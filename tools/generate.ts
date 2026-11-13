import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, unlinkSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { buildRegistry } from '../../components/tools/registry';
import { checkVersion } from '../../components/tools/check-version';
import { compatibility, compatibilityMarkdown } from '../../components/tools/compatibility';
import { prepareRegistry } from './prepare-registry';
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
const read = (p: string) => readFileSync(p, 'utf8');
const json = (p: string, fallback: unknown = []) => existsSync(p) ? JSON.parse(read(p)) : fallback;
const write = (p: string, value: string) => { mkdirSync(resolve(p, '..'), { recursive: true }); writeFileSync(p, value); };
const slugify = (s: string) => s.toLowerCase().replaceAll(' ', '-');
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
    else if (/\.(contract|tamber|ts|rs|toml|json|md)$/.test(item.name)) {
      const key=relative(library,path);sourceFiles[key]={path:key,code:read(path),language:item.name.endsWith('.contract')?'Contract':item.name.endsWith('.rs')?'Rust':item.name.endsWith('.ts')?'TypeScript':item.name.split('.').at(-1)!};
    }
  }
}
scan(library);
const blockTitles:Record<string,string>={'dashboard-01':'A dashboard with sidebar, charts and data table','sidebar-07':'A sidebar that collapses to icons','sidebar-03':'A sidebar with submenus','login-03':'A login page with a muted background','login-04':'A login page with form and image'};
const blockSlugs=['dashboard-01',...Array.from({length:16},(_,i)=>`sidebar-${String(i+1).padStart(2,'0')}`),...['login','signup'].flatMap(g=>Array.from({length:5},(_,i)=>`${g}-${String(i+1).padStart(2,'0')}`))];
const blocks=blockSlugs.map(slug=>{
 const group=slug.split('-')[0];const n=Number(slug.split('-')[1]);
 const path=`blocks/${slug}.contract`;const actualCode=read(resolve(library,path));sourceFiles[path]={path,code:actualCode,language:'Contract'};
 return {slug,title:blockTitles[slug]??`${group==='sidebar'?'Sidebar':group==='login'?'Login':'Signup'} layout ${n}`,source:path,code:actualCode,group};
});
const sections = JSON.parse(read(resolve(root,'content/guides.json')).replaceAll('{{UI_VERSION}}', uiVersion)) as any[];
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
pages.home.sections = [aiInstallSection];
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
for(const c of components) pages[`component_${c.slug.replaceAll('-','_')}`]={...blank,importCode:`use ${(c.exports??[]).join(', ')} from \"@rightui/ui\"`,title:c.title,description:c.description,kind:'component',slug:c.slug,source:c.source,code:c.example&&sourceFiles[c.example]?sourceFiles[c.example].code:'',usage:c.usage,keyboard:c.keyboard,sections:[],api:c.source&&sourceFiles[c.source]?propRows(publicSource,c.exports??[]):[]};
pages.ai_elements={...blank,title:'AI Elements',description:'Patterns for agentic interfaces, composed from rightui components.',kind:'ai-index',sections:[{id:'composition',title:'Built from shared components',text:'Copy a pattern into your Exact project and adapt its state and actions. Trace, Message, Code Block and the other rightui primitives provide the common structure. These demos use local sample data; connect your own model and tools in your data module.',code:'',language:''}]};
const aiRuntimeCode = read(resolve(library, 'docs/AI-ELEMENTS.md')).split('```contract\n')[1].split('```')[0].trimEnd();
const aiRuntimeSection = {id:'demo-clock',title:'Demo runtime',text:'Timed examples use an injected clock. Add these members to your root component. Replace the scripted state with events from your TypeScript or Rust data source when connecting a model.',code:aiRuntimeCode,language:'Contract'};
pages.ai_elements.sections.push(aiRuntimeSection);
for(const c of aiElements) pages[`ai_${c.slug.replaceAll('-','_')}`]={...blank,title:c.title,description:c.description,kind:'ai',slug:c.slug,source:c.source,code:read(resolve(library,c.source)),usage:c.usage,keyboard:c.keyboard,sections:[aiRuntimeSection],api:[]};
for(const b of blocks)pages[`view_${b.slug.replaceAll('-','_')}`]={...blank,title:b.title,description:`Preview the ${b.title.toLowerCase()} block built with rightui components for Exact. Explore its layout and source code.`,kind:'view',slug:b.slug};
const routes=[['home','/'],['how_exact','/docs/how-exact-works'],['installation','/docs/installation'],['typescript','/docs/installation/typescript'],['rust','/docs/installation/rust'],['theming','/docs/theming'],['registry','/docs/registry'],['compatibility','/docs/compatibility'],['components','/docs/components'],...components.map(c=>[`component_${c.slug.replaceAll('-','_')}`,`/docs/components/${c.slug}`]),['blocks','/blocks'],...['sidebar','login','signup'].map(c=>[`blocks_${c}`,`/blocks/${c}`]),['area','/charts/area'],['source','/source'],...blocks.map(b=>[`view_${b.slug.replaceAll('-','_')}`,`/view/${b.slug}`])];
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
 if(p.kind==='component')parts.push('## Installation', 'Install the shared package once in your Exact app. This version is a beta.', fenced('sh', `bun add --exact @rightui/ui@${uiVersion}`), 'Or choose another package manager:', fenced('sh', `npm install --save-exact @rightui/ui@${uiVersion}\npnpm add --save-exact @rightui/ui@${uiVersion}\nyarn add --exact @rightui/ui@${uiVersion}`), 'Exact compilation uses Bun 1.4.2. Register Geist using the [font setup guide](/docs/installation#font).', '### Manual source setup', 'Install an editable copy of the complete package:', fenced('sh', `mkdir -p vendor/rightui vendor/rightui-ui\nnpm pack @rightui/ui@${uiVersion} --pack-destination vendor/rightui\ntar -xzf ./vendor/rightui/rightui-ui-${uiVersion}.tgz -C vendor/rightui-ui --strip-components=1\nbun add file:./vendor/rightui-ui`), 'Keep package.json, the Contract files, ui.tamber, assets and licenses together.', '### Import', fenced('contract', p.importCode));
 if(p.usage)parts.push('## Usage',p.usage);
 if(p.code)parts.push('## Example',fenced('contract',p.code));
 if(p.keyboard)parts.push('## Keyboard',p.keyboard);
 if(p.api.length)parts.push('## API Reference','| Property | Type |\n| --- | --- |\n'+p.api.map((r:any)=>`| ${r.name} | ${r.type.replaceAll('|','\\|')} |`).join('\n'));
 for(const s of p.sections)parts.push(`## ${s.title}`,s.text,...(s.code?[fenced(s.language,s.code)]:[]));
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
if(demos.length)write(resolve(site,'generated/demos.contract'),demos.map((c,i)=>`use Demo as Demo${i} from "@rightui/registry/examples/${c.slug}"`).join('\n')+'\ncomponent ComponentDemo\n  props\n    slug: string\n    width: number\n    reduced: bool\n  view\n    column width="100%" min-width=0\n'+demos.map((c,i)=>`      ${i?'else if':'if'} slug == "${c.slug}"\n        Demo${i}(width=width, reduced=reduced)`).join('\n')+'\n');
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
write(resolve(site,'generated/blocks-data.ts'),`export default ${JSON.stringify(blocks.map(({slug,title,code,source})=>({slug,title,description:source,source,code,fullWidth:true})))};\n`);
if(existsSync(resolve(site,'generated/catalog.ts')))unlinkSync(resolve(site,'generated/catalog.ts'));
write(resolve(root,'packages/catalog/catalog.json'),JSON.stringify({components,aiElements,charts:chartMeta,blocks:blocks.map(({code,...rest})=>rest)},null,2)+'\n');
buildRegistry();
mkdirSync(resolve(site,'assets/registry'),{recursive:true});copyFileSync(resolve(library,'generated/registry.json'),resolve(site,'assets/registry/index.json'));
let template=read(resolve(root,'tools/app.contract.template')).replaceAll('{{UI_VERSION}}', uiVersion).replaceAll('{{NAVBAR_LOGO}}', 'data:image/png;base64,' + readFileSync(resolve(site, 'assets/brand/rightui-navbar.png')).toString('base64')).replace('// GENERATED_ROUTES',routes.map(([name,url])=>`  ${name} "${url}" render=${["component_chart", "area", "view_dashboard_01"].includes(name) ? "client" : "build activate=idle"}`).join('\n')+'\n  notfound render=build activate=idle');
const homeReady=existsSync(resolve(site,'components/home-cards.contract'));
template=template.replace('// HOME_IMPORT',homeReady?'use HomeCards from "./components/home-cards.contract"':'').replace('// HOME_CARDS',homeReady?'HomeCards(width=viewport.width, reduced=viewport.prefersReducedMotion)':'view height=300');
write(resolve(site,'app.contract'),template);
console.log(`Generated ${components.length} component routes (${demos.length} examples), ${blocks.length} blocks, ${charts.length} charts and ${Object.keys(sourceFiles).length} linked source files.`);
