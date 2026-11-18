import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { acquireLock, artifact, Commands, Journal, json, treeHash, validateState, verifyArtifact, writeJson, type State } from './core';
import { assertOtherPlatform, nextBuild, publicDrop, receipt } from './native';
import { plan } from './main';
import { assertMetadataOnly, type Metadata } from './metadata';
import { checkNpm } from './npm';

const directories: string[] = [];
function temporary() { const dir = mkdtempSync(resolve(tmpdir(), 'rightui-release-test-')); directories.push(dir); return dir; }
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function state(workspace: string): State {
  const source = { website: 'a'.repeat(40), library: 'b'.repeat(40), exact: 'c'.repeat(40) };
  return { schema: 1, id: 'test-all', target: 'all', version: '0.4.0-beta.1', source, current: { ...source }, workspace,
    toolchain: 'tools', createdAt: new Date().toISOString(), buildNumber: '2026111701', steps: {} };
}

test('a failed side effect remains interrupted across process restart; completed work is verified and reused', async () => {
  const dir = temporary(), first = new Journal(dir, state(dir)); let builds = 0;
  await first.step('build', async () => { builds++; return { sha: 'validated' }; });
  await expect(first.step('upload', async () => { throw new Error('connection lost after upload'); })).rejects.toThrow('connection lost');
  const resumed = new Journal(dir, json(resolve(dir, 'release.json')));
  let checked = false, reconciled = false;
  await resumed.step('build', async () => { builds++; return { sha: 'rebuilt' }; }, result => { checked = result.sha === 'validated'; });
  await resumed.step('upload', async interrupted => { reconciled = interrupted; return { revision: 12 }; });
  expect(builds).toBe(1); expect(checked).toBe(true); expect(reconciled).toBe(true);
  expect(json(resolve(dir, 'release.json')).steps.upload).toEqual({ status: 'done', result: { revision: 12 } });
});

test('a changed validated artifact stops resume without silently rebuilding', async () => {
  const dir = temporary(), file = resolve(dir, 'archive.tgz'); writeFileSync(file, 'approved');
  const journal = new Journal(dir, state(dir));
  await journal.step('pack', async () => artifact(file), verifyArtifact);
  writeFileSync(file, 'different');
  let rebuilt = false;
  await expect(journal.step('pack', async () => { rebuilt = true; return artifact(file); }, verifyArtifact)).rejects.toThrow('changed');
  expect(rebuilt).toBe(false);
});

test('the local lock rejects a concurrent release and recovers a dead owner', () => {
  const path = resolve(temporary(), 'lock'), unlock = acquireLock(path);
  expect(() => acquireLock(path)).toThrow('Another release'); unlock();
  mkdirSync(path); writeJson(resolve(path, 'owner.json'), { pid: 2147483647 });
  const recovered = acquireLock(path); recovered(); expect(existsSync(path)).toBe(false);
});

test('resume rejects another workspace or corrupted source provenance', () => {
  const original = state('/workspace');
  expect(() => validateState(original, '/other')).toThrow('wrong workspace');
  original.current.library = 'main';
  expect(() => validateState(original, '/workspace')).toThrow('provenance');
});

test('site artifact fingerprint catches changed, removed and extra files', () => {
  const dir = temporary(); writeFileSync(resolve(dir, 'index.html'), 'validated'); const initial = treeHash(dir);
  writeFileSync(resolve(dir, 'index.html'), 'modified'); expect(treeHash(dir)).not.toBe(initial);
  writeFileSync(resolve(dir, 'index.html'), 'validated'); expect(treeHash(dir)).toBe(initial);
  writeFileSync(resolve(dir, 'extra.js'), 'extra'); expect(treeHash(dir)).not.toBe(initial);
});

test('subprocess failures keep logs private and never expose their output in the error', async () => {
  const dir = temporary(), commands = new Commands(dir);
  await expect(commands.run('fake-upload', [process.execPath, '-e', 'console.log("fake-private-management-value"); process.exit(2)'], dir)).rejects.toThrow('fake-upload failed (exit 2)');
  expect(readFileSync(resolve(dir, 'fake-upload.out.log'), 'utf8')).toContain('fake-private-management-value');
});

test('AppDrop receipt uses an explicit public allowlist', () => {
  const result = receipt({ id: 'wcfnk49huy', revision: 11, version: '2026111701', shortVersion: '0.4.0', build: 'macos', manageKey: 'private', manageUrl: 'private', claimUrl: 'private' }, 'mac', '2026111701', '0.4.0');
  expect(JSON.stringify(result)).not.toContain('private');
  expect(Object.keys(result).sort()).toEqual(['build', 'platform', 'revision', 'url', 'version']);
  expect(() => receipt({ ...result, id: 'wrong' }, 'mac', '2026111701', '0.4.0')).toThrow('unexpected');
});

test('AppDrop metadata and platform preservation are checked, and build numbers stay monotonic', () => {
  const before = publicDrop({ id: 'wcfnk49huy', bundleId: 'dev.rightui', revision: 9, version: '2026111601', shortVersion: '0.3.0', mac: { revision: 10, version: '2026111708', shortVersion: '0.3.0' } });
  expect(nextBuild(before, new Date('2026-11-17T12:00:00Z'))).toBe('2026111709');
  const changed = structuredClone(before); changed.mac!.revision++;
  expect(() => assertOtherPlatform(before, changed, 'ios')).toThrow('mac changed');
  expect(() => publicDrop({ id: 'other' })).toThrow('identity');
});

test('targets have explicit effects: npm never deploys the site or native apps', () => {
  expect(plan('npm').join('\n')).not.toContain('upload native');
  expect(plan('npm').join('\n')).not.toContain('deploy prepared');
  expect(plan('site').join('\n')).not.toContain('OIDC');
  expect(plan('appdrop').join('\n')).not.toContain('deploy prepared');
  expect(plan('all').findIndex(step => step.includes('build and validate iPhone'))).toBeLessThan(plan('all').findIndex(step => step.includes('OIDC')));
});

test('generated metadata cannot silently commit concurrent user edits or other dependency updates', () => {
  const version = '0.4.0-beta.1';
  const manifest = JSON.stringify({ scripts: { build: 'original' }, dependencies: { '@rightui/ui': version } });
  const before: Metadata = {
    'package.json': manifest, 'apps/site/package.json': manifest,
    'apps/site/app.test.contract': 'expect @rightui/ui@0.4.0-beta.1\n',
    'bun.lock': JSON.stringify({ workspaces: { '': { dependencies: { '@rightui/ui': version } } }, packages: { '@rightui/ui': ['old'], other: ['unchanged'] } }),
    'content/downloads.json': JSON.stringify({ iphoneUrl: 'iphone', macDownloadUrl: 'old' }),
  };
  const after = { ...before, 'bun.lock': before['bun.lock'].replace('["old"]', '["new"]'), 'content/downloads.json': JSON.stringify({ iphoneUrl: 'iphone', macDownloadUrl: 'new' }) };
  expect(() => assertMetadataOnly(before, { ...after, 'apps/site/app.test.contract': 'other assertion' }, version, 'new')).toThrow('Unexpected edit');
  expect(() => assertMetadataOnly(before, after, version, 'new')).not.toThrow();
  expect(() => assertMetadataOnly(before, { ...after, 'package.json': manifest.replace('original', 'user edit') }, version, 'new')).toThrow('Unexpected edit');
  expect(() => assertMetadataOnly(before, { ...after, 'bun.lock': after['bun.lock'].replace('unchanged', 'other upgrade') }, version, 'new')).toThrow('Unexpected edit');
  expect(() => assertMetadataOnly(before, { ...after, 'content/downloads.json': after['content/downloads.json'].replace('iphone', 'changed-iphone') }, version, 'new')).toThrow('Unexpected edit');
});

test('a receipt is persisted before post-upload verification, even if verification fails', async () => {
  const dir = temporary(), journal = new Journal(dir, state(dir));
  await expect(journal.step('upload', async () => ({ revision: 12 }), () => { throw new Error('download unavailable'); })).rejects.toThrow('download unavailable');
  expect(json(resolve(dir, 'release.json')).steps.upload).toEqual({ status: 'running', result: { revision: 12 } });
});

test('GitHub workflow is manual, npm-only, serialized and uses OIDC without a publishing token', () => {
  const workflow = Bun.YAML.parse(readFileSync(resolve(import.meta.dir, '../../../components/.github/workflows/publish-npm.yml'), 'utf8')) as any;
  expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
  expect(workflow.concurrency['cancel-in-progress']).toBe(false);
  expect(Object.keys(workflow.jobs)).toEqual(['publish']);
  expect(workflow.jobs.publish.permissions['id-token']).toBe('write');
  expect(workflow.jobs.publish.environment).toBe('npm');
  expect(workflow.on.workflow_dispatch.inputs.tags_only.default).toBe(false);
  const steps = workflow.jobs.publish.steps;
  expect(steps.filter((step: any) => step.run).map((step: any) => step.run)).toEqual([
    'npm install --global npm@11.21.2 --ignore-scripts', 'node tools/publish-npm.mjs',
  ]);
  expect(JSON.stringify(workflow)).not.toContain('NPM_TOKEN');
  expect(JSON.stringify(workflow)).not.toContain('CLOUDFLARE');
  for (const step of steps.filter((step: any) => step.uses)) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
});

test('local delivery stays blocked until both npm tags select the expected version', async () => {
  const original = globalThis.fetch;
  const version = '0.4.0-beta.1';
  let latest = '0.2.0-beta.5';
  globalThis.fetch = (async (url: string | URL | Request) => new Response(JSON.stringify({
    version: String(url).endsWith('/latest') ? latest : version,
    dist: { integrity: 'sha512-verified' },
  }), { status: 200 })) as typeof fetch;
  try {
    await expect(checkNpm(version)).rejects.toThrow('npm latest is 0.2.0-beta.5');
    latest = version;
    expect((await checkNpm(version)).version).toBe(version);
  } finally { globalThis.fetch = original; }
});
