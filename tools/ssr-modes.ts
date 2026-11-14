import { defaultTheme, themeAxes, themeOptions } from '@rightui/ui/theme';
import { ssrFontBootstrap } from './ssr-fonts';

/**
 * Exact serializes a full mode tuple on SSR boundaries. The tuple includes
 * unpinned axes, so setting only the document's tuple would leave those axes
 * at the build's defaults until activation. Resolve the same pins while the
 * HTML parser adds each boundary, before the browser can paint it. Keep the
 * observer until Exact installs its mode API, then transfer the initial choice
 * into the runtime once. Otherwise its first apply() paints the default tuple
 * before the application's asynchronous theme task runs.
 *
 * This initializes Exact's mode attributes only. All CSS values still come
 * from the compiler, including nested preview boundaries and font stacks.
 */
export const ssrModeBootstrap = `(()=>{
  const axes=${JSON.stringify(themeAxes)},options=${JSON.stringify(themeOptions)},defaults=${JSON.stringify(defaultTheme)};
  const keys=Object.keys(axes),root=document.documentElement;
  const decode=(text,base)=>{
    const result={...base},seen=new Set();
    if(text==null||/^\\s*(unset|inherit)?\\s*$/.test(text))return result;
    for(const part of text.split(/[ ,]/).filter(Boolean)){
      const split=part.indexOf("="),key=keys.find(key=>axes[key]===part.slice(0,split)),value=part.slice(split+1);
      if(split<0||!key||seen.has(key)||!options[key].includes(value))return {...base};
      seen.add(key);result[key]=value;
    }
    return result;
  };
  const encode=value=>keys.map(key=>axes[key]+"="+value[key]).join(",");
  const initial=decode(root.getAttribute("data-x-modes"),defaults);
  let parsed=document.readyState!=="loading",handedOff=false;
  const resolve=boundary=>{
    const parent=boundary.parentElement?.closest("[data-x-b]");
    const inherited=decode(parent?.getAttribute("data-x-modes")??root.getAttribute("data-x-modes"),defaults);
    const value=encode(decode(boundary.getAttribute("data-x-pin"),inherited));
    if(boundary.getAttribute("data-x-modes")!==value)boundary.setAttribute("data-x-modes",value);
  };
  const scan=node=>{
    if(node.nodeType!==1)return;
    if(node.hasAttribute("data-x-b"))resolve(node);
    for(const boundary of node.querySelectorAll("[data-x-b]"))resolve(boundary);
  };
  scan(root);
  const handoff=()=>{
    if(handedOff)return;
    const exact=globalThis.exact,api=exact?.modes;
    if(typeof api?.read!=="function"||typeof api?.set!=="function")return;
    const current=api.read();
    if(!keys.every(key=>options[key].includes(current[axes[key]])))return;
    // A queued user action or the application's theme task may already have
    // requested an axis. Preserve that request, seed only untouched axes.
    const pins=keys.map(key=>[axes[key],exact.asked?.["mode:"+axes[key]]?current[axes[key]]:initial[key]]);
    if(api.set(pins)!==null)return;
    handedOff=true;
  };
  const process=records=>{
    handoff();
    for(const record of records)for(const node of record.addedNodes)scan(node);
    if(parsed&&handedOff)observer.disconnect();
  };
  const observer=new MutationObserver(process);
  observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:["data-x-modes"]});
  const finish=()=>{parsed=true;process(observer.takeRecords())};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",finish,{once:true});
  else finish();
})()`;

function modeTuples(): string[] {
  let tuples = [''];
  for (const key of Object.keys(themeAxes) as (keyof typeof themeAxes)[]) {
    tuples = tuples.flatMap(tuple => themeOptions[key].map(value => `${tuple}${tuple ? ',' : ''}${themeAxes[key]}=${value}`));
  }
  return tuples;
}

/** Exact prunes unused mode selectors from each prerendered page. Share only
 * its compiled mode variable rules, not a second copy of the runtime CSS. */
export function compiledModeCSS(css: string): string {
  const expected = new Set(modeTuples());
  const found = new Set<string>();
  const rules: string[] = [];
  let start = 0, depth = 0, quote = '', comment = false;
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (comment) { if (char === '*' && css[i + 1] === '/') { comment = false; i++; } continue; }
    if (quote) { if (char === '\\') i++; else if (char === quote) quote = ''; continue; }
    if (char === '/' && css[i + 1] === '*') { comment = true; i++; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth < 0) throw new Error('Unbalanced compiled CSS; review initial mode styles.');
      if (depth === 0) {
        const rule = css.slice(start, i + 1).trim();
        if (rule.includes('data-x-modes')) {
          const match = /^(?::root,)?\[data-x-modes="([^"]+)"\]\{([^{}]+)\}$/.exec(rule);
          if (!match || !expected.has(match[1]) || found.has(match[1])) throw new Error('Unexpected compiled mode selector; review initial mode styles.');
          const declarations = match[2].split(';').filter(Boolean);
          if (!declarations.every(value => /^--[\w-]+:/.test(value)) || !declarations.some(value => value.startsWith('--x-ui-background:'))) {
            throw new Error('Compiled mode styles must contain only token variables, including the page background.');
          }
          found.add(match[1]);
          rules.push(rule);
        }
        start = i + 1;
      }
    }
  }
  if (depth !== 0 || quote || comment || found.size !== expected.size) throw new Error(`Expected ${expected.size} complete compiled mode tuples; found ${found.size}.`);
  return `/* Mode variables extracted from Exact's compiled stylesheet. */\n${rules.join('\n')}\n`;
}

/** The stylesheet must follow Exact's inline page CSS: its default :root rule
 * has the same specificity as a selected tuple and would otherwise win. */
export function withCompiledModeStyles(html: string, href = '/rightui-modes.css'): string {
  if (!/^\/[\w./-]+\.css$/.test(href)) throw new Error('Initial mode stylesheet needs a root-relative CSS asset path.');
  const clean = html.replace(/\n?<link data-rightui-modes\b[^>]*>/g, '');
  const headEnd = clean.includes('</head>') ? clean.indexOf('</head>') : clean.indexOf('<div id="exact-root">');
  if (headEnd < 0) throw new Error('Initial mode stylesheet needs the Exact HTML head boundary.');
  const lastStyle = clean.lastIndexOf('</style>', headEnd);
  if (lastStyle < 0) throw new Error('Initial mode stylesheet must follow compiled page CSS.');
  const position = lastStyle + '</style>'.length;
  return clean.slice(0, position) + `\n<link data-rightui-modes rel="stylesheet" href="${href}">` + clean.slice(position);
}

/** Pure, idempotent postbuild preparation; call after withInitialTheme(). */
export function withSSRModeBootstrap(html: string): string {
  const clean = html.replace(/\n?<script data-rightui-ssr-modes>[\s\S]*?<\/script>/g, '');
  const initialTheme = /<script data-rightui-theme>[\s\S]*?<\/script>/;
  const found = initialTheme.exec(clean);
  if (!found) throw new Error('SSR mode initialization requires withInitialTheme() first.');
  if (/<(?:style|body)\b|<link\b[^>]*\brel=["']stylesheet["']/i.test(clean.slice(0, found.index))) {
    throw new Error('SSR mode initialization must run before styles and body parsing.');
  }
  return clean.replace(initialTheme, script => `${script}\n<script data-rightui-ssr-modes>${ssrModeBootstrap};${ssrFontBootstrap}</script>`);
}
