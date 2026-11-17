import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { publishedUi } from './ui-version';
import { prepareRegistry } from './prepare-registry';

const root = resolve(import.meta.dir, '..');
const requested = process.argv.slice(2);
if (requested.length > 1 || (requested[0] && !/^0\.\d+\.\d+-beta\.[1-9]\d*$/.test(requested[0]))) {
  throw new Error('Usage: bun run sync:ui [exact-beta-version]');
}
const { version } = await publishedUi();
if (requested[0] && requested[0] !== version) throw new Error(`Delivery is pinned to ${requested[0]}, but npm beta is ${version}. Refusing to switch releases.`);
const library = JSON.parse(readFileSync(resolve(root, '../components/packages/ui/package.json'), 'utf8')).version;
if (library !== version) throw new Error(`Align the library checkout with published npm beta ${version} before syncing the website (checkout: ${library}).`);
for (const path of ['package.json', 'apps/site/package.json']) {
  const file = resolve(root, path), manifest = JSON.parse(readFileSync(file, 'utf8'));
  manifest.dependencies['@rightui/ui'] = version;
  writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
}
prepareRegistry({ manifestOnly: true });
for (const args of [['install', '--ignore-scripts'], ['tools/generate.ts']]) {
  const result = Bun.spawnSync([process.execPath, ...args], { cwd: root, env: { ...process.env, EXACT_FEEDBACK: '0' }, stdout: 'inherit', stderr: 'inherit' });
  if (result.exitCode !== 0) process.exit(result.exitCode || 1);
}
console.log(`Synchronized @rightui/ui ${version}: manifests, lockfile, generated guides, commands and footer. Review and commit before deployment.`);
