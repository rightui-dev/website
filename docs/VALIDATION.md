# Validation status

Recorded checks as of November 14, 2026, using Bun 1.4.2 and Exact revision `53426cf02bf986a5e781abc4f953d79989c6dc05`. This report distinguishes executed checks from platform targets. It is not an exhaustive compatibility certification.

## Website

- The latest recorded `bun run test` completed **26 browser tests, 0 failures**. Coverage includes navigation, search, theme, installation controls, compatibility tables and targeted component interactions. The preceding `verify` run reported 0 Contract findings across its 22 tests.
- The production build passed for 66 component examples, 21 AI patterns, 27 blocks and 10 charts. The build generated 130 Markdown documents, including compatibility and installation pages. The official Exact SDK checkout was unchanged.
- The previous production release passed **137 route/status/MIME checks** on `https://rightui.dev`. This update passed **138 checks** against the local Cloudflare emulator. Served `app.js` and Geist matched the local build. Checks included Markdown, client-rendered routes and genuine unknown-route 404 responses.
- The approved logo is registered for the favicon, Apple touch icon and web manifest. A faithful 56×56, 1,155-byte derivative is embedded in initial HTML and the runtime for the 28px header logo. Postbuild rejects missing, deferred or external header logos.

The website now uses the immutable npm beta directly. Its generated demo registry rewrites public imports to that package and derives seven private demo helpers from its installed sources, without duplicating its Tamber design. The new How Exact works page was inspected at desktop and 390px mobile widths; its mobile document had no horizontal overflow.

## Package and data integration

- **`@rightui/ui@0.1.0-beta.3` is published on npm.** Its archive SHA-512 integrity matched the reviewed release artifact. Both the beta.3 archive and its npm installation built with zero warnings and passed the Button counter test, from 0 to 1. The npm archive integrity matched the validated local artifact.
- The package archive and its manual extraction were separately installed in isolated Exact apps without a global rightui link. Contract types and web builds passed; the counter interaction passed. The npm, pnpm and Yarn command variants are documented but were not individually exercised as installation clients.
- The complete Contract and TypeScript integration example built and passed one interaction test. The Rust integration passed one `cargo test`; this checks its data-source contract, not a native host launch.
- Five version-tool tests passed, covering beta policy, required notes, synchronized versions, immutable tags and refusal to repack modified package sources under an existing release.
- Releases remain beta. The npm `beta` channel resolves to `0.1.0-beta.3`; the existing `latest` tag remains on `0.1.0-beta.2`. Use an exact version or `@beta` for the current beta. No stable version is published.

## Rendering checks

- Desktop/mobile and light/dark rendering were checked. Script-disabled installation HTML was inspected at 390, 1023, 1024 and 1280 CSS pixels; its shell and article had no document horizontal overflow.
- `tools/check-first-paint.browser.js` passed at 12 widths from 390 to 2560 pixels against the Cloudflare emulator. It compared heading size, hero height, mosaic position, column geometry and the decoded 28px navbar logo before and after activation. The embedded logo has no image network request.
- Five focused image-helper tests passed. Script-disabled browser checks confirmed six painted Attachment symbols and a decoded homepage QR without a separate QR request.
- Focused component checks covered Message rendering, Copy Page geometry, menu keyboard selection, Context and citation focus/Escape behavior, Reasoning replay, and independent horizontal/vertical dragging. These checks establish their observed cases only.

## Native showcase

The separate `components/examples/native` showcase imports the same 124 previews; it does not reuse the website shell.

- The macOS showcase built with an ad hoc signature. Its catalog, split navigation and dashboard were inspected.
- `bun exact.mjs test macos` completed **2 tests, 0 failures**, including a repeat after the theme correction. Theme captures covered matching sidebar, content and native chrome in both schemes.
- **iOS validation is incomplete.** No successful iOS build, launch, physical-device check, IPA or AppDrop upload is recorded.
- Targets are web, iOS and macOS. Windows and Android are outside rightui support. Targeting a platform does not certify every component or interaction.

## Outstanding limits

The latest broad visual/accessibility audit reported **130 findings**, and has not been cleared by the functional checks above. Its 22 test endings were audited at phone/desktop sizes, light/dark schemes and the largest text size: 44 fixed-size findings, 25 clipping findings, 11 overflow findings and 50 other findings. Some involve intentional hidden live-status text or scrollable code; compact line heights, enlarged-text overflow, contrast and authored-dialog warnings still need triage. Generated reports live under `apps/site/.exact/verify/`.

The latest functional test build retained 13 compiler warnings and one informational note. Neither successful tests nor screenshots establish full variant parity, complete keyboard/VoiceOver coverage, pixel-perfect fidelity or a 120 fps guarantee. See the UI repository's [variation inventory](https://github.com/rightui-dev/ui/blob/main/docs/VARIATIONS.md), [AI pattern boundaries](https://github.com/rightui-dev/ui/blob/main/docs/AI-ELEMENTS.md) and [native guide](https://github.com/rightui-dev/ui/blob/main/docs/NATIVE.md).

Three routes (`/docs/components/chart`, `/charts/area`, `/view/dashboard-01`) render in the browser because the pinned SDK's server SVG-gradient renderer lacks `CSS.escape`. Other routes use build rendering. The demo dispatcher still compiles into one UI bundle; lazy data modules avoid loading every source document up front, while UI code splitting remains future work.

## SEO delivery

Page titles, descriptions, canonical URLs, Open Graph and Twitter cards use the production origin. An original 1200×630 social PNG accompanies the site. Dedicated client-route shells preserve route-specific metadata on direct loads; the sitemap excludes source viewers and isolated block previews, and 404 responses carry noindex. Exact updates titles and descriptions during in-app navigation; other metadata is guaranteed on direct URL loads. `bun tools/check-seo.ts` validates generated heads and crawl files; passing an origin validates HTTP delivery.

The SEO check passed for all 130 page heads, 102 sitemap URLs, robots.txt, the real 404 response and the 80,653-byte PNG, both in the build output and through the local Cloudflare emulator.

## Clean release history

The history cleanup was completed with `v0.1.0-beta.3`, from the clean source history. Earlier GitHub prereleases and tags were removed after their metadata and archives were backed up and verified. Existing npm versions remain available. The beta.3 archive changes only the README, changelog and package version; all Contract components, theme tokens and font assets are byte-identical to beta.2.

## AI installation prompt and Accordion spacing

The homepage and Installation guide share one versioned AI setup prompt, including their Markdown exports. Browser checks confirmed the complete prompt reached the clipboard successfully on both pages, with the Copied state displayed. The expandable prompt wraps without horizontal overflow at 390px. The homepage attribution links Exact to its official repository.

The beta.4 Accordion and AccordionMultiple render their headings, expanded content and chevrons 16px from the container edges. Browser measurements confirmed those insets at 390px, including hover, with no horizontal document overflow. ArrowDown moved focus to the next trigger. An isolated archive test and the website regression test checked single and independent expansion, keyboard activation and preserved state after resize. These are web checks; no new native validation is claimed.

The beta.4 package passed isolated installation, build and Button interaction checks from both its archive and the public npm registry. The website uses the exact npm version, with no local dependency override. The 26 browser tests passed; the 12-width initial-render comparison remained stable, and local hosting/SEO checks passed 138 route checks, 130 heads and 102 sitemap URLs.

## Code headers and package-manager commands

Code blocks show the language once when it is also their title, while source filenames keep their separate language label. The Installation guide and all component installation panels share the same Bun/npm/pnpm/Yarn command panel. Markdown exports preserve all four commands.

The 26 browser tests passed, including all four guide commands, keyboard selection, copy feedback reset and the existing Command/Manual component flow. A browser clipboard check confirmed Copy writes only the selected npm command. At 320px, the code scrolls inside its panel without document overflow, and Copy/Copied keeps the same header height. The final build passed after reserving the button width.
