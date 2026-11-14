import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyticsScript, analyticsWebsite } from './analytics';

const root = resolve(import.meta.dir, '..');
const dist = resolve(root, 'dist');
const server = process.argv[2];
let checked = 0;
function check(html: string, label: string) {
  const head = html.split('<div id="exact-root">')[0];
  const scripts = [...head.matchAll(/<script\b[^>]*>/g)].map(match => match[0]);
  const trackers = scripts.filter(tag => tag.includes(`src="${analyticsScript}"`));
  if (trackers.length !== 1) throw new Error(`${label}: expected one Umami tracker.`);
  for (const attribute of ['defer', `data-website-id="${analyticsWebsite}"`, 'data-domains="rightui.dev"', 'data-before-send="rightuiAnalyticsBeforeSend"', 'data-exclude-search="true"', 'data-exclude-hash="true"']) {
    if (!trackers[0].includes(attribute)) throw new Error(`${label}: missing ${attribute}`);
  }
  if (scripts.filter(tag => tag.includes('data-rightui-analytics="guard"')).length !== 1 || head.indexOf('window.rightuiAnalyticsBeforeSend=') > head.indexOf(`src="${analyticsScript}"`)) {
    throw new Error(`${label}: missing, duplicated or late analytics guard.`);
  }
  checked++;
}
function walk(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.html')) check(readFileSync(path, 'utf8'), path);
  }
}
if (server) {
  const pages: { url: string }[] = JSON.parse(readFileSync(resolve(root, 'packages/catalog/markdown.json'), 'utf8'));
  for (const path of [...pages.map(page => page.url), '/__rightui_analytics_missing__']) {
    const response = await fetch(new URL(path, server), { signal: AbortSignal.timeout(30000) });
    const expected = path === '/__rightui_analytics_missing__' ? 404 : 200;
    if (response.status !== expected) throw new Error(`${path}: expected HTTP ${expected}, received ${response.status}`);
    const csp = response.headers.get('content-security-policy');
    if (csp) throw new Error(`${path}: CSP detected; review Umami script, inline guard and gateway permissions before delivery.`);
    check(await response.text(), path);
  }
} else walk(dist);
console.log(`Analytics passed: ${checked} HTML heads with one deferred tracker and production-only guard${server ? ` on ${server}` : ' in dist'}.`);
