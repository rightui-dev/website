import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clientTarget, isIndexable, origin, socialImage, type SEOPage } from './seo';

const root = resolve(import.meta.dir, '..');
const dist = resolve(root, 'dist');
const pages: SEOPage[] = JSON.parse(readFileSync(resolve(root, 'packages/catalog/markdown.json'), 'utf8'));
const routes: { name: string; pattern: string; render: string }[] = JSON.parse(readFileSync(resolve(dist, 'routes.json'), 'utf8')).routes;
const server = process.argv[2];
const read = async (path: string, local: string, type: string, status = 200) => {
  if (!server) return readFileSync(resolve(dist, local));
  const response = await fetch(new URL(path, server), { signal: AbortSignal.timeout(30000) });
  if (response.status !== status || !response.headers.get('content-type')?.includes(type)) throw new Error(`${path}: expected ${status} ${type}, got ${response.status} ${response.headers.get('content-type')}`);
  return Buffer.from(await response.arrayBuffer());
};
const xml = (s: string) => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function checkHead(html: string, page: SEOPage) {
  const head = html.split('<div id="exact-root">')[0];
  const expectOne = (pattern: RegExp, value: string, label: string) => {
    const matches = [...head.matchAll(pattern)];
    if (matches.length !== 1 || matches[0][1] !== xml(value)) throw new Error(`${page.url}: ${label} missing, duplicated or incorrect (${matches[0]?.[1]})`);
  };
  const meta = (name: string, value: string) => expectOne(new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"[^>]*>`, 'g'), value, name);
  const title = `${page.title} — rightui`;
  expectOne(/<title>([^<]*)<\/title>/g, title, 'title');
  expectOne(/<link rel="canonical" href="([^"]*)"[^>]*>/g, origin + page.url, 'canonical');
  meta('description', page.description);
  meta('og:title', title); meta('og:description', page.description); meta('og:url', origin + page.url);
  meta('og:type', 'website'); meta('og:site_name', 'rightui'); meta('og:locale', 'en_US');
  meta('og:image', socialImage);
  for (const property of ['og:image:width', 'og:image:height', 'og:image:type', 'og:image:alt']) {
    if (head.indexOf(`property="${property}"`) < head.indexOf('property="og:image"')) throw new Error(`${page.url}: ${property} must follow og:image`);
  } meta('og:image:width', '1200'); meta('og:image:height', '630'); meta('og:image:type', 'image/png');
  meta('twitter:card', 'summary_large_image'); meta('twitter:title', title); meta('twitter:description', page.description); meta('twitter:image', socialImage);
  meta('robots', isIndexable(page.url) ? 'index, follow, max-image-preview:large' : 'noindex, follow');
  if (!/<meta property="og:image:alt" content="[^"]+"/.test(head) || !/<meta name="twitter:image:alt" content="[^"]+"/.test(head)) throw new Error(`${page.url}: missing image alt text`);
  const data = [...head.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
  if (!data.some(value => value['@type'] === 'WebSite' && value.url === origin + '/')) throw new Error(`${page.url}: missing WebSite structured data`);
  if (!page.description || page.description === 'This page does not exist.') throw new Error(`${page.url}: invalid description`);
}
for (const page of pages) {
  const route = routes.find(route => route.pattern === page.url)!;
  const local = route.render === 'client' ? `${clientTarget(route.name).slice(1)}.html` : page.url === '/' ? 'index.html' : `${page.url.slice(1)}/index.html`;
  checkHead((await read(page.url, local, 'text/html')).toString(), page);
}
const sitemap = (await read('/sitemap.xml', 'sitemap.xml', 'xml')).toString();
const listed = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map(match => match[1]).sort();
const expected = pages.filter(page => isIndexable(page.url)).map(page => origin + page.url).sort();
if (JSON.stringify(listed) !== JSON.stringify(expected)) throw new Error('Sitemap URLs differ from canonical indexable pages.');
const robots = (await read('/robots.txt', 'robots.txt', 'text/plain')).toString();
if (!robots.includes(`Sitemap: ${origin}/sitemap.xml`) || !robots.includes('Allow: /')) throw new Error('Invalid robots.txt.');
const image = await read('/assets/brand/rightui-og.png', 'assets/brand/rightui-og.png', 'image/png');
if (image.toString('hex', 0, 8) !== '89504e470d0a1a0a' || image.readUInt32BE(16) !== 1200 || image.readUInt32BE(20) !== 630 || image.length > 1_000_000) throw new Error('Invalid social PNG.');
const notfound = (await read('/__rightui_seo_missing__', '404.html', 'text/html', 404)).toString();
if (!/<meta name="robots" content="noindex, follow"/.test(notfound)) throw new Error('404 needs noindex.');
if (!server) {
  const redirects = readFileSync(resolve(dist, '_redirects'), 'utf8');
  for (const route of routes.filter(route => route.render === 'client')) {
    for (const suffix of ['', '/']) if (!redirects.includes(`${route.pattern}${suffix} ${clientTarget(route.name)} 200`)) throw new Error(`Client SEO rewrite missing: ${route.pattern}${suffix}`);
  }
}
console.log(`SEO passed: ${pages.length} page heads, ${listed.length} sitemap URLs, robots.txt, 404 and ${image.length}-byte social PNG${server ? ` on ${server}` : ' in dist'}.`);
