// Run in the browser on the built site. Compare script-free HTML with activated Exact.
(async () => {
  const widths = [390, 767, 768, 1023, 1024, 1199, 1200, 1399, 1400, 1899, 1900, 2560];
  const frames = [];
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const round = number => Math.round(number * 100) / 100;
  async function frame(scripts) {
    const element = document.createElement('iframe');
    if (!scripts) element.setAttribute('sandbox', 'allow-same-origin');
    element.style.cssText = 'position:fixed;inset:0;width:1280px;height:900px;border:0;opacity:0.01;pointer-events:none';
    const loaded = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('First-paint frame timed out')), 15000);
      element.onload = () => { clearTimeout(timeout); resolve(); };
    });
    element.src = '/?theme=system&preset=neutral&density=comfortable&radius=default&font=sans&first-paint-audit=' + (scripts ? 'active' : 'static');
    frames.push(element);
    document.body.append(element);
    await loaded;
    await element.contentDocument.fonts.ready;
    return element;
  }
  function measure(element) {
    const doc = element.contentDocument;
    const win = element.contentWindow;
    const hero = doc.querySelector('#page-hero');
    const mosaic = doc.querySelector('#home-mosaic');
    const logo = doc.querySelector('#navbar-logo');
    if (!logo?.complete || logo.naturalWidth !== 56 || !logo.getAttribute('src')?.startsWith('data:image/png;base64,')) {
      throw new Error('Navbar logo is not decoded from the embedded source before activation.');
    }
    const logoBox = logo.getBoundingClientRect();
    if (round(logoBox.width) !== 28 || round(logoBox.height) !== 28) throw new Error('Navbar logo dimensions changed.');
    if (!hero || !mosaic || !doc.querySelector('[data-rightui-critical]')) throw new Error('Built first-paint markup missing');
    return {
      logo: { source: logo.getAttribute('src'), width: round(logoBox.width), height: round(logoBox.height), loaded: true },
      titleSize: win.getComputedStyle(doc.querySelector('#hero-title')).fontSize,
      descriptionSize: win.getComputedStyle(doc.querySelector('#hero-description')).fontSize,
      heroHeight: round(hero.getBoundingClientRect().height),
      mosaicTop: round(mosaic.getBoundingClientRect().top),
      columns: [...mosaic.children].filter(node => node.getBoundingClientRect().width > 1).map(node => {
        const box = node.getBoundingClientRect();
        return { x: round(box.x), width: round(box.width) };
      }),
      overflow: doc.documentElement.scrollWidth > win.innerWidth,
    };
  }
  try {
    const initial = await frame(false);
    const active = await frame(true);
    const field = active.contentDocument.querySelector('[aria-label="Name"]');
    field.dispatchEvent(new active.contentWindow.Event('input', { bubbles: true }));
    await active.contentWindow.exact.ready;
    await delay(250);
    const results = [];
    for (const width of widths) {
      initial.style.width = active.style.width = width + 'px';
      await delay(150);
      const before = measure(initial);
      const after = measure(active);
      const expectedColumns = width >= 1900 ? 5 : width >= 1400 ? 4 : width >= 1024 ? 3 : width >= 768 ? 2 : 1;
      const expectedTitle = width >= 1200 ? '48px' : width >= 768 ? '40px' : '32px';
      if (JSON.stringify(before) !== JSON.stringify(after) || before.columns.length !== expectedColumns || before.titleSize !== expectedTitle || before.overflow) {
        throw new Error(JSON.stringify({ width, before, after, expectedColumns, expectedTitle }));
      }
      results.push({ width, columns: before.columns.length, titleSize: before.titleSize, stable: true });
    }
    return { passed: results.length, results };
  } finally {
    frames.forEach(element => element.remove());
  }
})();
