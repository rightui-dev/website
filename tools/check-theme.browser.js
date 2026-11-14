// Run this expression with preview_evaluate({ expression, awaitPromise: true })
// from a dedicated tab on the built site's origin. No SDK/runtime code is changed.
(async () => {
  const key = 'exact.state.theme';
  const original = localStorage.getItem(key);
  const system = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const frames = new Set();
  const results = [];
  const deadline = performance.now() + 45000;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (check, timeout = 8000) => {
    const start = performance.now();
    while (!check()) {
      if (performance.now() - start > timeout || performance.now() > deadline) throw new Error('Timed out waiting for iframe frames or Exact activation');
      await pause(25);
    }
  };
  const cases = [
    { name: 'home / saved dark', path: '/', stored: '"dark"', expected: 'dark' },
    { name: 'doc / saved dark', path: '/docs/components/trace', stored: '"dark"', expected: 'dark' },
    { name: 'client route / saved dark', path: '/charts/area', stored: '"dark"', expected: 'dark', client: true },
    { name: 'home / saved light', path: '/', stored: '"light"', expected: 'light' },
    { name: 'doc / URL light over saved dark', path: '/docs/components/trace?theme=light&probe=theme#usage', stored: '"dark"', expected: 'light' },
    { name: 'home / URL dark over saved light', path: '/?theme=dark', stored: '"light"', expected: 'dark' },
    { name: 'home / system default', path: '/', stored: null, expected: system },
    { name: 'home / corrupt storage', path: '/', stored: '{broken', expected: system },
    { name: 'home / storage unavailable', path: '/', stored: '"dark"', expected: system, blocked: true },
    { name: 'client / URL dark with storage unavailable', path: '/charts/area?theme=dark', stored: '"light"', expected: 'dark', blocked: true, client: true },
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
    let canvas;
    probe.capture = reason => {
      if (!document.body) return;
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
        declared, computed: html.colorScheme, resolved,
        htmlBackground: html.backgroundColor, bodyBackground: body.backgroundColor,
        shellBackground, canvasBackground, pageBackground, brightness: brightness(pageBackground),
      };
      if (probe.samples.length < 1200) probe.samples.push(sample);
    };
    const tick = () => {
      if (probe.stopped) return;
      probe.capture('frame');
      probe.raf = requestAnimationFrame(tick);
    };
    probe.observer = new MutationObserver(() => probe.capture('root style'));
    probe.observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
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
        scenario.stored === null ? localStorage.removeItem(key) : localStorage.setItem(key, scenario.stored);
        const url = new URL(scenario.path, location.origin).href;
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`Route returned HTTP ${response.status}`);
        const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
        const theme = parsed.querySelector('script[data-rightui-theme]');
        if (!theme) throw new Error('Built HTML has no first-paint theme bootstrap');
        const scripts = [];
        for (const script of parsed.querySelectorAll('script')) {
          const type = (script.getAttribute('type') || '').toLowerCase();
          if (script === theme || (type && !['module', 'text/javascript', 'application/javascript'].includes(type))) continue;
          scripts.push({ attributes: [...script.attributes].map(a => [a.name, a.value]), text: script.textContent });
          script.remove();
        }
        const options = JSON.stringify({ url, blocked: !!scenario.blocked }).replaceAll('<', '\\u003c');
        const instrumentation = parsed.createElement('script');
        instrumentation.textContent = `(${observe.toString()})(${options})`;
        theme.before(instrumentation);
        frame = document.createElement('iframe');
        frame.title = `Temporary theme check: ${scenario.name}`;
        frame.style.cssText = 'position:fixed;top:0;left:0;width:1100px;height:750px;border:0;opacity:0;pointer-events:none;z-index:-2147483647';
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
        await pause(450);
        probe.capture('settled');
        const settled = probe.samples.at(-1);
        const wrong = probe.samples.filter(s => s.resolved !== scenario.expected || (s.brightness !== null && (scenario.expected === 'dark' ? s.brightness > 128 : s.brightness < 128)));
        const transitions = probe.samples.filter((sample, i, all) => i === 0 || sample.pageBackground !== all[i - 1].pageBackground || sample.declared !== all[i - 1].declared || sample.phase !== all[i - 1].phase);
        const storedAfter = localStorage.getItem(key);
        const overrideUntouched = !new URL(url).searchParams.has('theme') || storedAfter === scenario.stored;
        results.push({
          name: scenario.name, passed: wrong.length === 0 && probe.errors.length === 0 && overrideUntouched && (scenario.client || initialShell),
          expected: scenario.expected, initialShell, initial, settled,
          frames: probe.samples.filter(s => s.reason === 'frame').length,
          wrongFrames: wrong.slice(0, 8), transitions: transitions.slice(0, 12),
          errors: probe.errors.slice(0, 8), overrideUntouched, storedAfter,
        });
      } catch (error) {
        results.push({ name: scenario.name, passed: false, error: String(error), probeErrors: frame?.contentWindow?.__rightuiThemeProbe?.errors?.slice(0, 8) });
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
    original === null ? localStorage.removeItem(key) : localStorage.setItem(key, original);
  }
  return {
    passed: results.every(result => result.passed), systemPreference: system,
    restoredTheme: localStorage.getItem(key) === original, results,
    limits: 'Computed styles sampled per animation frame plus root style mutations, not a compositor filmstrip. HTML is real fetched HTML in same-origin isolated iframes; runtime is deliberately delayed then loaded unchanged. System fallback tests the current browser preference only. Does not exercise toolbar clicks, back/forward cache, or a fully JavaScript-disabled visit.',
  };
})()
