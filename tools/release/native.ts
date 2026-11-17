import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { artifact, Commands, download, fetchJson, Journal, json, verifyArtifact, type Artifact } from './core';
import config from './config.json';

export type Platform = 'ios' | 'mac';
export type DropBuild = { revision: number; version: string; shortVersion: string } | null;
export type Drop = { ios: DropBuild; mac: DropBuild };
const origin = `https://appdrop.app/api/drops/${config.appdropId}`;
export function publicDrop(raw: any): Drop {
  if (raw?.id !== config.appdropId || raw.bundleId !== config.bundleId) throw new Error('Unexpected AppDrop identity.');
  const build = (value: any): DropBuild => {
    if (!value) return null;
    if (!Number.isInteger(value.revision) || value.revision < 1 || !/^\d+$/.test(String(value.version))) throw new Error('Invalid AppDrop version metadata.');
    return { revision: value.revision, version: String(value.version), shortVersion: String(value.shortVersion) };
  };
  return { ios: build(raw), mac: build(raw.mac) };
}
export const readDrop = async () => publicDrop(await fetchJson(origin));
export function nextBuild(drop: Drop, now = new Date()) {
  const dateFloor = Number(now.toISOString().slice(0, 10).replaceAll('-', '') + '00');
  return String(Math.max(dateFloor, Number(drop.ios?.version ?? 0), Number(drop.mac?.version ?? 0)) + 1);
}
export function assertOtherPlatform(before: Drop, after: Drop, platform: Platform) {
  const other = platform === 'ios' ? 'mac' : 'ios';
  if (JSON.stringify(before[other]) !== JSON.stringify(after[other])) throw new Error(`AppDrop ${other} changed during the ${platform} update. Delivery stopped.`);
}
export function receipt(raw: any, platform: Platform, build: string, version: string) {
  if (raw?.id !== config.appdropId || !Number.isInteger(raw.revision) || raw.revision < 1 || String(raw.version) !== build ||
      raw.shortVersion !== version || (platform === 'mac' ? raw.build !== 'macos' : !!raw.build && raw.build !== 'ios')) {
    throw new Error('AppDrop upload returned an unexpected public receipt. Inspect the private log.');
  }
  // Deliberate allowlist: the CLI also returns management credentials on updates.
  return { platform, revision: raw.revision as number, build, version, url: `https://appdrop.app/d/${config.appdropId}` };
}

export async function appdropTool(commands: Commands, directory: string) {
  const root = resolve(directory, 'appdrop-tool');
  const manifest = resolve(root, 'node_modules/appdrop/package.json');
  if (!existsSync(manifest)) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    writeFileSync(resolve(root, 'package.json'), JSON.stringify({ private: true, dependencies: { appdrop: config.appdropVersion } }));
    await commands.run('install-appdrop', [process.execPath, 'install', '--ignore-scripts'], root);
  }
  if (json(manifest).version !== config.appdropVersion) throw new Error('Unexpected AppDrop CLI version.');
  return resolve(root, 'node_modules/appdrop');
}

export async function validateBundle(commands: Commands, app: string, platform: Platform, build: string, version: string) {
  const plist = resolve(app, platform === 'mac' ? 'Contents/Info.plist' : 'Info.plist');
  const field = async (key: string) => (await commands.run(`plist-${platform}-${key}`, ['plutil', '-extract', key, 'raw', '-o', '-', plist], app)).trim();
  if (await field('CFBundleIdentifier') !== config.bundleId || await field('CFBundleVersion') !== build ||
      await field('CFBundleShortVersionString') !== version) throw new Error(`Wrong ${platform} bundle identity/version.`);
  const executable = await field('CFBundleExecutable');
  if (!/^[a-zA-Z0-9_.-]+$/.test(executable)) throw new Error('Invalid bundle executable.');
  if (platform === 'ios') {
    const platforms = JSON.parse(await commands.run('plist-ios-platforms', ['plutil', '-extract', 'CFBundleSupportedPlatforms', 'json', '-o', '-', plist], app));
    if (JSON.stringify(platforms) !== '["iPhoneOS"]') throw new Error('AppDrop requires an iPhone device archive, not a simulator.');
  }
  const binary = resolve(app, platform === 'mac' ? 'Contents/MacOS' : '.', executable);
  const architectures = await commands.run(`architecture-${platform}`, ['lipo', '-archs', binary], app);
  if (!architectures.trim().split(/\s+/).includes('arm64')) throw new Error(`${platform} bundle has no arm64 binary.`);
  await commands.run(`signature-${platform}`, ['codesign', '--verify', '--deep', '--strict', app], app);
}

export async function buildNative(journal: Journal, commands: Commands, site: string, cli: string, platform: Platform): Promise<Artifact> {
  return journal.step(`build-${platform}`, async () => {
    if (process.platform !== 'darwin') throw new Error('Native release requires macOS.');
    const version = journal.state.version.split('-')[0], build = journal.state.buildNumber;
    const directory = resolve(journal.directory, `native-${platform}`);
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const output = resolve(directory, platform === 'ios' ? 'RightUI.ipa' : 'RightUI-mac.zip');
    const args = [process.execPath, 'tools/build-native.ts', platform, ...(platform === 'ios' ? ['--archive', output] : [])];
    const log = await commands.run(`build-${platform}`, args, site, { EXACT_VERSION: version, EXACT_BUILD_NUMBER: build, EXACT_DEVELOPER_ID: '-' });
    if (platform === 'ios') {
      const { stripMacMetadata } = await import(pathToFileURL(resolve(cli, 'lib.mjs')).href);
      writeFileSync(output, stripMacMetadata(readFileSync(output)).buffer);
      const unpacked = resolve(directory, 'unpacked');
      mkdirSync(unpacked, { recursive: true });
      await commands.run('unpack-ios', ['ditto', '-x', '-k', output, unpacked], site);
      const apps = readdirSync(resolve(unpacked, 'Payload')).filter(name => name.endsWith('.app'));
      if (apps.length !== 1) throw new Error('Expected one iPhone app.');
      await validateBundle(commands, resolve(unpacked, 'Payload', apps[0]), platform, build, version);
    } else {
      const result = log.split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }).find(value => typeof value.path === 'string' && value.path.endsWith('.app'));
      if (!result || !existsSync(result.path)) throw new Error('Exact did not return a Mac application path.');
      const app = resolve(directory, 'RightUI.app');
      cpSync(result.path, app, { recursive: true, force: true });
      const plist = resolve(app, 'Contents/Info.plist');
      for (const [key, value] of [['CFBundleShortVersionString', version], ['CFBundleVersion', build]]) {
        await commands.run(`set-mac-${key}`, ['plutil', '-replace', key, '-string', value, plist], site);
      }
      await commands.run('sign-mac', ['codesign', '--force', '--sign', '-', '--timestamp=none', '--preserve-metadata=identifier,entitlements,requirements,flags,runtime', app], site);
      await validateBundle(commands, app, platform, build, version);
      await commands.run('zip-mac', ['ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', app, output], site);
    }
    await commands.run(`zip-check-${platform}`, ['unzip', '-tq', output], site);
    return artifact(output);
  }, verifyArtifact);
}

export async function deliverNative(journal: Journal, commands: Commands, cli: string, platform: Platform, file: Artifact) {
  verifyArtifact(file);
  const version = journal.state.version.split('-')[0], build = journal.state.buildNumber;
  const before = await journal.step(`before-${platform}`, readDrop);
  const verify = async (result: ReturnType<typeof receipt>) => {
    const after = await readDrop();
    if (after[platform]?.revision !== result.revision || after[platform]?.version !== build) throw new Error('AppDrop has moved since this delivery.');
    const url = `${origin}/${platform === 'ios' ? 'ipa' : 'file'}?revision=${result.revision}${platform === 'mac' ? '&build=macos' : ''}`;
    const downloaded = await download(url, resolve(journal.directory, `download-${platform}-${result.revision}.zip`));
    if (downloaded.sha256 !== file.sha256) throw new Error(`AppDrop ${platform} download does not match the validated archive.`);
  };
  return journal.step(`upload-${platform}`, async interrupted => {
    const current = await readDrop();
    assertOtherPlatform(before, current, platform);
    if (current[platform]?.version === build && current[platform]?.shortVersion === version) {
      return { platform, revision: current[platform]!.revision, build, version, url: `https://appdrop.app/d/${config.appdropId}` };
    }
    if (interrupted) throw new Error(`The previous ${platform} upload has no confirmed receipt. Inspect AppDrop and private upload logs before retrying; no duplicate upload was attempted.`);
    if (JSON.stringify(current) !== JSON.stringify(before)) throw new Error('AppDrop changed during the build.');
    if (Number(build) <= Number(current[platform]?.version ?? 0)) throw new Error('Native build number must increase; another delivery may have advanced AppDrop.');
    const output = await commands.run(`upload-${platform}`, ['node', resolve(cli, 'cli.mjs'), file.path, '--update', `https://appdrop.app/d/${config.appdropId}`, '--json'], journal.state.workspace);
    const result = output.trim().split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }).at(-1);
    const publicReceipt = receipt(result, platform, build, version);
    assertOtherPlatform(before, await readDrop(), platform);
    return publicReceipt;
  }, verify);
}
