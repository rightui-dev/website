import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { themeBootstrap, withInitialTheme } from './theme';
import { withClientMetadata } from './seo';

function run(stored: string | null, search = '', unavailable = false) {
  const document = { documentElement: { style: { colorScheme: '' } } };
  const reads: string[] = [];
  runInNewContext(themeBootstrap, {
    document, location: { search }, URLSearchParams,
    get localStorage() {
      if (unavailable) throw new Error('Storage access denied');
      return {
        getItem(key: string) { reads.push(key); return stored; },
        setItem() { throw new Error('The initial theme must never change the saved preference'); },
      };
    },
  });
  return { scheme: document.documentElement.style.colorScheme, reads };
}

test('first paint uses existing Exact preferences and URL overrides without writing storage', () => {
  expect(run('"dark"')).toEqual({ scheme: 'dark', reads: ['exact.state.theme'] });
  expect(run('"light"').scheme).toBe('light');
  expect(run('"dark"', '?theme=light').scheme).toBe('light');
  expect(run('"light"', '?theme=dark').scheme).toBe('dark');
  expect(run('"dark"', '?theme=invalid').scheme).toBe('dark');
  expect(run('"light"', '?theme=dark&theme=light').scheme).toBe('dark');
});

test('missing, damaged or unavailable storage keeps CSS system preference and URL still works', () => {
  for (const stored of [null, '{broken', 'true', '"invalid"', '"system"']) {
    expect(run(stored).scheme).toBe('');
  }
  expect(run(null, '', true).scheme).toBe('');
  expect(run(null, '?theme=dark', true).scheme).toBe('dark');
});

test('inline bootstrap precedes the activation loader and CSS in both Exact HTML forms', () => {
  for (const shell of [
    '<!doctype html><html><meta charset="utf-8"><script>activate()</script><style>html{color-scheme:light dark}</style><div id="exact-root"></div>',
    '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="app.css"></head><body><div id="exact-root"></div></body>',
  ]) {
    const html = withInitialTheme(shell);
    expect(html.indexOf('<script data-rightui-theme>')).toBeLessThan(html.search(/<script>activate|<link rel="stylesheet"/));
    expect(withInitialTheme(html)).toBe(html);
    expect(html).toContain('<div id="exact-root"></div>');
  }
  expect(() => withInitialTheme('<html><body>Changed exporter</body></html>')).toThrow('charset boundary');
  expect(() => withInitialTheme('<html><style>body{}</style><meta charset="utf-8">')).toThrow('before stylesheet');
});

test('dedicated client SEO shells retain the same early bootstrap exactly once', () => {
  const shell = withInitialTheme('<!doctype html><html><meta charset="utf-8"><script>activate()</script><div id="exact-root"></div>');
  const html = withClientMetadata(shell, { name: 'area', url: '/charts/area', title: 'Area Charts', description: 'Charts' });
  expect(html.match(/<script data-rightui-theme>/g)?.length).toBe(1);
  expect(html.indexOf('<script data-rightui-theme>')).toBeLessThan(html.indexOf('<script>activate()'));
  expect(html).toContain('https://rightui.dev/charts/area');
});
