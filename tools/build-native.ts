import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The website and native demo compile the same Contract sources.
// Only the browser preview chrome differs; no second application is maintained.
const root = resolve(import.meta.dir, '..');
const target = process.argv[2];
if (target !== 'mac' && target !== 'ios') throw new Error('Use native:mac or native:ios.');
const options = process.argv.slice(3);
if (options.length && (target !== 'ios' || options.length !== 2 || options[0] !== '--archive' || !options[1])) {
  throw new Error('Only native:ios accepts --archive <output.ipa> for an AppDrop device archive.');
}
const archive = options.length ? resolve(options[1]) : null;
if (archive && !archive.endsWith('.ipa')) throw new Error('The iOS archive must end in .ipa.');
const manifestPath = resolve(root, 'apps/site/app.json');
const originalManifest = readFileSync(manifestPath, 'utf8');
const run = async (args: string[], native: boolean) => {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd: root,
    env: { ...process.env, EXACT_FEEDBACK: '0', RIGHTUI_NATIVE: native ? '1' : '0', RIGHTUI_NATIVE_MAC: native && target === 'mac' ? '1' : '0' },
    stdout: 'inherit', stderr: 'inherit',
  });
  const result = await child.exited;
  if (result !== 0) throw new Error(`${args.join(' ')} exited ${result}`);
};
try {
  const manifest = JSON.parse(originalManifest);
  manifest.app = { ...manifest.app, id: 'dev.rightui', name: 'RightUI' };
  manifest.host = { ...manifest.host, macos: { minimumOS: '14.0', window: { width: 1280, height: 860 }, ...manifest.host?.macos } };
  manifest.deploy = { ...manifest.deploy, store: { ...manifest.deploy?.store, macos: '0', ios: '0' } };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await run(['tools/generate.ts'], true);
  await run(['apps/site/exact.mjs', target, ...(archive
    ? ['--device', '--unsigned', '--archive', archive]
    : ['--bundle', '--distribution']), '--json'], true);
} finally {
  writeFileSync(manifestPath, originalManifest);
  await run(['tools/generate.ts'], false);
}
