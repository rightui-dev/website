import { defaultTheme, themeOptions } from '@rightui/ui/theme';

/** Temporary transport for the same family stacks emitted by Exact. The probe
 * texts precede visible content. No font name or CSS font recipe lives here.
 * The application supplies its real resolved choice and readiness; lazy rows
 * keep their temporary rule only until their own compiled binding agrees. */
export const ssrFontBootstrap = `(()=>{
  const choices=${JSON.stringify(themeOptions.font)},fallback=${JSON.stringify(defaultTheme.font)},root=document.documentElement;
  const initial=root.getAttribute("data-rightui-font-choice"),selected=choices.includes(initial)?initial:fallback;
  const marked='[data-rightui-font="body"]',attribute="data-rightui-font-boot",pending=new Set();
  let parsed=document.readyState!=="loading",sheet=null,families=null,finished=false;
  const collect=node=>{
    if(node.nodeType!==1)return;
    if(node.getAttribute("data-rightui-font")==="body")pending.add(node);
    for(const leaf of node.querySelectorAll(marked))pending.add(leaf);
  };
  const catalogue=()=>{
    if(families)return true;
    const found={};
    for(const choice of [...choices,"theme"]){
      const probe=document.getElementById("rightui-font-"+choice);
      if(!probe){if(choice==="theme")continue;return false}
      const family=getComputedStyle(probe).fontFamily;
      if(!family)return false;
      found[choice]=family;
    }
    families=found;
    sheet=document.createElement("style");sheet.setAttribute("data-rightui-font-boot","");
    sheet.textContent=Object.entries(families).map(([choice,family])=>'['+attribute+'="'+choice+'"]{font-family:'+family+'!important}').join("\\n");
    document.head.append(sheet);
    return true;
  };
  const choiceFor=(node,current)=>{
    const scope=node.closest("[data-rightui-font-scope]")?.getAttribute("data-rightui-font-scope");
    return scope&&Object.hasOwn(families,scope)?scope:scope==="theme"?null:current;
  };
  const sync=()=>{
    if(finished||!catalogue())return;
    const shell=document.getElementById("site-shell"),ready=shell?.getAttribute("data-rightui-font-ready");
    const canRelease=parsed&&document.getElementById("exact-root")?.hasAttribute("data-boot-ms")&&ready!=null&&ready!=="false"&&ready!=="0";
    const currentChoice=shell?.getAttribute("data-rightui-font-choice");
    const current=canRelease&&Object.hasOwn(families,currentChoice)?currentChoice:selected;
    // Remove temporary selectors together, then read the runtime's actual
    // styles. This never rewrites a font-family owned by an Exact binding.
    if(canRelease)for(const node of pending)node.removeAttribute(attribute);
    const retain=[];
    for(const node of pending){
      if(!node.isConnected||node.getAttribute("data-rightui-font")!=="body"){
        node.removeAttribute(attribute);pending.delete(node);continue;
      }
      const choice=choiceFor(node,current);
      if(!choice){node.removeAttribute(attribute);pending.delete(node);continue}
      if(canRelease&&getComputedStyle(node).fontFamily===families[choice]){pending.delete(node);continue}
      retain.push([node,choice]);
    }
    for(const [node,choice]of retain)if(node.getAttribute(attribute)!==choice)node.setAttribute(attribute,choice);
    if(canRelease&&pending.size===0){finished=true;observer.disconnect();sheet.remove()}
  };
  const process=records=>{
    for(const record of records){
      for(const node of record.addedNodes)collect(node);
      if(record.type==="attributes")collect(record.target);
    }
    sync();
  };
  const observer=new MutationObserver(process);
  observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:["style","class","data-rightui-font","data-rightui-font-choice","data-rightui-font-ready","data-rightui-font-scope","data-boot-ms"]});
  collect(root);sync();
  const finish=()=>{parsed=true;process(observer.takeRecords())};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",finish,{once:true});else finish();
})()`;
