# Reference analysis — 2026-11-13

Inspected the live homepage, installation, components, blocks and area charts pages, and the pinned upstream source.

## Site structure

The header is 64px tall, with Geist typography, 24px outer gutters, a documentation search and theme control. The landing hero starts after 80px of space, with a 48px/52.8px semibold headline at a 1280px viewport. The responsive card mosaic uses two, three, four and five columns.

The desktop documentation has a scrolling left sidebar, a 640px article at x=320 in a 1280px viewport, and a right contents column. Page headings are 30px/36px, not landing headings. Component previews show actual interactive examples and their own source.

Blocks uses category navigation and full-width isolated previews with preview/code controls. Featured entries are dashboard-01, sidebar-07, sidebar-03, login-03 and login-04. The area gallery has one full-width interactive chart and nine small variants in a three-column grid.

## Source architecture

shadcn stores UI, examples, blocks and charts in its registry. Documentation and preview routes consume those files. Generated indexes and distributed registry items derive from source. rightui adopts this source-first structure, with its own Contract schema rather than pretending to implement the React registry protocol.

Relevant upstream paths: `apps/v4/app/(app)/(root)`, `apps/v4/app/(app)/docs`, `apps/v4/components/component-preview-tabs.tsx`, `apps/v4/components/block-viewer.tsx`, `apps/v4/registry/new-york-v4`.

## Adaptation

Keep the visual composition and useful browsing interactions. Replace branding and usage instructions with rightui and Exact. Omit v0, deployment ads, package installation marketing and fake GitHub statistics. Preserve MIT attribution.

UI is Contract. TypeScript and Rust are data integration paths, not interchangeable widget syntaxes. Show the exact published npm installation commands, the optional archive workflow and the real source linked to GitHub.

The website and library are separate repositories: [rightui-dev/website](https://github.com/rightui-dev/website) and [rightui-dev/ui](https://github.com/rightui-dev/ui). The library owns the Contract components and examples; the website generates its catalog and documentation from those sources.
