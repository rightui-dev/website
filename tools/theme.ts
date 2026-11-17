import { themeOptions, themeAxes, defaultTheme } from '@rightui/ui/theme';

// Exact persists JSON root states under these names. URL previews never write storage.
export const themeBootstrap = `(()=>{
  const options=${JSON.stringify(themeOptions)},axes=${JSON.stringify(themeAxes)},defaults=${JSON.stringify(defaultTheme)},query=new URLSearchParams(location.search);
  const read=(name,fallback)=>{try{return JSON.parse(localStorage.getItem("exact.state."+name))??fallback}catch{return fallback}};
  let theme=read("theme","system");const choice=query.get("theme");
  if(["light","dark","system"].includes(choice))theme=choice;
  const root=document.documentElement;
  root.style.colorScheme=theme==="light"||theme==="dark"?theme:"";
  const settings={};
  for(const key of Object.keys(options)){
    const stored=read("ui"+key[0].toUpperCase()+key.slice(1),defaults[key]),requested=query.get(key);
    settings[key]=options[key].includes(requested)?requested:options[key].includes(stored)?stored:defaults[key];
  }
  root.setAttribute("data-x-modes",Object.keys(axes).map(key=>axes[key]+"="+settings[key]).join(","));
  root.setAttribute("data-rightui-font-choice",settings.font);
  const axis=(key,state,fallback,min,max)=>{
    const saved=read(state,fallback),stored=typeof saved==="number"&&Number.isFinite(saved)&&saved>=min&&saved<=max?saved:fallback;
    const raw=query.get(key),value=raw===null||raw.trim()===""?NaN:Number(raw);
    return Math.round(Number.isFinite(value)&&value>=min&&value<=max?value:stored);
  };
  const optical=axis("opsz","uiOpticalSize",0,0,32),rounded=axis("roundness","uiRoundness",50,0,100);
  root.setAttribute("data-rightui-optical-size",String(optical>0&&optical<9?0:optical));
  root.setAttribute("data-rightui-roundness",String(rounded));
  root.setAttribute("data-rightui-weight-scale",String(axis("weight","uiWeightScale",100,25,112)));
})()`;

/** Run before styles, the activation loader and any visible markup on every URL. */
export function withInitialTheme(html: string) {
  const clean = html.replace(/\n?<script data-rightui-theme>[\s\S]*?<\/script>/g, '');
  const charset = /<meta\s+charset=["']utf-8["']\s*\/?>/i;
  if (!charset.test(clean)) throw new Error('Initial theme needs the HTML charset boundary before all styles and scripts.');
  const next = clean.replace(charset, tag => `${tag}\n<script data-rightui-theme>${themeBootstrap}</script>`);
  const position = next.indexOf('<script data-rightui-theme>');
  const preceding = next.slice(0, position);
  if (/<(?:script|style|body)\b|<link\b[^>]*\brel=["']stylesheet["']/i.test(preceding)) {
    throw new Error('Initial theme must run before stylesheet, runtime and body parsing.');
  }
  return next;
}
