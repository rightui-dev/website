// Run this expression with preview_evaluate({ expression, awaitPromise: true })
// from a dedicated tab on the built site's origin. No SDK/runtime code is changed.
(async () => {
  const key = 'exact.state.theme';
  const fontKey = 'exact.state.uiFont';
  const preferenceKeys = [key, 'exact.state.uiPreset', 'exact.state.uiDensity', 'exact.state.uiRadius', fontKey];
  const original = new Map(preferenceKeys.map(name => [name, localStorage.getItem(name)]));
  const system = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const frames = new Set();
  const results = [];
  const deadline = performance.now() + 45000;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (check, timeout = 8000, waitingFor = 'iframe frames or Exact activation') => {
    const start = performance.now();
    while (!check()) {
      if (performance.now() - start > timeout || performance.now() > deadline) throw new Error(`Timed out waiting for ${waitingFor}`);
      await pause(25);
    }
  };
  const cases = [
    { name: 'rose / direct light', path: '/docs/components/switch?theme=light&preset=rose&density=comfortable&radius=default&font=sans', stored: '"dark"', expected:'light', modes:'ui-preset=rose,ui-density=comfortable,ui-radius=default', background:'rgb(255, 248, 250)', controlHeight:32 },
    { name: 'amber compact serif / direct dark', path: '/themes?theme=dark&preset=amber&density=compact&radius=sharp&font=serif', stored: '"light"', expected:'dark', font:'serif', modes:'ui-preset=amber,ui-density=compact,ui-radius=sharp', background:'rgb(27, 18, 8)', controlHeight:28 },
    { name: 'forest compact sharp serif / direct dark', path: '/themes?theme=dark&preset=forest&density=compact&radius=sharp&font=serif', stored: '"light"', expected:'dark', font:'serif', modes:'ui-preset=forest,ui-density=compact,ui-radius=sharp', background:'rgb(16, 23, 15)', controlHeight:28 },
    { name: 'indigo round / direct light', path: '/docs/components/switch?theme=light&preset=indigo&density=comfortable&radius=round&font=sans', stored: '"dark"', expected:'light', modes:'ui-preset=indigo,ui-density=comfortable,ui-radius=round', background:'rgb(248, 250, 252)', controlHeight:32 },
    { name: 'violet serif / direct light', path: '/themes?theme=light&preset=violet&density=comfortable&radius=round&font=serif', stored: '"dark"', expected:'light', font:'serif', modes:'ui-preset=violet,ui-density=comfortable,ui-radius=round', background:'rgb(250, 245, 255)', controlHeight:32 },
    { name: 'violet compact mono / direct dark', path: '/docs/components/switch?theme=dark&preset=violet&density=compact&radius=sharp&font=mono', stored: '"light"', expected:'dark', font:'mono', modes:'ui-preset=violet,ui-density=compact,ui-radius=sharp', background:'rgb(22, 11, 36)', controlHeight:28 },
    { name: 'home / URL mono over saved serif', path: '/?font=mono', stored: '"dark"', storedFont: '"serif"', expected: 'dark', font: 'mono' },
    { name: 'home / saved serif', path: '/', stored: '"light"', storedFont: '"serif"', expected: 'light', font: 'serif' },
    { name: 'doc / saved mono', path: '/docs/components/trace', stored: '"dark"', storedFont: '"mono"', expected: 'dark', font: 'mono' },
    { name: 'client route / saved mono', path: '/charts/area', stored: '"light"', storedFont: '"mono"', expected: 'light', font: 'mono', client: true },
    { name: 'doc / URL sans over saved mono', path: '/docs/components/switch?font=sans', stored: '"light"', storedFont: '"mono"', expected: 'light' },
    { name: 'home / invalid URL font uses saved serif', path: '/?font=unknown', stored: '"light"', storedFont: '"serif"', expected: 'light', font: 'serif' },
    { name: 'home / corrupt saved font', path: '/', stored: '"light"', storedFont: '{broken', expected: 'light' },
    { name: 'home / saved dark', path: '/', stored: '"dark"', expected: 'dark' },
    { name: 'doc / saved dark', path: '/docs/components/trace', stored: '"dark"', expected: 'dark' },
    { name: 'client route / saved dark', path: '/charts/area', stored: '"dark"', expected: 'dark', client: true },
    { name: 'home / saved light', path: '/', stored: '"light"', expected: 'light' },
    { name: 'doc / URL light over saved dark', path: '/docs/components/trace?theme=light&probe=theme#usage', stored: '"dark"', expected: 'light' },
    { name: 'home / URL dark over saved light', path: '/?theme=dark', stored: '"light"', expected: 'dark' },
    { name: 'home / system default', path: '/', stored: null, expected: system },
    { name: 'home / corrupt storage', path: '/', stored: '{broken', expected: system },
    { name: 'home / storage unavailable', path: '/', stored: '"dark"', storedFont: '"mono"', expected: system, blocked: true },
    { name: 'client / URL dark mono with storage unavailable', path: '/charts/area?theme=dark&font=mono', stored: '"light"', storedFont: '"serif"', expected: 'dark', font: 'mono', blocked: true, client: true },
  ];

  // This is test instrumentation only. It runs before the unchanged app bootstrap.
  function observe(options) {
    const probe = window.__rightuiThemeProbe = { phase: 'initial', samples: [], errors: [], stopped: false, urlReady: false };
    try {
      history.replaceState(null, '', options.url);
      probe.urlReady = location.href === options.url;
      if (!probe.urlReady) throw new Error('Iframe URL did not accept its direct route');
      if (options.blocked) Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() { throw new DOMException('Theme probe: storage denied', 'SecurityError'); },
      });
    } catch (error) {
      probe.errors.push(String(error));
      return;
    }
    addEventListener('error', event => probe.errors.push(event.message || 'Resource/script error'));
    addEventListener('unhandledrejection', event => probe.errors.push(String(event.reason)));
    const transparent = value => !value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)';
    const brightness = value => {
      const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      return channels?.length === 3 ? (channels[0] + channels[1] + channels[2]) / 3 : null;
    };
    const normalizeFamily = value => value.toLowerCase().replace(/["']/g, '').replace(/\s*,\s*/g, ',').trim();
    const fontFaceCache = new WeakMap();
    const declaredFontFaces = () => {
      const faces = [];
      for (const sheet of document.styleSheets) {
        try {
          const rules = sheet.cssRules;
          let cached = fontFaceCache.get(sheet);
          if (!cached || cached.count !== rules.length) {
            const found = [];
            const scan = entries => {
              for (const rule of entries) {
                if (rule.type === CSSRule.FONT_FACE_RULE) found.push({
                  family: normalizeFamily(rule.style.getPropertyValue('font-family')),
                  source: rule.style.getPropertyValue('src'),
                  weight: rule.style.getPropertyValue('font-weight').trim(),
                  style: rule.style.getPropertyValue('font-style').trim() || 'normal',
                });
                else if (rule.cssRules) scan(rule.cssRules);
              }
            };
            scan(rules);
            cached = { count: rules.length, faces: found };
            fontFaceCache.set(sheet, cached);
          }
          faces.push(...cached.faces);
        } catch {
          // A still-loading or cross-origin sheet cannot prove a bundled face.
        }
      }
      return faces;
    };
    const fontSnapshot = shell => {
      const families = Object.fromEntries(['sans', 'serif', 'mono', 'theme'].map(choice => {
        const node = document.getElementById(`rightui-font-${choice}`);
        return [choice, node ? getComputedStyle(node).fontFamily : null];
      }));
      // Exact gives bundled faces generated names such as ExactPlanStack8.
      // Verify those aliases against their actual asset declarations, rather
      // than accepting an arbitrary alias or requiring the source family name.
      const faces = declaredFontFaces();
      const bundles = {
        sans: { normal: 'Geist.ttf', italic: 'Geist-Italic.ttf', weight: '100 900', fallback: 'system-ui,sans-serif' },
        serif: { normal: 'Newsreader.ttf', italic: 'Newsreader-Italic.ttf', weight: '200 800', fallback: 'serif' },
      };
      const faceChecks = Object.fromEntries(Object.entries(bundles).map(([choice, bundle]) => {
        const stack = normalizeFamily(families[choice] || '').split(',');
        const family = stack.shift();
        const supports = style => faces.some(face => face.family === family && face.style === style && face.weight === bundle.weight && [...face.source.matchAll(/url\(["']?([^"')]+)["']?\)/g)].some(match => {
          try { return new URL(match[1], document.baseURI).pathname.endsWith('/assets/fonts/' + bundle[style]); } catch { return false; }
        }));
        return [choice, { family, fallback: stack.join(',') === bundle.fallback, normal: supports('normal'), italic: supports('italic'), loaded: !!family && document.fonts.check(`400 16px "${family}"`, 'RightUI Aa') }];
      }));
      const invalidProbes = Object.entries(faceChecks).filter(([, face]) => !face.fallback || !face.normal || !face.italic).map(([choice]) => choice);
      if (normalizeFamily(families.mono || '') !== 'monospace') invalidProbes.push('mono');
      const visible = [], mismatches = [];
      for (const node of shell?.querySelectorAll('[data-rightui-font="body"]') ?? []) {
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) continue;
        const style = getComputedStyle(node);
        if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue;
        const scope = node.closest('[data-rightui-font-scope]')?.getAttribute('data-rightui-font-scope');
        const choice = Object.hasOwn(families, scope) ? scope : options.font;
        const expected = families[choice], actual = style.fontFamily;
        const sample = { id: node.id || null, text: (node.textContent || node.getAttribute('placeholder') || '').trim().slice(0, 64), actual, choice, expected, temporary: node.getAttribute('data-rightui-font-boot') };
        visible.push(sample);
        if (!expected || normalizeFamily(actual) !== normalizeFamily(expected)) mismatches.push(sample);
      }
      return {
        documentChoice: document.documentElement.getAttribute('data-rightui-font-choice'),
        runtimeChoice: shell?.getAttribute('data-rightui-font-choice'),
        ready: shell?.getAttribute('data-rightui-font-ready'),
        families, faceChecks, invalidProbes, visibleCount: visible.length,
        visibleFamilies: [...new Set(visible.map(row => row.actual))],
        mismatches: mismatches.slice(0, 8), mismatchCount: mismatches.length,
        visibleTemporary: visible.filter(row => row.temporary != null).length,
        pendingElements: document.querySelectorAll('[data-rightui-font-boot]:not(style)').length,
        temporaryStyles: document.querySelectorAll('style[data-rightui-font-boot]').length,
        examples: visible.slice(0, 4),
      };
    };
    let canvas;
    probe.capture = reason => {
      if (!document.body) return;
      // document.write() can run iframe rAF callbacks while a head stylesheet
      // still blocks painting. Sample the initial view once that sheet exists;
      // it stays loaded throughout activation, so runtime resets remain visible.
      const modes = document.querySelector('link[data-rightui-modes]');
      if (modes && !modes.sheet) return;
      if (!canvas?.isConnected) {
        canvas = document.createElement('span');
        canvas.style.cssText = 'position:fixed;width:0;height:0;pointer-events:none;background:Canvas';
        document.body.append(canvas);
      }
      const html = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      const shell = document.getElementById('site-shell');
      const shellBackground = shell ? getComputedStyle(shell).backgroundColor : null;
      const canvasBackground = getComputedStyle(canvas).backgroundColor;
      const pageBackground = !transparent(shellBackground) ? shellBackground : !transparent(body.backgroundColor) ? body.backgroundColor : !transparent(html.backgroundColor) ? html.backgroundColor : canvasBackground;
      const declared = document.documentElement.style.colorScheme;
      const resolved = declared === 'dark' || declared === 'light' ? declared : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      const sample = {
        ms: Math.round(performance.now()), phase: probe.phase, reason,
        declared, computed: html.colorScheme, resolved, modes:document.documentElement.getAttribute("data-x-modes"),
        htmlBackground: html.backgroundColor, bodyBackground: body.backgroundColor,
        shellBackground, canvasBackground, pageBackground, brightness: brightness(pageBackground),
        controlHeight: document.getElementById('search-open')?.getBoundingClientRect().height,
        fonts: fontSnapshot(shell),
      };
      if (probe.samples.length < 1200) probe.samples.push(sample);
    };
    const tick = () => {
      if (probe.stopped) return;
      probe.capture('frame');
      probe.raf = requestAnimationFrame(tick);
    };
    probe.observer = new MutationObserver(() => probe.capture('root style'));
    probe.observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-x-modes', 'data-rightui-font-choice'] });
    probe.stop = () => {
      probe.stopped = true;
      cancelAnimationFrame(probe.raf);
      probe.observer.disconnect();
      canvas?.remove();
    };
    probe.raf = requestAnimationFrame(tick);
  }

  try {
    for (const scenario of cases) {
      if (performance.now() > deadline) {
        results.push({ name: scenario.name, passed: false, error: 'Overall 45-second budget reached; remaining cases not run' });
        break;
      }
      let frame;
      try {
        localStorage.setItem('exact.state.uiPreset', '"neutral"');
        localStorage.setItem('exact.state.uiDensity', '"comfortable"');
        localStorage.setItem('exact.state.uiRadius', '"default"');
        const storedFont = scenario.storedFont === undefined ? '"sans"' : scenario.storedFont;
        storedFont === null ? localStorage.removeItem(fontKey) : localStorage.setItem(fontKey, storedFont);
        scenario.stored === null ? localStorage.removeItem(key) : localStorage.setItem(key, scenario.stored);
        const url = new URL(scenario.path, location.origin).href;
        const response = await fetch(url, { headers: { Accept: 'text/html' }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`Route returned HTTP ${response.status}`);
        const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
        const theme = parsed.querySelector('script[data-rightui-theme]');
        if (!theme) throw new Error('Built HTML has no first-paint theme bootstrap');
        const scripts = [];
        for (const script of parsed.querySelectorAll('script')) {
          const type = (script.getAttribute('type') || '').toLowerCase();
          if (script === theme || script.hasAttribute("data-rightui-ssr-modes") || (type && !['module', 'text/javascript', 'application/javascript'].includes(type))) continue;
          scripts.push({ attributes: [...script.attributes].map(a => [a.name, a.value]), text: script.textContent });
          script.remove();
        }
        const expectedFont = scenario.font || 'sans';
        const options = JSON.stringify({ url, blocked: !!scenario.blocked, font: expectedFont }).replaceAll('<', '\\u003c');
        const instrumentation = parsed.createElement('script');
        instrumentation.textContent = `(${observe.toString()})(${options})`;
        theme.before(instrumentation);
        frame = document.createElement('iframe');
        frame.title = `Temporary theme check: ${scenario.name}`;
        frame.style.cssText = 'position:fixed;top:0;left:0;width:1100px;height:750px;border:0;opacity:0;pointer-events:none;z-index:-2147483647';
        // An iframe inherits its embedding element's color scheme. Match the
        // browser preference rather than the parent page's chosen RightUI mode.
        frame.style.colorScheme = system;
        frames.add(frame);
        document.body.append(frame);
        frame.contentDocument.open();
        frame.contentDocument.write('<!doctype html>\n' + parsed.documentElement.outerHTML);
        frame.contentDocument.close();
        await until(() => frame.contentWindow.__rightuiThemeProbe?.urlReady || frame.contentWindow.__rightuiThemeProbe?.errors.length, 2000);
        const probe = frame.contentWindow.__rightuiThemeProbe;
        if (!probe.urlReady) throw new Error(probe.errors.join('; '));
        await until(() => probe.samples.filter(s => s.reason === 'frame').length >= 3, 2000);
        const initial = probe.samples.at(-1);
        const initialShell = !!frame.contentDocument.getElementById('site-shell');
        probe.phase = 'activation';
        // Restore the original loader. Force its ordinary entry module to load so
        // interaction-only documents can be tested without changing any UI state.
        for (const saved of scripts) {
          const script = frame.contentDocument.createElement('script');
          for (const [name, value] of saved.attributes) script.setAttribute(name, value);
          script.textContent = saved.text;
          frame.contentDocument.head.append(script);
        }
        const activate = frame.contentDocument.createElement('script');
        activate.type = 'module';
        activate.src = new URL('app.js', frame.contentDocument.baseURI).href;
        frame.contentDocument.head.append(activate);
        await until(() => frame.contentDocument.getElementById('exact-root')?.dataset.bootMs);
        await until(() => {
          const shell = frame.contentDocument.getElementById('site-shell');
          return shell?.getAttribute('data-rightui-font-ready') === 'true'
            && !frame.contentDocument.querySelector('[data-rightui-font-boot]');
        }, 8000, 'runtime font readiness and removal of temporary font rules');
        await until(() => frame.contentDocument.fonts.status !== 'loading', 8000, 'bundled font loading');
        await pause(450);
        probe.capture('settled');
        const settled = probe.samples.at(-1);
        const wrong = probe.samples.filter(s => s.resolved !== scenario.expected || (s.brightness !== null && (scenario.expected === 'dark' ? s.brightness > 128 : s.brightness < 128)));
        const expectedModes = scenario.modes || 'ui-preset=neutral,ui-density=comfortable,ui-radius=default';
        const wrongPreset = probe.samples.filter(s => s.reason === 'frame' && s.shellBackground && (s.modes !== expectedModes || (scenario.background && s.shellBackground !== scenario.background) || (scenario.controlHeight && s.controlHeight !== scenario.controlHeight)));
        // Mutation callbacks can observe a binding before the bootstrap observer
        // fixes it in the same microtask. Only paint frames establish a flash.
        const wrongFonts = probe.samples.filter(s => s.reason === 'frame' && s.fonts.visibleCount > 0 && (s.fonts.documentChoice !== expectedFont || s.fonts.invalidProbes.length > 0 || s.fonts.mismatchCount > 0));
        const initialFontChecked = initial.fonts.visibleCount > 0 && initial.fonts.invalidProbes.length === 0 && initial.fonts.mismatchCount === 0;
        const hydrationUnique = !new URL(url).pathname.startsWith("/themes") || (frame.contentDocument.querySelectorAll("#theme-export").length === 1 && frame.contentDocument.querySelectorAll("[data-testid=theme-export-title]").length === 1);
        const runtimeFontChecked = settled.fonts.visibleCount > 0 && settled.fonts.runtimeChoice === expectedFont && settled.fonts.ready === 'true' && settled.fonts.invalidProbes.length === 0 && settled.fonts.mismatchCount === 0 && settled.fonts.pendingElements === 0 && settled.fonts.temporaryStyles === 0 && (expectedFont === 'mono' || settled.fonts.faceChecks[expectedFont]?.loaded === true);
        const transitions = probe.samples.filter((sample, i, all) => i === 0 || sample.pageBackground !== all[i - 1].pageBackground || sample.declared !== all[i - 1].declared || sample.phase !== all[i - 1].phase || sample.fonts.visibleFamilies.join(',') !== all[i - 1].fonts.visibleFamilies.join(','));
        const storedAfter = localStorage.getItem(key);
        const overrideUntouched = !new URL(url).searchParams.has('theme') || storedAfter === scenario.stored;
        const storedFontAfter = localStorage.getItem(fontKey);
        const fontOverrideUntouched = !new URL(url).searchParams.has('font') || storedFontAfter === storedFont;
        results.push({
          name: scenario.name, passed: wrong.length === 0 && wrongPreset.length === 0 && wrongFonts.length === 0 && probe.errors.length === 0 && overrideUntouched && fontOverrideUntouched && runtimeFontChecked && hydrationUnique && (scenario.client || (initialShell && initialFontChecked)),
          expected: scenario.expected, expectedFont, initialShell, initialFontChecked, runtimeFontChecked, hydrationUnique, initial, settled,
          frames: probe.samples.filter(s => s.reason === 'frame').length,
          wrongFrames: wrong.slice(0, 8), wrongPresetFrames: wrongPreset.slice(0, 8), wrongFontFrames: wrongFonts.slice(0, 8), transitions: transitions.slice(0, 12),
          errors: probe.errors.slice(0, 8), overrideUntouched, fontOverrideUntouched, storedAfter, storedFontAfter,
        });
      } catch (error) {
        const probe = frame?.contentWindow?.__rightuiThemeProbe;
        results.push({ name: scenario.name, passed: false, error: String(error), probeErrors: probe?.errors?.slice(0, 8), lastSample: probe?.samples?.at(-1) });
      } finally {
        frame?.contentWindow?.__rightuiThemeProbe?.stop?.();
        frame?.remove();
        frames.delete(frame);
      }
    }
  } finally {
    for (const frame of frames) {
      frame.contentWindow?.__rightuiThemeProbe?.stop?.();
      frame.remove();
    }
    for (const [name, value] of original) value === null ? localStorage.removeItem(name) : localStorage.setItem(name, value);
  }
  return {
    passed: results.length === cases.length && results.every(result => result.passed) && preferenceKeys.every(name => localStorage.getItem(name) === original.get(name)), systemPreference: system,
    restoredTheme: localStorage.getItem(key) === original.get(key),
    restoredPreferences: preferenceKeys.every(name => localStorage.getItem(name) === original.get(name)), results,
    limits: 'Computed colours and visible body font-family stacks sampled per animation frame, not a compositor filmstrip or glyph inspection. Bundled aliases must declare the expected regular/italic assets and variable weight ranges; the selected bundled face must be loaded at runtime. HTML is real fetched HTML in same-origin isolated iframes; runtime is deliberately delayed then loaded unchanged. Runtime font checks require all temporary font rules to disappear. Client routes have no SSR body-font assertion before activation. System fallback tests the current browser preference only. Does not exercise toolbar clicks, back/forward cache, or a fully JavaScript-disabled visit.',
  };
})()
