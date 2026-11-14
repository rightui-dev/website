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
