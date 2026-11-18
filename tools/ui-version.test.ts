import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { uiVersion, assertCurrentUiReferences, checkBuiltUiReferences, assertPublishedUi } from './ui-version';

const current = '0.3.0-beta.3', old = '0.2.0-beta.5';
const temporary: string[] = [];
const write = (path: string, data: unknown) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data)); };
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });
function fixture() {
  const base = mkdtempSync(resolve(tmpdir(), 'rightui-versions-')); temporary.push(base);
  const root = resolve(base, 'landing');
  for (const file of ['package.json', 'apps/site/package.json', 'packages/registry/package.json']) write(resolve(root, file), { dependencies: { '@rightui/ui': current } });
  for (const file of ['node_modules/@rightui/ui/package.json', '../components/packages/ui/package.json', '../components/metadata/compatibility.json']) write(resolve(root, file), { version: current });
  write(resolve(root, 'bun.lock'), { workspaces: { '': { dependencies: { '@rightui/ui': current } } }, packages: { '@rightui/ui': [`@rightui/ui@${current}`, '', {}, 'sha512-good'] } });
  return root;
}
test('installed package is the common version, with aligned manifests and lock', () => expect(uiVersion(fixture())).toBe(current));
for (const file of ['package.json', 'apps/site/package.json', 'packages/registry/package.json']) test(`rejects stale ${file}`, () => {
  const root = fixture(); write(resolve(root, file), { dependencies: { '@rightui/ui': old } }); expect(() => uiVersion(root)).toThrow('installed @rightui/ui');
});
test('rejects a stale library checkout', () => {
  const file = '../components/packages/ui/package.json';
  const root = fixture(); write(resolve(root, file), { version: old }); expect(() => uiVersion(root)).toThrow('installed @rightui/ui');
});
test('keeps historical compatibility evidence and rejects future or invalid evidence', () => {
  const root = fixture(), file = resolve(root, '../components/metadata/compatibility.json');
  write(file, { version: old });
  expect(uiVersion(root)).toBe(current);
  for (const version of ['0.3.0-beta.4', 'invalid']) {
    write(file, { version });
    expect(() => uiVersion(root)).toThrow('compatibility evidence');
  }
});
test('rejects a stale lock even when manifests agree', () => {
  const root = fixture(); write(resolve(root, 'bun.lock'), { workspaces: {}, packages: { '@rightui/ui': [`@rightui/ui@${old}`] } }); expect(() => uiVersion(root)).toThrow('bun.lock');
});
test('local candidates work without a registry connection but cannot deploy', () => {
  const root = fixture(), lock = { workspaces: {}, overrides: { '@rightui/ui': 'file:./candidate.tgz' }, packages: { '@rightui/ui': ['@rightui/ui@file:./candidate.tgz'] } };
  write(resolve(root, 'bun.lock'), lock); expect(uiVersion(root)).toBe(current); expect(() => assertPublishedUi(current, lock, { version: current, integrity: 'sha512-good' })).toThrow('official npm');
});
test('catches stale copyable commands, archive names, footer and unresolved templates', () => {
  for (const content of [`bun add @rightui/ui@${old}`, `rightui-ui-${old}.tgz`, `Beta · ${old}`, `Current release: ${old}`, '{{UI_VERSION}}', '@rightui/ui@<version>']) expect(() => assertCurrentUiReferences(content, 'guide', current)).toThrow();
  expect(() => assertCurrentUiReferences(`Install @rightui/ui@${current}. Archive: rightui-ui-${current}.tgz. Beta · ${current}`, 'guide', current)).not.toThrow();
});
test('checks delivered documents including client shells and preserves archived source history', () => {
  const root = fixture(), dist = resolve(root, 'dist');
  write(resolve(dist, 'index.html'), `<footer>Beta · ${current}</footer><nav>rightuiDocsComponents</nav>`);
  write(resolve(dist, '_client-pages/demo/index.html'), `<code>npm install @rightui/ui@${current}</code>`);
  write(resolve(dist, 'llms.txt'), `Current release: ${current}`);
  write(resolve(dist, 'assets/registry/CHANGELOG.md'), `npm install @rightui/ui@${old}`);
  expect(checkBuiltUiReferences(dist, current)).toBe(3);
  write(resolve(dist, 'docs/installation.md'), `bun add @rightui/ui@${old}`);
  expect(() => checkBuiltUiReferences(dist, current)).toThrow('docs/installation.md');
});
test('deployment requires the current npm beta and exact official integrity', () => {
  const lock = { packages: { '@rightui/ui': [`@rightui/ui@${current}`, '', {}, 'sha512-good'] } };
  expect(() => assertPublishedUi(current, lock, { version: current, integrity: 'sha512-good' })).not.toThrow();
  expect(() => assertPublishedUi(current, lock, { version: '0.3.0-beta.4', integrity: 'sha512-good' })).toThrow('sync:ui');
  expect(() => assertPublishedUi(current, lock, { version: current, integrity: 'sha512-other' })).toThrow('integrity');
});

test('install commands cannot fall back to latest or an old range; imports remain unversioned', () => {
  for (const command of ['npm install @rightui/ui', 'bun add @rightui/ui@latest', 'pnpm add @rightui/ui@^0.2.0-beta.5', 'yarn add @rightui/ui@beta']) expect(() => assertCurrentUiReferences(command, 'command', current)).toThrow('must pin');
  expect(() => assertCurrentUiReferences('use Button from "@rightui/ui"', 'source', current)).not.toThrow();
  expect(() => assertCurrentUiReferences(`npm install --save-exact @rightui/ui@${current}`, 'command', current)).not.toThrow();
});
