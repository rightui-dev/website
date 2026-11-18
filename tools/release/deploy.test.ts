import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { git, type State } from './core';
import { alignedLock, assertNotBehind, changedPackageFiles, nextBeta, recoverMetadata, withReleaseNotes } from './deploy';
import { packageSource } from './npm';
import { preserveConcurrentEdits, restoreConcurrentEdits } from './concurrent-edits';

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function repo() {
  const dir = mkdtempSync(resolve(tmpdir(), 'rightui-deploy-')); directories.push(dir);
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.name', 'Release test'); git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'commit.gpgsign', 'false'); git(dir, 'config', 'tag.gpgsign', 'false');
  mkdirSync(resolve(dir, 'packages/ui'), { recursive: true });
  writeFileSync(resolve(dir, 'packages/ui/example.contract'), 'original');
  commit(dir); git(dir, 'tag', '-a', 'v0.4.0-beta.2', '-m', 'release');
  return dir;
}
function commit(dir: string, message = 'test fixture') { git(dir, 'add', '-A'); git(dir, 'commit', '-m', message); return git(dir, 'rev-parse', 'HEAD'); }

test('automatic versions remain beta, including serials above 9; stable inputs are rejected', () => {
  expect(nextBeta('0.4.0-beta.9')).toBe('0.4.0-beta.10');
  expect(nextBeta('0.4.0-beta.9999999999999999')).toBe('0.4.0-beta.10000000000000000');
  for (const bad of ['1.0.0', '0.4.0', '0.4.0-beta.0', '0.4.0-rc.1']) expect(() => nextBeta(bad)).toThrow();
});

test('package changes include new and deleted files; repository-only edits do not bump npm', () => {
  const dir = repo(); writeFileSync(resolve(dir, 'README.md'), 'repository docs');
  expect(changedPackageFiles(dir, 'v0.4.0-beta.2')).toEqual([]);
  writeFileSync(resolve(dir, 'packages/ui/new.contract'), 'new');
  rmSync(resolve(dir, 'packages/ui/example.contract'));
  expect(changedPackageFiles(dir, 'v0.4.0-beta.2').sort()).toEqual(['packages/ui/example.contract', 'packages/ui/new.contract']);
});

test('release notes preserve authored explanations and fallback only describes changed files', () => {
  const authored = '# Changes\n\n## Unreleased\n\n- Fix closing behavior.\n\n## [old]\n';
  expect(withReleaseNotes(authored, ['packages/ui/dialog.contract'])).toBe(authored);
  const empty = '# Changes\n\n## Unreleased\n\n## [old]\n';
  expect(withReleaseNotes(empty, ['packages/ui/dialog.contract'])).toContain('Update distributed file: "dialog.contract".');
});

test('site lock alignment preserves other dependencies and removes only the UI override', () => {
  const old = { workspaces: { '': { dependencies: { '@rightui/ui': 'old', other: '1' } }, 'apps/site': { dependencies: { '@rightui/ui': 'old' } } },
    overrides: { '@rightui/ui': 'file:local', other: 'keep' }, packages: { '@rightui/ui': ['old'], other: ['untouched'] } };
  const lock = alignedLock(old, '0.4.0-beta.3', 'sha512-real-bytes');
  expect(lock.workspaces['apps/site'].dependencies['@rightui/ui']).toBe('0.4.0-beta.3');
  expect(lock.packages['@rightui/ui']).toEqual(['@rightui/ui@0.4.0-beta.3', '', {}, 'sha512-real-bytes']);
  expect(lock.overrides).toEqual({ other: 'keep' }); expect(lock.packages.other).toEqual(['untouched']);
  expect(old.overrides['@rightui/ui']).toBe('file:local');
});

test('published package provenance survives repo-only commits but rejects changed package bytes', () => {
  const dir = repo(), tag = 'v0.4.0-beta.2', original = git(dir, 'rev-parse', 'HEAD');
  writeFileSync(resolve(dir, 'README.md'), 'new docs'); const docs = commit(dir);
  expect(packageSource(dir, tag, docs)).toBe(original);
  writeFileSync(resolve(dir, 'packages/ui/example.contract'), 'changed'); const changed = commit(dir);
  expect(() => packageSource(dir, tag, changed)).toThrow('immutable');
});

test('source preparation refuses a remote ahead of local HEAD without merging or resetting', () => {
  const dir = repo(), original = git(dir, 'rev-parse', 'HEAD');
  writeFileSync(resolve(dir, 'README.md'), 'remote update'); const newer = commit(dir);
  git(dir, 'update-ref', 'refs/remotes/origin/main', original);
  expect(() => assertNotBehind(dir)).not.toThrow();
  git(dir, 'update-ref', 'refs/remotes/origin/main', newer);
  git(dir, 'reset', '--hard', original);
  expect(() => assertNotBehind(dir)).toThrow('origin/main');
  expect(git(dir, 'rev-parse', 'HEAD')).toBe(original);
});

function metadataFixture() {
  const dir = repo(), version = '0.4.0-beta.2';
  mkdirSync(resolve(dir, 'apps/site'), { recursive: true }); mkdirSync(resolve(dir, 'content'));
  for (const file of ['package.json', 'apps/site/package.json']) writeFileSync(resolve(dir, file), JSON.stringify({ dependencies: { '@rightui/ui': version } }));
  writeFileSync(resolve(dir, 'bun.lock'), JSON.stringify({ workspaces: {}, packages: { '@rightui/ui': ['archive'] } }));
  writeFileSync(resolve(dir, 'content/downloads.json'), JSON.stringify({ iphoneUrl: 'keep', macDownloadUrl: 'old' }));
  writeFileSync(resolve(dir, 'apps/site/app.test.contract'), 'expected @rightui/ui@0.4.0-beta.1\n');
  const head = commit(dir);
  writeFileSync(resolve(dir, 'apps/site/app.test.contract'), 'expected @rightui/ui@0.4.0-beta.2\n');
  const source = { website: head, library: head, exact: head };
  const state: State = { schema: 1, id: 'test-all', target: 'all', version, workspace: dir, source, current: { ...source }, createdAt: '', toolchain: '', buildNumber: '1',
    steps: { 'website-metadata': { status: 'running' }, 'upload-mac': { status: 'done', result: { revision: 12 } } } };
  const log = mkdtempSync(resolve(tmpdir(), 'rightui-journal-')); directories.push(log);
  writeFileSync(resolve(dir, 'content/downloads.json'), JSON.stringify({ iphoneUrl: 'keep', macDownloadUrl: 'https://appdrop.app/api/drops/wcfnk49huy/file?revision=12&build=macos' }));
  return { dir, log, state };
}

test('failed metadata commits can be regenerated without discarding unrelated edits', () => {
  const { dir, log, state } = metadataFixture();
  git(dir, 'add', 'content/downloads.json');
  recoverMetadata(dir, log, state);
  expect(git(dir, 'status', '--porcelain')).toBe('');
  expect(readFileSync(resolve(log, 'metadata-recovery.patch'), 'utf8')).toContain('revision=12');
  writeFileSync(resolve(dir, 'packages/ui/example.contract'), 'user edit');
  expect(() => recoverMetadata(dir, log, state)).toThrow('Source files');
  expect(readFileSync(resolve(dir, 'packages/ui/example.contract'), 'utf8')).toBe('user edit');
});

test('a completed metadata commit is adopted after interruption before journal save', () => {
  const { dir, log, state } = metadataFixture();
  const head = commit(dir, `chore(release): sync ${state.version} (${state.id})`);
  recoverMetadata(dir, log, state);
  expect(state.current.website).toBe(head);
  expect(JSON.parse(readFileSync(resolve(log, 'release.json'), 'utf8')).current.website).toBe(head);
});

test('metadata recovery preserves a staged source edit hidden by a restored working copy', () => {
  const { dir, log, state } = metadataFixture();
  const file = resolve(dir, 'package.json'), original = readFileSync(file, 'utf8');
  writeFileSync(file, JSON.stringify({ ...JSON.parse(original), scripts: { custom: 'user work' } }));
  git(dir, 'add', 'package.json'); writeFileSync(file, original);
  expect(() => recoverMetadata(dir, log, state)).toThrow('Unexpected edit');
  expect(git(dir, 'show', ':package.json')).toContain('user work');
});

test('a completed metadata commit is recovered independently of later uncommitted source edits', () => {
  const { dir, log, state } = metadataFixture();
  const head = commit(dir, `chore(release): sync ${state.version} (${state.id})`);
  writeFileSync(resolve(dir, 'package.json'), 'subsequent user edit');
  writeFileSync(resolve(dir, 'new-file.txt'), 'new source');
  recoverMetadata(dir, log, state, true);
  expect(state.current.website).toBe(head);
  preserveConcurrentEdits(dir, resolve(log, 'edits.json'));
  expect(git(dir, 'status', '--porcelain')).toBe('');
  restoreConcurrentEdits(dir, resolve(log, 'edits.json'));
  expect(readFileSync(resolve(dir, 'package.json'), 'utf8')).toBe('subsequent user edit');
  expect(readFileSync(resolve(dir, 'new-file.txt'), 'utf8')).toBe('new source');
});

function editsFixture() {
  const dir = repo(), log = mkdtempSync(resolve(tmpdir(), 'rightui-concurrent-test-'));
  directories.push(log);
  return { dir, file: resolve(log, 'edits.json') };
}

test('resume preserves staged, unstaged and new files, then restores them exactly once after a metadata commit', () => {
  const { dir, file } = editsFixture();
  const source = resolve(dir, 'packages/ui/example.contract');
  writeFileSync(source, 'staged edit'); git(dir, 'add', 'packages/ui/example.contract');
  writeFileSync(source, 'unstaged edit'); writeFileSync(resolve(dir, 'new-file.txt'), 'new file');
  preserveConcurrentEdits(dir, file);
  expect(git(dir, 'status', '--porcelain')).toBe('');
  expect(readFileSync(source, 'utf8')).toBe('original');
  preserveConcurrentEdits(dir, file);
  expect(JSON.parse(readFileSync(file, 'utf8')).entries).toHaveLength(1);
  writeFileSync(resolve(dir, 'downloads.json'), 'published metadata'); commit(dir);
  restoreConcurrentEdits(dir, file);
  expect(readFileSync(source, 'utf8')).toBe('unstaged edit');
  expect(git(dir, 'show', ':packages/ui/example.contract')).toBe('staged edit');
  expect(readFileSync(resolve(dir, 'new-file.txt'), 'utf8')).toBe('new file');
  expect(readFileSync(resolve(dir, 'downloads.json'), 'utf8')).toBe('published metadata');
  const status = git(dir, 'status', '--porcelain');
  restoreConcurrentEdits(dir, file);
  expect(git(dir, 'status', '--porcelain')).toBe(status);
});

test('a crash after stashing but before recording its hash is reconciled from the unique stash message', () => {
  const { dir, file } = editsFixture();
  writeFileSync(resolve(dir, 'new-file.txt'), 'preserved'); preserveConcurrentEdits(dir, file);
  const state = JSON.parse(readFileSync(file, 'utf8')), oid = state.entries[0].oid;
  state.entries[0].phase = 'saving'; delete state.entries[0].oid;
  writeFileSync(file, JSON.stringify(state));
  preserveConcurrentEdits(dir, file);
  expect(JSON.parse(readFileSync(file, 'utf8')).entries[0].oid).toBe(oid);
  restoreConcurrentEdits(dir, file);
  expect(readFileSync(resolve(dir, 'new-file.txt'), 'utf8')).toBe('preserved');
});

test('restoration conflicts preserve the full backup and do not apply it twice', () => {
  const { dir, file } = editsFixture();
  const source = resolve(dir, 'packages/ui/example.contract');
  writeFileSync(source, 'user version'); preserveConcurrentEdits(dir, file);
  writeFileSync(source, 'concurrent version'); commit(dir);
  expect(() => restoreConcurrentEdits(dir, file)).toThrow('complete backup remains');
  const state = JSON.parse(readFileSync(file, 'utf8'));
  expect(git(dir, 'show', `${state.entries[0].oid}:packages/ui/example.contract`)).toBe('user version');
  expect(() => restoreConcurrentEdits(dir, file)).toThrow('interrupted or conflicted');
});

test('resume can recover generated metadata before preserving unrelated concurrent source edits', () => {
  const { dir, log, state } = metadataFixture();
  writeFileSync(resolve(dir, 'packages/ui/example.contract'), 'concurrent edit');
  writeFileSync(resolve(dir, 'new-file.txt'), 'new file');
  recoverMetadata(dir, log, state, true);
  expect(JSON.parse(readFileSync(resolve(dir, 'content/downloads.json'), 'utf8')).macDownloadUrl).toBe('old');
  preserveConcurrentEdits(dir, resolve(log, 'edits.json'));
  expect(git(dir, 'status', '--porcelain')).toBe('');
  expect(() => recoverMetadata(dir, log, state, true)).not.toThrow();
  restoreConcurrentEdits(dir, resolve(log, 'edits.json'));
  expect(readFileSync(resolve(dir, 'packages/ui/example.contract'), 'utf8')).toBe('concurrent edit');
});
