# Local delivery, npm-only GitHub Actions

All package validation, website builds/tests, iPhone/Mac builds and Cloudflare/AppDrop delivery run locally. GitHub Actions only verifies and publishes an existing npm archive using OIDC. No npm publishing token is needed locally or in GitHub.

## Commands

Run from the website repository. The launcher selects the pinned Bun when available, and otherwise refuses an incompatible runtime before delivery.

```sh
bun run release doctor
bun run release all --dry-run
bun run release site
bun run release appdrop
bun run release npm
bun run release all
bun run release resume <release-id>
bun run release status <release-id>
```

`./release` accepts the same arguments. From the library repository, `bun run release:npm` forwards to the npm target.

- `site`: verifies the published UI dependency, builds/tests the site, checks the Cloudflare emulator and uploads the validated output. It verifies production routes, assets, SEO, analytics and source provenance, and records the Cloudflare version ID.
- `appdrop`: validates the current published UI and web candidate, builds iPhone and Mac sequentially, verifies archives and signatures, updates the existing drop, checks downloaded bytes, then commits/pushes only the generated website download link. It does not deploy the website.
- `npm`: packs a prepared beta once, checks isolated installation and candidate documentation locally, creates its annotated tag and GitHub prerelease, and dispatches the npm-only workflow. After verifying the published bytes, the workflow aligns `beta` and `latest` to that version. The local engine verifies both tags and a fresh npm installation. It does not deploy the website or AppDrop.
- `all`: validates the package, candidate site and both native archives before publication; publishes npm; updates AppDrop; synchronizes exact dependency/download metadata; commits/pushes those generated files; builds and deploys the final site.

Invocation of a delivery command must be covered by the user's authorization for its listed effects. Installing or testing the tooling does not authorize a product release. Dry-run and doctor never build, commit, push or publish.

## Source preparation

Prepare the version, changelog and compatibility evidence using the library's `docs/VERSIONING.md`. Commit and push the intended sources on `main` in both repositories before invoking delivery. The engine refuses dirty sources, other branches/remotes, changed SDKs and mismatched website/library versions. It does not guess whether a change breaks the public API, bump versions, commit unrelated edits, upgrade Exact, notarize apps or install them on a device. Every authorized npm delivery automatically aligns `beta` and `latest`; the version itself remains beta.

After a standalone npm publication, `bun run sync:ui <exact-beta-version>` updates the website dependency and lock. Commit/push that change before `release site` or `release appdrop`. `all` performs this generated metadata commit itself.

Non-secret target identities and tool pins live in `tools/release/config.json`. Keep the sibling `components` and `.tooling/exact` layout. Public AppDrop links still live in `content/downloads.json`.

## One-time setup

1. Install the pinned Bun and Exact toolchain, Node, GitHub CLI, Cloudflare dependencies and Apple build tools using the existing setup guides. Authenticate `gh` for both repositories and Wrangler for the configured account. Keep the AppDrop management credential in its private local store or `APPDROP_MANAGE_KEY`.
2. Merge/push the library's `.github/workflows/publish-npm.yml` and `tools/publish-npm.mjs` to `rightui-dev/ui` on `main`. The workflow is manual only; pushes and tags do not trigger publication.
3. Configure the `@rightui/ui` trusted publisher on npm: provider **GitHub Actions**, owner **rightui-dev**, repository **ui**, workflow **publish-npm.yml**, environment **npm**, permissions **Allow npm publish** and **Allow npm dist-tag**. Both are required and independent. Preserve other existing publishers. The workflow uses GitHub's `npm` environment; configure it without a required reviewer if unattended publication is intended.

With an authenticated npm CLI supporting `npm trust`, the equivalent setup is:

```sh
npx --yes npm@11.21.2 trust list @rightui/ui --json
npx --yes npm@11.21.2 trust github @rightui/ui \
  --repository rightui-dev/ui --file publish-npm.yml --environment npm \
  --allow-publish
```

The CLI command above configures direct publishing; also enable **Allow npm dist-tag** in npm's trusted-publisher settings. The workflow pins npm 11.21.2 to support dist-tag operations through OIDC. This one-time account configuration may require interactive login/2FA. An expired session must be renewed by the account owner. It is separate from future automated publications. `npm whoami` does not verify OIDC; only an authorized workflow operation proves the exchange works.

To repair the default tag for an already published beta, dispatch this same workflow with `tags_only=true`, the exact version, the source commit behind its annotated tag, and the validated archive SHA-256. The workflow still verifies the GitHub/npm archive bytes and refuses to publish any package in this mode. It will not promote an older beta over a newer current release.

References: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), [npm trust](https://docs.npmjs.com/cli/v11/commands/npm-trust/).

## Artifacts, interruption and recovery

The engine prints the release ID and private report location. State, candidate checkout, sealed archives and logs are stored outside Git in the user's local application-support directory. A process lock serializes deliveries on that machine. It is not a distributed lock across other machines; remote state and npm workflow concurrency provide additional checks.

Build/test commands run sequentially. The isolated website candidate consumes the exact sealed UI archive; generated candidate files never replace the active editor's files. Bun and SDK caches remain local. Successful steps reuse their results only within the same recorded source/toolchain context. Before upload, archive hashes and the complete website output fingerprint are rechecked.

Resume with the printed ID. Do not start a second delivery just because an upload timed out. The engine verifies npm and AppDrop against remote bytes and uses the matching workflow run. Failed GitHub runs can be retried through resume without rebuilding/repacking. An ambiguous AppDrop upload with no remotely matching artifact stops for inspection instead of blindly uploading again. A changed artifact or source commit also stops recovery.

Generated website metadata is the only source mutation the engine owns. If a process dies while changing or committing metadata, inspect the private logs and Git diff; the clean-source guard deliberately stops rather than discarding edits. A failed push after the generated commit can be resumed with the same release ID.

AppDrop responses can contain management credentials: raw stdout/stderr stays in private logs. The report includes only explicitly selected public URL/platform/version/revision fields. iPhone archives are normalized before hashing/upload, matching the pinned AppDrop CLI. Each platform update checks that it preserved the other platform.

Native binaries embed the website source's download links from before their upload. The website link is updated afterward to the returned Mac revision; the report distinguishes original native sources from the final website commit. This prevents an endless rebuild/upload cycle.

Publication across npm, AppDrop and Cloudflare is not atomic. The journal records completed stages instead of claiming a global rollback. Archive/signature checks do not certify device interaction or notarization.

## Tooling validation

```sh
bun run test:release
cd ../components
bun run test:publish
```

Tests use temporary directories and fake artifacts; they do not publish, upload or deploy. A successful tooling suite is not evidence of a production delivery or an OIDC exchange.
