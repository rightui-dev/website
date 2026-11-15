# Validation status

Recorded checks as of November 15, 2026, using Bun 1.4.2 and Exact revision `53426cf02bf986a5e781abc4f953d79989c6dc05`. This report distinguishes executed checks from platform targets. It is not an exhaustive compatibility certification.


## Simple Sheet motion — November 15, 2026

- Package **0.3.0-beta.3** gives all four SheetContent orientations the same slide and backdrop fade. Bottom no longer uses Drawer handles, snap points or springs. Drawer source and behavior remain unchanged.
- Eight isolated package Sheet tests passed, including initially open content and reopening during an interrupted exit. Real browser pointer checks measured entry and exit translations on every edge with synchronized opacity and no focus-induced layer scrolling. At 390px, reduced-motion checks observed no intermediate movement. An independent archive installation built and passed its Button test.
- iOS simulator interactions and a recording verified full-window panels, no handles, close controls and visible entry/exit motion on all edges. Native accessibility and physical frame rate remain incompletely measured. The previous 45-test site run belongs to beta.2 and was not rerun for this Sheet-only correction.
- iPhone and Mac **0.3.0, build 2026111505** are available on AppDrop as iOS **revision 5** and Mac **revision 6**. Both downloads match the uploaded bytes after IPA metadata normalization. Each update preserved the other platform. The iPhone copy was installed and launched on the physical device. Mac strict signature/ZIP checks passed. Once its window became available, opening and closing all four Sheet orientations was checked in the release archive; the bottom panel covered the window and had no handle.
- npm publication completed on the beta channel. The public canonical tarball matches the release archive and registry integrity; a fresh registry installation built and passed its Button interaction. The website dependency and Bun lock resolve the official package, and all 94 installed files match the verified archive. The existing latest tag remains unchanged.
- The final documentation build passed. Local Cloudflare checks passed 141 routing/status/MIME probes, 133 SEO heads and 105 sitemap URLs, and 134 analytics heads with the production-only guard. No local checkout paths were found in the generated HTML, JavaScript or Markdown.
- Both native bundles exclude the Umami script and tracker identifier. Native apps embed the previous Mac download revision 5; the source link was advanced to revision 6 after upload. This native delivery does not deploy the public website.

## Drawer options and popover invokers — November 15, 2026

- The final browser suite passed **45 tests, 0 failures**. Six route-data tests passed with 34 assertions. The installed-package overlay fixture passed 13 targeted tests; six Sheet checks cover the controlled composition. These checks do not establish exhaustive catalog accessibility coverage.
- Drawer supports detached panels, optional handle/close controls, configurable backdrop opacity and dismissal, spring bounce, controlled snap points and separately scrolling content between fixed regions. Attached panels keep the normal content inset; detached panels use a smaller inset. Full height removes corner rounding, and rounding plus top safe-area spacing follow the displayed height while dragging down. The same controls remain visible; no extra Back button is introduced.
- The automatic Drawer body scrolls to the window bottom with bottom safe-area spacing inside its content. A simulator layout check confirmed that its scroll viewport ends at the screen edge, removing the fixed blank strip over the content. Targeted web pointer measurements recorded spring overshoot and successful dragging outside the visual handle box. Sustained physical-device frame rate remains unmeasured; the user deferred Instruments capture.
- Popover triggers declare their native invoker relationship while their controlled action owns visibility. Desktop/mobile browser checks and iOS simulator pointer checks confirm second-trigger dismissal, outside dismissal and internal theme changes without closing. A public Popover regression verifies edited content survives dismissal and reopening.
- Umami is added only by the website postbuild step. Native bundles were scanned for its script URL, tracker identifier and callback, with no matches.
- The package **0.3.0-beta.2** is published on npm's beta channel. Its downloaded archive matches the release checksum; an isolated app installed the npm version, built and passed its Button interaction check. The documentation lockfile now resolves the registry package with no local archive override.
- iPhone and Mac version **0.3.0**, build **2026111504**, are available on AppDrop as iOS **revision 4** and Mac **revision 5**. Both public downloads match the uploaded artifacts (after the CLI's IPA metadata normalization). Each platform update preserved the other's recorded version. The iPhone app was installed and launched on the physical device; this is not a new physical gesture/performance measurement. The Mac release copy passed strict signature checks and was opened; its theme trigger and outside-click dismissal were checked.
- Native apps were built from the exact package archive subsequently verified on npm. Their embedded Mac download link retains revision 4; the source link was updated to revision 5 after AppDrop returned that revision. Native delivery does not deploy the public website.

## Native navigation delivery — November 15, 2026

- Retained iOS visits load their own page and auxiliary data. A shared header covers the status-bar area while page content moves beneath it. A slow interactive return and cancellation were recorded and visually inspected; a completed edge swipe returned to the previous screen.
- Blocks categories use the public tab component and replace the current visit's category query. Sidebar then Login changed content in place; one edge swipe returned to Home. Legacy category URLs remain supported. Selecting the Home logo while already on Home left the displayed hierarchy unchanged.
- The preview Back bar uses a clipped, token-timed translation. It hides on downward scrolling and returns on upward scrolling without changing the content inset. Simulator checks exercised Dashboard page and table scrolling, Sidebar 01 scrolling and return to the catalog. Reduced motion disables the transition in the authored implementation; no new system reduced-motion device check is claimed.
- The final web interaction suite passed **40 tests, 0 failures**. Six data-loader tests passed with 34 assertions, covering retained pages, source queries, category overrides and missing data. These targeted checks do not clear the historical accessibility findings below.
- The mobile menu slides in from the left while the page and shared navbar scale to 88% and move right using the same 320 ms easing. The light surface remains white; appearance controls retain dark mode. Closing from the page or close button, menu navigation, portrait/landscape safe areas, interrupted and completed native Back gestures, and the appearance popover were checked in the simulator. Web tests also cover Escape, desktop resize and reduced motion.
- A closing flash was reproduced in a simulator recording: the central page content disappeared for about 70 ms. Keeping the UIKit route bounds fixed and transforming an inner page surface removed the observed flash. Two subsequent closing recordings (close button and page tap, 67 captured frames total) retained page content throughout the inspected frames. These targeted recordings do not establish a frame-rate guarantee or physical-device validation.
- The raised page has matching top and bottom corners. The shared header clips only its lower shadow to avoid a seam with the page. Its native top inset is measured from the status-bar background; this avoids an Exact server-rendering failure encountered when adding `safeAreaTop` to the viewport resource. The final simulator recording retained central page content in all 43 captured frames. The final web suite passed **40 tests, 0 failures**, without viewport resource errors.
- The same sources built as iPhone and Mac version **0.2.0**, build **2026111501**. Both archives passed ZIP, bundle identity, arm64 and strict signature checks. The Mac version fields were updated in the release copy and the outer bundle re-signed because the pinned host writes fixed defaults; the SDK remains unchanged. Mac launch, navigation and Back were exercised; the menu was also checked in a narrow Mac window.
- AppDrop now serves iOS **revision 3** and Mac **revision 4**. Metadata checks confirmed that each update preserved the other platform. Public download hashes are recorded in the private delivery evidence. These builds use the existing personal-signing iOS and ad hoc Mac distribution model.
- A separate copy of the final iPhone app was signed with a valid local development profile, installed over the paired network connection, and launched on the physical iPhone. The installed version/build and running process were confirmed. This does not add a physical-device visual or gesture regression pass.
- The source's Mac download link was updated to revision 4 after the uploads. The shipped native apps and currently published website retain their embedded revision 3 link on `/try`; the shared AppDrop landing link selects the new platform builds. No npm publication, GitHub push or production website deployment was performed for this navigation batch.

## Avatar first-pointer follow-up

The beta.4 production check exposed a pre-activation click problem: the decorative image's load/error listener hid the enclosing button from Exact's initial-event capture. The beta.5 correction makes only that image transparent to pointer hit testing. With idle activation held, real first-pointer clicks at 1440px and 390px activated the built app, opened the menu and focused Profile. Five Avatar tests and the isolated package/Button check also passed. No new native build is claimed for this web interaction correction.

The published npm archive was verified byte for byte against the reviewed beta.5 artifact (SHA-256 `d783458853efd9696396c387f45c0e175863c110fbdb0a2e3849008ccac8c4f6`). A fresh npm installation passed its web build and Button interaction check. The website dependency and lockfile use the official registry package.

## Release 0.2.0-beta.4 — Avatar, block previews and iOS

- The `0.2.0-beta.4` archive passed an isolated installation, web build and Button interaction, plus five Avatar tests for image recovery, legacy props/counts, account-menu selection and keyboard navigation. Original user icons on flat backgrounds replace portrait photographs. The five initial preview images were decoded and visible before JavaScript activation.
- The website passed 34 browser tests before the final icon-only replacement. Targeted checks after that replacement confirmed the real pointer/keyboard account-menu flow, a 24px mobile article inset and no horizontal overflow. Sidebar text aligned with the header logo across the checked desktop widths. Search focus retained its complete ring in light/dark mode and sharp/default/rounded configurations.
- All 54 block previews (27 blocks, light and dark) were regenerated at 3200×2000 from the current examples, including the Expo mark and `@ccheever` profile. The capture report recorded no application error or document overflow; sidebar-13 was captured with its dialog open.
- The published npm archive matches the reviewed artifact byte for byte (SHA-256 `560ea8681ef4fb7c013112c4b75738204256cec71573df3c5d941b1cfc9a5eb2`). A fresh registry installation built and passed its Button interaction. Both `beta` and `latest` select `0.2.0-beta.4`; the website lockfile resolves the official package without a local override.
- The local production build passed 141 hosting checks, 133 SEO heads and 105 sitemap URLs, plus 134 analytics heads with the production-only guard.
- The same site sources compiled as an iPhone arm64 archive, app version `0.2.0`, build `2026111404`. ZIP integrity, bundle identity, architecture and the ad hoc signature passed verification. AppDrop iOS revision 2 serves exactly the CLI upload bytes after removal of Finder metadata (SHA-256 `3a5a07b45b1241dcac432dde6a10790902be030d8a73700bf66421f731d5a737`). The Mac build remains at revision 3. No iPhone installation, launch or interaction test is claimed.

## Release 0.2.0-beta.3 — modal Sheet

- The published npm archive matches the reviewed artifact byte for byte (SHA-256 `2c1d5c6da106440a593e5f47722f74fc66646c43fec52439befe5a0395d391ec`). A fresh registry installation built and passed the Button interaction. Both `beta` and `latest` select `0.2.0-beta.3`; the website lockfile resolves that official package without a local override.
- The package retains the existing controlled Sheet and root imports. The new SheetContent, SheetBody and SheetFooter use the optional `@rightui/ui/sheet` entry. Only applications importing that entry need the documented `rightui-sheet` declaration and web stylesheet; a fresh Button-only app built and passed its interaction test without that declaration.
- The final archive installed in isolation, built, and passed six Sheet interaction tests covering persistent fields, Escape, optional close controls and four orientations on mobile. The component and web stylesheet are byte-identical to the approved local implementation; import wiring and distribution documentation were adjusted for compatibility.
- In Chromium at 1280×800, five real pointer clicks covered all four sides and No Close Button. Each dialog covered the viewport, kept focus inside, locked page scrolling and returned focus on Escape. Animation measurements observed zero dialog scroll and zero direction reversals. At 390×844, right and bottom panels retained a visible footer and caused no document overflow; both pointer-driven animations also passed. These are targeted checks; the older full website suite was not rerun for this release.
- The local Cloudflare emulator passed 141 route/status/MIME checks. SEO passed 133 page heads and 105 sitemap URLs. Analytics checks confirmed a unique tracker and production-domain guard, including dedicated client shells. Existing Expo demo profiles, previews and Umami integration remain included.
- No native build or AppDrop update was performed for this Sheet delivery. The new native modal composition remains unvalidated.

## Release 0.2.0-beta.1

- The final local candidate passed **34 browser tests, 0 failures**, after the single-slot PageInsets correction. Coverage includes repeated mobile block menus, theme and font choices, source tabs and three-second clipboard feedback in code blocks, package commands and documentation actions. The test compiler reports eight warnings and one informational note; these checks do not clear every accessibility or enlarged-text concern in the historical report.
- **59 focused tests** passed: 36 theme/configuration checks with 279 assertions and 23 initial-render/helper checks with 156 assertions. The visual-token guard checks 345 tokens, 36 mode combinations and 214 authored Contract files with no unclassified visual decisions. Reviewed geometry and system-owned appearance exceptions remain explicit.
- The versioned archive installed independently, compiled and passed the Button interaction with all three imported font configurations (Sans, Newsreader Serif and Mono). The package includes the five migration/customization guides, regular and italic font resources, licenses and pinned provenance.
- The Cloudflare emulator passed **141 route/status/MIME checks**, including exact JavaScript/font bytes. SEO passed **133 heads, 105 sitemap URLs**, robots.txt, the real 404 response and the original 80,653-byte social image.
- The corrected production build passed the initial-render comparison at **12 widths from 390 to 2560 pixels**. On the 390px Switch page, the article retained 24px side insets and no horizontal document overflow. Pointer and Space activation toggled the Switch, while the disabled control did not change state.
- PageInsets now renders its slot once, with static token-based side spacers. The checked JavaScript asset is approximately 15.2 MiB, below Cloudflare's 25 MiB limit. Postbuild rejects future builds exceeding that limit. The Exact SDK is unchanged.
- The approved macOS site archive was compiled from the same Contract site, ad hoc signed and manually exercised through Home, Blocks, Dashboard, Back/Forward and the external website action. AppDrop revision 2 serves exactly the approved ZIP (SHA-256 `090eaeb7273ce6d727f4ae97e7d85b3fb2ea1d6465d2c161b8f689fe7d905efd`). That archive predates the website delivery-only PageInsets and installation-copy refinements; no later Mac rebuild is claimed.
- The published npm archive matches the reviewed archive byte for byte (SHA-256 `485eb86c8d50e2230598e90622a90002eae15f00096381ef671c79343281d4f4`). A fresh registry install built and passed the Button interaction with all three imported font configurations. Both `beta` and the explicitly approved default `latest` resolve to `0.2.0-beta.1`; it remains a prerelease. The website lockfile now resolves the official registry package.
- All 23 browser appearance scenarios passed on the final local production build, covering preference restoration, direct URLs, presets, fonts and the initial-render/runtime handoff. The production build reports 21 compiler warnings and one note; successful execution is not a claim of warning-free compilation.
- No iOS build was started for this delivery. AppDrop's existing iPhone revision 1 is unchanged. Native visual and interaction coverage remains targeted, not exhaustive.

## Block profile and analytics follow-up

- The dashboard and six sidebar demos now show `@ccheever` with an inline Expo mark, including the account menu. All 14 light/dark previews were refreshed at a 1440×900 viewport and exported at 1280×800. Browser checks confirmed the profile, inline mark and absence of horizontal document overflow; the sidebar account menu opened with the same profile. Existing third-party source/license attribution remains intact.
- A fresh macOS build includes the final previews. Its 14 images match the compiled resource inventory; strict signature and ZIP checks passed. AppDrop revision 3 serves the identical archive (SHA-256 `02e3f5e75a68a09ffe3820b023de8c32b8eed185ba3c82dbb34de44bc714002b`). No new native interaction coverage is claimed. The iPhone artifact is unchanged.
- The website loads the deferred Umami Cloud tracker without an additional SDK or user identification. Collection is restricted to top-level public routes on `rightui.dev`; source viewers, isolated block previews, iframes, unknown routes and local hosts are excluded. Query strings and fragments are omitted, so appearance controls do not count as page navigation.
- This follow-up changes repository demos and the website only. The npm package remains `0.2.0-beta.1`; the release test counts above are not a new full-suite run on these changes.

## Earlier validation history

The following sections retain earlier release evidence and its original scope; they do not describe the current release unless explicitly stated.

### Website

- The latest recorded `bun run test` completed **28 browser tests, 0 failures**. Coverage includes navigation, search, theme, installation controls, compatibility tables and targeted component interactions. The preceding `verify` run reported 0 Contract findings across its 22 tests.
- The production build passed for 66 component examples, 21 AI patterns, 27 blocks and 10 charts. The build generated 130 Markdown documents, including compatibility and installation pages. The official Exact SDK checkout was unchanged.
- The previous production release passed **137 route/status/MIME checks** on `https://rightui.dev`. This update passed **138 checks** against the local Cloudflare emulator. Served `app.js` and Geist matched the local build. Checks included Markdown, client-rendered routes and genuine unknown-route 404 responses.
- The approved logo is registered for the favicon, Apple touch icon and web manifest. A faithful 56×56, 1,155-byte derivative is embedded in initial HTML and the runtime for the 28px header logo. Postbuild rejects missing, deferred or external header logos.

The website now uses the immutable npm beta directly. Its generated demo registry rewrites public imports to that package and derives seven private demo helpers from its installed sources, without duplicating its Tamber design. The new How Exact works page was inspected at desktop and 390px mobile widths; its mobile document had no horizontal overflow.

### Package and data integration

- The earlier **`@rightui/ui@0.1.0-beta.3` release** was validated on npm. Its archive SHA-512 integrity matched the reviewed release artifact. Both the beta.3 archive and its npm installation built with zero warnings and passed the Button counter test, from 0 to 1. The npm archive integrity matched the validated local artifact.
- The package archive and its manual extraction were separately installed in isolated Exact apps without a global rightui link. Contract types and web builds passed; the counter interaction passed. The npm, pnpm and Yarn command variants are documented but were not individually exercised as installation clients.
- The complete Contract and TypeScript integration example built and passed one interaction test. The Rust integration passed one `cargo test`; this checks its data-source contract, not a native host launch.
- Five version-tool tests passed, covering beta policy, required notes, synchronized versions, immutable tags and refusal to repack modified package sources under an existing release.
- Releases remain beta. Both npm tags, `latest` and `beta`, now resolve to `0.1.0-beta.5` following explicit approval. The default install selects beta.5; this does not make it stable. Use an exact version for reproducible installation.

### Rendering checks

- Desktop/mobile and light/dark rendering were checked. Script-disabled installation HTML was inspected at 390, 1023, 1024 and 1280 CSS pixels; its shell and article had no document horizontal overflow.
- `tools/check-first-paint.browser.js` passed at 12 widths from 390 to 2560 pixels against the Cloudflare emulator. It compared heading size, hero height, mosaic position, column geometry and the decoded 28px navbar logo before and after activation. The embedded logo has no image network request.
- Five focused image-helper tests passed. Script-disabled browser checks confirmed six painted Attachment symbols and a decoded homepage QR without a separate QR request.
- Focused component checks covered Message rendering, Copy Page geometry, menu keyboard selection, Context and citation focus/Escape behavior, Reasoning replay, and independent horizontal/vertical dragging. These checks establish their observed cases only.

### Native showcase

The separate `components/examples/native` showcase imports the same 124 previews; it does not reuse the website shell.

- The macOS showcase built with an ad hoc signature. Its catalog, split navigation and dashboard were inspected.
- `bun exact.mjs test macos` completed **2 tests, 0 failures**, including a repeat after the theme correction. Theme captures covered matching sidebar, content and native chrome in both schemes.
- **iOS validation of this older standalone showcase is incomplete.** It has no recorded successful iOS build or device check. The newer website-based iPhone archive is recorded separately above.
- Targets are web, iOS and macOS. Windows and Android are outside rightui support. Targeting a platform does not certify every component or interaction.

### Outstanding limits

The latest broad visual/accessibility audit reported **130 findings**, and has not been cleared by the functional checks above. Its 22 test endings were audited at phone/desktop sizes, light/dark schemes and the largest text size: 44 fixed-size findings, 25 clipping findings, 11 overflow findings and 50 other findings. Some involve intentional hidden live-status text or scrollable code; compact line heights, enlarged-text overflow, contrast and authored-dialog warnings still need triage. Generated reports live under `apps/site/.exact/verify/`.

The beta.5 functional test run reported 15 compiler warnings and one informational note; the subsequent final candidate build reported 18 warnings and one note. Neither successful tests nor screenshots establish full variant parity, complete keyboard/VoiceOver coverage, pixel-perfect fidelity or a 120 fps guarantee. See the UI repository's [variation inventory](https://github.com/rightui-dev/ui/blob/main/docs/VARIATIONS.md), [AI pattern boundaries](https://github.com/rightui-dev/ui/blob/main/docs/AI-ELEMENTS.md) and [native guide](https://github.com/rightui-dev/ui/blob/main/docs/NATIVE.md).

Three routes (`/docs/components/chart`, `/charts/area`, `/view/dashboard-01`) render in the browser because the pinned SDK's server SVG-gradient renderer lacks `CSS.escape`. Other routes use build rendering. The demo dispatcher still compiles into one UI bundle; lazy data modules avoid loading every source document up front, while UI code splitting remains future work.

### SEO delivery

Page titles, descriptions, canonical URLs, Open Graph and Twitter cards use the production origin. An original 1200×630 social PNG accompanies the site. Dedicated client-route shells preserve route-specific metadata on direct loads; the sitemap excludes source viewers and isolated block previews, and 404 responses carry noindex. Exact updates titles and descriptions during in-app navigation; other metadata is guaranteed on direct URL loads. `bun tools/check-seo.ts` validates generated heads and crawl files; passing an origin validates HTTP delivery.

The SEO check passed for all 130 page heads, 102 sitemap URLs, robots.txt, the real 404 response and the 80,653-byte PNG, both in the build output and through the local Cloudflare emulator.

### Clean release history

The history cleanup was completed with `v0.1.0-beta.3`, from the clean source history. Earlier GitHub prereleases and tags were removed after their metadata and archives were backed up and verified. npm versions were initially preserved; any subsequent targeted removal is recorded separately. The beta.3 archive changes only the README, changelog and package version; all Contract components, theme tokens and font assets are byte-identical to beta.2.

### AI installation prompt and Accordion spacing

The beta.4 homepage and Installation guide shared one versioned AI setup prompt, including their Markdown exports. The homepage prompt was subsequently removed; it remains available in Installation. Browser checks confirmed the complete prompt reached the clipboard successfully on both pages, with the Copied state displayed. The expandable prompt wraps without horizontal overflow at 390px. The homepage attribution links Exact to its official repository.

The beta.4 Accordion and AccordionMultiple render their headings, expanded content and chevrons 16px from the container edges. Browser measurements confirmed those insets at 390px, including hover, with no horizontal document overflow. ArrowDown moved focus to the next trigger. An isolated archive test and the website regression test checked single and independent expansion, keyboard activation and preserved state after resize. These are web checks; no new native validation is claimed.

The beta.4 package passed isolated installation, build and Button interaction checks from both its archive and the public npm registry. The website uses the exact npm version, with no local dependency override. The 26 browser tests passed; the 12-width initial-render comparison remained stable, and local hosting/SEO checks passed 138 route checks, 130 heads and 102 sitemap URLs.

### Code headers and package-manager commands

Code blocks show the language once when it is also their title, while source filenames keep their separate language label. The Installation guide and all component installation panels share the same Bun/npm/pnpm/Yarn command panel. Markdown exports preserve all four commands.

The 26 browser tests passed, including all four guide commands, keyboard selection, copy feedback reset and the existing Command/Manual component flow. A browser clipboard check confirmed Copy writes only the selected npm command. At 320px, the code scrolls inside its panel without document overflow, and Copy/Copied keeps the same header height. The final build passed after reserving the button width.


### Trace, Code Block and initial theme

The beta.5 component update preserves existing required props. Trace adds compact status rows, controlled tool/error/source disclosures and a local replay demonstration. CodeBlockAdvanced accepts syntax tokens and line variants, with wrapping, line numbers, constrained height, copy feedback and optional UTF-8 download. The example tokens are reproducibly generated by Shiki; a language label alone does not tokenize arbitrary code.

The 28 website browser tests passed, including replay progression through the final answer, disclosure state, reduced motion, resize, tokenized source text, wrap and copy feedback. Desktop and 390px rendering checks showed no document horizontal overflow. Code Block's empty and populated unwrapped lines measured 24px. With clipboard write permission granted to the isolated browser, Copy succeeded; the downloaded route.ts matched the original 337-byte code. This checks the web download fallback, not the native file picker. No new iOS or macOS checks were run.

An early inline theme bootstrap now reads Exact's stored preference before styles and activation. URL overrides, persisted light/dark choices and the system default share the same priority in the bootstrap and the Contract runtime. Four helper tests passed, including malformed/unavailable storage and dedicated SEO client shells. Browser measurements passed 20 scenarios across emulated light and dark system preferences: home, documentation and client-rendered routes, saved choices, URL overrides, corrupt values and storage exceptions. Animation-frame and root-style samples detected no opposite-color frame before or through activation. These are computed-style measurements, not a compositor filmstrip. A real toggle preserved the URL's other parameter and fragment, left the stored preference intact for the URL override and retained its scheme after reload.

The homepage AI prompt box was removed; Installation retains its copyable prompt. The hero status now reads Work in progress and links to Compatibility. Local hosting and SEO checks passed 138 routes, 130 page heads and 102 sitemap URLs.

The final beta.5 candidate archive and documentation build passed locally. The final build reported 18 warnings and one informational note; the existing broad audit remains unresolved. The first-paint layout/logo comparison passed all 12 widths from 390 to 2560px after the homepage changes. The package is now published on npm; its SHA-512 integrity matches the validated archive. The official npm installation built with zero warnings and passed the isolated Button interaction test. The website dependency and lockfile now resolve the exact official beta.5 without a local override.

On November 14, 2026, the obsolete npm versions `0.0.0-stage` and `0.1.0-beta.2` were explicitly removed after their registry metadata and tarball integrity were backed up and verified. The registry retains beta.3, beta.4 and beta.5; both `latest` and `beta` select beta.5. The final website build uses the official exact npm package. Hosting/SEO checks passed locally for 138 routes, 130 page heads and 102 sitemap URLs.


## 2026-11-15 — window overlays, drawer stops and theme history (local)

The local candidate uses @rightui/ui 0.3.0-beta.1. Dialog, Alert Dialog, Drawer, Sheet and Toast use a painted window-level layer. Ten isolated browser checks pass for geometry outside a transformed clip, repeated visibility, focus/Escape, non-modal Toast, initially open content, Drawer pointer and keyboard stops, normalization and SafeArea's zero-inset web layout. Six Sheet checks pass for form persistence, optional close controls and four edges. Additional real browser pointer presses verified modal backdrop dismissal and Alert Dialog background blocking.

The package archive also installs, compiles and passes its interaction check in an independent Exact app. The final full-site browser suite passes all 42 tests, including the two appearance-history regressions. The final web build and SEO checks pass: 133 page heads and 105 sitemap URLs. Native simulator checks verified the authored full-window Sheet, editable fields, the complete Drawer surface at 30% and 90%, pull-down closure, progressive backdrop and the theme preserved after interactive navigation back. A simulator recording confirms changing panel edges and backdrop intensity; it is not a physical frame-rate measurement. Toast remains non-modal in the native interaction check.

The iPhone archive is version 0.3.0, build 2026111502. A separately development-signed copy was installed and launched over Wi-Fi; installed version and bundle identifier were verified. The archived IPA was not modified by device signing. ProMotion eligibility is present and Exact requests the display maximum for spatial motion. Sustained 120 fps and full VoiceOver modal isolation are not certified by these checks; physical performance capture requires a real gesture session.

This batch is local/device delivery. npm, GitHub, the public website and AppDrop remain separate publication steps.
