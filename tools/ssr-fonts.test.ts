import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { ssrFontBootstrap } from './ssr-fonts';

type Mutation = { type: string; target: NodeStub; addedNodes: NodeStub[]; attributeName?: string };
class NodeStub {
  nodeType = 1;
  parentElement: NodeStub | null = null;
  children: NodeStub[] = [];
  attributes = new Map<string, string>();
  textContent = '';
  runtimeFamily = '';
  notify: (record: Mutation) => void = () => {};
  constructor(public tag = 'div', attrs: Record<string, string> = {}) { for (const [name, value] of Object.entries(attrs)) this.attributes.set(name, value); }
  get isConnected(): boolean { return this.tag === 'html' || !!this.parentElement?.isConnected; }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  hasAttribute(name: string) { return this.attributes.has(name); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); this.notify({ type: 'attributes', target: this, addedNodes: [], attributeName: name }); }
  removeAttribute(name: string) { if (this.attributes.delete(name)) this.notify({ type: 'attributes', target: this, addedNodes: [], attributeName: name }); }
  closest() { for (let node: NodeStub | null = this; node; node = node.parentElement) if (node.hasAttribute('data-rightui-font-scope')) return node; return null; }
  all(): NodeStub[] { return this.children.flatMap(node => [node, ...node.all()]); }
  querySelectorAll() { return this.all().filter(node => node.getAttribute('data-rightui-font') === 'body'); }
  append(child: NodeStub) { child.parentElement = this; child.notify = this.notify; this.children.push(child); this.notify({ type: 'childList', target: this, addedNodes: [child] }); }
  remove() { if (!this.parentElement) return; const parent = this.parentElement; parent.children = parent.children.filter(node => node !== this); this.parentElement = null; parent.notify({ type: 'childList', target: parent, addedNodes: [] }); }
}

function fixture(selected = 'serif') {
  const families = { sans: '"CompiledSans42", system-ui', serif: '"CompiledSerif73", serif', mono: '"CompiledMono19", monospace', theme: '"CustomBody88", serif' };
  const root = new NodeStub('html', { 'data-rightui-font-choice': selected });
  const head = new NodeStub('head'), exact = new NodeStub('div', { id: 'exact-root' });
  const shell = new NodeStub('main', { id: 'site-shell', 'data-rightui-font-ready': 'false', 'data-rightui-font-choice': 'sans' });
  root.append(head); root.append(exact); exact.append(shell);
  let active = false, records: Mutation[] = [], filters: string[] = [], callback = (_records: Mutation[]) => {};
  const notify = (record: Mutation) => { if (active && (record.type === 'childList' || filters.includes(record.attributeName!))) records.push(record); };
  for (const node of [root, ...root.all()]) node.notify = notify;
  const events = new Map<string, () => void>();
  const document = {
    documentElement: root, head, readyState: 'loading',
    getElementById(id: string) { return [root, ...root.all()].find(node => node.getAttribute('id') === id) ?? null; },
    createElement(tag: string) { const node = new NodeStub(tag); node.notify = notify; return node; },
    addEventListener(name: string, listener: () => void) { events.set(name, listener); },
  };
  const sheet = () => head.children.find(node => node.tag === 'style' && node.hasAttribute('data-rightui-font-boot'));
  const computed = (node: NodeStub) => {
    const temporary = node.getAttribute('data-rightui-font-boot') as keyof typeof families;
    return { fontFamily: sheet() && temporary ? families[temporary] : node.runtimeFamily };
  };
  runInNewContext(ssrFontBootstrap, {
    document, getComputedStyle: computed,
    MutationObserver: class {
      constructor(listener: typeof callback) { callback = listener; }
      observe(_node: unknown, options: { attributeFilter: string[] }) { active = true; filters = options.attributeFilter; }
      disconnect() { active = false; records = []; }
      takeRecords() { const result = records; records = []; return result; }
    },
  });
  const flush = () => { let turns = 0; while (active && records.length) { if (++turns > 10) throw new Error('Font observer did not settle'); const next = records; records = []; callback(next); } };
  const probes = () => {
    for (const [choice, family] of Object.entries(families)) { const probe = new NodeStub('span', { id: `rightui-font-${choice}` }); probe.runtimeFamily = family; shell.append(probe); }
    flush();
  };
  const leaf = (parent = shell, role = 'body') => { const node = new NodeStub('span', { 'data-rightui-font': role }); node.runtimeFamily = families.sans; parent.append(node); flush(); return node; };
  const ready = (choice = selected) => {
    document.readyState = 'interactive'; events.get('DOMContentLoaded')?.();
    exact.setAttribute('data-boot-ms', '500'); shell.setAttribute('data-rightui-font-choice', choice); shell.setAttribute('data-rightui-font-ready', 'true'); flush();
  };
  const actual = (node: NodeStub, choice: keyof typeof families) => { node.runtimeFamily = families[choice]; node.setAttribute('style', `font-family:${families[choice]}`); flush(); };
  return { root, shell, families, probes, leaf, ready, actual, flush, sheet, computed, isObserving: () => active };
}

test('the parser applies only compiler-provided families and leaves code typography intact', () => {
  const page = fixture('mono'); page.probes();
  const body = page.leaf(), code = page.leaf(page.shell, 'code');
  expect(page.computed(body).fontFamily).toBe(page.families.mono);
  expect(code.hasAttribute('data-rightui-font-boot')).toBe(false);
  expect(body.hasAttribute('style')).toBe(false);
  for (const family of Object.values(page.families)) expect(page.sheet()?.textContent).toContain(family);
  expect(ssrFontBootstrap).not.toContain('Geist');
});

test('explicit nested scopes and the configured theme fallback survive the initial global choice', () => {
  const page = fixture(); page.probes();
  const mono = new NodeStub('section', { 'data-rightui-font-scope': 'mono' }); page.shell.append(mono);
  const fallback = new NodeStub('section', { 'data-rightui-font-scope': 'theme' }); mono.append(fallback);
  const a = page.leaf(mono), b = page.leaf(fallback);
  expect(page.computed(a).fontFamily).toBe(page.families.mono);
  expect(page.computed(b).fontFamily).toBe(page.families.theme);
});

test('handoff waits for lazy rows, never rewrites their inline styles, then removes itself', () => {
  const page = fixture(); page.probes(); const eager = page.leaf(), lazy = page.leaf();
  page.actual(eager, 'serif'); page.ready();
  expect(eager.hasAttribute('data-rightui-font-boot')).toBe(false);
  expect(page.computed(lazy).fontFamily).toBe(page.families.serif);
  expect(page.isObserving()).toBe(true);
  page.actual(lazy, 'serif');
  expect(page.isObserving()).toBe(false);
  expect(page.sheet()).toBeUndefined();
  expect(lazy.getAttribute('style')).toBe(`font-family:${page.families.serif}`);
  page.actual(lazy, 'mono');
  expect(page.computed(lazy).fontFamily).toBe(page.families.mono);
});

test('a runtime choice made before handoff wins over the initial preference', () => {
  const page = fixture(); page.probes(); const body = page.leaf();
  page.ready('mono');
  expect(page.computed(body).fontFamily).toBe(page.families.mono);
  page.actual(body, 'mono');
  expect(page.sheet()).toBeUndefined();
});

test('a leaf that becomes code stops receiving the body font override', () => {
  const page = fixture(); page.probes(); const body = page.leaf();
  body.setAttribute('data-rightui-font', 'code'); page.flush();
  expect(body.hasAttribute('data-rightui-font-boot')).toBe(false);
  expect(page.computed(body).fontFamily).toBe(page.families.sans);
  page.ready(); expect(page.isObserving()).toBe(false);
});
