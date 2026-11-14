import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, cpSync, unlinkSync, rmSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { buildRegistry } from '../../components/tools/registry';
import { checkVersion } from '../../components/tools/check-version';
import { compatibility, compatibilityMarkdown } from '../../components/tools/compatibility';
import { prepareRegistry } from './prepare-registry';
import { createTheme, themeLayout, themeOptions, themeAxes, themeTokens } from '@rightui/ui/theme';
prepareRegistry();
const root = resolve(import.meta.dir, '..');
const finderMetadata = resolve(root, "dist.gen/.DS_Store");
if (existsSync(finderMetadata)) unlinkSync(finderMetadata);
const library = resolve(root, '../components');
const uiVersion = checkVersion(library);
for (const manifest of ['package.json', 'apps/site/package.json']) {
  if (JSON.parse(readFileSync(resolve(root, manifest), 'utf8')).dependencies['@rightui/ui'] !== uiVersion) {
    throw new Error(`${manifest} must pin the same published UI version as the documentation: ${uiVersion}`);
  }
}
const site = resolve(root, 'apps/site');
// Keep command assertions pinned to the same candidate as the installation UI.
const siteTests = resolve(site, 'app.test.contract');
const versionedTests = readFileSync(siteTests, 'utf8').replace(/(@rightui\/ui@|rightui-ui-)\d+\.\d+\.\d+-beta\.\d+/g, (_, prefix) => prefix + uiVersion);
writeFileSync(siteTests, versionedTests);

mkdirSync(resolve(site,'assets/fonts'),{recursive:true});
for(const font of ['Geist.ttf','Geist-Italic.ttf','Newsreader.ttf','Newsreader-Italic.ttf','OFL.txt','OFL-Italic.txt','OFL-Newsreader.txt'])copyFileSync(resolve(root,'node_modules/@rightui/ui/assets/fonts',font),resolve(site,'assets/fonts',font));
rmSync(resolve(site, 'assets/avatars'), { recursive: true, force: true });
cpSync(resolve(root, 'node_modules/@rightui/ui/assets/avatars'), resolve(site, 'assets/avatars'), { recursive: true });
const read = (p: string) => readFileSync(p, 'utf8');
const json = (p: string, fallback: unknown = []) => existsSync(p) ? JSON.parse(read(p)) : fallback;
const write = (p: string, value: string) => { mkdirSync(resolve(p, '..'), { recursive: true }); writeFileSync(p, value); };
const slugify = (s: string) => s.toLowerCase().replaceAll(' ', '-');
const appDropLogo = 'data:image/png;base64,' + readFileSync(resolve(site, 'assets/brand/appdrop.png')).toString('base64');
write(resolve(site, 'generated/appdrop-brand.contract'), `component AppDropMark\n  view\n    image ${JSON.stringify(appDropLogo)} id="appdrop-logo" width=24 height=24 alt="" transform="rotate(-12deg)" flex-shrink=0\n`);
const families = 'Accordion|Alert|Alert Dialog|Aspect Ratio|Attachment|Avatar|Badge|Breadcrumb|Bubble|Button|Button Group|Calendar|Card|Carousel|Chart|Checkbox|Code Block|Collapsible|Combobox|Command|Context Menu|Data Table|Date Picker|Dialog|Direction|Drawer|Dropdown Menu|Empty|Field|Hover Card|Input|Input Group|Input OTP|Item|Kbd|Label|Marker|Menubar|Message|Message Scroller|Native Select|Navigation Menu|Pagination|Popover|Progress|Questionnaire|Radio Group|Resizable|Scroll Area|Select|Separator|Sheet|Sidebar|Skeleton|Slider|Spinner|Switch|Table|Tabs|Textarea|Toast|Toggle|Toggle Group|Tooltip|Trace|Typography'.split('|');
const details = json(resolve(library, 'metadata/components.json')) as any[];
const aiElements = json(resolve(library, 'metadata/ai-elements.json')) as any[];
const components = families.map(title => ({slug: slugify(title), title, description: `Use ${title.toLowerCase()} in your Exact application.`, usage: '', keyboard: '', source: '', example: '', exports: [], ...details.find(x => x.slug === slugify(title))}));
const chartMeta = json(resolve(library, 'metadata/charts.json')) as any[];
const charts = chartMeta.map(x => ({...x, code: read(resolve(library,x.source))}));
const sourceFiles: Record<string,{path:string,code:string,language:string}> = {};
function scan(dir: string) {
  if (!existsSync(dir)) return;
  for (const item of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    if (item.name.startsWith('.') || ['node_modules','target','dist','generated','Cargo.lock'].includes(item.name)) continue;
    const path = resolve(dir,item.name);
    if (item.isDirectory()) scan(path);
    else if (/\.(contract|tamber|ts|rs|toml|json|md|css)$/.test(item.name)) {
      const key=relative(library,path);sourceFiles[key]={path:key,code:read(path),language:item.name.endsWith('.contract')?'Contract':item.name.endsWith('.rs')?'Rust':item.name.endsWith('.ts')?'TypeScript':item.name.split('.').at(-1)!};
    }
  }
}
scan(library);
const blockTitles:Record<string,string>={'dashboard-01':'A dashboard with sidebar, charts and data table','sidebar-07':'A sidebar that collapses to icons','sidebar-03':'A sidebar with submenus','login-03':'A login page with a muted background','login-04':'A login page with form and image'};
const blockSlugs=['dashboard-01',...Array.from({length:16},(_,i)=>`sidebar-${String(i+1).padStart(2,'0')}`),...['login','signup'].flatMap(g=>Array.from({length:5},(_,i)=>`${g}-${String(i+1).padStart(2,'0')}`))];
function blockSources(entry: string) {
 const seen = new Set<string>();
 const visit = (path: string) => {
  if (seen.has(path) || !sourceFiles[path]) return;
  seen.add(path);
  for (const match of sourceFiles[path].code.matchAll(/^use .* from "([^"]+)"/gm)) {
   const spec = match[1];
   const imported = spec.startsWith('@rightui/registry/') ? spec.slice('@rightui/registry/'.length) : spec.startsWith('.') ? relative(library, resolve(library, dirname(path), spec)) : '';
   if (imported) visit(imported.endsWith('.contract') ? imported : imported + '.contract');
  }
 };
 visit(entry);
 return [...seen].map(path => sourceFiles[path]);
}
const blocks=blockSlugs.map(slug=>{
 const group=slug.split('-')[0];const n=Number(slug.split('-')[1]);
 const path=`blocks/${slug}.contract`;const actualCode=read(resolve(library,path));sourceFiles[path]={path,code:actualCode,language:'Contract'};
 return {slug,title:blockTitles[slug]??`${group==='sidebar'?'Sidebar':group==='login'?'Login':'Signup'} layout ${n}`,source:path,code:actualCode,group};
});
const sections = JSON.parse(read(resolve(root,'content/guides.json')).replaceAll('{{UI_VERSION}}', uiVersion).replaceAll('{{THEME_COMBINATIONS}}', String(Object.keys(themeAxes).reduce((count, key) => count * themeOptions[key as keyof typeof themeAxes].length, 1)))) as any[];
const blank={title:'Page not found',description:'This page does not exist.',kind:'notfound',slug:'',source:'',code:'',usage:'',keyboard:'',markdown:'',markdownHref:'',sections:[],api:[],importCode:''};
const pages:Record<string,any>={home:{...blank,title:'UI components for Exact',description:'Build interfaces for web, iOS and macOS with rightui. Explore customizable Exact components, ready-to-use blocks, charts and practical documentation.',kind:'home'},components:{...blank,title:'Components',description:'Composable components with live examples and source you can make your own.',kind:'index'},blocks:{...blank,title:'Building Blocks for Exact',description:'Clean, modern building blocks. Explore, use and adapt their source in your Exact apps.',kind:'blocks',slug:'featured'},area:{...blank,title:'Beautiful Charts & Graphs',description:'A collection of ready-to-use charts, written in Exact. From simple areas to interactive data displays.',kind:'charts'},source:{...blank,title:'Source code',description:'The files used by this website and its live examples.',kind:'source'}};
const compatibilityData = compatibility(library);
const compatibilityReport = {
 version: compatibilityData.matrix.version, asOf: compatibilityData.matrix.asOf,
 groups: compatibilityData.groups.map(group => ({...group, rows: group.rows.map(({evidence,...row}) => row)})),
 statuses: Object.entries(compatibilityData.matrix.statuses).map(([id,s]) => ({id,label:s.label,description:s.description,url:''})),
 evidence: compatibilityData.matrix.evidence.map(item => ({id:item.id,label:item.id,description:item.description,url:item.url})),
};
write(resolve(site,'generated/compatibility.ts'),`export default ${JSON.stringify(compatibilityReport)};\n`);
pages.compatibility={...blank,title:'Compatibility',description:'Validation status for every component, AI pattern, block and chart across iOS, macOS, Web, Windows and Android.',kind:'compatibility',sections:[{id:'status',title:'Status legend',text:'',code:'',language:''},...compatibilityData.groups.map(group=>({id:group.id,title:group.title,text:'',code:'',language:''})),{id:'evidence',title:'Evidence',text:'',code:'',language:''}]};
for (const {route,...x} of sections) pages[route]={...blank,...x,sections:x.sections.map(({source,siteSource,...section}:any)=>({...section,code:source?read(resolve(library,source)):siteSource?read(resolve(site,siteSource)):section.code})),kind:'guide'};
const aiInstallSection = pages.installation.sections.find((section: any) => section.id === 'ai-setup');
if (!aiInstallSection?.code) throw new Error('Installation must define the shared AI setup prompt.');
for (const category of ['sidebar','login','signup'])pages[`blocks_${category}`]={...pages.blocks,slug:category,title:`${category === 'sidebar' ? 'Sidebar' : category === 'login' ? 'Login' : 'Signup'} blocks for Exact`,description:`Explore ${category} layouts built with rightui. Preview each block and adapt its Contract source for your Exact application.`};
const publicSource = Object.values(sourceFiles).filter(f=>f.path.startsWith('packages/ui/') && f.path.endsWith('.contract')).map(f=>f.code).join('\n');
const propRows=(code:string,names:string[])=>{
 const rows:{name:string,type:string}[]=[];let current='',props=false;
 for(const line of code.split('\n')) {
  if(line.startsWith('component ')){current=line.slice(10).trim();props=false;}
  if(line==='  props'){props=names.includes(current);continue;}
  if(props && /^  \S/.test(line))props=false;
  if(props && /^    [\w-]+: /.test(line)){const p=line.trim();const split=p.indexOf(': ');rows.push({name:`${current}.${p.slice(0,split)}`,type:p.slice(split+2)});}
 }
 return rows;
};
for(const c of components) pages[`component_${c.slug.replaceAll('-','_')}`]={...blank,importCode:`use ${(c.exports??[]).join(', ')} from \"${c.importFrom ?? "@rightui/ui"}\"`,title:c.title,description:c.description,kind:'component',slug:c.slug,source:c.source,code:c.example&&sourceFiles[c.example]?sourceFiles[c.example].code:'',usage:c.usage,keyboard:c.keyboard,sections:[],api:c.source&&sourceFiles[c.source]?propRows(publicSource,c.exports??[]):[]};
const clipboardSetup = read(resolve(root, 'node_modules/@rightui/ui/docs/CODE-BLOCK.md')).split('```contract\n')[1]?.split('```')[0].trimEnd();
const sheetSetup = read(resolve(root, 'node_modules/@rightui/ui/docs/SHEET.md')).split('```json\n')[1]?.split('```')[0].trimEnd();
if (!sheetSetup) throw new Error('SheetContent requires its documented web stylesheet setup.');
pages.component_sheet.sections.push({id:'web-setup',title:'Web setup',text:'Copy node_modules/@rightui/ui/assets/sheet.css to assets/sheet.css in your app. Merge this configuration into app.json, preserving existing entries. The stylesheet supplies viewport positioning and scroll locking. Native hosts ignore it. Keep the root uiFont provider from Installation.',code:sheetSetup,language:'json'});
if (!clipboardSetup) throw new Error('CodeBlock requires its documented root clipboard setup.');
pages.component_code_block.sections.push({id:'clipboard-setup',title:'Clipboard setup',text:'Add this controller once to your app root. All CodeBlock variants share the last copied value and reset their confirmation after three seconds. Merge these providers with uiFont from Installation.',code:clipboardSetup,language:'Contract'});
pages.ai_elements={...blank,title:'AI Elements',description:'Patterns for agentic interfaces, composed from rightui components.',kind:'ai-index',sections:[{id:'composition',title:'Built from shared components',text:'Copy a pattern into your Exact project and adapt its state and actions. Trace, Message, Code Block and the other rightui primitives provide the common structure. These demos use local sample data; connect your own model and tools in your data module.',code:'',language:''}]};
const aiRuntimeCode = read(resolve(library, 'docs/AI-ELEMENTS.md')).split('```contract\n')[1].split('```')[0].trimEnd();
const aiRuntimeSection = {id:'demo-clock',title:'Demo runtime',text:'Timed examples use an injected clock. Add these members to your root component. Replace the scripted state with events from your TypeScript or Rust data source when connecting a model.',code:aiRuntimeCode,language:'Contract'};
pages.ai_elements.sections.push(aiRuntimeSection);
for(const c of aiElements) pages[`ai_${c.slug.replaceAll('-','_')}`]={...blank,title:c.title,description:c.description,kind:'ai',slug:c.slug,source:c.source,code:read(resolve(library,c.source)),usage:c.usage,keyboard:c.keyboard,sections:[aiRuntimeSection],api:[]};
for(const b of blocks)pages[`view_${b.slug.replaceAll('-','_')}`]={...blank,title:b.title,description:`Preview the ${b.title.toLowerCase()} block built with rightui components for Exact. Explore its layout and source code.`,kind:'view',slug:b.slug};
pages.try={...blank,title:'Essayer RightUI',description:'Essayez les composants RightUI sur votre iPhone ou votre Mac avec AppDrop.',kind:'try'};
pages.try_iphone={...blank,title:'Essayer RightUI sur iPhone',description:'Scannez le QR code pour installer RightUI sur votre iPhone avec AppDrop.',kind:'try-iphone'};
pages.themes={...pages.home,title:'Themes',description:'Customize RightUI palettes, density, corners and typography. Preview and export your Exact theme.',kind:'themes',slug:'themes',sections:[]};
write(resolve(site,'app.tamber'),createTheme({interactive:true}));
// Exact captures TypeScript inside the app. Generate lazy resource data from the
// installed public helper instead of importing a module outside that capture.
const themeLoaders: string[]=[];
for(const preset of themeOptions.preset)for(const density of themeOptions.density)for(const radius of themeOptions.radius)for(const font of themeOptions.font){
  const key=`${preset}/${density}/${radius}/${font}`,name=key.replaceAll('/','-');
  write(resolve(site,`generated/themes/${name}.ts`),`export default ${JSON.stringify(createTheme({preset,density,radius,font}))};\n`);
  themeLoaders.push(`${JSON.stringify(key)}:()=>import("./themes/${name}.ts")`);
}
write(resolve(site,'generated/theme-exports.ts'),`export default {${themeLoaders.join(',')}};\n`);

// Standalone animation timing rows are omitted by this Exact web compiler.
// Derive the pseudo-element timing from the same public tokens as its Contract.
const motionValue = (name: string): string => {
  const token = themeTokens.find(token => token.name === name);
  if (!token || !['duration', 'easing'].includes(token.kind)) throw new Error(`Missing motion token: ${name}`);
  return token.value.replace(/\bui\.[a-z][a-z0-9-]*/g, motionValue);
};
// Responsive font-size syntax is unavailable in this Exact pin. Generate the fallback
// from the public theme configuration, so it cannot drift from the library values.
write(resolve(site,'assets/critical.css'),`/* Generated from @rightui/ui/theme. */
${read(resolve(root, "node_modules/@rightui/ui/assets/sheet.css"))}
#exact-root [data-rightui-availability="available"] { position: relative; overflow: visible; }
#exact-root [data-rightui-availability="available"]::after { content: ""; position: absolute; inset: 0; border-radius: inherit; background-color: inherit; pointer-events: none; animation-name: rightui-availability-sonar; animation-duration: ${motionValue("ui.duration-availability")}; animation-timing-function: ${motionValue("ui.easing")}; animation-iteration-count: infinite; }
@keyframes rightui-availability-sonar { 0% { transform: scale(1); opacity: 0.4; } 75%, 100% { transform: scale(2.8); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { #exact-root [data-rightui-availability="available"]::after { animation: none; opacity: 0; } }
#exact-root #hero-title { font-size: ${themeLayout.heroTitle.small} !important; }
#exact-root #hero-description { font-size: ${themeLayout.heroDescription.small} !important; }
@media (min-width: ${themeLayout.breakpoints.medium}px) {
  #exact-root #hero-title { font-size: ${themeLayout.heroTitle.medium} !important; }
  #exact-root #hero-description { font-size: ${themeLayout.heroDescription.medium} !important; }
}
@media (min-width: ${themeLayout.breakpoints.large}px) { #exact-root #hero-title { font-size: ${themeLayout.heroTitle.large} !important; } }
@media (min-width: ${themeLayout.breakpoints.buildFlow}px) {
  #exact-build-flow { grid-template-columns: minmax(0, 1fr) 20px minmax(0, 1fr) 20px minmax(0, 1fr) !important; }
  #exact-build-flow > div > svg { transform: none !important; }
}
@media (max-width: ${themeLayout.breakpoints.compactBrand}px) { #navbar-wordmark { display: none !important; } #navbar-home { gap: 0 !important; } }
`);

const routes=[['home','/'],['try','/try'],['try_iphone','/try/iphone'],['themes','/themes'],['how_exact','/docs/how-exact-works'],['installation','/docs/installation'],['typescript','/docs/installation/typescript'],['rust','/docs/installation/rust'],['theming','/docs/theming'],['registry','/docs/registry'],['compatibility','/docs/compatibility'],['components','/docs/components'],...components.map(c=>[`component_${c.slug.replaceAll('-','_')}`,`/docs/components/${c.slug}`]),['blocks','/blocks'],...['sidebar','login','signup'].map(c=>[`blocks_${c}`,`/blocks/${c}`]),['area','/charts/area'],['source','/source'],...blocks.map(b=>[`view_${b.slug.replaceAll('-','_')}`,`/view/${b.slug}`])];
routes.push(['ai_elements','/docs/ai-elements'],...aiElements.map(c=>[`ai_${c.slug.replaceAll('-','_')}`,`/docs/ai-elements/${c.slug}`]));
const catalog=components.map(c=>({slug:c.slug,title:c.title,description:c.description,href:`/docs/components/${c.slug}`}));
const aiCatalog=aiElements.map(c=>({slug:c.slug,title:c.title,description:c.description,href:`/docs/ai-elements/${c.slug}`}));
write(resolve(site,'generated/ai-nav.ts'),`export default ${JSON.stringify(aiCatalog)};\n`);
write(resolve(site,'generated/ai-demos.contract'),aiElements.map((c,i)=>`use Demo as AI${i} from "@rightui/registry/${c.source.replace('.contract','')}"`).join('\n')+'\ncomponent AIDemo\n  props\n    slug: string\n    width: number\n    reduced: bool\n  view\n    column width="100%" min-width=0\n'+aiElements.map((c,i)=>`      ${i?'else if':'if'} slug == "${c.slug}"\n        AI${i}(width=width, reduced=reduced)`).join('\n')+'\n');
const markdownIndex=[];
const fenced=(language:string,code:string)=>{const fence='`'.repeat(Math.max(3,...[...code.matchAll(/`+/g)].map(x=>x[0].length+1)));return `${fence}${language.toLowerCase()}\n${code}\n${fence}`;};
for(const [name,url] of routes) {
 const p=pages[name];
 p.sections=p.sections.map((section:any)=>{
  const packageCommands=section.packageCommands??[];
  if(packageCommands.length && (packageCommands.length!==4 || packageCommands.some((command:unknown)=>typeof command!=='string' || !command.trim())))throw new Error(`${name}/${section.id} must provide Bun, npm, pnpm and Yarn commands in that order.`);
  return {...section,packageCommands,code:packageCommands.length?packageCommands.map((command:string,i:number)=>`# ${['Bun','npm','pnpm','Yarn'][i]}\n${command}`).join('\n\n'):section.code};
 });
 const parts=[`---\ntitle: ${JSON.stringify(p.title)}\ndescription: ${JSON.stringify(p.description)}\n---`,`# ${p.title}`,p.description];
 if(p.kind==='component')parts.push('## Installation', 'Install the shared package once in your Exact app. This version is a beta.', fenced('sh', `bun add --exact @rightui/ui@${uiVersion}`), 'Or choose another package manager:', fenced('sh', `npm install --save-exact @rightui/ui@${uiVersion}\npnpm add --save-exact @rightui/ui@${uiVersion}\nyarn add --exact @rightui/ui@${uiVersion}`), 'Exact compilation uses Bun 1.4.2. Register Geist and Newsreader, declare the font marker and add the root provider using [Installation](/docs/installation).', '### Manual source setup', 'Install an editable copy of the complete package:', fenced('sh', `mkdir -p vendor/rightui vendor/rightui-ui\nnpm pack @rightui/ui@${uiVersion} --pack-destination vendor/rightui\ntar -xzf ./vendor/rightui/rightui-ui-${uiVersion}.tgz -C vendor/rightui-ui --strip-components=1\nbun add file:./vendor/rightui-ui`), 'Keep package.json, the Contract files, ui.tamber, assets and licenses together.', '### Import', fenced('contract', p.importCode));
 if(p.usage)parts.push('## Usage',p.usage);
 if(p.code)parts.push('## Example',fenced('contract',p.code));
 if(p.keyboard)parts.push('## Keyboard',p.keyboard);
 if(p.api.length)parts.push('## API Reference','| Property | Type |\n| --- | --- |\n'+p.api.map((r:any)=>`| ${r.name} | ${r.type.replaceAll('|','\\|')} |`).join('\n'));
 for(const s of p.sections)parts.push(`## ${s.title}`,s.text,...(s.code?[fenced(s.language,s.code)]:[]));
 if(p.kind==='try')parts.push('## iPhone','[Installer avec AppDrop](/try/iphone)','## Mac','[Télécharger avec AppDrop](https://appdrop.app/api/drops/wcfnk49huy/file?revision=3&build=macos)','Mac avec puce Apple, macOS 14 ou ultérieur.','## Android et Windows','Pas encore disponibles.');
 if(p.kind==='try-iphone')parts.push('[Ouvrir AppDrop sur mon iPhone](https://appdrop.app/d/wcfnk49huy)','La configuration AppDrop est requise avant la première installation.');
 if(p.kind==='index')parts.push('## Components',catalog.map(c=>`- [${c.title}](${c.href}.md): ${c.description}`).join('\n'));
 if(p.kind==='ai-index')parts.push('## Patterns',aiCatalog.map(c=>`- [${c.title}](${c.href}.md): ${c.description}`).join('\n'));
 if(p.kind==='blocks')parts.push('## Blocks',blocks.map(b=>`- [${b.title}](/view/${b.slug}.md)`).join('\n'));
 if(p.kind==='charts')parts.push(...charts.flatMap(c=>[`## ${c.title}`,fenced('contract',c.code)]));
 if(p.source && sourceFiles[p.source])parts.push('## Source',`File: ${p.source}`,fenced(sourceFiles[p.source].language,sourceFiles[p.source].code));
 p.markdown=(p.kind==='compatibility'?parts[0]+'\n\n'+compatibilityMarkdown(library):parts.filter(Boolean).join('\n\n')+'\n');p.markdownHref=(url==='/'?'/index':url)+'.md';
 write(resolve(site,`assets/markdown/${name}.md`),p.markdown);
 markdownIndex.push({name,url,title:p.title,description:p.description,markdownHref:p.markdownHref});
}
write(resolve(root,'packages/catalog/markdown.json'),JSON.stringify(markdownIndex,null,2)+'\n');
const demos=components.filter(c=>c.example&&existsSync(resolve(library,c.example)));
if(demos.length)write(resolve(site,'generated/demos.contract'),demos.map((c,i)=>`use ${c.slug === "avatar" ? "Overview" : "Demo"} as Demo${i} from "@rightui/registry/examples/${c.slug}"`).join('\n')+'\ncomponent ComponentDemo\n  props\n    slug: string\n    width: number\n    reduced: bool\n  view\n    column width="100%" min-width=0\n'+demos.map((c,i)=>`      ${i?'else if':'if'} slug == "${c.slug}"\n        Demo${i}(width=width, reduced=reduced)`).join('\n')+'\n');
if(charts.length)write(resolve(site,'generated/charts.contract'),charts.map((c,i)=>`use Demo as Chart${i} from "@rightui/registry/charts/${c.slug}"`).join('\n')+'\ncomponent ChartDemo\n  props\n    slug: string\n    width: number\n    reduced: bool\n  view\n    column width="100%" min-width=0\n'+charts.map((c,i)=>`      ${i?'else if':'if'} slug == "${c.slug}"\n        Chart${i}(width=width, reduced=reduced)`).join('\n')+'\n');
for(const [name,data] of Object.entries(pages))write(resolve(site,`generated/pages/${name}.ts`),`export default ${JSON.stringify(data)};\n`);
const sourceOutput = resolve(site, "generated/sources");
if (existsSync(sourceOutput)) for (const file of readdirSync(sourceOutput)) {
  if (/^source-\d+\.ts$/.test(file)) unlinkSync(resolve(sourceOutput, file));
}
const sourceLoaders=Object.entries(sourceFiles).map(([path,data],i)=>{write(resolve(site,`generated/sources/source-${i}.ts`),`export default ${JSON.stringify(data)};\n`);return `${JSON.stringify(path)}:()=>import("./sources/source-${i}.ts")`;});
write(resolve(site,'generated/index.ts'),`export const pages = {${Object.keys(pages).map(name=>`${JSON.stringify(name)}:()=>import("./pages/${name}.ts")`).join(',')}};\nexport const sources = {${sourceLoaders.join(',')}};\n`);
write(resolve(site,'generated/nav.ts'),`export default ${JSON.stringify(catalog)};\n`);
write(resolve(site,'generated/charts-data.ts'),`export default ${JSON.stringify(charts)};\n`);
write(resolve(site,'generated/blocks-data.ts'),`export default ${JSON.stringify(blocks.map(({slug,title,code,source})=>({slug,title,source,code,files:blockSources(source)})))};\n`);
if(existsSync(resolve(site,'generated/catalog.ts')))unlinkSync(resolve(site,'generated/catalog.ts'));
write(resolve(root,'packages/catalog/catalog.json'),JSON.stringify({components,aiElements,charts:chartMeta,blocks:blocks.map(({code,...rest})=>rest)},null,2)+'\n');
buildRegistry();
mkdirSync(resolve(site,'assets/registry'),{recursive:true});copyFileSync(resolve(library,'generated/registry.json'),resolve(site,'assets/registry/index.json'));
let template=read(resolve(root,'tools/app.contract.template')).replaceAll('{{THEME_PRESETS}}', JSON.stringify(themeOptions.preset)).replaceAll('{{THEME_FONTS}}', JSON.stringify(themeOptions.font)).replaceAll('{{THEME_LABELS}}', JSON.stringify(themeOptions.preset.map(preset => preset[0].toUpperCase() + preset.slice(1)))).replaceAll('{{UI_VERSION}}', uiVersion).replaceAll('{{NAVBAR_LOGO}}', 'data:image/png;base64,' + readFileSync(resolve(site, 'assets/brand/rightui-navbar.png')).toString('base64')).replace('// GENERATED_ROUTES',routes.map(([name,url])=>`  ${name} "${url}" render=${["component_chart", "area", "view_dashboard_01"].includes(name) ? "client" : "build activate=idle"}`).join('\n')+'\n  notfound render=build activate=idle');
const homeReady=existsSync(resolve(site,'components/home-cards.contract'));
template=template.replace('{{NATIVE_APP}}', process.env.RIGHTUI_NATIVE === '1' ? 'true' : 'false');
template=template.replace('{{NATIVE_MAC}}', process.env.RIGHTUI_NATIVE_MAC === '1' ? 'true' : 'false');
template=template.replace('// HOME_IMPORT',homeReady?'use HomeCards from "./components/home-cards.contract"':'').replace('// HOME_CARDS',homeReady?'HomeCards(width=viewport.width, nativeApp=nativeApp, reduced=viewport.prefersReducedMotion, openDialog=openHomeDialog)':'view height=300');
write(resolve(site,'app.contract'),template);
console.log(`Generated ${components.length} component routes (${demos.length} examples), ${blocks.length} blocks, ${charts.length} charts and ${Object.keys(sourceFiles).length} linked source files.`);
