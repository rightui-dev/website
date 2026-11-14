import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { defaultTheme, themeAxes, themeOptions } from '@rightui/ui/theme';
import { compiledModeCSS, ssrModeBootstrap, withCompiledModeStyles } from './ssr-modes';

const keys = Object.keys(themeAxes) as (keyof typeof themeAxes)[];
const tuple = (settings: Record<string, string>) => keys.map(key => `${themeAxes[key]}=${settings[key]}`).join(',');
const forest = { preset: 'forest', density: 'compact', radius: 'sharp', font: 'serif' };

type RecordLike = { addedNodes: ElementStub[] };
class ElementStub {
  nodeType = 1;
  parentElement: ElementStub | null = null;
  childNodes: ElementStub[] = [];
  attributes = new Map<string, string>();
  changed: () => void = () => {};
  constructor(attributes: Record<string, string> = {}) { for (const [key, value] of Object.entries(attributes)) this.attributes.set(key, value); }
  hasAttribute(name: string) { return this.attributes.has(name); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); if (name === 'data-x-modes') this.changed(); }
  closest() { for (let node: ElementStub | null = this; node; node = node.parentElement) if (node.hasAttribute('data-x-b')) return node; return null; }
  querySelectorAll() { return this.childNodes.flatMap(child => [...(child.hasAttribute('data-x-b') ? [child] : []), ...child.querySelectorAll()]); }
}

function boot(settings = forest) {
  const root = new ElementStub({ 'data-x-modes': tuple(settings) });
  const events = new Map<string, () => void>();
  let active = false, records: RecordLike[] = [], callback = (_records: RecordLike[]) => {};
  root.changed = () => { if (active) records.push({ addedNodes: [] }); };
  const document = { documentElement: root, readyState: 'loading', addEventListener(name: string, listener: () => void) { events.set(name, listener); } };
  const context: any = {
    document,
    MutationObserver: class {
      constructor(listener: typeof callback) { callback = listener; }
      observe() { active = true; }
      takeRecords() { const result = records; records = []; return result; }
      disconnect() { active = false; records = []; }
    },
  };
  const flush = () => {
    let turns = 0;
    while (active && records.length) {
      if (++turns > 10) throw new Error('Mode observer did not settle');
      const next = records; records = []; callback(next);
    }
  };
  const append = (parent: ElementStub, child: ElementStub) => {
    child.parentElement = parent; child.changed = root.changed; parent.childNodes.push(child);
    if (active) records.push({ addedNodes: [child] });
    flush();
  };
  const finishParsing = () => { document.readyState = 'interactive'; events.get('DOMContentLoaded')?.(); flush(); };
  const installRuntime = (requested: Partial<typeof forest> = {}) => {
    let state: Record<string, string> = Object.fromEntries(keys.map(key => [themeAxes[key], requested[key] ?? defaultTheme[key]]));
    const calls: string[][][] = [];
    context.exact = {
      asked: Object.fromEntries(Object.entries(requested).map(([key, value]) => [`mode:${themeAxes[key as keyof typeof themeAxes]}`, { value }])),
      modes: {
        read: () => ({ ...state }),
        set(pins: string[][]) {
          calls.push(pins); state = { ...state, ...Object.fromEntries(pins) };
          root.setAttribute('data-x-modes', keys.map(key => `${themeAxes[key]}=${state[themeAxes[key]]}`).join(','));
          // Exact applies the same tuple to boundaries in document order,
          // with each boundary's explicit pins replacing inherited axes.
          for (const boundary of root.querySelectorAll()) {
            const parent = boundary.parentElement?.closest();
            const inherited = Object.fromEntries((parent?.getAttribute('data-x-modes') ?? root.getAttribute('data-x-modes')!).split(',').map(part => part.split('=')));
            for (const pin of (boundary.getAttribute('data-x-pin') ?? '').split(/[ ,]/).filter(Boolean)) { const [key, value] = pin.split('='); inherited[key] = value; }
            boundary.setAttribute('data-x-modes', keys.map(key => `${themeAxes[key]}=${inherited[themeAxes[key]]}`).join(','));
          }
          return null;
        },
      },
    };
    // modes.js initializes Win to defaults and schedules this first apply.
    root.setAttribute('data-x-modes', keys.map(key => `${themeAxes[key]}=${state[themeAxes[key]]}`).join(','));
    flush();
    return { calls, read: () => state, set: context.exact.modes.set };
  };
  runInNewContext(ssrModeBootstrap, context);
  return { root, append, finishParsing, installRuntime, flush, isObserving: () => active };
}

test('parser resolves nested preview pins over the initial tuple', () => {
  const page = boot();
  const preview = new ElementStub({ 'data-x-b': '0', 'data-x-pin': 'ui-preset=indigo', 'data-x-modes': tuple(defaultTheme) });
  const content = new ElementStub({ 'data-x-b': '0', 'data-x-modes': tuple(defaultTheme) });
  page.append(page.root, preview); page.append(preview, content);
  expect(preview.getAttribute('data-x-modes')).toBe(tuple({ ...forest, preset: 'indigo' }));
  expect(content.getAttribute('data-x-modes')).toBe(preview.getAttribute('data-x-modes'));
});

test('DOMContentLoaded before activation keeps the handoff alive and seeds runtime once', () => {
  const page = boot(); page.finishParsing();
  expect(page.isObserving()).toBe(true);
  const runtime = page.installRuntime();
  expect(page.root.getAttribute('data-x-modes')).toBe(tuple(forest));
  expect(runtime.read()).toEqual(Object.fromEntries(keys.map(key => [themeAxes[key], forest[key]])));
  expect(runtime.calls.length).toBe(1);
  expect(page.isObserving()).toBe(false);
  runtime.set([['ui-preset', 'neutral']]); page.flush();
  expect(page.root.getAttribute('data-x-modes')).toBe(tuple({ ...forest, preset: 'neutral' }));
  expect(runtime.calls.length).toBe(2);
});

test('runtime before DOMContentLoaded hands off once while late parser boundaries retain preview pins', () => {
  const page = boot(); const runtime = page.installRuntime();
  expect(page.isObserving()).toBe(true);
  const preview = new ElementStub({ 'data-x-b': '0', 'data-x-pin': 'ui-radius=round', 'data-x-modes': tuple(defaultTheme) });
  page.append(page.root, preview);
  expect(preview.getAttribute('data-x-modes')).toBe(tuple({ ...forest, radius: 'round' }));
  page.finishParsing();
  expect(page.isObserving()).toBe(false);
  expect(runtime.calls.length).toBe(1);
});

test('a user or application request queued before handoff wins for its axis', () => {
  const page = boot(); page.finishParsing();
  const runtime = page.installRuntime({ radius: 'round' });
  expect(page.root.getAttribute('data-x-modes')).toBe(tuple({ ...forest, radius: 'round' }));
  expect(runtime.calls.length).toBe(1);
});

function compiledFixture() {
  let settings: Record<string, string>[] = [{}];
  for (const key of keys) settings = settings.flatMap(value => themeOptions[key].map(option => ({ ...value, [key]: option })));
  return settings.map((value, index) => `${index ? '' : ':root,'}[data-x-modes="${tuple(value)}"]{--x-ui-background:light-dark(white,black);--x-ui-radius:0px}`);
}

test('shared initial CSS contains all configured compiled tuples and excludes ordinary runtime rules', () => {
  const rules = compiledFixture();
  const css = compiledModeCSS(`body{margin:0}${rules.join('')}@media(min-width:500px){body{display:flex}}`);
  expect(css.match(/data-x-modes=/g)?.length).toBe(rules.length);
  expect(css).not.toContain('margin:0');
  expect(css).not.toContain('@media');
  for (const rule of rules) expect(css).toContain(rule);
});

test('compiled CSS format drift, partial tuples and non-token rules fail explicitly', () => {
  const rules = compiledFixture();
  expect(() => compiledModeCSS(rules.slice(1).join(''))).toThrow(`Expected ${rules.length}`);
  expect(() => compiledModeCSS(rules.join('') + rules[0])).toThrow('Unexpected compiled mode selector');
  expect(() => compiledModeCSS(`@media screen{${rules[0]}}${rules.slice(1).join('')}`)).toThrow('Unexpected compiled mode selector');
  expect(() => compiledModeCSS(rules.join('').replace('--x-ui-radius:0px', 'border-radius:0px'))).toThrow('only token variables');
  expect(() => compiledModeCSS(rules.join('').replace('--x-ui-background:', '--x-other:'))).toThrow('page background');
  expect(() => compiledModeCSS(`${rules.join('')}body{`)).toThrow('complete compiled mode tuples');
});

test('blocking mode stylesheet follows page CSS in both Exact document forms and stays idempotent', () => {
  for (const html of [
    '<html><head><style data-exact-page>:root{--x-ui-background:white}</style><style data-rightui-critical>body{}</style></head><body><div id="exact-root"></div></body></html>',
    '<html><style>:root{--x-ui-background:white}</style><div id="exact-root"></div>',
  ]) {
    const result = withCompiledModeStyles(html);
    expect(result.indexOf('<link data-rightui-modes')).toBeGreaterThan(result.lastIndexOf('</style>'));
    expect(result.indexOf('<link data-rightui-modes')).toBeLessThan(result.indexOf('<div id="exact-root">'));
    expect(result).toContain('rel="stylesheet" href="/rightui-modes.css"');
    expect(withCompiledModeStyles(result)).toBe(result);
  }
  expect(() => withCompiledModeStyles('<html></html>')).toThrow('head boundary');
  expect(() => withCompiledModeStyles('<html><head></head></html>')).toThrow('compiled page CSS');
  expect(() => withCompiledModeStyles('<html></html>', 'https://invalid/css')).toThrow('root-relative');
});
