import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { prepareRegistry } from './prepare-registry';

// Local review only: pack an unpublished candidate, install its exact bytes, build and serve.
// No registry writes, git operations or deployment commands belong in this tool.
const root = resolve(import.meta.dir, '..');
const library = resolve(root, '../components');
const local = resolve(root, '.local-preview');
const version = JSON.parse(readFileSync(resolve(library, 'packages/ui/package.json'), 'utf8')).version;
const run = (args: string[], cwd = root) => {
  const result = Bun.spawnSync([process.execPath, ...args], {cwd, env:{...process.env,EXACT_FEEDBACK:'0'}, stdout:'inherit',stderr:'inherit'});
  if(result.exitCode!==0) throw new Error(`Local preview command failed: ${args.join(' ')}`);
};
mkdirSync(local,{recursive:true});
run(['tools/package-ui.ts'],library);
const archive = resolve(library,`dist/rightui-ui-${version}.tgz`);
const hash=createHash('sha256').update(readFileSync(archive)).digest('hex');
const candidate=resolve(local,`rightui-ui-${version}-${hash.slice(0,16)}.tgz`);
if(!existsSync(candidate))copyFileSync(archive,candidate);
for(const path of ['package.json','apps/site/package.json']){
  const file=resolve(root,path);const manifest=JSON.parse(readFileSync(file,'utf8'));
  manifest.dependencies['@rightui/ui']=version;
  writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');
}
prepareRegistry({manifestOnly:true});
const path=resolve(root,'package.json');const original=readFileSync(path,'utf8');const manifest=JSON.parse(original);
if(manifest.overrides?.['@rightui/ui'])throw new Error('Remove the existing RightUI override before creating the local candidate.');
manifest.overrides={...manifest.overrides,'@rightui/ui':`file:${candidate}`};
writeFileSync(path,JSON.stringify(manifest,null,2)+'\n');
try{run(['install','--ignore-scripts']);}finally{writeFileSync(path,original);}
writeFileSync(resolve(local,'candidate.json'),JSON.stringify({version,sha256:hash,archive:candidate,published:false},null,2)+'\n');
console.log(`Installed local-only @rightui/ui ${version} (${hash.slice(0,16)}).`);
if(process.argv.includes('--install-only'))process.exit(0);
run(['run','build']);
const server=Bun.spawn([process.execPath,'apps/site/exact.mjs','serve','dist','--port','8792','--lan'],{cwd:root,env:{...process.env,EXACT_FEEDBACK:'0'},stdout:'inherit',stderr:'inherit'});
console.log('Local review: http://localhost:8792/themes');
process.exit(await server.exited);
