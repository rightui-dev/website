# rightui website

Beta documentation for [rightui](https://github.com/rightui-dev/ui): live component examples, AI patterns, blocks, charts and their actual Contract source. Inspired by [shadcn/ui](https://ui.shadcn.com).

## Run locally

Use **Bun 1.4.2**. Clone both repositories into sibling folders with these names:

```sh
mkdir rightui
cd rightui
git clone https://github.com/rightui-dev/ui.git components
git clone https://github.com/rightui-dev/website.git landing
cd landing
bun run setup
bun run build
bun run dev
```

Open http://localhost:8792. Access to the repositories is required while they are private.

`setup` prepares the official [expo/exact](https://github.com/expo/exact) checkout at `../.tooling/exact` and generates a local demo registry from the sibling sources and installs the public `@rightui/ui` package from npm. The SDK is pinned to `53426cf02bf986a5e781abc4f953d79989c6dc05`; an existing checkout at another revision is left unchanged and rejected. Set `EXACT` to an absolute path to use a separate checkout at that revision. Setup does not build or launch a native app.

Build before starting the server. After source edits, run `bun run build` and reload. The current build remains available during compilation. Use `bun run test` for the browser tests after generation; Exact needs a Chromium installation, configurable with `CHROME`.

## Source layout

```text
rightui/
  components/          # rightui-dev/ui
  landing/             # rightui-dev/website
    apps/site/         # Exact application and browser tests
    content/           # English documentation
    tools/             # setup, generation and build tools
  .tooling/exact/       # official pinned SDK, outside both repositories
```

Edit `tools/app.contract.template`, not generated `apps/site/app.contract`. `tools/generate.ts` reads the library sources and creates the routes, catalog, Markdown documents, demo dispatchers and source viewer data. Generated files and build artifacts are excluded from Git. Every demo imports the shared Contract library; the site does not maintain a separate copy of the components.

The `/source?file=…` viewer displays the source used for this build and links to its GitHub file. Documentation pages offer Copy Page and Markdown access. The UI package's installation guide lives in [rightui-dev/ui](https://github.com/rightui-dev/ui/blob/main/docs/INSTALLATION.md); `@rightui/ui@0.1.0-beta.4` is published on npm.

## Platform scope and validation

rightui targets **web, iOS and macOS only**. Windows, Android and Linux are outside its current support scope. This repository builds the web documentation; the native showcase is in the UI repository.

Web and targeted macOS checks have passed. iOS validation is incomplete; no successful iOS build or device check is claimed. Platform targets do not imply exhaustive component validation or stable upstream APIs; Exact is pre-1.0. See [validation](docs/VALIDATION.md) and the [native guide](https://github.com/rightui-dev/ui/blob/main/docs/NATIVE.md).

Most routes are prerendered. Three SVG chart routes render in the browser because the pinned Exact server renderer accesses `CSS.escape` without a server implementation. The upstream SDK is unchanged. See the validation report for remaining visual, accessibility and performance work.

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). shadcn/ui is the design reference; rightui is an independent Exact implementation.

The UI version shown on the site and in installation commands follows the library manifest. Keep the website dependency pinned to the matching published npm version, then rebuild the site; see the [versioning policy](https://github.com/rightui-dev/ui/blob/main/docs/VERSIONING.md).

## Hosting

The production domain is [rightui.dev](https://rightui.dev). See [Deployment](docs/DEPLOYMENT.md) for the Cloudflare account, reproducible build, route checks and publication commands. Source repository visibility is independent of the public site.
