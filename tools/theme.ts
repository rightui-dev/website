// Exact's persisted root states are JSON values at `exact.state.<name>`.
// Keep this read aligned with state theme and the pinned SDK's persist adapter.
export const themeBootstrap = `(()=>{let theme="system";try{const stored=JSON.parse(localStorage.getItem("exact.state.theme"));if(stored==="light"||stored==="dark")theme=stored}catch{}const query=new URLSearchParams(location.search).get("theme");if(query==="light"||query==="dark")theme=query;document.documentElement.style.colorScheme=theme==="system"?"":theme})()`;

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
