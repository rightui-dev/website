import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import config from './config.json';
import { acquireLock, artifact, assertClean, Commands, fetchJson, git, hash, Journal, json, treeHash, validateState, verifyArtifact, type Artifact, type Snapshot, type State, type Target } from './core';
import { appdropTool, buildNative, deliverNative, nextBuild, readDrop } from './native';
import { checkNpm, publishNpm } from './npm';
import { assertMetadataOnly, metadataFiles, type Metadata } from './metadata';

const root = resolve(import.meta.dir, '../..');
const library = resolve(root, '../components');
const exact = resolve(root, '../.tooling/exact');
const stateRoot = resolve(homedir(), 'Library/Application Support/RightUI/releases');
const bun = process.execPath;
const help = `Usage: bun run release <site|appdrop|npm|all> [--dry-run]
       bun run release resume <id>
       bun run release status <id>
       bun run release doctor

site: build, check and deploy rightui.dev locally.
appdrop: build and upload iPhone + Mac locally; commit/push the returned download link.
npm: validate locally, create the immutable GitHub prerelease, dispatch npm-only OIDC publication.
all: validate all candidates, publish npm, upload native apps, synchronize and deploy the site.

Release sources must already be committed and pushed to main in both repositories.
Each npm publication aligns beta and latest to the validated beta version.
No version bump, stable release, device installation or native notarization is implicit.
Generated website dependency/download metadata is committed and pushed by appdrop/all.
Private artifacts, logs and resumable state live outside both repositories.
`;
const hasNative = (target: Target) => target === 'appdrop' || target === 'all';
const hasNpm = (target: Target) => target === 'npm' || target === 'all';
const hasSite = (target: Target) => target === 'site' || target === 'all';
const snapshot = (): Snapshot => ({ website: git(root, 'rev-parse', 'HEAD'), library: git(library, 'rev-parse', 'HEAD'), exact: git(exact, 'rev-parse', 'HEAD') });

export function plan(target: Target) {
  return [
    'check clean committed sources, pinned tools and target access',
    ...(hasNpm(target) ? ['pack once; validate archive installation and candidate documentation locally'] : []),
    ...(hasNative(target) ? ['build and validate iPhone and Mac archives locally, sequentially'] : []),
    ...(hasNpm(target) ? ['create GitHub prerelease; publish its exact archive through npm OIDC only; verify npm'] : []),
    ...(hasNative(target) ? ['update the existing AppDrop link; verify downloaded bytes'] : []),
    ...(hasNative(target) ? ['commit/push generated website metadata only'] : []),
    ...(hasSite(target) ? ['build site locally; run quick checks; check Cloudflare routing; deploy prepared assets; verify production'] : []),
  ];
}

function toolchain(target: Target) {
  const details = { bun: Bun.version, node: process.version, wrangler: json(resolve(root, 'node_modules/wrangler/package.json')).version,
    exact: config.exact, appdrop: config.appdropVersion,
    xcode: hasNative(target) ? execFileSync('xcodebuild', ['-version'], { encoding: 'utf8' }).trim() : null };
  return hash(JSON.stringify(details));
}
function preflight(target: Target, remote = true) {
  if (Bun.version !== config.bun) throw new Error(`Bun ${config.bun} is required. Use ./release to select it.`);
  if (hasNative(target) && process.platform !== 'darwin') throw new Error('AppDrop builds require macOS.');
  for (const [path, repository] of [[root, config.websiteRepository], [library, config.libraryRepository]]) {
    assertClean(path);
    if (git(path, 'branch', '--show-current') !== config.branch) throw new Error(`Use the ${config.branch} branch in ${path}.`);
    const origin = git(path, 'remote', 'get-url', 'origin');
    if (![ `https://github.com/${repository}.git`, `https://github.com/${repository}`, `git@github.com:${repository}.git` ].includes(origin)) throw new Error(`Unexpected origin for ${path}.`);
    if (remote && git(path, 'ls-remote', 'origin', `refs/heads/${config.branch}`).split(/\s/)[0] !== git(path, 'rev-parse', 'HEAD')) throw new Error(`Push the intended ${repository} source commit before release; origin/main differs.`);
  }
  assertClean(exact);
  if (git(exact, 'rev-parse', 'HEAD') !== config.exact) throw new Error('Exact SDK differs from the pinned release toolchain.');
  const manifest = json(resolve(library, 'packages/ui/package.json'));
  if (manifest.name !== '@rightui/ui' || !/^0\.(0|[1-9]\d*)\.(0|[1-9]\d*)-beta\.[1-9]\d*$/.test(manifest.version) || manifest.publishConfig?.tag !== 'beta') throw new Error('Prepare an exact UI beta with version:ui before release.');
  if (json(resolve(root, 'package.json')).dependencies['@rightui/ui'] !== manifest.version) throw new Error('Website and library versions must be aligned before release.');
  const hosting = Bun.JSONC.parse(readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8')) as { name: string; account_id: string; routes: unknown };
  if (hosting.name !== config.worker || hosting.account_id !== config.cloudflareAccount ||
      JSON.stringify(hosting.routes) !== JSON.stringify([{ pattern: new URL(config.site).hostname, custom_domain: true }])) throw new Error('Cloudflare production target changed. Review release configuration.');
  return manifest.version as string;
}

async function access(commands: Commands, target: Target, version: string) {
  if (hasNpm(target) || hasNative(target)) {
    const repository = JSON.parse(await commands.run('github-access', ['gh', 'api', `repos/${config.libraryRepository}`], root));
    if (!repository.permissions?.push) throw new Error('GitHub write access is required to deliver release artifacts.');
  }
  if (hasNative(target)) {
    const website = JSON.parse(await commands.run('website-github-access', ['gh', 'api', `repos/${config.websiteRepository}`], root));
    if (!website.permissions?.push) throw new Error('GitHub write access to the website is required for the generated download link.');
  }
  if (hasNpm(target)) {
    const workflow = JSON.parse(await commands.run('npm-workflow', ['gh', 'api', `repos/${config.libraryRepository}/actions/workflows/${config.workflow}`], root));
    if (workflow.state !== 'active') throw new Error('The npm publication workflow is not active on main.');
    // npm validates the trusted publisher during publication; whoami cannot test OIDC.
  } else {
    await checkNpm(version);
  }
  if (hasSite(target)) await commands.run('cloudflare-access', ['node', resolve(root, 'node_modules/wrangler/bin/wrangler.js'), 'whoami'], root);
  if (hasNative(target)) {
    const store = resolve(process.env.APPDROP_HOME || resolve(homedir(), '.appdrop'), 'drops.json');
    const hasKey = !!process.env.APPDROP_MANAGE_KEY || (existsSync(store) && !!json(store)[config.appdropId]?.manageKey);
    if (!hasKey) throw new Error('AppDrop update access is missing. Configure APPDROP_MANAGE_KEY privately or use the existing local AppDrop login.');
  }
}

async function pack(journal: Journal, commands: Commands): Promise<Artifact> {
  return journal.step('package', async () => {
    await commands.run('check-version', [bun, 'run', 'check:version'], library);
    await commands.run('pack', [bun, 'run', 'package:ui'], library);
    const name = `rightui-ui-${journal.state.version}.tgz`, source = resolve(library, 'dist', name), destination = resolve(journal.directory, name);
    if (existsSync(destination)) {
      if (artifact(destination).sha256 !== artifact(source).sha256) throw new Error('Packing changed the saved archive. Start a new release after inspection.');
    } else copyFileSync(source, destination);
    return artifact(destination);
  }, verifyArtifact);
}

async function candidate(journal: Journal, commands: Commands, archive?: Artifact) {
  const base = resolve(journal.directory, 'candidate'), site = resolve(base, 'landing');
  await journal.step('candidate-checkout', async () => {
    // A disposable local clone protects the active editor; the SDK and its caches remain local.
    rmSync(base, { recursive: true, force: true });
    mkdirSync(resolve(base, '.tooling'), { recursive: true, mode: 0o700 });
    symlinkSync(library, resolve(base, 'components'));
    symlinkSync(exact, resolve(base, '.tooling/exact'));
    await commands.run('clone-candidate', ['git', 'clone', '--shared', '--no-checkout', root, site], root);
    await commands.run('checkout-candidate', ['git', 'checkout', '--detach', journal.state.source.website], site);
    await commands.run('candidate-registry', [bun, '-e', 'import { prepareRegistry } from "./tools/prepare-registry.ts"; prepareRegistry({manifestOnly:true});'], site);
    const manifestFile = resolve(site, 'package.json'), original = readFileSync(manifestFile, 'utf8');
    if (archive) {
      verifyArtifact(archive);
      const manifest = JSON.parse(original);
      manifest.overrides = { ...manifest.overrides, '@rightui/ui': `file:${archive.path}` };
      writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
    }
    try { await commands.run('candidate-install', [bun, 'install', '--ignore-scripts', ...(archive ? [] : ['--frozen-lockfile'])], site); }
    finally { writeFileSync(manifestFile, original); }
    return { site, revision: journal.state.source.website };
  }, result => { if (git(result.site, 'rev-parse', 'HEAD') !== result.revision) throw new Error('Candidate checkout changed.'); });
  return site;
}

async function verifyWeb(commands: Commands, site: string, label: string) {
  await commands.run(`${label}-build`, [bun, 'run', 'build'], site);
  // Generation/postbuild already checks versions, public documents and assets.
  // Browser scenario suites are opt-in, never part of a release.
}

async function commitMetadata(journal: Journal, commands: Commands, macRevision?: number) {
  await journal.step('website-metadata', async () => {
    const readMetadata = () => Object.fromEntries(metadataFiles.map(file => [file, readFileSync(resolve(root, file), 'utf8')])) as Metadata;
    const before = readMetadata();
    const macUrl = macRevision ? `https://appdrop.app/api/drops/${config.appdropId}/file?revision=${macRevision}&build=macos` : undefined;
    if (journal.state.target === 'all') await commands.run('sync-ui', [bun, 'tools/sync-ui-version.ts', journal.state.version], root);
    if (macRevision) {
      const file = resolve(root, 'content/downloads.json'), downloads = json(file);
      downloads.macDownloadUrl = macUrl;
      writeFileSync(file, JSON.stringify(downloads, null, 2) + '\n');
      await commands.run('generate-downloads', [bun, 'run', 'generate'], root);
    }
    assertMetadataOnly(before, readMetadata(), journal.state.version, macUrl);
    await commands.run('check-metadata-version', [bun, 'tools/check-ui-version.ts'], root);
    // This also verifies registry integrity without invoking the clean-source production guard yet.
    const { assertPublishedUi } = await import('../ui-version');
    const published = await checkNpm(journal.state.version);
    assertPublishedUi(journal.state.version, Bun.JSONC.parse(readFileSync(resolve(root, 'bun.lock'), 'utf8')), published);
    const allowed: readonly string[] = metadataFiles;
    const changed = git(root, 'diff', '--name-only', 'HEAD').split('\n').filter(Boolean);
    if (changed.some(file => !allowed.includes(file)) || git(root, 'ls-files', '--others', '--exclude-standard')) throw new Error('Metadata generation changed unexpected files. Inspect before continuing.');
    if (changed.length) {
      await commands.run('stage-metadata', ['git', 'add', '--', ...changed], root);
      if (git(root, 'rev-parse', 'HEAD') !== journal.state.current.website ||
          git(root, 'diff', '--cached', '--name-only').split('\n').filter(Boolean).some(file => !changed.includes(file))) throw new Error('Git changed while preparing release metadata.');
      assertMetadataOnly(before, Object.fromEntries(metadataFiles.map(file => [file, git(root, 'show', `:${file}`)])) as Metadata, journal.state.version, macUrl);
      await commands.run('commit-metadata', ['git', 'commit', '-m', `chore(release): sync ${journal.state.version} (${journal.state.id})`], root);
      journal.state.current.website = git(root, 'rev-parse', 'HEAD');
      journal.save();
    }
    await commands.run('push-metadata', ['git', 'push', 'origin', `HEAD:refs/heads/${config.branch}`], root);
    return { website: journal.state.current.website, macRevision: macRevision ?? null };
  });
}

async function localHosting(commands: Commands) {
  const executable = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
  const server = Bun.spawn(['node', executable, 'dev', '--local', '--ip', '127.0.0.1', '--port', '8794'], {
    cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdout: 'ignore', stderr: 'ignore', stdin: 'ignore',
  });
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (server.exitCode !== null) throw new Error('Cloudflare emulator failed to start (port 8794 must be free).');
      try {
        const response = await fetch('http://127.0.0.1:8794/build-info.json', { signal: AbortSignal.timeout(1000) });
        if (response.ok && JSON.stringify(await response.json()) === JSON.stringify(json(resolve(root, 'dist/build-info.json')))) { ready = true; break; }
      } catch {}
      await Bun.sleep(500);
    }
    if (!ready) throw new Error('Cloudflare emulator was not ready.');
    await commands.run('hosting-local', [bun, 'run', 'check:hosting', 'http://127.0.0.1:8794', '--smoke'], root);
    await commands.run('seo-local', [bun, 'tools/check-seo.ts'], root);
    await commands.run('analytics-local', [bun, 'tools/check-analytics.ts'], root);
  } finally { server.kill('SIGTERM'); await server.exited; }
}

async function deploySite(journal: Journal, commands: Commands, guard: () => void) {
  const build = await journal.step('site-build', async () => {
    await commands.run('check-published-ui', [bun, 'tools/check-ui-version.ts', '--published'], root);
    await verifyWeb(commands, root, 'site');
    await localHosting(commands);
    await commands.run('cloudflare-dry-run', [bun, 'run', 'deploy:check'], root);
    guard();
    return { digest: treeHash(resolve(root, 'dist')), info: json(resolve(root, 'dist/build-info.json')) };
  }, result => { if (treeHash(resolve(root, 'dist')) !== result.digest) throw new Error('Validated site assets changed. Refusing deployment.'); });
  const verifyLive = async () => {
    if (JSON.stringify(await fetchJson(`${config.site}/build-info.json`)) !== JSON.stringify(build.info)) throw new Error('Production provenance differs from this release.');
    await commands.run('hosting-production', [bun, 'run', 'check:hosting', config.site, '--smoke'], root);
  };
  return journal.step('site-deployment', async () => {
    guard();
    const live = await fetchJson(`${config.site}/build-info.json`);
    let versionId: string | undefined;
    if (JSON.stringify(live) !== JSON.stringify(build.info)) {
      if (treeHash(resolve(root, 'dist')) !== build.digest) throw new Error('Validated site assets changed before upload.');
      const output = await commands.run('deploy-prepared', [bun, 'run', 'deploy:prepared'], root);
      versionId = output.match(/Current Version ID:\s*([a-f0-9-]{36})/i)?.[1];
    }
    await verifyLive();
    if (!versionId) {
      const deployments = JSON.parse(await commands.run('cloudflare-deployments', ['node', resolve(root, 'node_modules/wrangler/bin/wrangler.js'), 'deployments', 'list', '--json'], root));
      const latest = [...deployments].sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
      if (latest?.versions?.length === 1 && latest.versions[0].percentage === 100) versionId = latest.versions[0].version_id;
    }
    if (!versionId) throw new Error('Could not record the Cloudflare version ID. Inspect the private deployment log.');
    return { url: config.site, versionId, source: build.info };
  }, verifyLive);
}

export async function main(args = process.argv.slice(2), lifecycle: { lockHeld?: boolean; onStarted?: (state: State) => void } = {}) {
  if (!args.length || args[0] === '--help') { console.log(help); return; }
  if (args[0] === 'doctor') {
    if (args.length !== 1) throw new Error(help);
    const blockers: string[] = [];
    for (const [name, check] of [
      ['Bun', () => { if (Bun.version !== config.bun) throw new Error(`expected ${config.bun}`); }],
      ['library source', () => assertClean(library)], ['website source', () => assertClean(root)],
      ['Exact', () => { assertClean(exact); if (git(exact, 'rev-parse', 'HEAD') !== config.exact) throw new Error('wrong SDK revision'); }],
    ] as const) { try { check(); } catch (error: any) { blockers.push(`${name}: ${error.message}`); } }
    console.log(JSON.stringify({ version: json(resolve(library, 'packages/ui/package.json')).version, stateDirectory: stateRoot, blockers,
      npmPublisher: { repository: config.libraryRepository, workflow: config.workflow, environment: config.npmEnvironment },
      note: 'Read-only local checks. npm OIDC is verified only by an actual authorized publication.' }, null, 2));
    if (blockers.length) process.exitCode = 1;
    return;
  }
  if (args[0] === 'status') {
    if (args.length !== 2 || !/^[a-zA-Z0-9-]+$/.test(args[1])) throw new Error(help);
    const state = json(resolve(stateRoot, args[1], 'release.json')); validateState(state, root);
    console.log(JSON.stringify(state, null, 2)); return;
  }
  const resume = args[0] === 'resume';
  if (resume ? args.length !== 2 || !/^[a-zA-Z0-9-]+$/.test(args[1]) :
      !['site', 'appdrop', 'npm', 'all'].includes(args[0]) || args.length > 2 || (args[1] && args[1] !== '--dry-run')) throw new Error(help);
  const target = resume ? json(resolve(stateRoot, args[1], 'release.json')).target as Target : args[0] as Target;
  if (args[1] === '--dry-run') {
    console.log(JSON.stringify({ target, steps: plan(target), mutations: false }, null, 2));
    preflight(target, false); return;
  }
  process.umask(0o077);
  const unlock = lifecycle.lockHeld ? () => {} : acquireLock(resolve(stateRoot, 'delivery.lock'));
  let commands: Commands | undefined;
  const stop = () => commands?.stop();
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    let state: State;
    if (resume) {
      state = json(resolve(stateRoot, args[1], 'release.json')); validateState(state, root);
      preflight(target, false);
      if (toolchain(target) !== state.toolchain) throw new Error('Toolchain changed since validation. Start a new delivery.');
    } else {
      const version = preflight(target), source = snapshot();
      const id = `${new Date().toISOString().replace(/[^0-9]/g, '')}-${target}`;
      state = { schema: 1, id, target, version, source, current: { ...source }, workspace: root, toolchain: toolchain(target),
        createdAt: new Date().toISOString(), buildNumber: '0', steps: {} };
    }
    const directory = resolve(stateRoot, state.id), journal = new Journal(directory, state);
    journal.save();
    lifecycle.onStarted?.(state);
    commands = new Commands(resolve(directory, 'logs'), { EXACT_FEEDBACK: '0', EXACT: exact, EXACT2: exact, WRANGLER_SEND_METRICS: 'false', PATH: `${dirname(bun)}:${process.env.PATH}` });
    const guard = () => {
      for (const path of [root, library, exact]) assertClean(path);
      if (JSON.stringify(snapshot()) !== JSON.stringify(state.current)) throw new Error('Source commits changed during delivery.');
    };
    guard();
    console.log(`Release ${state.id}; resume with: bun run release resume ${state.id}`);
    await access(commands, target, state.version);
    let archive: Artifact | undefined;
    if (hasNpm(target)) {
      archive = await pack(journal, commands);
      await journal.step('package-validation', async () => {
        await commands!.run('check-archive', [bun, 'tools/check-package.ts', '--archive', archive!.path], library);
        guard(); return { archive: archive!.sha256 };
      }, () => verifyArtifact(archive!));
    }
    let candidateSite: string | undefined;
    if (hasNpm(target) || hasNative(target)) {
      candidateSite = await candidate(journal, commands, archive);
      await journal.step('candidate-web-validation', async () => {
        await verifyWeb(commands!, candidateSite!, 'candidate'); guard(); return { source: state.source };
      });
    }
    let cli: string | undefined, ios: Artifact | undefined, mac: Artifact | undefined;
    if (hasNative(target)) {
      cli = await appdropTool(commands, directory);
      const number = await journal.step('native-build-number', async () => ({ number: nextBuild(await readDrop()) }));
      state.buildNumber = number.number; journal.save();
      ios = await buildNative(journal, commands, candidateSite!, cli!, 'ios');
      mac = await buildNative(journal, commands, candidateSite!, cli!, 'mac');
      guard();
    }
    if (hasNpm(target)) {
      await publishNpm(journal, commands, library, archive!, guard);
      await journal.step('npm-installation-validation', async () => {
        await commands!.run('check-registry', [bun, 'tools/check-package.ts', '--registry'], library);
        guard(); return { version: state.version };
      });
    }
    let macRevision: number | undefined;
    if (hasNative(target)) {
      guard(); await deliverNative(journal, commands, cli!, 'ios', ios!);
      guard(); macRevision = (await deliverNative(journal, commands, cli!, 'mac', mac!)).revision;
    }
    if (hasNative(target)) { guard(); await commitMetadata(journal, commands, macRevision); }
    if (hasSite(target)) await deploySite(journal, commands, guard);
    guard();
    console.log(`Delivery complete: ${state.id}\nReport: ${resolve(directory, 'release.json')}`);
  } finally {
    process.off('SIGINT', stop); process.off('SIGTERM', stop); unlock();
  }
}
