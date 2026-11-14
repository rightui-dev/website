# Block preview images

The 27 blocks have light and dark PNG previews in `apps/site/assets/blocks/`.
They are real browser captures of `/view/<slug>` from a frozen local build.

Keep the desktop layout at **1280 × 800 CSS pixels** and rasterize at **2.5×**
to produce **3200 × 2000 PNGs**. This preserves the 8:5 framing while keeping
text, SVGs and borders sharp on high-density screens. Do not enlarge existing
bitmaps or capture a loading state.

## Refresh

1. Build the current site and serve the resulting `dist` through the local
   Cloudflare preview on port 8793. Keep that build unchanged until capture ends.
2. Use the approved **dedicated Browser Harness launcher**, which uses its own
   headless Chromium profile. Do not connect to a personal browser or invoke a
   generic Harness command that could attach to one. From the repository root:

   ```sh
   python3 "$HOME/codex-browser-agent/browser.py" run <<'PY'
   from pathlib import Path

   new_tab('about:blank')
   capture_tab = current_tab()['targetId']
   capture_base = 'http://localhost:8793'
   capture_output = '/tmp/rightui-block-previews'
   # Optional subset, otherwise all 27 blocks in both color schemes:
   # capture_slugs = ['dashboard-01', 'sidebar-13']
   try:
       exec(Path('tools/capture-blocks.browser.py').read_text())
   finally:
       close_tab(capture_tab)
   PY
   ```

   Use a fresh output directory for a new build. The script requires a loopback
   preview URL and never writes to the repository, builds or publishes anything.
3. Review the PNGs and `capture-report.json`. The script waits for rendered
   controls, fonts, decoded images and settled frames. It checks dimensions,
   color scheme, overflow, application errors and the expected @ccheever/Expo
   branding. Native browser ResizeObserver loop notices are recorded separately.
   Sidebar 13 is captured after a real pointer click opens its settings dialog.
4. Copy the reviewed PNGs into `apps/site/assets/blocks/` while no build is
   running, then rebuild the site to include them. Keep the capture report with
   local validation evidence, outside the public asset directory.

No bitmap resampling, font substitution, injected content or visual CSS changes
are applied during capture. The defaults are neutral palette, comfortable
density, default corners and sans font, with explicit light/dark URL settings.
