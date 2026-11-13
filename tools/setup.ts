import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareRegistry } from './prepare-registry';

const root = resolve(import.meta.dir, '..');
const library = resolve(root, '../components');
if (Bun.version !== '1.4.2') throw new Error(`Bun 1.4.2 is required; found ${Bun.version}.`);
if (!existsSync(resolve(library, 'tools/setup-native.ts'))) {
  throw new Error('Clone https://github.com/rightui-dev/ui.git into ../components before running setup.');
}

prepareRegistry({ manifestOnly: true });

for (const [cwd, args] of [
  [library, ['tools/setup-native.ts']],
  [root, ['install']],
] as [string, string[]][]) {
  const result = Bun.spawnSync([process.execPath, ...args], {
    cwd, env: { ...process.env, EXACT_FEEDBACK: '0' }, stdout: 'inherit', stderr: 'inherit',
  });
  if (result.exitCode !== 0) process.exit(result.exitCode || 1);
}

prepareRegistry();
