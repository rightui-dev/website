import { isDeepStrictEqual } from 'node:util';

export const metadataFiles = ['package.json', 'apps/site/package.json', 'bun.lock', 'content/downloads.json', 'apps/site/app.test.contract'] as const;
export type Metadata = Record<(typeof metadataFiles)[number], string>;

export function assertMetadataOnly(before: Metadata, after: Metadata, version: string, macUrl?: string, files: readonly string[] = metadataFiles) {
  for (const file of metadataFiles) {
    if (!files.includes(file)) continue;
    if (file === 'apps/site/app.test.contract') {
      const expected = before[file].replace(/(@rightui\/ui@|rightui-ui-)\d+\.\d+\.\d+-beta\.\d+/g, (_, prefix) => prefix + version);
      if (after[file] !== expected) throw new Error(`Unexpected edit in ${file}; only generated version references may change.`);
      continue;
    }
    const previous = file === 'bun.lock' ? Bun.JSONC.parse(before[file]) : JSON.parse(before[file]);
    const actual = file === 'bun.lock' ? Bun.JSONC.parse(after[file]) : JSON.parse(after[file]);
    const expected = structuredClone(previous);
    if (file === 'content/downloads.json') {
      if (macUrl) expected.macDownloadUrl = macUrl;
    } else if (file === 'bun.lock') {
      // Only this package's resolution and workspace pins may change during sync.
      expected.packages['@rightui/ui'] = actual.packages['@rightui/ui'];
      for (const workspace of Object.values(expected.workspaces) as any[]) {
        if (workspace.dependencies?.['@rightui/ui']) workspace.dependencies['@rightui/ui'] = version;
      }
      if (expected.overrides?.['@rightui/ui']) {
        delete expected.overrides['@rightui/ui'];
        if (!Object.keys(expected.overrides).length) delete expected.overrides;
      }
    } else expected.dependencies['@rightui/ui'] = version;
    if (!isDeepStrictEqual(actual, expected)) throw new Error(`Unexpected edit in ${file}; only generated release metadata may be committed.`);
  }
}
