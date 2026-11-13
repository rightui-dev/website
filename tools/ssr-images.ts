/** Website-only first-paint repair. Run on generated HTML before publication. */
export function repairSSRImages(html: string, qrSource?: string): string {
  return html.replace(/<img\b[^>]*>/g, tag => {
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
    const path = attr('data-symbol-path');
    if (path !== undefined) {
      const viewBox = attr('data-symbol-viewbox') ?? '0 0 24 24';
      // Same geometry and default weight (400) as Exact's symbol mask renderer.
      const paint = /\bdata-symbol-fill(?:\s|=|>)/.test(tag)
        ? `fill="black" fill-rule="${/\bdata-symbol-nonzero(?:\s|=|>)/.test(tag) ? 'nonzero' : 'evenodd'}"`
        : 'fill="none" stroke="black" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${path.split(';').map(d => `<path d="${d}" ${paint}/>`).join('')}</svg>`;
      const mask = `url(&quot;data:image/svg+xml,${encodeURIComponent(svg)}&quot;)`;
      // Exact replaces this variable on activation; retain its img and metadata.
      const css = `--exact-symbol-mask:${mask};background-color:currentColor;mask-image:var(--exact-symbol-mask);mask-repeat:no-repeat;mask-position:center;mask-size:contain;mask-origin:content-box;mask-clip:content-box;`;
      if (!tag.includes('--exact-symbol-mask:')) {
        tag = /\bstyle="/.test(tag) ? tag.replace(/\bstyle="/, `style="${css}`) : tag.replace(/>$/, ` style="${css}">`);
      }
    }
    if (qrSource && /\bsrc="\/?assets\/home\/exact-qr\.svg"/.test(tag)) {
      tag = tag.replace(/\bsrc="[^"]*"/, `src="data:image/svg+xml,${encodeURIComponent(qrSource)}" data-rightui-inline-asset="assets/home/exact-qr.svg"`);
      tag = tag.replace(/\bloading="lazy"/, 'loading="eager"');
    }
    if (attr('id') === 'navbar-logo') {
      for (const [name, value] of Object.entries({ loading: 'eager', decoding: 'sync', width: '28', height: '28' })) {
        const attribute = new RegExp(`\\s${name}="[^"]*"`, 'g');
        tag = tag.replace(attribute, '').replace(/>$/, ` ${name}="${value}">`);
      }
    }
    return tag.replace(/\bsrc="assets\//, 'src="/assets/');
  });
}

/** Refuse a header that could show an empty logo while scripts or an image request load. */
export function assertNavbarFirstPaint(html: string, inlineLogo: string): boolean {
  if (!/\bid="site-header"/.test(html)) return false;
  const logo = html.match(/<img\b[^>]*\bid="navbar-logo"[^>]*>/)?.[0];
  if (!logo || !inlineLogo.startsWith('data:image/png;base64,') || !logo.includes(`src="${inlineLogo}"`)
    || !logo.includes('loading="eager"') || !logo.includes('decoding="sync"')
    || !logo.includes('width="28"') || !logo.includes('height="28"')) {
    throw new Error('Navbar logo must be embedded, eagerly decoded and sized in the initial HTML.');
  }
  return true;
}
