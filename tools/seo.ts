import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const origin = 'https://rightui.dev';
export const socialImage = `${origin}/assets/brand/rightui-og.png`;
export type SEOPage = { name: string; url: string; title: string; description: string };
export const isIndexable = (url: string) => url !== '/source' && !url.startsWith('/view/');
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export const clientTarget = (name: string) => `/_client-pages/${name}`;

export function socialDetails(html: string) {
  const alt = 'rightui — Your next interface. Built with Exact. UI components for web, iOS and macOS.';
  const imageFields = [['type', 'image/png'], ['width', '1200'], ['height', '630'], ['alt', alt]];
  for (const name of ['og:locale', 'twitter:image:alt', ...imageFields.map(([name]) => `og:image:${name}`)]) {
    html = html.replace(new RegExp(`<meta (?:name|property)="${name}"[^>]*>`, 'g'), '');
  }
  const imageDetails = imageFields.map(([name, value]) => `<meta property="og:image:${name}" content="${escape(value)}">`).join('\n');
  html = html.replace(/<meta property="og:image"[^>]*>/, tag => `${tag}\n${imageDetails}`);
  const boundary = html.includes('</head>') ? '</head>' : '<div id="exact-root">';
  if (!html.includes(boundary)) throw new Error('Social metadata head boundary changed.');
  return html.replace(boundary, `<meta property="og:locale" content="en_US">\n<meta name="twitter:image:alt" content="${escape(alt)}">\n${boundary}`);
}

export function withClientMetadata(shell: string, page: SEOPage) {
  const title = `${page.title} — rightui`;
  const meta = (attribute: string, name: string, value: string) => `<meta ${attribute}="${name}" content="${escape(value)}">`;
  const fields = [
    `<title>${escape(title)}</title>`,
    meta('name', 'description', page.description),
    meta('name', 'robots', isIndexable(page.url) ? 'index, follow, max-image-preview:large' : 'noindex, follow'),
    `<link rel="canonical" href="${escape(origin + page.url)}">`,
    ...Object.entries({ 'og:type': 'website', 'og:site_name': 'rightui', 'og:title': title, 'og:description': page.description, 'og:url': origin + page.url, 'og:image': socialImage }).map(([key, value]) => meta('property', key, value)),
    ...Object.entries({ 'twitter:card': 'summary_large_image', 'twitter:title': title, 'twitter:description': page.description, 'twitter:image': socialImage }).map(([key, value]) => meta('name', key, value)),
  ].join('\n');
  const cleaned = shell.replace(/<title>[\s\S]*?<\/title>\n?/g, '')
    .replace(/<meta\s+(?:name|property)="(?:description|robots|og:(?:type|site_name|title|description|url|image)|twitter:(?:card|title|description|image))"[^>]*>\n?/g, '')
    .replace(/<link\s+rel="canonical"[^>]*>\n?/g, '');
  const boundary = cleaned.includes('</head>') ? '</head>' : '<div id="exact-root">';
  if (!cleaned.includes(boundary)) throw new Error('Client shell head boundary changed.');
  return socialDetails(cleaned.replace(boundary, `${fields}\n${boundary}`));
}

export function prepareSEO(dist: string, pages: SEOPage[], clientRoutes: { name: string; pattern: string }[]) {
  const image = readFileSync(resolve(dist, 'assets/brand/rightui-og.png'));
  if (image.toString('hex', 0, 8) !== '89504e470d0a1a0a' || image.readUInt32BE(16) !== 1200 || image.readUInt32BE(20) !== 630 || image.length > 1_000_000) {
    throw new Error('Social image must be a PNG measuring 1200 × 630, below 1 MB.');
  }
  const shellPath = resolve(dist, 'shell.html');
  const shell = readFileSync(shellPath, 'utf8');
  mkdirSync(resolve(dist, '_client-pages'), { recursive: true });
  for (const route of clientRoutes) {
    const page = pages.find(page => page.url === route.pattern);
    if (!page) throw new Error(`Missing client SEO data: ${route.pattern}`);
    writeFileSync(resolve(dist, clientTarget(route.name).slice(1) + '.html'), withClientMetadata(shell, page));
  }
  // The generic fallback is not a content page. Each client route has its own head above.
  writeFileSync(shellPath, shell.replace(/<meta name="robots"[^>]*>\n?/g, '').replace('<div id="exact-root">', '<meta name="robots" content="noindex, follow">\n<div id="exact-root">'));
  const indexed = pages.filter(page => isIndexable(page.url));
  if (new Set(indexed.map(page => page.url)).size !== indexed.length) throw new Error('Duplicate sitemap URLs.');
  // Include the two indexable client pages omitted by Exact’s build-only sitemap.
  writeFileSync(resolve(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexed.map(page => `  <url><loc>${escape(origin + page.url)}</loc></url>`).join('\n')}\n</urlset>\n`);
  writeFileSync(resolve(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
  console.log(`Prepared SEO for ${pages.length} pages, ${clientRoutes.length} client previews and ${indexed.length} sitemap URLs.`);
}
