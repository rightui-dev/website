import { expect, test } from 'bun:test';
import { repairSSRImages, assertNavbarFirstPaint } from './ssr-images';

test('server symbol placeholders carry their real geometry before activation', () => {
  const html = '<img data-symbol-color data-symbol-path="M1 2H3;M4 5H6" data-symbol-source="symbol:document" src="data:image/svg+xml,empty" style="isolation:isolate;">';
  const result = repairSSRImages(html);
  expect(result).toContain('data-symbol-source="symbol:document"');
  expect(result).toContain('isolation:isolate;');
  expect(result).toContain('mask-image:var(--exact-symbol-mask)');
  const svg = decodeURIComponent(result.match(/--exact-symbol-mask:url\(&quot;data:image\/svg\+xml,([^&]+)&quot;/)![1]);
  expect(svg).toContain('<path d="M1 2H3"');
  expect(svg).toContain('<path d="M4 5H6"');
  expect(svg).toContain('stroke-width="1.85"');
  expect(repairSSRImages(result)).toBe(result);
});

test('filled symbols retain their viewbox and winding rule', () => {
  const result = repairSSRImages('<img data-symbol-fill data-symbol-nonzero data-symbol-viewbox="0 0 10 10" data-symbol-path="M0 0H10V10Z">');
  const svg = decodeURIComponent(result.match(/--exact-symbol-mask:url\(&quot;data:image\/svg\+xml,([^&]+)&quot;/)![1]);
  expect(svg).toContain('viewBox="0 0 10 10"');
  expect(svg).toContain('fill-rule="nonzero"');
  expect(svg).not.toContain('stroke-width');
});

test('the landing QR is self-contained and eager without rewriting other images', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0H1"/></svg>';
  const result = repairSSRImages('<img alt="QR" src="assets/home/exact-qr.svg" loading="lazy"><img src="https://example.com/image.png" loading="lazy">', svg);
  expect(result).toContain(`src="data:image/svg+xml,${encodeURIComponent(svg)}"`);
  expect(result).toContain('loading="eager"');
  expect(result).toContain('<img src="https://example.com/image.png" loading="lazy">');
  expect(repairSSRImages(result, svg)).toBe(result);
});

test('the navbar logo paints from the same embedded bytes before activation', () => {
  const inline = 'data:image/png;base64,AAA=';
  const html = `<header id="site-header"><img id="navbar-logo" src="${inline}" decoding="async" loading="lazy"></header>`;
  const result = repairSSRImages(html);
  expect(assertNavbarFirstPaint(result, inline)).toBe(true);
  expect(result).toContain(`src="${inline}"`);
  expect(result).toContain('width="28" height="28"');
  expect(repairSSRImages(result)).toBe(result);
});

test('first-paint guards reject missing, deferred or external navbar logos', () => {
  const inline = 'data:image/png;base64,AAA=';
  expect(() => assertNavbarFirstPaint('<header id="site-header"></header>', inline)).toThrow('Navbar logo');
  expect(() => assertNavbarFirstPaint('<header id="site-header"><img id="navbar-logo" src="/assets/brand/rightui.png"></header>', inline)).toThrow('Navbar logo');
  expect(() => assertNavbarFirstPaint(`<header id="site-header"><img id="navbar-logo" src="${inline}" loading="lazy" decoding="async"></header>`, inline)).toThrow('Navbar logo');
  expect(assertNavbarFirstPaint('<main>Frameless preview</main>', inline)).toBe(false);
});
