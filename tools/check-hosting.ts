import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const origin = new URL(process.argv[2] ?? 'http://localhost:8793');
const dist = resolve(import.meta.dir, '../dist');
const routes = JSON.parse(readFileSync(resolve(dist, 'routes.json'), 'utf8')).routes as { pattern: string; render: string; notfound: boolean }[];
const checks = routes.filter(route => !route.notfound).map(route => ({ path: route.pattern, status: 200, type: 'text/html' }));
checks.push(
  ...routes.filter(route => route.render === 'client').map(route => ({ path: route.pattern + '/', status: 200, type: 'text/html' })),
  { path: '/docs/compatibility.md', status: 200, type: 'text/markdown' },
  { path: '/docs/components/button.md', status: 200, type: 'text/markdown' },
  { path: '/source?file=packages/ui/button.contract', status: 200, type: 'text/html' },
  { path: '/__rightui_missing_route__', status: 404, type: 'text/html' },
  { path: '/missing-script.js', status: 404, type: 'text/html' },
);

async function response(path: string) {
  return fetch(new URL(path, origin), { redirect: 'manual', signal: AbortSignal.timeout(30000) });
}

for (let offset = 0; offset < checks.length; offset += 8) {
  await Promise.all(checks.slice(offset, offset + 8).map(async check => {
    const result = await response(check.path);
    if (result.status !== check.status || !result.headers.get('content-type')?.includes(check.type)) {
      throw new Error(`${check.path}: ${result.status} ${result.headers.get('content-type')}; expected ${check.status} ${check.type}`);
    }
    await result.arrayBuffer();
  }));
}

for (const path of ['/assets/fonts/Geist.ttf', '/app.js']) {
  const result = await response(path);
  if (result.status !== 200) throw new Error(`${path}: ${result.status}`);
  const bytes = Buffer.from(await result.arrayBuffer());
  const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');
  if (digest(bytes) !== digest(readFileSync(resolve(dist, path.slice(1))))) throw new Error(`${path}: served bytes differ from this build`);
}
console.log(`${checks.length} route/status/MIME checks passed on ${origin.origin}; app.js and Geist match the local build.`);
