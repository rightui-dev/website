import type { Answer, Result, Sources } from './app.contract.d.ts';
import { pages, sources as sourceFiles } from './generated/index';
import catalog from './generated/nav';
import aiCatalog from './generated/ai-nav';
import themeExports from './generated/theme-exports';
export const grants = '';

type Screen = Result<'loadScreens'>[number];

const loadPage = async (route: string): Promise<Screen['page']> => {
  const load = pages[route as keyof typeof pages];
  return load ? (await load()).default : {title:'Page not found',description:'This page does not exist.',kind:'notfound',slug:'',source:'',code:'',usage:'',keyboard:'',markdown:'',markdownHref:'',sections:[],api:[],importCode:''};
};
const loadSource = async (path: string): Promise<Screen['source']> => {
  const load = sourceFiles[path as keyof typeof sourceFiles];
  return load ? (await load()).default : {path,code:'Source file not found. Choose a component or block to open its source.',language:'Text'};
};
const loadCompatibility = async () => (await import('./generated/compatibility')).default;
const loadCharts = async () => (await import('./generated/charts-data')).default;
const loadBlocks = async () => (await import('./generated/blocks-data')).default;

const sources: Sources = {
  loadTheme: async ([preset, density, radius, font, optical, rounded, weight, focusRing]) => {
    const load = themeExports[`${preset}/${density}/${radius}/${font}` as keyof typeof themeExports];
    if (!load) return {code: ''};
    const axes = optical === 0 ? `'ROND' ${rounded}` : `'ROND' ${rounded}, 'opsz' ${optical}`;
    const note = font === 'sans' ? `\n// On your App's outermost view in app.contract:\n//   font-variation-settings="${axes}"\n//   font-optical-sizing="${optical === 0 ? 'auto' : 'none'}"\n// Weights below already include your proportional scale; do not scale them twice.\n` : '';
    const scale = font === 'sans' ? weight / 100 : 1;
    const theme = (await load()).default;
    const selected = focusRing ? theme : theme.replace(/ui\.foundation-focus-width: length = [^\n]+/, 'ui.foundation-focus-width: length = 0px');
    const code = selected.replace(/(ui\.weight-[a-z]+: number = )(\d+)/g, (_, prefix, base) => prefix + Number(base) * scale);
    const values = Object.fromEntries([...code.matchAll(/ui\.weight-([a-z]+): number = (\d+)/g)].map(match => [match[1], Number(match[2])]));
    const provider = `\n// Import FontWeights from "@rightui/ui". In your root provider:\n//   uiWeights = FontWeights(regular=${values.regular}, medium=${values.medium}, semibold=${values.semibold}, bold=${values.bold}, heavy=${values.heavy})\n// Set the root font-weight to ${values.regular} for text without an explicit role.\n`;
    return {code: code + note + provider};
  },
  loadCatalog: () => catalog,
  loadAI: () => aiCatalog,
  loadScreens: async ([requests]) => Promise.all(requests.map(async ({id, name, sourceFile, blockCategory: requestedCategory}) => {
    // A retained route resolves its own data, including a source URL's query.
    // Let loader errors reject the resource, as the individual loaders do.
    const page = await loadPage(name);
    const [source, blocks, charts, compatibility] = await Promise.all([
      name === 'source' || name.startsWith('component_')
        ? loadSource(name === 'source' ? sourceFile : page.source)
        : Promise.resolve({path: '', code: '', language: ''}),
      name.startsWith('blocks') ? loadBlocks() : Promise.resolve([]),
      name === 'area' ? loadCharts() : Promise.resolve([]),
      name === 'compatibility'
        ? loadCompatibility()
        : Promise.resolve({version: '', asOf: '', groups: [], statuses: [], evidence: []}),
    ]);
    const blockCategory = ['featured', 'sidebar', 'login', 'signup'].includes(requestedCategory) ? requestedCategory : page.kind === 'blocks' ? page.slug : 'featured';
    return {id, name, blockCategory, page, source, blocks, charts, compatibility};
  })),
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
