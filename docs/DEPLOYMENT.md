# Production deployment

The supported delivery entry point is `bun run release site` (or `all` for an authorized combined release). See [Local delivery](RELEASING.md). It performs the checks below and uses `deploy:prepared` internally. Cloudflare deployment and all builds/tests remain local; GitHub Actions is used only for npm publication.

The public documentation site is served at `https://rightui.dev` by the static-assets Worker `rightui-website`, in Cloudflare account **Fizzy APP**, `68e46be88d396623b3870544a294e0dd`. The domain is configured as a Worker Custom Domain. Cloudflare manages its DNS binding and HTTPS certificate.

## Release versions and downloads

`bun run sync:ui` reads npm's current beta, requires the matching library checkout, pins both website manifests, installs the official package and regenerates the guides, AI prompt, all installation commands, Markdown and footer. Review and commit the resulting changes. The package's freshly published releases are exempted from Bun's age gate; other dependencies retain it. This command does not publish npm, change dist-tags or deploy.

The installed `@rightui/ui/package.json` supplies the displayed version. Generation checks it against the library, compatibility metadata, workspace manifests and Bun lock. Build checks reject stale commands, archive names, footer labels and unresolved placeholders in current public documents, including dedicated client shells. Source archives retain historical changelogs and fixtures unchanged.

`bun run deploy` checks the current npm beta and archive integrity before building and again immediately before upload. It refuses local overrides, dirty source checkouts and stale build provenance. Publishing npm alone does not update a static website: run sync, commit and deploy for each delivery. Keep validation history dated; it is not the current installation version.

Public AppDrop links have one source, `content/downloads.json`, shared by rendered pages and Markdown. After an AppDrop upload, update its server-returned Mac revision there. If changing the iPhone drop itself, regenerate its QR asset too.

## Build and publish

Use Bun **1.4.2**, the sibling components checkout and the pinned Exact SDK described in the README. Wrangler is pinned in `package.json` and `bun.lock`.

Authenticate Wrangler using an account with access to Fizzy APP. Commit and push the reviewed sources before delivery, so `/build-info.json` identifies the deployed website, library and Exact revisions.

```sh
bun run release site
```

This runs the build and browser suite, starts/stops the local Cloudflare emulator, checks routing/SEO/analytics, performs the deployment dry-run, uploads the prepared assets, and verifies production. `bun run deploy` is an alias for this command. Use the printed release ID with `bun run release resume <id>` after an interruption; do not rerun the underlying commands independently.

Each static asset must remain below Cloudflare’s 25 MiB limit. Postbuild checks the application bundle size. Keep large Contract slots instantiated once; conditional wrapper branches can duplicate their compiled content.

For an initial-render regression, run `tools/check-first-paint.browser.js` in the browser on the built site. It compares script-disabled HTML and activated Exact at every homepage breakpoint. The built HTML inlines `apps/site/assets/critical.css`; serving unprocessed Exact test output skips this delivery step.

The hosting check verifies every catalog route, client-route aliases, Markdown types, unknown-route 404s, and the exact bytes of `app.js` and Geist against the local build. Browser interaction tests remain `bun run test`; HTTP checks do not replace them. The engine records the Cloudflare version ID and verifies `/build-info.json` before reporting completion. Its internal `deploy:prepared` step uploads the validated build with npm/version/provenance guards, without rebuilding it.

## Routing

Umami is injected after the dedicated client shells are generated. Its runtime guard limits collection to top-level, indexable catalog routes on `rightui.dev`, including after client-side navigation. Local hosts, source viewers, block previews, iframes and unknown paths are excluded. Query and hash changes do not create page views. Keep the script unique; do not add a second manual navigation tracker. If a Content Security Policy is introduced, review the inline guard, `https://cloud.umami.is` script and `https://gateway.umami.is` collection endpoint together.

Exact builds HTML for most routes. The build generates `_redirects` with explicit internal 200 proxies for the three client-rendered pages, including slash aliases. Each destination is a dedicated `/_client-pages/<route-name>` shell with the page's canonical URL and social metadata. The extensionless destination avoids Cloudflare HTML-normalization redirects and preserves the original page URL. Unknown paths use the real `404.html` with HTTP status 404. There is no catch-all SPA rewrite.

The postbuild step rejects request-rendered or parameterized routes until a server handler is added. A static-assets deployment must not silently pretend to support them. Fonts, Markdown and linked source files are ordinary same-origin assets. Local build metadata is excluded with `.assetsignore`.

## Source visibility and credentials

The website and both GitHub repositories are public. Repository visibility is independent of deployment. `wrangler.jsonc` is safe to version: account IDs, domains, Worker names and compatibility dates are configuration, not credentials. This static site needs no runtime secrets or data bindings.

Keep Cloudflare API tokens and OAuth state outside Git. `.env*`, `.dev.vars*` and `.wrangler/` are ignored. Cloudflare authentication stays local. The sibling library's manual GitHub Actions workflow publishes npm only; it has no Cloudflare or AppDrop credentials and performs no application builds.

Cloudflare references: [Static Assets](https://developers.cloudflare.com/workers/static-assets/), [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) and [proxy rules](https://developers.cloudflare.com/workers/static-assets/redirects/).
