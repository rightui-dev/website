import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { uiVersion, publishedUi, assertPublishedUi, checkBuiltUiReferences } from './ui-version';

const root = resolve(import.meta.dir, '..');
const version = uiVersion(root);
const args = process.argv.slice(2);
if (args.some(arg => !['--published', '--dist'].includes(arg))) throw new Error('Usage: bun tools/check-ui-version.ts [--published] [--dist]');
if (args.includes('--published')) {
  for (const cwd of [root, resolve(root, '../components'), resolve(root, '../.tooling/exact')]) {
    if (execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }).trim()) throw new Error('Commit or resolve source changes before production deployment.');
  }
  assertPublishedUi(version, Bun.JSONC.parse(readFileSync(resolve(root, 'bun.lock'), 'utf8')), await publishedUi());
}
if (args.includes('--dist')) {
  const info = JSON.parse(readFileSync(resolve(root, 'dist/build-info.json'), 'utf8'));
  const head = (cwd: string) => execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  if (info.uiVersion !== version || info.websiteRevision !== head(root) || info.uiRevision !== head(resolve(root, '../components')) || info.exactRevision !== head(resolve(root, '../.tooling/exact'))) throw new Error('Build provenance is stale. Rebuild before deployment.');
  console.log(`Checked ${checkBuiltUiReferences(resolve(root, 'dist'), version)} public documents.`);
}
console.log(`UI version aligned: ${version}${args.includes('--published') ? ' (npm beta and integrity verified)' : ''}.`);
