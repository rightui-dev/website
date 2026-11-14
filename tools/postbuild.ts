import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { repairSSRImages, assertNavbarFirstPaint } from './ssr-images';
import { prepareSEO, clientTarget, socialDetails } from './seo';
import { withInitialTheme } from './theme';
import { withClipboardFallback } from './clipboard';
import { compiledModeCSS, withCompiledModeStyles, withSSRModeBootstrap } from './ssr-modes';

const root = resolve(import.meta.dir, '..');
const dist = resolve(root, 'dist');
if (statSync(resolve(dist, 'app.js')).size > 25 * 1024 * 1024) {
  throw new Error('app.js exceeds the Cloudflare 25 MiB asset limit. Check for duplicated Contract slots before deployment.');
}
writeFileSync(resolve(dist, 'rightui-modes.css'), compiledModeCSS(readFileSync(resolve(dist, 'style.css'), 'utf8')));
function insertHead(html: string, markup: string) {
  if (html.includes('</head>')) return html.replace('</head>', `${markup}</head>`);
  const rootTag = '<div id="exact-root">';
  if (!html.includes(rootTag)) throw new Error('Exact HTML head boundary changed; review first-paint styles.');
  return html.replace(rootTag, `${markup}\n${rootTag}`);
}
const pages: { name: string; url: string; title: string; description: string; markdownHref: string }[] = JSON.parse(readFileSync(resolve(root, 'packages/catalog/markdown.json'), 'utf8'));
for (const page of pages) {
  const source = resolve(dist, `assets/markdown/${page.name}.md`);
  const target = resolve(dist, page.markdownHref.slice(1));
  const body = readFileSync(source, 'utf8');
  if (!body.includes(`# ${page.title}\n`) || !body.includes('title:')) throw new Error(`Incomplete Markdown: ${page.url}`);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  const htmlPath = resolve(dist, page.url === '/' ? 'index.html' : `${page.url.slice(1)}/index.html`);
  if (existsSync(htmlPath)) {
    const html = readFileSync(htmlPath, 'utf8');
    const link = `<link rel="alternate" type="text/markdown" href="${page.markdownHref}">`;
    writeFileSync(htmlPath, html.includes(link) ? html : insertHead(html, link));
  }
}
writeFileSync(resolve(dist, 'llms.txt'), `# rightui\n\n> Exact UI components and patterns. Local documentation with real Contract source.\n\n${pages.filter(p=>p.url!=='/source').map(p=>`- [${p.title}](${p.markdownHref}): ${p.description}`).join('\n')}\n`);
console.log(`Published and checked ${pages.length} Markdown documents and llms.txt.`);

const fontPaths = [...readFileSync(resolve(root, 'apps/site/app.contract'), 'utf8').matchAll(/^\s+\d+(?: \d+)?(?: italic)? = "([^"\n]+\.(?:ttf|otf|woff2?))"/gm)].map(match=>match[1]);
if (!fontPaths.length) throw new Error('No declared font resources found. Review the application font declarations.');
const criticalCSS = readFileSync(resolve(root, "apps/site/assets/critical.css"), "utf8");
copyFileSync(resolve(root, "apps/site/assets/critical.css"), resolve(dist, "assets/critical.css"));
const qrSource = readFileSync(resolve(dist, 'assets/home/exact-qr.svg'), 'utf8');
const navbarLogo = readFileSync(resolve(root, 'apps/site/assets/brand/rightui-navbar.png'));
if (navbarLogo.length > 8192 || navbarLogo.readUInt32BE(16) !== 56 || navbarLogo.readUInt32BE(20) !== 56) {
  throw new Error('Navbar logo must remain a compact 56×56 PNG for its 28px display size.');
}
const inlineLogo = `data:image/png;base64,${navbarLogo.toString('base64')}`;
let firstPaintLogos = 0;
let fontFaces = 0;
function fixFontDisplay(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) fixFontDisplay(path);
    else if (/\.(html|css)$/.test(entry.name)) {
      const source = readFileSync(path, 'utf8');
      let next = source.replace(/@font-face\s*\{[^}]*\}/g, face => {
        if (!fontPaths.some(path => face.includes(path))) return face;
        if (!/font-display\s*:\s*(optional|swap)/.test(face)) return face;
        fontFaces++;
        return face.replace(/font-display\s*:\s*optional/g, 'font-display:swap');
      });
      if (entry.name.endsWith('.html')) {
        next = withCompiledModeStyles(withSSRModeBootstrap(withInitialTheme(withClipboardFallback(socialDetails(repairSSRImages(next, qrSource))))));
        if (assertNavbarFirstPaint(next, inlineLogo)) firstPaintLogos++;
        next = next.replace(/<style data-rightui-critical>[\s\S]*?<\/style>\n?/g, '');
        next = insertHead(next, `<style data-rightui-critical>${criticalCSS}</style>`);
      }
      if (next !== source) writeFileSync(path, next);
    }
  }
}
fixFontDisplay(dist);
if (firstPaintLogos === 0 || !readFileSync(resolve(dist, 'app.js'), 'utf8').includes(inlineLogo)) {
  throw new Error('Navbar logo must share its inline source between initial HTML and the Exact runtime.');
}
console.log(`Checked ${firstPaintLogos} embedded navbar logos for first paint and runtime source parity.`);
if (fontFaces === 0) throw new Error('Declared font faces were not emitted; review font loading.');
console.log(`Enabled font swapping for ${fontFaces} declared font faces.`);

const routes = JSON.parse(readFileSync(resolve(dist, 'routes.json'), 'utf8')).routes as { name: string; pattern: string; render: string; notfound: boolean }[];
if (routes.some(route => route.render === 'request' || /[:*]/.test(route.pattern))) {
  throw new Error('Cloudflare static hosting needs an explicit handler for request or parameterized routes.');
}
const clientRoutes = routes.filter(route => route.render === 'client' && !route.notfound);
prepareSEO(dist, pages, clientRoutes);
writeFileSync(resolve(dist, '_redirects'), clientRoutes.flatMap(route => [
  `${route.pattern} ${clientTarget(route.name)} 200`, `${route.pattern}/ ${clientTarget(route.name)} 200`,
]).join('\n') + '\n');
writeFileSync(resolve(dist, '.assetsignore'), '.exact-build.json\n.exact/\n**/.DS_Store\n');
console.log(`Prepared Cloudflare static hosting with ${clientRoutes.length} client routes and a real 404 page.`);

const revision = (cwd: string) => execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
const library = resolve(root, '../components');
writeFileSync(resolve(dist, 'build-info.json'), JSON.stringify({
  websiteRevision: revision(root),
  uiRevision: revision(library),
  uiVersion: JSON.parse(readFileSync(resolve(library, 'packages/ui/package.json'), 'utf8')).version,
  exactRevision: revision(resolve(root, process.env.EXACT ?? '../.tooling/exact')),
}, null, 2) + '\n');
