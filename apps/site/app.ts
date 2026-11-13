import type { Answer, Result, Sources } from './app.contract.d.ts';
import { pages, sources as sourceFiles } from './generated/index';
import catalog from './generated/nav';
import aiCatalog from './generated/ai-nav';
export const grants = '';
const sources: Sources = {
  loadCatalog: () => catalog,
  loadAI: () => aiCatalog,
  loadCompatibility: async () => (await import('./generated/compatibility')).default,
  loadCharts: async () => (await import('./generated/charts-data')).default,
  loadBlocks: async () => (await import('./generated/blocks-data')).default,
  loadPage: async ([route]): Promise<Result<'loadPage'>> => {
    const load = pages[route as keyof typeof pages];
    return load ? (await load()).default : {title:'Page not found',description:'This page does not exist.',kind:'notfound',slug:'',source:'',code:'',usage:'',keyboard:'',markdown:'',markdownHref:'',sections:[],api:[],importCode:''};
  },
  loadSource: async ([path]): Promise<Result<'loadSource'>> => {
    const load = sourceFiles[path as keyof typeof sourceFiles];
    return load ? (await load()).default : {path,code:'Source file not found. Choose a component or block to open its source.',language:'Text'};
  },
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
