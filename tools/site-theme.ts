import { createTheme } from '@rightui/ui/theme';

// Site preview overrides the public package's sans token; components keep their
// own semantic weights and the published package remains unchanged.
export function createSiteTheme(options: Parameters<typeof createTheme>[0] = {}) {
  return createTheme(options)
    .replace('Copy the bundled Geist and Newsreader fonts and their licenses from @rightui/ui/assets/fonts.', 'Bundle AlloVariable.ttf (Allo 1.0.1, SIL OFL) alongside the package fonts and licenses.')
    .replace('ui.foundation-font-sans: family = "Geist", system-ui, sans-serif', 'ui.foundation-font-sans: family = "Allo", system-ui, sans-serif')
    + '\n// In app.contract also declare:\n// font "Allo"\n//   100 900 = "assets/fonts/AlloVariable.ttf"\n';
}
