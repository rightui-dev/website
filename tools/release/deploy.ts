import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { acquireLock, assertClean, git, gitOutput, json, validateState, writeJson, type State } from './core';
import { main } from './main';
import { assertMetadataOnly, metadataFiles, type Metadata } from './metadata';
import config from './config.json';
import { editsFile, preserveConcurrentEdits, restoreConcurrentEdits } from './concurrent-edits';

const root = resolve(import.meta.dir, '../..');
const library = resolve(root, '../components');
const exact = resolve(root, '../.tooling/exact');
const stateRoot = resolve(homedir(), 'Library/Application Support/RightUI/releases');
const pointer = resolve(stateRoot, 'deploy-current.json');
type Deployment = { schema: 1; workspace: string; releaseId?: string; done: boolean };

export function nextBeta(version: string) {
  const match = /^(0\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-beta\.)([1-9]\d*)$/.exec(version);
  if (!match) throw new Error('Only 0.x.y-beta.N releases are supported.');
  return match[1] + (BigInt(match[2]) + 1n);
}

export function changedPackageFiles(repo: string, tag: string) {
  return [...new Set([
    ...git(repo, 'diff', '--name-only', '-z', tag, '--', 'packages/ui').split('\0'),
    ...git(repo, 'ls-files', '--others', '--exclude-standard', '-z', '--', 'packages/ui').split('\0'),
  ].filter(Boolean))];
}

export function withReleaseNotes(changelog: string, files: string[]) {
  const section = /^## Unreleased\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/m;
  const existing = section.exec(changelog);
  if (!existing) throw new Error('The package changelog needs an Unreleased section.');
  if (existing[1].replace(/<!--[\s\S]*?-->/g, '').trim()) return changelog;
  // Factual fallback only. Agents should write behavioral notes while implementing changes.
  const paths = files.map(file => `- Update distributed file: ${JSON.stringify(file.slice('packages/ui/'.length))}.`).join('\n');
  return changelog.replace(section, () => `## Unreleased\n\n${paths}\n\n`);
}

export function alignedLock(lock: any, version: string, integrity: string) {
  const result = structuredClone(lock);
  for (const workspace of Object.values(result.workspaces) as any[]) {
    if (workspace.dependencies?.['@rightui/ui']) workspace.dependencies['@rightui/ui'] = version;
  }
  result.packages['@rightui/ui'] = [`@rightui/ui@${version}`, '', {}, integrity];
  if (result.overrides?.['@rightui/ui']) {
    delete result.overrides['@rightui/ui'];
    if (!Object.keys(result.overrides).length) delete result.overrides;
  }
  return result;
}

export function assertRepo(repo: string, repository: string) {
  if (git(repo, 'branch', '--show-current') !== config.branch) throw new Error(`${repository}: use main; no branch is switched automatically.`);
  const remote = git(repo, 'remote', 'get-url', 'origin');
  if (![`https://github.com/${repository}.git`, `https://github.com/${repository}`, `git@github.com:${repository}.git`].includes(remote)) throw new Error(`${repository}: unexpected origin.`);
  if (git(repo, 'ls-files', '-u')) throw new Error(`${repository}: resolve Git conflicts first.`);
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
    if (existsSync(resolve(repo, git(repo, 'rev-parse', '--git-path', marker)))) throw new Error(`${repository}: finish the pending Git operation first.`);
  }
}

function run(args: string[], cwd = root) {
  console.log(`→ ${args[0] === process.execPath ? 'bun' : args[0]} ${args.slice(1).join(' ')}`);
  const result = Bun.spawnSync(args, { cwd, env: { ...process.env, EXACT_FEEDBACK: '0', PATH: `${dirname(process.execPath)}:${process.env.PATH}` }, stdout: 'inherit', stderr: 'inherit', stdin: 'inherit' });
  if (result.exitCode !== 0) throw new Error(`${args[0]} failed (exit ${result.exitCode}). No signing, authentication or Git protection was disabled.`);
}

export function assertNotBehind(repo: string) {
  const base = git(repo, 'rev-parse', `refs/remotes/origin/${config.branch}`);
  if (git(repo, 'merge-base', base, 'HEAD') !== base) throw new Error('origin/main has changes absent locally. Integrate them before deploying; no automatic merge or force push.');
}

// Recover only the exact generated edits the release engine owns. Never discard source edits.
export function recoverMetadata(repo: string, directory: string, state: State, allowSourceEdits = false) {
  if (state.steps['website-metadata']?.status !== 'running') return;
  const previous = state.current.website;
  const head = git(repo, 'rev-parse', 'HEAD');
  if (head === previous && !git(repo, 'status', '--porcelain')) return;
  const revision = state.steps['upload-mac']?.result?.revision;
  if (!Number.isInteger(revision)) throw new Error('Missing verified Mac receipt for metadata recovery.');
  const url = `https://appdrop.app/api/drops/${config.appdropId}/file?revision=${revision}&build=macos`;
  const before = Object.fromEntries(metadataFiles.map(file => [file, gitOutput(repo, 'show', `${previous}:${file}`)])) as Metadata;
  if (head !== previous) {
    if (!allowSourceEdits) assertClean(repo);
    if (git(repo, 'rev-parse', 'HEAD^') !== previous || git(repo, 'log', '-1', '--format=%s') !== `chore(release): sync ${state.version} (${state.id})`) throw new Error('Unexpected commit during metadata recovery.');
    const committedFiles = git(repo, 'diff', '--name-only', previous, head).split('\n').filter(Boolean);
    if (committedFiles.some(file => !(metadataFiles as readonly string[]).includes(file))) throw new Error('Source files changed during the metadata commit.');
    const committed = Object.fromEntries(metadataFiles.map(file => [file, gitOutput(repo, 'show', `${head}:${file}`)])) as Metadata;
    assertMetadataOnly(before, committed, state.version, url);
    state.current.website = head;
    writeJson(resolve(directory, 'release.json'), state);
    return; // Leave subsequent source edits intact for preservation by the wrapper.
  }
  if (!allowSourceEdits && git(repo, 'ls-files', '--others', '--exclude-standard')) throw new Error('Untracked files appeared during delivery. Preserve them and reconcile before resuming.');
  const changed = git(repo, 'diff', '--name-only', previous).split('\n').filter(Boolean);
  if ((!allowSourceEdits || head !== previous) && changed.some(file => !(metadataFiles as readonly string[]).includes(file))) throw new Error('Source files changed during delivery. Refusing automatic recovery.');
  const generated = changed.filter(file => (metadataFiles as readonly string[]).includes(file));
  const after = Object.fromEntries(metadataFiles.map(file => [file, readFileSync(resolve(repo, file), 'utf8')])) as Metadata;
  assertMetadataOnly(before, after, state.version, url, allowSourceEdits ? generated : metadataFiles);
  if (git(repo, 'status', '--porcelain')) {
    const staged = git(repo, 'diff', '--cached', '--name-only').split('\n').filter(Boolean);
    if (!allowSourceEdits && staged.some(file => !(metadataFiles as readonly string[]).includes(file))) throw new Error('Unexpected staged files during metadata recovery.');
    const stagedMetadata = Object.fromEntries(metadataFiles.map(file => [file, gitOutput(repo, 'show', `:${file}`)])) as Metadata;
    const stagedGenerated = staged.filter(file => (metadataFiles as readonly string[]).includes(file));
    assertMetadataOnly(before, stagedMetadata, state.version, url, stagedGenerated);
    // Save evidence before re-generating the verified dependency/download metadata.
    writeFileSync(resolve(directory, 'metadata-recovery.patch'), git(repo, 'diff', previous), { mode: 0o600 });
    const restore = [...new Set([...generated, ...stagedGenerated])];
    if (restore.length) git(repo, 'restore', '--staged', '--worktree', '--', ...restore);
  }
}

export async function deploy(args = process.argv.slice(2)) {
  if (args.length > 1 || (args[0] && !['--dry-run', '--help'].includes(args[0]))) throw new Error('Usage: ./deploy [--dry-run|--help]');
  if (args[0] === '--help') {
    console.log('Usage: ./deploy [--dry-run]\nPrepare beta if package changed; commit/push both repositories; run the local all-target delivery.\nRun again to resume an interrupted delivery. Breaking changes need a prepared next-minor beta.');
    return;
  }
  if (Bun.version !== config.bun) throw new Error(`Use ./deploy with Bun ${config.bun}.`);
  if (process.platform !== 'darwin') throw new Error('iOS/macOS delivery requires macOS.');
  for (const [repo, name] of [[library, config.libraryRepository], [root, config.websiteRepository]]) assertRepo(repo, name);
  assertClean(exact);
  if (git(exact, 'rev-parse', 'HEAD') !== config.exact) throw new Error('Exact differs from the pinned SDK.');
  const saved: Deployment | undefined = existsSync(pointer) ? json(pointer) : undefined;
  if (saved && (saved.schema !== 1 || saved.workspace !== root || (saved.releaseId && !/^[a-zA-Z0-9-]+$/.test(saved.releaseId)))) throw new Error('Invalid deployment journal.');
  if (args[0] === '--dry-run') {
    console.log(JSON.stringify({ mutations: false, version: json(resolve(library, 'packages/ui/package.json')).version,
      resume: saved && !saved.done ? saved.releaseId ?? 'source preparation' : null,
      steps: ['fetch and check both main branches', 'reuse prepared beta or increment beta for changed package files', 'align site dependency and lock with exact archive', 'commit all non-ignored changes in both repos; push without force', 'local package/site checks and sequential iOS/macOS builds', 'npm-only GitHub Actions: beta + latest', 'AppDrop uploads and verified download metadata', 'local website build, Cloudflare deployment and production checks'],
      signing: 'Preserve Git signing; failure stops delivery. No credentials or security settings changed.' }, null, 2));
    return;
  }
  process.umask(0o077);
  const unlock = acquireLock(resolve(stateRoot, 'delivery.lock'));
  let pendingDirectory: string | undefined;
  try {
    // Another invocation may have finished between our read-only checks and lock acquisition.
    const latest: Deployment | undefined = existsSync(pointer) ? json(pointer) : undefined;
    if (latest && (latest.schema !== 1 || latest.workspace !== root || (latest.releaseId && !/^[a-zA-Z0-9-]+$/.test(latest.releaseId)))) throw new Error('Invalid deployment journal.');
    let deployment: Deployment = latest && !latest.done ? latest : { schema: 1, workspace: root, done: false };
    writeJson(pointer, deployment);
    if (deployment.releaseId) {
      const directory = resolve(stateRoot, deployment.releaseId), state: State = json(resolve(directory, 'release.json'));
      validateState(state, root);
      pendingDirectory = directory;
      recoverMetadata(root, directory, state, true);
      for (const [repo, key] of [[library, 'library'], [root, 'website']] as const) {
        if (git(repo, 'rev-parse', 'HEAD') !== state.current[key]) throw new Error('New commits appeared since this delivery. Refusing to change frozen source provenance.');
      }
      if (!state.steps['candidate-checkout']?.result?.libraryRevision) {
        const changed = [...git(library, 'diff', '--name-only', 'HEAD').split('\n'), ...git(library, 'diff', '--cached', '--name-only').split('\n'), ...git(library, 'ls-files', '--others', '--exclude-standard').split('\n')].filter(Boolean);
        if (changed.some(file => file !== 'AGENTS.md' && !file.startsWith('docs/') && !file.startsWith('tools/'))) throw new Error('This older delivery used a shared candidate library. Package/demo edits require artifact review before its native builds can be reused.');
      }
      for (const [repo, key] of [[library, 'library'], [root, 'website']] as const) preserveConcurrentEdits(repo, editsFile(directory, key));
      await main(['resume', deployment.releaseId], { lockHeld: true });
    } else {
      // Check both remotes before changing either repository.
      for (const repo of [library, root]) {
        run(['git', 'fetch', 'origin', '--tags'], repo);
        assertNotBehind(repo);
      }
      let version = json(resolve(library, 'packages/ui/package.json')).version as string;
      nextBeta(version); // validate even when the current version is already prepared
      const tag = `v${version}`;
      if (git(library, 'tag', '--list', tag)) {
        const changed = changedPackageFiles(library, tag);
        if (changed.length) {
          const file = resolve(library, 'packages/ui/CHANGELOG.md');
          writeFileSync(file, withReleaseNotes(readFileSync(file, 'utf8'), changed));
          version = nextBeta(version);
          run([process.execPath, 'run', 'version:ui', version], library);
        }
      }
      run([process.execPath, 'run', 'check:version'], library);
      run([process.execPath, 'run', 'package:ui'], library);
      const archive = resolve(library, `dist/rightui-ui-${version}.tgz`);
      const integrity = 'sha512-' + createHash('sha512').update(readFileSync(archive)).digest('base64');
      for (const file of ['package.json', 'apps/site/package.json']) {
        const path = resolve(root, file), manifest = json(path);
        manifest.dependencies['@rightui/ui'] = version;
        if (manifest.overrides?.['@rightui/ui']) {
          delete manifest.overrides['@rightui/ui'];
          if (!Object.keys(manifest.overrides).length) delete manifest.overrides;
        }
        writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
      }
      const lock = resolve(root, 'bun.lock');
      writeFileSync(lock, JSON.stringify(alignedLock(Bun.JSONC.parse(readFileSync(lock, 'utf8')), version, integrity), null, 2) + '\n');
      // This prepublication integrity comes from real tarball bytes. The engine
      // installs the sealed candidate, then requires matching official npm bytes.
      for (const repo of [library, root]) {
        if (git(repo, 'status', '--porcelain')) {
          run(['git', 'add', '-A', '--', '.'], repo);
          run(['git', 'commit', '-m', `chore(release): prepare ${version} delivery`], repo);
        }
      }
      for (const repo of [library, root]) run(['git', 'push', 'origin', 'HEAD:refs/heads/main'], repo);
      await main(['all'], { lockHeld: true, onStarted: state => {
        deployment.releaseId = state.id;
        writeJson(pointer, deployment);
      } });
    }
    if (pendingDirectory) {
      for (const [repo, key] of [[library, 'library'], [root, 'website']] as const) restoreConcurrentEdits(repo, editsFile(pendingDirectory, key));
      pendingDirectory = undefined;
    }
    deployment.done = true;
    writeJson(pointer, deployment);
    console.log('Complete: both repositories, npm beta/latest, iOS/macOS AppDrop and rightui.dev.');
  } finally {
    try {
      if (pendingDirectory) {
        const errors: unknown[] = [];
        for (const [repo, key] of [[library, 'library'], [root, 'website']] as const) {
          try { restoreConcurrentEdits(repo, editsFile(pendingDirectory, key)); } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, errors.map(error => (error as Error).message).join('\n'));
      }
    } finally { unlock(); }
  }
}
