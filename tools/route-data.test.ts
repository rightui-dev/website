import {describe, expect, test} from 'bun:test';
import {answer} from '../apps/site/app';

type Request = {id: string; name: string; sourceFile: string; blockCategory: string};
const request = (id: string, name: string, sourceFile = '', blockCategory = ''): Request => ({id, name, sourceFile, blockCategory});
const load = (requests: Request[]) => answer('loadScreens', [requests], {}, {}, {});

describe('retained route data', () => {
  test('keeps each visit identity, page and component source separate', async () => {
    const screens = await load([
      request('1', 'home'), request('2', 'component_avatar'), request('3', 'component_button'),
    ]);
    expect(screens.map(screen => screen.id)).toEqual(['1', '2', '3']);
    expect(screens.map(screen => screen.name)).toEqual(['home', 'component_avatar', 'component_button']);
    expect(screens[0].page.kind).toBe('home');
    expect(screens[1].page.title).toBe('Avatar');
    expect(screens[2].page.title).toBe('Button');
    expect(screens[0].source).toEqual({path: '', code: '', language: ''});
    expect(screens[1].source.path).toBe('packages/ui/composition.contract');
    expect(screens[2].source.path).toBe('packages/ui/button.contract');
    expect(screens[1].source.code).not.toBe(screens[2].source.code);
  });

  test('retains distinct source queries for repeated visits to the source route', async () => {
    const screens = await load([
      request('11', 'source', 'examples/avatar.contract'),
      request('12', 'source', 'examples/button.contract'),
    ]);
    expect(screens.map(screen => screen.id)).toEqual(['11', '12']);
    expect(screens.map(screen => screen.source.path)).toEqual(['examples/avatar.contract', 'examples/button.contract']);
    expect(screens[0].source.code).not.toBe(screens[1].source.code);
  });

  test('a push and a return preserve the earlier route data', async () => {
    const previous = [request('21', 'home'), request('22', 'component_avatar')];
    const initial = await load(previous);
    const expected = structuredClone(initial);
    const pushed = await load([...previous, request('23', 'component_button')]);
    expect(pushed.slice(0, 2)).toEqual(expected);
    expect(initial).toEqual(expected);
    const popped = await load(previous);
    expect(popped).toEqual(expected);
  });

  test('loads auxiliary content only for the routes that own it', async () => {
    const screens = await load([
      request('31', 'home'), request('32', 'blocks_sidebar'), request('33', 'area'), request('34', 'compatibility'),
    ]);
    expect(screens[0].blocks).toEqual([]);
    expect(screens[0].charts).toEqual([]);
    expect(screens[0].compatibility.groups).toEqual([]);
    expect(screens[1].blocks.length).toBeGreaterThan(0);
    expect(screens[1].charts).toEqual([]);
    expect(screens[2].charts.length).toBeGreaterThan(0);
    expect(screens[2].blocks).toEqual([]);
    expect(screens[3].compatibility.groups.length).toBeGreaterThan(0);
    expect(screens[3].blocks).toEqual([]);
    expect(screens[3].charts).toEqual([]);
  });

  test('category queries override legacy URLs without changing the visit identity', async () => {
    const legacy = await load([request('51', 'blocks_sidebar')]);
    const selected = await load([request('51', 'blocks_sidebar', '', 'login')]);
    const invalid = await load([request('51', 'blocks_sidebar', '', 'unknown')]);
    expect(legacy[0].blockCategory).toBe('sidebar');
    expect(selected[0].blockCategory).toBe('login');
    expect(selected[0].id).toBe(legacy[0].id);
    expect(selected[0].page).toEqual(legacy[0].page);
    expect(invalid[0].blockCategory).toBe('sidebar');
  });

  test('keeps not-found responses and accepts an empty route list', async () => {
    const screens = await load([
      request('41', 'missing_route'), request('42', 'source', 'missing.contract'),
    ]);
    expect(screens[0].page.kind).toBe('notfound');
    expect(screens[0].page.title).toBe('Page not found');
    expect(screens[1].source).toEqual({path: 'missing.contract', code: 'Source file not found. Choose a component or block to open its source.', language: 'Text'});
    expect(await load([])).toEqual([]);
  });
});
