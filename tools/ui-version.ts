import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const beta = /^\d+\.\d+\.\d+-beta\.\d+$/;
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
export function uiVersion(root = resolve(import.meta.dir, '..')): string {
  const version = read(resolve(root, 'node_modules/@rightui/ui/package.json')).version;
  if (!beta.test(version)) throw new Error('Install an exact @rightui/ui beta before generating the site.');
  const versions: Record<string, unknown> = {
    'package.json': read(resolve(root, 'package.json')).dependencies?.['@rightui/ui'],
    'apps/site/package.json': read(resolve(root, 'apps/site/package.json')).dependencies?.['@rightui/ui'],
    'packages/registry/package.json': read(resolve(root, 'packages/registry/package.json')).dependencies?.['@rightui/ui'],
    'library package': read(resolve(root, '../components/packages/ui/package.json')).version,
  };
  const evidenceVersion = read(resolve(root, '../components/metadata/compatibility.json')).version;
  if (typeof evidenceVersion !== 'string' || !beta.test(evidenceVersion) || Bun.semver.order(evidenceVersion, version) > 0) {
    throw new Error(`Invalid compatibility evidence version ${evidenceVersion} for installed @rightui/ui ${version}.`);
  }
  const lock = Bun.JSONC.parse(readFileSync(resolve(root, 'bun.lock'), 'utf8')) as {
    workspaces: Record<string, { dependencies?: Record<string, string> }>;
    overrides?: Record<string, string>;
    packages?: Record<string, unknown[]>;
  };
  for (const [name, workspace] of Object.entries(lock.workspaces) as [string, any][]) {
    if (workspace.dependencies?.['@rightui/ui']) versions[`bun.lock ${name || 'root'}`] = workspace.dependencies['@rightui/ui'];
  }
  for (const [name, value] of Object.entries(versions)) {
    if (value !== version) throw new Error(`${name} uses ${value}; installed @rightui/ui is ${version}. Run bun run sync:ui after aligning the library checkout.`);
  }
  // Local candidates remain usable before publication. Deployment rejects this override.
  if (!lock.overrides?.['@rightui/ui'] && lock.packages?.['@rightui/ui']?.[0] !== `@rightui/ui@${version}`) {
    throw new Error('bun.lock resolves a different UI package. Run bun install.');
  }
  return version;
}

export function assertCurrentUiReferences(content: string, label: string, version: string): void {
  if (content.includes('{{UI_VERSION}}') || content.includes('@rightui/ui@<version>')) {
    throw new Error(`${label}: unresolved UI version placeholder.`);
  }
  // Imports may be unversioned; copyable installation commands must pin this release.
  const commands = content.replaceAll('\\n', '\n');
  const commandPattern = /\b(?:bun\s+add|npm\s+(?:install|i|add|pack)|pnpm\s+add|yarn\s+add)\b[^\r\n;]*?(@rightui\/ui(?:@[^\s"'`\\<>()[\]{};,]*)?)/g;
  for (const match of commands.matchAll(commandPattern)) {
    const requested = match[1].replace(/\.$/, '');
    if (requested !== `@rightui/ui@${version}`) throw new Error(`${label}: installation must pin @rightui/ui@${version}, found ${requested}.`);
  }
  const patterns = [/@rightui\/ui@(\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?)/g, /rightui-ui-(\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?)\.tgz/g, /Beta · (\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?)/g, /Current release: (\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?)/g];
  for (const pattern of patterns) for (const match of content.matchAll(pattern)) {
    if (match[1] !== version) throw new Error(`${label}: stale UI version ${match[1]}; expected ${version}. Use {{UI_VERSION}} in authored guides/templates.`);
  }
}

export function checkBuiltUiReferences(dist: string, version: string): number {
  let checked = 0;
  function visit(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name), name = relative(dist, path).replaceAll('\\', '/');
      // Real source archives retain their changelogs, migration examples and test fixtures.
      if (name === 'assets/registry' || name === 'assets/sources' || entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) visit(path);
      else if (/\.(html|md)$/.test(name) || name === 'llms.txt') {
        const content = readFileSync(path, 'utf8');
        assertCurrentUiReferences(name.endsWith('.html') ? content.replace(/<[^>]*>/g, ' ') : content, name, version);
        checked++;
      }
    }
  }
  visit(dist);
  return checked;
}

export async function publishedUi(): Promise<{ version: string; integrity: string }> {
  const response = await fetch('https://registry.npmjs.org/@rightui%2Fui/beta', { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Cannot verify npm beta: HTTP ${response.status}. Deployment stopped.`);
  const manifest = await response.json() as any;
  if (!beta.test(manifest.version) || typeof manifest.dist?.integrity !== 'string') throw new Error('Invalid npm beta metadata.');
  return { version: manifest.version, integrity: manifest.dist.integrity };
}

export function assertPublishedUi(version: string, lock: any, published: { version: string; integrity: string }): void {
  if (published.version !== version) throw new Error(`npm beta is ${published.version}, site is ${version}. Run bun run sync:ui; commit the synchronized site before deploying.`);
  if (lock.overrides?.['@rightui/ui'] || lock.packages?.['@rightui/ui']?.[0] !== `@rightui/ui@${version}` || lock.packages['@rightui/ui'][3] !== published.integrity) {
    throw new Error('Production requires the official npm archive and matching lockfile integrity; local candidates cannot deploy.');
  }
}
