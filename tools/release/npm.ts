import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { artifact, Commands, download, fetchJson, git, Journal, verifyArtifact, type Artifact } from './core';
import config from './config.json';

const registry = 'https://registry.npmjs.org/@rightui%2Fui';
export async function checkNpm(version: string, archive?: Artifact) {
  const published = await fetchJson(`${registry}/${version}`);
  if (!published) throw new Error(`@rightui/ui@${version} is not published yet.`);
  const beta = await fetchJson(`${registry}/beta`);
  if (beta?.version !== version) throw new Error(`npm beta is ${beta?.version}; delivery is pinned to ${version}.`);
  const latest = await fetchJson(`${registry}/latest`);
  if (latest?.version !== version) throw new Error(`npm latest is ${latest?.version}; the publication workflow must align beta and latest to ${version} before delivery continues.`);
  if (archive) {
    verifyArtifact(archive);
    if (new URL(published.dist.tarball).origin !== 'https://registry.npmjs.org') throw new Error('Unexpected registry archive URL.');
    const downloaded = await download(published.dist.tarball, `${archive.path}.registry`);
    if (downloaded.sha256 !== archive.sha256) throw new Error('npm archive differs from the locally validated archive.');
  }
  return { version, integrity: published.dist.integrity, url: `https://www.npmjs.com/package/@rightui/ui/v/${version}` };
}

export function packageSource(library: string, tag: string, current: string) {
  if (git(library, 'cat-file', '-t', tag) !== 'tag') throw new Error('The release tag must be annotated.');
  const tagged = git(library, 'rev-parse', `${tag}^{commit}`);
  if (git(library, 'merge-base', tagged, current) !== tagged ||
      git(library, 'rev-parse', `${tagged}:packages/ui`) !== git(library, 'rev-parse', `${current}:packages/ui`)) {
    throw new Error('Package sources differ from the immutable release tag. Prepare a new beta.');
  }
  return tagged;
}

export async function publishNpm(journal: Journal, commands: Commands, library: string, archive: Artifact, guard: () => void) {
  const { version, source } = journal.state, tag = `v${version}`;
  verifyArtifact(archive);
  const releaseRecord = await journal.step('github-release', async () => {
    guard();
    const remoteTag = git(library, 'ls-remote', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`);
    const localTag = git(library, 'tag', '--list', tag);
    if (!localTag && remoteTag) {
      await commands.run('fetch-release-tag', ['git', 'fetch', 'origin', `refs/tags/${tag}:refs/tags/${tag}`], library);
    } else if (!localTag) {
      await commands.run('tag-release', ['git', 'tag', '-a', tag, source.library, '-m', `chore(release): @rightui/ui ${version}`], library);
    }
    const publishedSource = packageSource(library, tag, source.library);
    if (!remoteTag) await commands.run('push-release-tag', ['git', 'push', 'origin', `refs/tags/${tag}`], library);
    else if (!remoteTag.includes(`${publishedSource}\trefs/tags/${tag}^{}`)) throw new Error('Remote release tag differs from the frozen source.');

    const notes = readFileSync(resolve(library, 'packages/ui/CHANGELOG.md'), 'utf8').split(`## [${version}]`)[1]?.split(/^## /m)[0]?.trim();
    if (!notes) throw new Error('The release has no changelog notes.');
    const notesFile = resolve(journal.directory, 'release-notes.md');
    writeFileSync(notesFile, `## @rightui/ui ${version}\n\n${notes}\n`, { mode: 0o600 });
    const checksum = `${archive.path}.sha256`;
    writeFileSync(checksum, `${archive.sha256}  rightui-ui-${version}.tgz\n`, { mode: 0o600 });
    let release = await fetchJson(`https://api.github.com/repos/${config.libraryRepository}/releases/tags/${tag}`);
    if (!release) {
      await commands.run('create-github-release', ['gh', 'release', 'create', tag, '--repo', config.libraryRepository, '--verify-tag', '--prerelease', '--latest=false', '--title', `@rightui/ui ${version}`, '--notes-file', notesFile], library);
      // Authenticated read avoids a cached anonymous 404 immediately after creation.
      release = JSON.parse(await commands.run('read-github-release', ['gh', 'api', `repos/${config.libraryRepository}/releases/tags/${tag}`], library));
    }
    if (!release || release.draft || !release.prerelease) throw new Error('Release must be a published GitHub prerelease.');
    for (const file of [archive.path, checksum]) {
      const name = file.split('/').at(-1)!;
      const existing = release.assets.find((item: any) => item.name === name);
      if (existing) {
        const downloaded = await download(existing.browser_download_url, resolve(journal.directory, `existing-${name}`));
        if (downloaded.sha256 !== artifact(file).sha256) throw new Error(`Existing GitHub asset ${name} differs. It will not be overwritten.`);
      } else {
        await commands.run(`upload-${name}`, ['gh', 'release', 'upload', tag, file, '--repo', config.libraryRepository], library);
      }
    }
    return { url: release.html_url, archive: archive.sha256, source: publishedSource };
  });

  return journal.step('npm-publication', async interrupted => {
    guard();
    const title = `npm ${version} ${archive.sha256}`;
    const runs = async () => JSON.parse(await commands.run('npm-workflow-runs', ['gh', 'api', `repos/${config.libraryRepository}/actions/workflows/${config.workflow}/runs?event=workflow_dispatch&per_page=100`], library)).workflow_runs;
    let run = (await runs()).find((item: any) => item.display_title === title);
    if (!run) {
      if (interrupted) throw new Error('Previous npm dispatch has no visible matching run. Inspect GitHub Actions before retrying; no duplicate dispatch was sent.');
      await commands.run('dispatch-npm', ['gh', 'workflow', 'run', config.workflow, '--repo', config.libraryRepository, '--ref', config.branch,
        '-f', `version=${version}`, '-f', `source_sha=${releaseRecord.source}`, '-f', `sha256=${archive.sha256}`], library);
      for (let attempt = 0; attempt < 12; attempt++) {
        run = (await runs()).find((item: any) => item.display_title === title);
        if (run) break;
        await Bun.sleep(2500);
      }
      if (!run) throw new Error('npm workflow was dispatched but is not visible yet. Resume this release; do not dispatch manually.');
    } else if (run.status === 'completed' && run.conclusion !== 'success') {
      await commands.run('retry-npm', ['gh', 'run', 'rerun', String(run.id), '--repo', config.libraryRepository, '--failed'], library);
    } else if (run.status === 'completed') {
      const tags = (await fetchJson(registry))?.['dist-tags'];
      if (tags?.beta !== version || tags?.latest !== version) {
        // A successful historical run does not prove today's tags still match.
        await commands.run('reconcile-npm-tags', ['gh', 'run', 'rerun', String(run.id), '--repo', config.libraryRepository], library);
      }
    }
    console.log(`npm publication: ${run.html_url}`);
    await commands.run('wait-npm', ['gh', 'run', 'watch', String(run.id), '--repo', config.libraryRepository, '--exit-status', '--interval', '5'], library);
    const published = await checkNpm(version, archive);
    return { ...published, workflow: run.html_url };
  }, async () => { await checkNpm(version, archive); });
}
