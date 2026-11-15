# Production deployment

The public documentation site is served at `https://rightui.dev` by the static-assets Worker `rightui-website`, in Cloudflare account **Fizzy APP**, `68e46be88d396623b3870544a294e0dd`. The domain is configured as a Worker Custom Domain. Cloudflare manages its DNS binding and HTTPS certificate.

## Build and publish

Use Bun **1.4.2**, the sibling components checkout and the pinned Exact SDK described in the README. Wrangler is pinned in `package.json` and `bun.lock`.

```sh
bun run build
bun run deploy:check
```

Before an authorized deployment, run the Cloudflare emulator in one terminal and the HTTP checks in another:

```sh
bun run preview:cloudflare
```

```sh
bun run check:hosting http://localhost:8793
```

Authenticate Wrangler using an account with access to Fizzy APP. Commit the reviewed source before rebuilding and publishing, so `/build-info.json` identifies the deployed website, library and Exact revisions.

```sh
bun run deploy
bun run check:hosting https://rightui.dev
bun tools/check-seo.ts https://rightui.dev
bun tools/check-analytics.ts https://rightui.dev
```

Each static asset must remain below Cloudflare’s 25 MiB limit. Postbuild checks the application bundle size. Keep large Contract slots instantiated once; conditional wrapper branches can duplicate their compiled content.

For an initial-render regression, run `tools/check-first-paint.browser.js` in the browser on the built site. It compares script-disabled HTML and activated Exact at every homepage breakpoint. The built HTML inlines `apps/site/assets/critical.css`; serving unprocessed Exact test output skips this delivery step.

The hosting check verifies every catalog route, client-route aliases, Markdown types, unknown-route 404s, and the exact bytes of `app.js` and Geist against the local build. Browser interaction tests remain `bun run test`; HTTP checks do not replace them. Record the Cloudflare version ID from deployment output and verify `/build-info.json` before claiming that a particular revision is live.

## Routing

Umami is injected after the dedicated client shells are generated. Its runtime guard limits collection to top-level, indexable catalog routes on `rightui.dev`, including after client-side navigation. Local hosts, source viewers, block previews, iframes and unknown paths are excluded. Query and hash changes do not create page views. Keep the script unique; do not add a second manual navigation tracker. If a Content Security Policy is introduced, review the inline guard, `https://cloud.umami.is` script and `https://gateway.umami.is` collection endpoint together.

Exact builds HTML for most routes. The build generates `_redirects` with explicit internal 200 proxies for the three client-rendered pages, including slash aliases. Each destination is a dedicated `/_client-pages/<route-name>` shell with the page's canonical URL and social metadata. The extensionless destination avoids Cloudflare HTML-normalization redirects and preserves the original page URL. Unknown paths use the real `404.html` with HTTP status 404. There is no catch-all SPA rewrite.

The postbuild step rejects request-rendered or parameterized routes until a server handler is added. A static-assets deployment must not silently pretend to support them. Fonts, Markdown and linked source files are ordinary same-origin assets. Local build metadata is excluded with `.assetsignore`.

## Source visibility and credentials

The website and both GitHub repositories are public. Repository visibility is independent of deployment. `wrangler.jsonc` is safe to version: account IDs, domains, Worker names and compatibility dates are configuration, not credentials. This static site needs no runtime secrets or data bindings.

Keep Cloudflare API tokens and OAuth state outside Git. `.env*`, `.dev.vars*` and `.wrangler/` are ignored. GitHub Actions, if added later, must use repository/environment secrets and a token scoped to this deployment. No Git-triggered deployment pipeline has been configured by this setup.

Cloudflare references: [Static Assets](https://developers.cloudflare.com/workers/static-assets/), [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) and [proxy rules](https://developers.cloudflare.com/workers/static-assets/redirects/).
