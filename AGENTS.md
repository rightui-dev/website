# rightui website

This repository is the Exact documentation website, not a React application.
The separate `../components/` repository owns the public Contract components, examples and blocks.
Use the local Exact checkout at `../.tooling/exact`; keep `EXACT_FEEDBACK=0`.
Read `apps/site/AGENTS.md` and the SDK site guide before changing the application.
Build and test sequentially; never edit application inputs during an Exact build/test.
Documentation is English. All demos import `@rightui/ui` and show their real source.
Public guides address people installing and using the library. Keep release/publishing procedures, website deployment, local machine diagnostics and contributor-only checkout commands in repository docs, not consumer pages. Examples must work without access to private repositories; use the public source viewer for supporting files.
Public status labels must stay concise and generic (for example, Partial checks). Never publish personal machine details, local absolute paths, installed Xcode/SDK versions or local upgrade blockers in consumer documentation or generated public evidence.
Document rightui's scope as web, iOS and macOS only. Distinguish target support from executed validation; do not claim Windows, Android or Linux support.
Do not invent npm releases, Rust widget APIs, GitHub links or performance claims.
Use conventional English commits. No remote, push or deployment without authorization.

## Library version coordination

Follow `../components/docs/VERSIONING.md`. Agents own beta version coordination; the library package remains `@rightui/ui`. Site/docs-only changes do not trigger a UI release unless package redistribution is required.
The website generator resolves `{{UI_VERSION}}` in `content/guides.json` from the installed sibling library manifest. Keep that placeholder as the source of truth; do not hardcode a separate current version or claim an unpublished npm release.
For each library delivery, refresh generated documentation, build the documentation site and validate installation guidance against the immutable versioned archive and exact Exact SDK pin. Report checks actually executed.
Coordinate conventional release commits, annotated `v<version>` library tags and pushes only within session authorization. Existing authorization need not be requested again; these rules grant no new authority. Never publish npm packages without explicit authorization and npm scope ownership verification. Current releases must be beta; stable versions and the npm `latest` channel require an explicit user request.

## Production hosting

The public documentation domain is `rightui.dev`. Deploy only the `rightui-website` static-assets Worker on Cloudflare account `68e46be88d396623b3870544a294e0dd` (Fizzy APP), using the checked-in `wrangler.jsonc`. Keep API tokens, OAuth credentials, `.dev.vars` and AppDrop management links outside Git. Account IDs and route configuration are not secrets. Repository visibility is independent of site visibility; do not change it without the user's request.

Run `bun run build`, validate Cloudflare routing locally, then `bun run deploy:check` before an authorized production deployment. Preserve explicit client-route rewrites and real 404 responses. Verify HTTPS HTML, Markdown, fonts, a client-rendered route and an unknown route on the custom domain after deployment. Record the source SHA and Cloudflare version ID; a successful upload alone does not prove the domain works.

## Initial rendering

Visible header assets and above-the-fold content must render in initial HTML, without waiting for JavaScript activation. Use appropriately sized eager images, reserve dimensions, and verify the rendered page before and after activation. Do not ship delayed logo appearance, placeholder flashes or layout shifts.
