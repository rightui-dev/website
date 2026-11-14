import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dir, '..');
const library = resolve(root, '../components');
const destination = resolve(root, 'packages/registry');
const directories = ['blocks', 'charts', 'examples', 'patterns'];
const posix = (path: string) => path.split(sep).join('/');
const sourcePath = (path: string) => posix(relative(library, path));
const isDemo = (path: string) => directories.some(dir => path.startsWith(`${dir}/`)) && path.endsWith('.contract');
const localImport = (from: string, to: string) => {
  const path = posix(relative(dirname(resolve(destination, from)), resolve(destination, to)));
  return path.startsWith('.') ? path : `./${path}`;
};

export function prepareRegistry(options: { manifestOnly?: boolean } = {}) {
  const registry = JSON.parse(readFileSync(resolve(library, 'package.json'), 'utf8'));
  const site = JSON.parse(readFileSync(resolve(root, 'apps/site/package.json'), 'utf8'));
  const uiVersion = site.dependencies['@rightui/ui'];
  if (!/^\d+\.\d+\.\d+-beta\.\d+$/.test(uiVersion)) {
    throw new Error('The website registry requires an exact @rightui/ui beta version.');
  }
  const exports: Record<string, string> = {};
  for (const [key, target] of Object.entries(registry.exports).sort(([a], [b]) => a.localeCompare(b))) {
    if (typeof target !== 'string') throw new Error(`Unsupported registry export: ${key}`);
    const path = sourcePath(resolve(library, target));
    if (isDemo(path)) exports[key] = `./${path}`;
  }
  const manifest = JSON.stringify({
    name: '@rightui/registry', version: '0.0.0', private: true,
    exports, dependencies: { '@rightui/ui': uiVersion },
  }, null, 2) + '\n';
  if (options.manifestOnly) {
    mkdirSync(destination, { recursive: true });
    writeFileSync(resolve(destination, 'package.json'), manifest);
    return { files: 0, exports: Object.keys(exports).length };
  }

  const uiRoot = resolve(root, 'node_modules/@rightui/ui');
  if (!existsSync(resolve(uiRoot, 'index.contract')) ||
      JSON.parse(readFileSync(resolve(uiRoot, 'package.json'), 'utf8')).version !== uiVersion) {
    throw new Error(`Install the website dependencies before preparing registry sources: @rightui/ui ${uiVersion} is required.`);
  }
  const publicNames = new Map<string, string>();
  const uiExports = JSON.parse(readFileSync(resolve(uiRoot, 'package.json'), 'utf8')).exports;
  const isPublicUi = (specifier: string) => specifier === '@rightui/ui' ||
    (specifier.startsWith('@rightui/ui/') && typeof uiExports['./' + specifier.slice('@rightui/ui/'.length)] === 'string');
  for (const match of readFileSync(resolve(uiRoot, 'index.contract'), 'utf8').matchAll(/^use (.+) from "([^"]+)"/gm)) {
    for (const name of match[1].split(',').map(name => name.trim())) {
      const parts = name.split(/\s+as\s+/);
      publicNames.set(parts.at(-1)!, posix(relative(uiRoot, resolve(uiRoot, match[2]))));
    }
  }
  const files = new Map<string, string>();

  function uiImports(from: string, names: string, uiPath: string): string {
    if (uiPath.startsWith('../') || !uiPath.endsWith('.contract')) throw new Error(`Invalid UI helper: ${uiPath}`);
    const bindings = names.split(',').map(name => name.trim());
    const isPublic = (name: string) => publicNames.get(name.split(/\s+as\s+/)[0]) === uiPath;
    const published = bindings.filter(isPublic);
    const helpers = bindings.filter(name => !isPublic(name));
    const lines = published.length ? [`use ${published.join(', ')} from "@rightui/ui"`] : [];
    if (helpers.length) {
      const target = `internal-ui/${uiPath}`;
      collectHelper(uiPath);
      lines.push(`use ${helpers.join(', ')} from "${localImport(from, target)}"`);
    }
    return lines.join('\n');
  }

  function collectHelper(uiPath: string) {
    const output = `internal-ui/${uiPath}`;
    if (files.has(output)) return;
    files.set(output, '');
    const input = resolve(uiRoot, uiPath);
    const sharedDeclarations: string[] = [];
    const privateSource = readFileSync(input, 'utf8').split(/\n(?=\S)/).filter(block => {
      const declaration = block.match(/^(?:component|shape|style|fn|motion) ([\w-]+)/);
      if (!declaration || publicNames.get(declaration[1]) !== uiPath) return true;
      sharedDeclarations.push(declaration[1]);
      return false;
    }).join('\n');
    const content = privateSource.replace(/^use (.+) from "([^"]+)"/gm, (line, names, specifier) => {
      if (specifier.startsWith('.')) {
        const dependency = posix(relative(uiRoot, resolve(dirname(input), specifier)));
        return uiImports(output, names, dependency);
      }
      if (!isPublicUi(specifier)) throw new Error(`Unexpected UI helper dependency: ${specifier}`);
      return line;
    });
    // Public shapes are nominal: private helpers must use the package's original declarations.
    const publicImport = sharedDeclarations.length ? `use ${sharedDeclarations.join(', ')} from "@rightui/ui"\n` : '';
    files.set(output, publicImport + content);
  }

  function collectDemo(path: string) {
    if (files.has(path)) return;
    if (!isDemo(path)) throw new Error(`Registry dependency is outside the demo source directories: ${path}`);
    files.set(path, '');
    const input = resolve(library, path);
    const content = readFileSync(input, 'utf8').replace(/^use (.+) from "([^"]+)"/gm, (line, names, specifier) => {
      if (specifier.startsWith('.')) {
        const dependency = sourcePath(resolve(dirname(input), specifier));
        if (dependency.startsWith('packages/ui/')) return uiImports(path, names, dependency.slice('packages/ui/'.length));
        collectDemo(dependency);
      } else if (specifier.startsWith('@rightui/registry/')) {
        const key = `./${specifier.slice('@rightui/registry/'.length)}`;
        const target = exports[key];
        if (!target) throw new Error(`Missing registry export: ${key}`);
        collectDemo(target.slice(2));
      } else if (!isPublicUi(specifier)) {
        throw new Error(`Unexpected registry dependency: ${specifier}`);
      }
      return line;
    });
    files.set(path, content);
  }
  for (const target of Object.values(exports)) collectDemo(target.slice(2));

  // Only private Contract helpers are copied from npm; its manifest and Tamber remain unique.
  // Preserve node_modules created by Bun while removing stale generated source files.
  mkdirSync(destination, { recursive: true });
  for (const directory of [...directories, 'internal-ui']) rmSync(resolve(destination, directory), { recursive: true, force: true });
  for (const [path, content] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    const output = resolve(destination, path);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, content);
  }
  writeFileSync(resolve(destination, 'package.json'), manifest);
  return { files: files.size, exports: Object.keys(exports).length };
}

if (import.meta.main) {
  const result = prepareRegistry();
  console.log(`Prepared website registry: ${result.files} Contract files, ${result.exports} exports.`);
}
