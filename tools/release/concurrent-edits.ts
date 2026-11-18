import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { git, json, writeJson } from './core';

type Entry = { message: string; oid?: string; phase: 'saving' | 'saved' | 'applying' | 'restored' };
type SavedEdits = { schema: 1; repo: string; entries: Entry[] };

function load(repo: string, file: string): SavedEdits {
  const state: SavedEdits = existsSync(file) ? json(file) : { schema: 1, repo, entries: [] };
  if (state.schema !== 1 || state.repo !== repo || !Array.isArray(state.entries) || state.entries.some(entry =>
    !/^rightui-concurrent-[a-f0-9-]+$/.test(entry.message) ||
    !['saving', 'saved', 'applying', 'restored'].includes(entry.phase) ||
    (entry.oid && !/^[a-f0-9]{40}$/.test(entry.oid)) || (entry.phase !== 'saving' && !entry.oid))) {
    throw new Error('Invalid concurrent-edit recovery record.');
  }
  return state;
}

function findStash(repo: string, message: string) {
  return git(repo, 'stash', 'list', '--format=%H%x09%gs').split('\n')
    .find(line => line.endsWith(`: ${message}`))?.split('\t')[0];
}

/** Called under the delivery lock, only after matching the frozen source commits. */
export function preserveConcurrentEdits(repo: string, file: string) {
  const state = load(repo, file);
  for (const entry of state.entries) {
    if (entry.phase === 'applying') throw new Error(`A previous edit restoration needs reconciliation. Changes are preserved in Git stash ${entry.oid}.`);
    if (entry.phase === 'saving') {
      const oid = findStash(repo, entry.message);
      if (oid) { entry.oid = oid; entry.phase = 'saved'; writeJson(file, state); }
      else {
        // The process may have stopped before the stash command started.
        if (!git(repo, 'status', '--porcelain')) throw new Error('Interrupted edit backup has no visible stash. Refusing to guess.');
        save(entry);
      }
    }
  }
  if (!git(repo, 'status', '--porcelain')) return;
  if (git(repo, 'ls-files', '-u')) throw new Error('Resolve Git conflicts before preserving concurrent edits.');
  const entry: Entry = { message: `rightui-concurrent-${randomUUID()}`, phase: 'saving' };
  state.entries.push(entry);
  writeJson(file, state); // Record intent before the worktree is changed.
  save(entry);

  function save(entry: Entry) {
    git(repo, 'stash', 'push', '--include-untracked', '--message', entry.message);
    const oid = findStash(repo, entry.message);
    if (!oid) throw new Error('Concurrent edits were not saved; refusing to continue.');
    entry.oid = oid; entry.phase = 'saved'; writeJson(file, state);
    console.log(`Preserved concurrent edits in ${repo}; they are excluded from this delivery.`);
  }
}

export function restoreConcurrentEdits(repo: string, file: string) {
  if (!existsSync(file)) return;
  const state = load(repo, file);
  for (const entry of state.entries) {
    if (entry.phase === 'restored') continue;
    if (entry.phase === 'saving') {
      const oid = findStash(repo, entry.message);
      if (!oid) continue; // Nothing was removed from the working tree yet.
      entry.oid = oid; entry.phase = 'saved'; writeJson(file, state);
    }
    if (entry.phase === 'applying') throw new Error(`Edit restoration was interrupted or conflicted. Backup: Git stash ${entry.oid}. No changes were discarded.`);
    entry.phase = 'applying'; writeJson(file, state);
    try {
      // --index restores the user's staged/unstaged split as well as new files.
      git(repo, 'stash', 'apply', '--index', entry.oid!);
    } catch {
      throw new Error(`Concurrent edits could not be restored cleanly. Resolve the working-tree conflict; the complete backup remains in Git stash ${entry.oid}.`);
    }
    entry.phase = 'restored'; writeJson(file, state);
    console.log(`Restored concurrent edits in ${repo}; ready for the next delivery.`);
    // Keep the backup in the stash list. It is never popped or silently deleted.
  }
}

export const editsFile = (directory: string, repository: 'website' | 'library') => resolve(directory, `concurrent-${repository}.json`);
