import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { themeBootstrap, withInitialTheme } from './theme';
import { withClientMetadata } from './seo';
import { withSSRModeBootstrap } from './ssr-modes';

function run(stored: string | null, search = '', unavailable = false, settings: Record<string,string> = {}) {
  const attributes: Record<string,string> = {};
  const document = { documentElement: { style: { colorScheme: '' }, setAttribute(name:string,value:string){attributes[name]=value;} } };
  const reads: string[] = [];
  runInNewContext(themeBootstrap, {
    document, location: { search }, URLSearchParams,
    get localStorage() {
      if (unavailable) throw new Error('Storage access denied');
      return {
        getItem(key: string) { reads.push(key); return key==='exact.state.theme' ? stored : settings[key] ?? null; },
        setItem() { throw new Error('The initial theme must never change the saved preference'); },
      };
    },
  });
  return { scheme: document.documentElement.style.colorScheme, reads, modes:attributes["data-x-modes"], font:attributes["data-rightui-font-choice"] };
}

test('first paint uses existing Exact preferences and URL overrides without writing storage', () => {
  expect(run('"dark"').scheme).toBe('dark');
  expect(run('"dark"').reads).toEqual(['exact.state.theme','exact.state.uiPreset','exact.state.uiDensity','exact.state.uiRadius','exact.state.uiFont']);
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

test('saved visual settings and URL overrides resolve before activation without mutating saved values', () => {
  const settings={'exact.state.uiPreset':'"forest"','exact.state.uiDensity':'"compact"','exact.state.uiRadius':'"sharp"','exact.state.uiFont':'"serif"'};
  expect(run('"dark"','',false,settings).modes).toBe('ui-preset=forest,ui-density=compact,ui-radius=sharp');
  expect(run('"dark"','',false,settings).font).toBe('serif');
  expect(run('"dark"','?preset=indigo&radius=round&font=sans',false,settings).modes).toBe('ui-preset=indigo,ui-density=compact,ui-radius=round');
  expect(run('"dark"','?font=sans',false,settings).font).toBe('sans');
  expect(run('"dark"','?theme=system',false,settings).scheme).toBe('');
  expect(run(null,'?preset=unknown&density=wrong&radius=wrong&font=wrong').modes).toBe('ui-preset=neutral,ui-density=comfortable,ui-radius=default');
  expect(run(null,'?font=wrong').font).toBe('sans');
  expect(run(null,'?preset=forest&density=compact&radius=sharp&font=mono',true).modes).toBe('ui-preset=forest,ui-density=compact,ui-radius=sharp');
  expect(run(null,'?font=mono',true).font).toBe('mono');
  for (const preset of ['rose','amber']) {
    expect(run(null,`?preset=${preset}&density=compact&radius=round&font=serif`,true).modes).toBe(`ui-preset=${preset},ui-density=compact,ui-radius=round`);
  }
});

test('SSR mode transport stays before styles and survives client route shells', () => {
  const html=withSSRModeBootstrap(withInitialTheme('<!doctype html><html><meta charset="utf-8"><style>body{}</style><div id="exact-root"></div>'));
  expect(html.indexOf('<script data-rightui-theme>')).toBeLessThan(html.indexOf('<script data-rightui-ssr-modes>'));
  expect(html.indexOf('<script data-rightui-ssr-modes>')).toBeLessThan(html.indexOf('<style>'));
  expect(withSSRModeBootstrap(html)).toBe(html);
  expect(withClientMetadata(html,{name:'area',url:'/charts/area',title:'Charts',description:'Charts'})).toContain('<script data-rightui-ssr-modes>');
  expect(()=>withSSRModeBootstrap('<html></html>')).toThrow('withInitialTheme');
});
