import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const bun = process.execPath;
const generated = Bun.spawn([bun, 'tools/generate.ts'], { cwd: root, stdout: 'inherit', stderr: 'inherit' });
if (await generated.exited !== 0) process.exit(1);
for (let attempt = 0; attempt < 3; attempt++) {
  const metadata = resolve(root, 'dist.gen/.DS_Store');
  if (existsSync(metadata)) unlinkSync(metadata);
  const build = Bun.spawn([bun, 'apps/site/exact.mjs', 'web-build', '--out', 'dist'], {
    cwd: root, env: { ...process.env, EXACT_FEEDBACK: '0' }, stdout: 'inherit', stderr: 'pipe',
  });
  const errors = await new Response(build.stderr).text();
  const code = await build.exited;
  if (code !== 0 && errors.includes('not builds kept by generation') && existsSync(metadata) && attempt < 2) continue;
  process.stderr.write(errors);
  if (code !== 0) process.exit(code);
  const publish = Bun.spawn([bun, 'tools/postbuild.ts'], { cwd: root, stdout: 'inherit', stderr: 'inherit' });
  process.exit(await publish.exited);
}
