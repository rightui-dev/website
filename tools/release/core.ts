import { createHash } from 'node:crypto';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

export type Target = 'site' | 'appdrop' | 'npm' | 'all';
export type Snapshot = { website: string; library: string; exact: string };
export type Artifact = { path: string; sha256: string };
export type State = {
  schema: 1; id: string; target: Target; version: string; source: Snapshot; current: Snapshot;
  workspace: string; toolchain: string; createdAt: string; buildNumber: string;
  steps: Record<string, { status: 'running' | 'done'; result?: any }>;
};
export const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
export const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
export const artifact = (path: string): Artifact => ({ path: resolve(path), sha256: hash(readFileSync(path)) });
export function verifyArtifact(value: Artifact) {
  if (!value || !existsSync(value.path) || artifact(value.path).sha256 !== value.sha256) throw new Error('Saved artifact is missing or changed. Refusing to publish or rebuild it silently.');
}
export function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
}
export function git(root: string, ...args: string[]): string {
  return gitOutput(root, ...args).trim();
}
export function gitOutput(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}
export function assertClean(root: string) {
  if (git(root, 'status', '--porcelain')) throw new Error(`Uncommitted changes in ${root}. Commit the intended release sources before delivery; no files were staged automatically.`);
}
export function treeHash(root: string): string {
  const entries: string[] = [];
  function visit(dir: string, prefix = '') {
    for (const name of readdirSync(dir).sort()) {
      const path = resolve(dir, name), key = prefix + name, stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error(`Unexpected artifact symlink: ${key}`);
      if (stat.isDirectory()) visit(path, `${key}/`);
      else entries.push(`${key}\0${hash(readFileSync(path))}`);
    }
  }
  visit(root);
  return hash(entries.join('\n'));
}
export function acquireLock(path: string): () => void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try { mkdirSync(path, { mode: 0o700 }); }
  catch {
    let pid: number;
    try { pid = json(resolve(path, 'owner.json')).pid; } catch { throw new Error('Release lock is incomplete. Inspect it before removing it.'); }
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('Invalid release lock.');
    try { process.kill(pid, 0); throw new Error(`Another release is running (PID ${pid}).`); }
    catch (error: any) { if (error.code !== 'ESRCH') throw error; }
    rmSync(path, { recursive: true });
    mkdirSync(path, { mode: 0o700 });
  }
  writeJson(resolve(path, 'owner.json'), { pid: process.pid });
  return () => rmSync(path, { recursive: true, force: true });
}
export function validateState(state: State, workspace: string) {
  if (state.schema !== 1 || !/^[a-zA-Z0-9-]+$/.test(state.id) || state.workspace !== workspace ||
      !['site', 'appdrop', 'npm', 'all'].includes(state.target) || !/^0\.\d+\.\d+-beta\.[1-9]\d*$/.test(state.version) ||
      !/^\d+$/.test(state.buildNumber) || !state.steps) throw new Error('Invalid release state or wrong workspace.');
  for (const snapshot of [state.source, state.current]) for (const key of ['website', 'library', 'exact'] as const) {
    if (!/^[a-f0-9]{40}$/.test(snapshot?.[key])) throw new Error('Invalid source provenance.');
  }
}

export class Journal {
  constructor(public directory: string, public state: State) {}
  save() { writeJson(resolve(this.directory, 'release.json'), this.state); }
  async step<T>(name: string, execute: (interrupted: boolean) => Promise<T>, verify?: (result: T) => void | Promise<void>): Promise<T> {
    const previous = this.state.steps[name];
    if (previous?.status === 'done') {
      await verify?.(previous.result);
      console.log(`✓ ${name} (reused)`);
      return previous.result;
    }
    this.state.steps[name] = { status: 'running' };
    this.save();
    console.log(`→ ${name}`);
    const result = await execute(previous?.status === 'running');
    this.state.steps[name] = { status: 'running', result };
    this.save();
    await verify?.(result);
    this.state.steps[name] = { status: 'done', result };
    this.save();
    return result;
  }
}

export class Commands {
  child: ReturnType<typeof Bun.spawn> | undefined;
  interrupted = false;
  constructor(public logs: string, public env: Record<string, string | undefined> = {}) {}
  async run(label: string, args: string[], cwd: string, extra: Record<string, string> = {}): Promise<string> {
    if (this.interrupted) throw new Error('Release interrupted.');
    mkdirSync(this.logs, { recursive: true, mode: 0o700 });
    const outPath = resolve(this.logs, `${label}.out.log`), errPath = resolve(this.logs, `${label}.err.log`);
    const out = openSync(outPath, 'w', 0o600), err = openSync(errPath, 'w', 0o600);
    try {
      this.child = Bun.spawn(args, { cwd, env: { ...process.env, ...this.env, ...extra }, stdout: out, stderr: err, stdin: 'ignore' });
      const code = await this.child.exited;
      if (code !== 0 || this.interrupted) throw new Error(`${label} failed (exit ${code}). Private logs: ${this.logs}`);
      return readFileSync(outPath, 'utf8');
    } finally { this.child = undefined; closeSync(out); closeSync(err); }
  }
  stop() { this.interrupted = true; this.child?.kill('SIGTERM'); }
}

export async function fetchJson(url: string) {
  const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Read failed: HTTP ${response.status} at ${new URL(url).origin}.`);
  return response.json() as Promise<any>;
}
export async function download(url: string, path: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}.`);
  await Bun.write(path, response);
  return artifact(path);
}
