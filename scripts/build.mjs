#!/usr/bin/env node
// 本产品独立拥有资源需求、工程准备与编译；公开回执仅提供验真资源，不提供执行命令。
import {spawn,spawnSync} from 'node:child_process';
import {AsyncLocalStorage} from 'node:async_hooks';
import {rmSync,rmdirSync,chmodSync,closeSync,openSync,readlinkSync,unlinkSync,copyFileSync,existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,realpathSync,symlinkSync,writeFileSync} from 'node:fs';
import {basename,dirname,isAbsolute,join,parse,relative,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {randomUUID as testRandomUUID} from 'node:crypto';
// 本仓测试进程使用独立会话，子进程继承身份；正式Build仍使用固定平台现场。
if(process.env.NODE_TEST_CONTEXT&&!process.env.PRODUCT_TEST_SESSION)process.env.PRODUCT_TEST_SESSION=testRandomUUID();
const testSession=process.env.NODE_TEST_CONTEXT&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(process.env.PRODUCT_TEST_SESSION||'')?process.env.PRODUCT_TEST_SESSION:null;

const targetRuntime=await(async()=>{
const {default:fs}=await import('node:fs');
const {dirname,join,resolve,parse,relative,sep}=await import('node:path');
const {fileURLToPath,pathToFileURL}=await import('node:url');
const {randomUUID}=await import('node:crypto');
const {AsyncLocalStorage}=await import('node:async_hooks');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const product='citizenweb';
const sessions=new AsyncLocalStorage();
const scopes=new Set(['build','test']);
const fail=message=>{throw Error(product+' target：'+message);};
function fixedWork(scope){
 const testRoot=testSession?join(root,'target/test/sessions',testSession):null;
 if(scope==='test')return testRoot||join(root,'target/test');
 if(scope==='build')return join(root,'target/build');
 if(typeof scope==='string'&&scope.startsWith('build/')){
  const platform=scope.slice(6);if(Object.hasOwn(contract.platforms,platform))return testRoot?join(testRoot,'build',platform):join(root,'target/build',platform);
 }
 fail('工作根用途无效');
}
function isBuildWork(work){return typeof work==='string'&&Object.keys(contract.platforms).some(platform=>work===fixedWork('build/'+platform));}
function validWork(work){return work===fixedWork('test')||isBuildWork(work);}
function directory(path,create=false){
 let at=parse(path).root;
 for(const part of relative(at,path).split(sep)){
  at=join(at,part);
  if(create&&!fs.existsSync(at))try{fs.mkdirSync(at,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
  const value=fs.lstatSync(at);if(!value.isDirectory()||value.isSymbolicLink()||fs.realpathSync(at)!==at)fail('工作目录经过链接或非目录');
 }
 return fs.lstatSync(path);
}
function checkFixedWork(work,{create=false}={}){
 if(typeof work!=='string'||!validWork(work))fail('工作根只允许本产品target/build或target/test固定目录');
 directory(work,create);return work;
}
function checkScratchPath(path){
 if(typeof path!=='string'||resolve(path)!==path||![fixedWork('test'),...Object.keys(contract.platforms).map(platform=>fixedWork('build/'+platform))].some(work=>path===work||path.startsWith(work+sep)))fail('内部物化目录越出本产品固定工作根');
 directory(path);return path;
}
function fixedScratch(prefix){
 const path=resolve(prefix.replace(/-$/,''));checkScratchPath(dirname(path));
 fs.mkdirSync(path,{mode:0o700});return directory(path)&&path;
}
function assertTargetTopology(){
 const target=join(root,'target');if(!fs.existsSync(target))return;
 directory(target);
 for(const name of fs.readdirSync(target))if(!scopes.has(name))fail('target含非固定目录或根部生成文件：'+name);
 for(const name of fs.readdirSync(target))directory(join(target,name));
}
function regular(path){const value=fs.lstatSync(path);if(!value.isFile()||value.isSymbolicLink()||value.nlink!==1||value.size>65536)fail('任务标记不是准确普通文件');return value;}
function readOwner(work){const path=join(work,'.active.json');if(!fs.existsSync(path))return null;regular(path);let value;try{value=JSON.parse(fs.readFileSync(path,'utf8'));}catch{fail('任务标记损坏，禁止清场');}
 if(value.schema!==1||value.product_id!==product||value.work!==work||!Number.isSafeInteger(value.pid)||value.pid<1||typeof value.nonce!=='string'||!Array.isArray(value.groups)||!value.groups.every(pid=>Number.isSafeInteger(pid)&&pid>1))fail('任务标记身份无效');return value;
}
function alive(pid,group=false){try{process.kill(group&&process.platform!=='win32'?-pid:pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;return true;}}
function writeOwner(owner){regular(join(owner.work,'.active.json'));fs.writeFileSync(join(owner.work,'.active.json'),JSON.stringify(owner)+'\n',{mode:0o600});}
function writable(path){const value=fs.lstatSync(path);if(value.isDirectory()&&!value.isSymbolicLink()){if(fs.realpathSync(path)!==path)fail('清理路径漂移');fs.chmodSync(path,value.mode|0o700);for(const name of fs.readdirSync(path))writable(join(path,name));}}
function removeTree(path){
 const state=fs.lstatSync(path);
 if(state.isSymbolicLink()){fs.unlinkSync(path);return;}
 if(state.isDirectory()){if(fs.realpathSync(path)!==path)fail('清理目录漂移');fs.chmodSync(path,state.mode|0o700);for(const name of fs.readdirSync(path))removeTree(join(path,name));fs.rmdirSync(path);return;}
 fs.unlinkSync(path);
}
// 清场由本产品确认资源供给与配方后代已经退出。
function assertSupplyExited(work){
 for(const name of ['.supply-active.json','.resource-active.json']){
  const file=join(work,name);if(!fs.existsSync(file))continue;regular(file);const record=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!Number.isSafeInteger(record.pid)||record.pid<2||!Array.isArray(record.groups)||record.groups.some(pid=>!Number.isSafeInteger(pid)||pid<2))fail('资源退出记录无效');
  if((record.pid!==process.pid&&alive(record.pid))||record.groups.some(pid=>alive(pid,true)))fail('资源工具退出未确认');
 }
}
function empty(work,keep=[]){
 assertSupplyExited(work);
 const before=directory(work);
 for(const name of fs.readdirSync(work)){if(keep.includes(name))continue;const path=join(work,name);removeTree(path);}
 const after=directory(work);if(before.dev!==after.dev||before.ino!==after.ino||fs.readdirSync(work).some(name=>!keep.includes(name)))fail('固定工作目录未完全清空或被替换');
}
function short(work,action){const path=isBuildWork(work)?join(dirname(work),'.claim-'+basename(work)):join(work,'.claim.lock');try{fs.mkdirSync(path,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;
 const record=join(path,'owner.json');let holder=null;
 if(fs.existsSync(record)){regular(record);try{holder=JSON.parse(fs.readFileSync(record,'utf8'));}catch{fail('领取锁损坏');}}
 const active=readOwner(work);
 if(holder?(holder.work!==work||!Number.isSafeInteger(holder.pid)||alive(holder.pid)):(Date.now()-fs.lstatSync(path).mtimeMs<30000))fail('固定工作目录正在领取或收尾');
 if(active&&(alive(active.pid)||active.groups.some(pid=>alive(pid,true))))fail('固定工作目录仍有活跃进程');
 writable(path);fs.rmSync(path,{recursive:true});fs.mkdirSync(path,{mode:0o700});}
 fs.writeFileSync(join(path,'owner.json'),JSON.stringify({pid:process.pid,work})+'\n',{flag:'wx',mode:0o600});
 const before=directory(path);try{return action();}finally{const after=directory(path);if(before.dev!==after.dev||before.ino!==after.ino)fail('领取锁漂移');fs.unlinkSync(join(path,'owner.json'));fs.rmdirSync(path);}}
function clearFixedWork(work){
 checkFixedWork(work);const session=sessions.getStore(),owner=readOwner(work);
 if(owner&&!(owner.state==='retained'&&owner.pid===process.pid)&&(!session||session.owner.work!==work||session.owner.nonce!==owner.nonce))fail('固定工作目录属于其他活跃任务');
 if(owner&&owner.groups.some(pid=>alive(pid,true)))fail('工具后代退出未确认，禁止清场');
 if(fs.existsSync(join(work,'.product-build.lock')))fail('产品编译进程仍持有守卫，禁止清场');
 const value=short(work,()=>{empty(work,owner&&!(owner.state==='retained'&&owner.pid===process.pid)?['.active.json','.claim.lock']:['.claim.lock']);if(isBuildWork(work)&&fs.readdirSync(work).length===0)fs.rmdirSync(work);});return value;
}
function claimFixedWork(scope,{environment=process.env,retain=false,run_id}={}){
 const work=checkFixedWork(fixedWork(scope),{create:true}),current=sessions.getStore();
 if(current?.owner.work===work){if(run_id){const owner=readOwner(work);if(owner?.nonce!==current.owner.nonce||owner.run_id&&owner.run_id!==run_id)fail('编译任务编号不一致');owner.run_id=run_id;writeOwner(owner);current.owner=owner;}return {...current,nested:true};}
 const token=environment.PRODUCT_WORK_LEASE;
 return short(work,()=>{
  const previous=readOwner(work);
  if(previous){
   if(token===previous.nonce&&alive(previous.pid))return {owner:previous,nested:true,retain};
   if(previous.groups.some(pid=>alive(pid,true)))fail('上轮工具进程仍运行，禁止领取');
   if(previous.state==='retained')fail('结果尚未由调用方消费，禁止覆盖');
   if(alive(previous.pid))fail('固定工作目录已有活跃任务');
  }
  if(fs.existsSync(join(work,'.product-build.lock')))fail('产品守卫尚未释放，禁止覆盖');
  empty(work,['.claim.lock']);
  const owner={schema:1,product_id:product,work,pid:process.pid,nonce:randomUUID(),groups:[],state:'running',...(run_id?{run_id}:{})};
  fs.writeFileSync(join(work,'.active.json'),JSON.stringify(owner)+'\n',{flag:'wx',mode:0o600});return {owner,retain};
 });
}
function trackFixedProcess(work,pid){
 if(!pid||!validWork(work))return;
 const owner=readOwner(work);if(!owner)return;
 if(owner.pid!==process.pid&&!(alive(owner.pid)&&process.env.PRODUCT_WORK_LEASE===owner.nonce))fail('工具进程不能写入其他任务');
 if(!owner.groups.includes(pid)){owner.groups.push(pid);writeOwner(owner);}
}
function trackWorkProcess(pid){
 const session=sessions.getStore();if(!session||!pid)return;
 const owner=readOwner(session.owner.work);if(owner?.nonce!==session.owner.nonce)fail('任务所有权漂移');
 if(!owner.groups.includes(pid)){owner.groups.push(pid);writeOwner(owner);}
}
function workEnvironment(environment=process.env){
 const session=sessions.getStore();if(!session)return environment;
 const work=session.owner.work,result={...environment,PRODUCT_WORK_LEASE:session.owner.nonce};
 for(const [key,name]of Object.entries({TMPDIR:'tmp',TMP:'tmp',TEMP:'tmp',npm_config_cache:'dependencies/npm',XDG_CACHE_HOME:'cache',XDG_CONFIG_HOME:'config',CLANG_MODULE_CACHE_PATH:'cache/clang'})){
  const supplied=result[key];
  if(supplied!==undefined&&typeof supplied!=='string')fail('可写环境目录无效：'+key);
  const local=supplied&&(resolve(supplied)===work||resolve(supplied).startsWith(work+sep));
  result[key]=local?supplied:join(work,name);directory(resolve(result[key]),true);
 }
 return result;
}
function retainWork(){const session=sessions.getStore();if(!session)fail('缺少当前任务');session.retain=true;}
function releaseFixedWork(session,{unsafe=false}={}){
 if(session.nested)return;
 const work=session.owner.work;
 const value=short(work,()=>{
  const owner=readOwner(work);if(owner?.nonce!==session.owner.nonce)fail('任务所有权漂移');
  const groups=owner.groups.filter(pid=>alive(pid,true));
  if(unsafe||groups.length){writeOwner({...owner,groups,state:'unsafe'});fail('工具后代退出未确认，保留守卫并禁止任务完成');}
 if(session.retain){writeOwner({...owner,groups:[],state:'retained'});return;}
  if(fs.existsSync(join(work,'.product-build.lock')))fail('产品编译守卫未释放，禁止完成');
  empty(work,['.claim.lock']);if(isBuildWork(work))fs.rmdirSync(work);
 });return value;
}
function withFixedWorkSync(scope,action,options={}){
 const session=claimFixedWork(scope,options);let unsafe=false;
 try{return sessions.run(session,()=>action(session.owner.work,session));}
 catch(error){unsafe=String(error?.message).includes('退出未确认');throw error;}
 finally{releaseFixedWork(session,{unsafe});}
}
async function withFixedWork(scope,action,options={}){
 const session=claimFixedWork(scope,options);let unsafe=false;
 try{return await sessions.run(session,()=>action(session.owner.work,session));}
 catch(error){unsafe=String(error?.message).includes('退出未确认');throw error;}
 finally{releaseFixedWork(session,{unsafe});}
}
// 调用方在消费结果且产品进程退出后，只能收尾这个产品的准确固定目录。
function finishFixedWork(work,{run_id}={}){
 if(run_id&&validWork(work)&&!fs.existsSync(work))return;
 checkFixedWork(work);
 const value=short(work,()=>{
  const owner=readOwner(work);if(run_id&&!owner)return;if(run_id&&owner.run_id!==run_id)fail('编译收尾任务编号不一致');if(owner){
   if((alive(owner.pid)&&!(owner.pid===process.pid&&owner.state==='retained'))||owner.groups.some(pid=>alive(pid,true)))fail('产品进程退出未确认');
  }
  if(fs.existsSync(join(work,'.product-build.lock')))fail('产品守卫尚未释放');
  if(run_id&&fs.existsSync(join(work,'build-result.json'))){regular(join(work,'build-result.json'));if(JSON.parse(fs.readFileSync(join(work,'build-result.json'),'utf8')).run_id!==run_id)fail('结果任务编号不符');}
  empty(work,['.claim.lock']);if(isBuildWork(work))fs.rmdirSync(work);
 });return value;
}
function taskScope(work){checkFixedWork(work);if(work===fixedWork('test'))return 'test';const platform=Object.keys(contract.platforms).find(name=>work===fixedWork('build/'+name));if(!platform)fail('编译平台现场无效');return 'build/'+platform;}


return Object.freeze({fixedWork,checkFixedWork,checkScratchPath,fixedScratch,assertTargetTopology,clearFixedWork,claimFixedWork,trackFixedProcess,trackWorkProcess,workEnvironment,retainWork,releaseFixedWork,withFixedWorkSync,withFixedWork,finishFixedWork,taskScope});
})();
export const {fixedWork,checkFixedWork,checkScratchPath,fixedScratch,assertTargetTopology,clearFixedWork,claimFixedWork,trackFixedProcess,trackWorkProcess,workEnvironment,retainWork,releaseFixedWork,withFixedWorkSync,withFixedWork,finishFixedWork,taskScope}=targetRuntime;
export const finishBuild=finishFixedWork;

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const contract=Object.freeze({
  "schema": 1,
  "product_id": "citizenweb",
  "entry": "scripts/build.mjs",
  "platforms": {
    "web": {
      "tools": [
        {
          "id": "node",
          "version": "25.2.1"
        }
      ],
      "locks": [
        {
          "ecosystem": "npm",
          "path": "package-lock.json"
        }
      ],
      "completion": "compile-only",
      "files": []
    }
  },
  "resource_entry": "scripts/build.mjs"
});
const product=contract.product_id, prefix=product.toUpperCase();
const inside=(base,path)=>{const r=relative(base,path);return r===''||!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep);};
const fail=message=>{throw Error(product+' Build：'+message);};
export function checkWork(work) { return checkFixedWork(work); }
// GitHub checkout 固定提交在独立 HEAD 中；用 Node 核对，不为 Web 编译另建 Git 工具闭包。
export function checkoutSHA(directory=root){
 const git=join(directory,'.git'),head=join(git,'HEAD'),parent=lstatSync(git),entry=lstatSync(head);
 if(!parent.isDirectory()||parent.isSymbolicLink()||!entry.isFile()||entry.isSymbolicLink()||entry.nlink!==1||entry.size>64)fail('GitHub检出提交身份无效');
 const value=readFileSync(head,'utf8');if(!/^[a-f0-9]{40}\n?$/u.test(value))fail('GitHub检出提交身份无效');return value.trim();
}

// 产品自己拥有target工作边界；测试与独立入口也不借用调用方的全局缓存。
export function productTarget(platform) {
 platformContract(platform);
 return join(root,'target');
}
export function temporaryRoot(platform=Object.keys(contract.platforms)[0],scope='test',suppliedInput) {
 if(!['test','tmp','build'].includes(scope))fail('临时目录职责无效');
 platformContract(platform);const expected=fixedWork(scope==='test'?'test':'build/'+platform);
 if(suppliedInput!=null&&suppliedInput!==expected)fail('临时工作根必须是本产品固定目录');
 return checkFixedWork(expected,{create:true});
}
// 产品测试只使用本仓准确固定现场。
export const testRoot=platform=>temporaryRoot(platform||'web','test');

// 清理只针对当前执行拥有的工作根；工具全部退出后删除并回读，固定根本身保留。
export function clearWork(work) { return clearFixedWork(work); }

export function platformContract(platform) {
 if(!Object.hasOwn(contract.platforms,platform))fail('平台未声明');
 return contract.platforms[platform];
}
// Web只有本仓npm原锁，没有第一方Git源码或原生平台归档。
export function lockedSources(){return [];}
export function requirements(platform,work){
 checkWork(work);const declared=platformContract(platform);
 if(declared.locks.length!==1||declared.locks[0].ecosystem!=='npm'||declared.locks[0].path!=='package-lock.json')fail('Web原锁声明无效');
 const lock=join(root,'package-lock.json'),info=lstatSync(lock);if(!info.isFile()||info.isSymbolicLink())fail('Web原始锁缺失或链接');
 return {schema:1,product_id:product,platform,tools:declared.tools,locks:declared.locks,sources:[],archives:[]};
}

export function resourceEnvironment(platform,work,receipt,base={}){
 checkWork(work);const declared=platformContract(platform);
 if(!receipt||receipt.schema!==1||receipt.product_id!==product||receipt.platform!==platform||receipt.work!==work||receipt.offline!==true
  ||!receipt.tools||!receipt.dependencies||!receipt.archives||Object.keys(receipt.archives).length)fail('资源回执身份无效');
 const allowed=new Set(['CITIZENWEB_RESOURCE_MODE','PRODUCT_WORK_DIR','PATH']);
 if(Object.keys(receipt.environment||{}).some(key=>!allowed.has(key)))fail('资源回执包含未声明环境或注入变量');
 if(Object.keys(receipt.tools).sort().join(',')!=='node'||receipt.environment?.PATH!==dirname(receipt.tools.node?.path||''))fail('Web工具闭包必须只有锁定Node');
 for(const tool of declared.tools){const value=receipt.tools[tool.id];
  if(!value||value.version!==tool.version||typeof value.path!=='string'||!isAbsolute(value.path)||resolve(value.path)!==value.path)fail('缺少准确版本的工具：'+tool.id);
  const info=lstatSync(value.path);if(!info.isFile()||info.isSymbolicLink()||!(info.mode&0o111)||realpathSync(value.path)!==value.path)fail('工具入口必须是普通执行器：'+tool.id);
 }
 const own=receipt.dependencies.own||{};if(!own.npmCache)fail('缺少原始锁依赖回执：npm');checkDependency(work,own.npmCache);
 const env={HOME:join(work,'home'),LANG:'C.UTF-8',LC_ALL:'C.UTF-8',...receipt.environment,TMPDIR:join(work,'tmp'),TMP:join(work,'tmp'),TEMP:join(work,'tmp'),
  XDG_CACHE_HOME:join(work,'cache'),XDG_CONFIG_HOME:join(work,'config'),npm_config_offline:'true',npm_config_audit:'false',npm_config_fund:'false',
  npm_config_cache:own.npmCache};
 env.NODE=receipt.tools.node.path;
 env.PATH=dirname(receipt.tools.node.path);
 env.CITIZENWEB_WORK_DIR=work;env.CITIZENWEB_PROJECT_ROOT=join(work,'source');env.PRODUCT_SOURCE_DIR=env.CITIZENWEB_PROJECT_ROOT;
 env.CITIZENWEB_RESOURCE_MODE=base.PRODUCT_RESOURCE_FD==='4'?'provided':env.CITIZENWEB_RESOURCE_MODE||'independent';
 const execution=executions.getStore();if(execution)execution.buildEnvironment=env;
 return env;
}
function checkDependency(work,path){if(!isAbsolute(path)||resolve(path)!==path||!inside(work,path)||path===work||!lstatSync(path).isDirectory()||realpathSync(path)!==path)fail('依赖回执越界或无效');}
// 工程输入复制到本轮真实目录，保证包解析与写入均不进入正式源码；内部链接映射到同轮副本。
export function createView(source,destination) {
 const owned=inside(fixedWork('build/web'),destination)||inside(fixedWork('test'),destination);
 if(realpathSync(source)!==source||!lstatSync(source).isDirectory()||!isAbsolute(destination)||resolve(destination)!==destination||(inside(source,destination)&&!(source===root&&owned))||inside(destination,source))fail('工程输入与输出边界无效');
 let parent=dirname(destination);while(!existsSync(parent))parent=dirname(parent);
 if(!lstatSync(parent).isDirectory()||realpathSync(parent)!==parent)fail('工程输出经过链接');
 if(lstatSync(destination,{throwIfNoEntry:false}))fail('本轮工程已存在');mkdirSync(destination,{recursive:true,mode:0o700});
 const generated=new Set(['.git','build','target','node_modules','.cache','.DS_Store','dist','tsconfig.tsbuildinfo']);
 function visit(from,to){for(const name of readdirSync(from).sort()){if(generated.has(name))continue;const a=join(from,name),b=join(to,name),s=lstatSync(a);
  if(s.isDirectory()){mkdirSync(b);visit(a,b);}else if(s.isFile()){copyFileSync(a,b);}
  else if(s.isSymbolicLink()){const target=realpathSync(a);if(!inside(source,target)||!lstatSync(target).isFile())fail('源码链接越界');symlinkSync(join(destination,relative(source,target)),b);}else fail('源码文件类型无效');
 }}visit(source,destination);return destination;
}
// 本机与自动化共用同一静态编译步骤；工具与npm模式由所属调用提供。
function packageBinary(project,name,command){
 const lock=JSON.parse(readFileSync(join(project,'package-lock.json'),'utf8')),entry=lock.packages?.['node_modules/'+name];
 const relative=entry?.bin?.[command];if(typeof relative!=='string'||relative.startsWith('/')||relative.split('/').some(part=>!part||part==='.'||part==='..'))fail('原锁工具入口无效：'+name);
 const path=join(project,'node_modules',name,relative),info=lstatSync(path);if(!info.isFile()||info.isSymbolicLink()||realpathSync(path)!==path)fail('原锁工具执行文件无效：'+name);return path;
}
async function compileWeb(project,work,{node,npmCli,offline,environment={},signal}={}){
 const dist=join(work,'stage/compile');mkdirSync(dirname(dist),{recursive:true,mode:0o700});
 for(const name of ['package.json','package-lock.json'])if(!readFileSync(join(project,name)).equals(readFileSync(join(root,name))))fail('Build源码视图不属于本产品');
 const env={...environment,PRODUCT_BUILD_ROOT:root,CITIZENWEB_DIST:dist,CI:'true',WRANGLER_SEND_METRICS:'false'};
 await runBuildProcess(node,[npmCli,'ci','--ignore-scripts',...(offline?['--offline']:[]),'--no-audit','--no-fund'],env,project,{signal});
 if(!offline)await runBuildProcess(node,[npmCli,'audit','--audit-level=low'],env,project,{signal});
 await runBuildProcess(node,[packageBinary(project,'eslint','eslint'),'--config','config/eslint.config.js','.'],env,project,{signal});
 await runBuildProcess(node,[packageBinary(project,'typescript','tsc'),'-b','tsconfig.json'],env,project,{signal});
 await runBuildProcess(node,[packageBinary(project,'vite','vite'),'build','--config','config/vite.config.ts'],env,project,{signal});
 if(!lstatSync(join(dist,'index.html'),{throwIfNoEntry:false})?.isFile())fail('官网编译入口缺失');
 return dist;
}
// 门禁只交付当前任务工具与离线npm缓存；编译参数和输出验真仍由产品Build执行。
export async function verifyWebBuild({work,node,npmCache,signal}={}){
 if(work!==fixedWork('test')||!isAbsolute(node||'')||!lstatSync(node,{throwIfNoEntry:false})?.isFile()
  ||!isAbsolute(npmCache||'')||!lstatSync(npmCache,{throwIfNoEntry:false})?.isDirectory())fail('Web验收供给无效');
 const project=createView(root,join(work,'web-source'));
 const environment={PATH:dirname(node),HOME:join(work,'home'),LANG:'C.UTF-8',LC_ALL:'C.UTF-8',npm_config_cache:npmCache};
 mkdirSync(environment.HOME,{recursive:true});
 const npmCli=join(dirname(node),'../lib/node_modules/npm/bin/npm-cli.js');
 const dist=await compileWeb(project,work,{node,npmCli,offline:true,environment,signal});
 return {schema:1,product_id:'citizenweb',platform:'web',files:readdirSync(dist).length,sha256:outputDigest(dist)};
}
// 归档坐标只接受本产品当前锁；完整性在build前核验，prepare允许稍后展开的锁。
export async function checkArchives(platform,work,receipt,complete=false) {
 await requirements(platform,work);
 if(!receipt?.archives||Object.keys(receipt.archives).length)fail('Web没有原生归档需求');
 return true;
}
export async function prepare(platform,work,receipt,base) {
 const env=resourceEnvironment(platform,work,receipt,base),source=root;
 for(const name of ['home','work','tmp','cache','config','dependencies','stage'])mkdirSync(join(work,name),{recursive:true,mode:0o700});
 await checkArchives(platform,work,receipt);
 createView(source,env[prefix+'_PROJECT_ROOT']);
 return {schema:1,product_id:product,platform,work};
}
export async function build(platform,work,receipt,base) {
 const env=resourceEnvironment(platform,work,receipt,base),declared=platformContract(platform);
 await checkArchives(platform,work,receipt,true);
 const project=env[prefix+'_PROJECT_ROOT'];
 const npmCli=join(dirname(env.NODE),'../lib/node_modules/npm/bin/npm-cli.js');
 await compileWeb(project,work,{node:env.NODE,npmCli,offline:true,environment:env,signal:executions.getStore()?.signal});

 return completeBuild(platform,work,receipt);
}

// 每次调用拥有自己的取消和进程集合，导入API并发也不能共享执行状态。
const executions=new AsyncLocalStorage();
export async function runBuildProcess(file,args,env,cwd=root,{capture=false,input,accepted=[0],timeout=7200000,signal=executions.getStore()?.signal,passHost=false,streamError=false}={}) {
 signal?.throwIfAborted();
 return new Promise((ok,reject)=>{
  const child=spawn(file,args,{cwd,env:workEnvironment(env),detached:true,stdio:['pipe','pipe','pipe',...(passHost?[3]:[])]});
  trackWorkProcess(child.pid);
  let stdout=[],stderr=[],bytes=0,reason,settled=false;
  const stop=()=>{try{process.kill(-child.pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')reason='无法取消产品工具进程组';}};
  let killer;
  const terminate=()=>{stop();clearTimeout(killer);killer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},1500);};
  const forced=setTimeout(()=>{reason='产品工具超时';terminate();},timeout);forced.unref();
  const abort=()=>{reason='产品任务已取消';terminate();};
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const consume=(chunk,out)=>{bytes+=chunk.length;if(bytes>16*1024*1024){reason='产品工具输出超限';terminate();return;}out.push(chunk);if(!capture)process.stderr.write(chunk);};
  child.stdout.on('data',chunk=>consume(chunk,stdout));child.stderr.on('data',chunk=>{if(capture&&streamError)process.stderr.write(chunk);else consume(chunk,stderr);});
  child.stdin.on('error',()=>{reason='产品工具输入失败';stop();});
  child.once('error',()=>{reason='产品工具无法启动';});
  child.once('close',async(code,termination)=>{
   clearTimeout(forced);clearTimeout(killer);
   // 主进程close不代表后代退出；未退出的同组工具必须停止并确认，之后才能清理材料。
   const alive=()=>{if(!child.pid)return false;try{process.kill(-child.pid,0);return true;}catch(error){return error.code!=='ESRCH';}};
   if(alive()){reason??='产品工具退出后仍有后代';stop();for(let n=0;n<15&&alive();n++)await new Promise(r=>setTimeout(r,100));if(alive())try{process.kill(-child.pid,'SIGKILL');}catch{};for(let n=0;n<15&&alive();n++)await new Promise(r=>setTimeout(r,100));}
   if(alive()){reason='产品工具后代退出未确认，保留工作目录';const state=executions.getStore();if(state)state.unconfirmed=true;}
   signal?.removeEventListener('abort',abort);clearTimeout(killer);
   if(signal?.aborted)reason='产品任务已取消';
   if(settled)return;settled=true;
   if(reason||termination||!accepted.includes(code))reject(Error(reason||'产品工具执行失败'));
   else ok({stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8'),code});
  });
  child.stdin.end(input);
 });
}
const run=async(file,args,env,cwd=root,capture=false)=>(await runBuildProcess(file,args,env,cwd,{capture})).stdout;

export function outputDigest(path) {
 const hash=createHash('sha256');const base=path;
 function visit(file){const info=lstatSync(file);const name=relative(base,file);
  if(info.isSymbolicLink()){const real=realpathSync(file);if(!inside(base,real))fail('输出链接越界');hash.update(JSON.stringify([name,'link',readlinkSync(file)])+'\n');}
  else if(info.isDirectory()){hash.update(JSON.stringify([name,'directory'])+'\n');for(const child of readdirSync(file).sort())visit(join(file,child));}
  else if(info.isFile()&&info.nlink===1){hash.update(JSON.stringify([name,'file',Boolean(info.mode&0o111),info.size])+'\n');hash.update(readFileSync(file));}
  else fail('输出包含特殊文件或硬链接');
 }visit(path);return hash.digest('hex');
}

// 宿主完整Build先由调用方消费回执、安装并收尾；独立执行由本产品清空现场。
// 本仓完整Build在资源回执后运行自己的测试，控制台不选择测试清单。
function testFiles(){return ['scripts/build.mjs','scripts/publish.mjs'];}
// 产品在资源回执后运行自身Node回归；控制台只调用完整Build。
async function runProductTests(platform,work,receipt,base){
 const env=resourceEnvironment(platform,work,receipt,base),node=receipt.tools.node;
 if(!node||node.version!==contract.platforms[platform].tools.find(value=>value.id==='node')?.version
  ||!isAbsolute(node.path)||realpathSync(node.path)!==node.path)throw Error('本仓测试缺少准确Node入口');
 // Node测试运行器自行设置测试子进程身份；预设NODE_TEST_CONTEXT会让它跳过全部文件。
 const testEnvironment={HOME:work,USER:base.USER,LOGNAME:base.LOGNAME,LANG:'C',LC_ALL:'C',PATH:env.PATH};
 const files=testFiles().map(file=>join(root,file));
 for(const file of files){const info=lstatSync(file);if(!info.isFile()||info.isSymbolicLink()||realpathSync(file)!==file)throw Error('本仓测试文件无效');}
 const digests=files.map(file=>createHash('sha256').update(readFileSync(file)).digest('hex'));
 await runBuildProcess(node.path,['--test','--test-concurrency=1',...files],testEnvironment,root);
 if(files.some((file,index)=>createHash('sha256').update(readFileSync(file)).digest('hex')!==digests[index]))throw Error('本仓测试期间源码改变');
}
if(testSession&&process.argv.length===2&&testFiles().some(file=>join(root,file)===resolve(process.argv[1]||'')))process.on('exit',()=>{
 // 只清当前测试进程随机会话，活跃工具或身份不符就保留现场并失败。
 try{
  for(const platform of Object.keys(contract.platforms)){const work=fixedWork('build/'+platform);if(existsSync(work))finishFixedWork(work);}
  const session=fixedWork('test');if(existsSync(session)){finishFixedWork(session);rmdirSync(session);}
  const sessions=join(root,'target/test/sessions');if(existsSync(sessions)&&readdirSync(sessions).length===0)rmdirSync(sessions);
 }catch(error){process.stderr.write('产品测试会话收尾失败：'+error.message+'\n');process.exitCode=1;}
});
if(testSession&&process.argv.length===2&&resolve(process.argv[1]||'')===fileURLToPath(import.meta.url)){
 const {test}=await import('node:test'),{default:assert}=await import('node:assert/strict');
 test('回归固定根属于本轮会话，正式平台根保持原位',()=>{
  assert.equal(fixedWork('test'),join(root,'target/test/sessions',testSession));
  for(const platform of Object.keys(contract.platforms))assert.equal(fixedWork('build/'+platform),join(fixedWork('test'),'build',platform));
 });
 test('正式入口在领取工作根前拒绝合成阶段',()=>{
  const module=JSON.stringify(fileURLToPath(import.meta.url));
  const child=spawnSync(process.execPath,['--input-type=module','-e','import {execute} from '+module+';await execute("bad","/bad",{}, {stages:{}});'],{env:{PATH:process.env.PATH,HOME:process.env.HOME},encoding:'utf8'});
  assert.notEqual(child.status,0);assert.match(child.stderr,/合成阶段仅用于本仓测试/);
 });

}


export async function execute(platform,work,request={},options={}) {
 if(options.stages&&!process.env.NODE_TEST_CONTEXT)fail('合成阶段仅用于本仓测试');
 const environment=options.environment||process.env;
 if(options.consume){
  const workflow={"web": "web.yml"}[platform];
  if(typeof options.consume!=='function'||!workflow||environment.GITHUB_ACTIONS!=='true'
   ||environment.GITHUB_REPOSITORY!=='crcfrcn/citizenweb'
   ||environment.GITHUB_EVENT_NAME!=='workflow_dispatch'||environment.GITHUB_REF!=='refs/heads/main'
   ||environment.GITHUB_WORKFLOW_REF!==environment.GITHUB_REPOSITORY+'/.github/workflows/'+workflow+'@refs/heads/main'
   ||!/^[a-f0-9]{40}$/u.test(environment.GITHUB_SHA||'')
   ||checkoutSHA()!==environment.GITHUB_SHA)
   fail('GitHub正式编译消费身份无效');
 }
 checkFixedWork(work,{create:true});
 return withFixedWork(taskScope(work),async()=>{
  const result=await executeTask(platform,work,request,options);
  if(options.consume)await options.consume(result);
  return result;
 },{run_id:request.run_id,environment,retain:environment.PRODUCT_RESOURCE_FD==='4'||environment.PRODUCT_HOST_FD==='3'});
}
async function executeTask(platform,work,request={},options={}) {
 checkWork(work);platformContract(platform);
 if(!inside(productTarget(platform),work)||work===productTarget(platform))fail('执行工作根与当前产品平台不一致');
 options.signal?.throwIfAborted();
 if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(k=>!['run_id','program_digest'].includes(k))
  ||request.run_id!==undefined&&!/^[1-9][0-9]{8}$/u.test(request.run_id)||request.program_digest!==undefined&&!/^[a-f0-9]{64}$/u.test(request.program_digest)
  )fail('本仓Build只接受任务编号、程序输入记录及显式供给方式');
 chmodSync(work,0o700);
 const lock=join(work,'.product-build.lock'),resultFile=join(work,'build-result.json');
 if(existsSync(resultFile))fail('本轮完整Build已有结果，禁止复用旧终态');
 const handle=openSync(lock,'wx',0o600);closeSync(handle);
 const cancellation=new AbortController(),abort=()=>cancellation.abort();options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
 const state={signal:cancellation.signal,cancellation,host:options.host,unconfirmed:false,finished:false};
 try{return await executions.run(state,async()=>{
  const stages=options.stages||{requirements,resources,prepare,build};
  const resourcesOptions={signal:state.signal,offline:Boolean(options.offline),environment:options.environment||process.env};

  if((options.environment||process.env).PRODUCT_RESOURCE_FD==='4'){
   state.resourceClient=options.resourceClient||createResourceSupplyClient(new Socket({fd:4,readable:true,writable:true}),state.signal);
   resourcesOptions.supply=previous=>state.resourceClient({previous});
  }
  await stages.requirements(platform,work);state.signal.throwIfAborted();
  let receipt=await stages.resources(platform,work,request,resourcesOptions);state.signal.throwIfAborted();
  if(!options.stages)await runProductTests(platform,work,receipt,resourcesOptions.environment);
  state.signal.throwIfAborted();
  await stages.prepare(platform,work,receipt,resourcesOptions.environment);state.signal.throwIfAborted();
  await stages.requirements(platform,work);
  receipt=await stages.resources(platform,work,receipt,resourcesOptions);state.signal.throwIfAborted();
  const result=await stages.build(platform,work,receipt,resourcesOptions.environment);state.signal.throwIfAborted();
  checkBuildResult(result,platform,work,request.run_id);
  writeFileSync(resultFile,JSON.stringify(result)+'\n',{flag:'wx',mode:0o600});return result;
 });}catch(error){if(String(error?.message).includes('退出未确认'))state.unconfirmed=true;throw error;}finally{state.finished=true;state.socket?.destroy();state.resourceClient?.close?.();options.signal?.removeEventListener('abort',abort);if(!state.unconfirmed){unlinkSync(lock);if(!options.consume&&(options.environment||process.env).PRODUCT_RESOURCE_FD!=='4'&&(options.environment||process.env).PRODUCT_HOST_FD!=='3')clearWork(work);}}
}
export function checkBuildResult(value,platform,work,runId) {
 // 官网本机编译仅验证Web候选，Sites交付与正式归档不由此入口宣布完成。
 const web=platformContract('web');
 if(platform!=='web'||web.completion!=='compile-only'||web.files.length!==0)fail('公民官网本机声明越出Web编译职责');
 if(value?.product_id!==product||value.schema!==1||value.platform!==platform||value.work!==work
  ||value.completion!==web.completion||value.run_id!==runId)fail('公民官网编译结果身份错误');
 if(!Array.isArray(value.files)||value.files.length)fail('公民官网本机终态不能夹带部署或分发资产');
 const fields=Object.keys(value).sort().join(',');
 if(fields!==(runId?'completion,files,platform,product_id,run_id,schema,work':'completion,files,platform,product_id,schema,work'))fail('公民官网结果不符合本仓公开编译接口');
 return value;
}
async function completeBuild(platform,work,receipt) {
 const declared=platformContract(platform);
 if(declared.completion!=='compile-only'||declared.files.length)fail('Web编译完成声明无效');
 const result={schema:1,product_id:product,platform,work,completion:'compile-only',files:[]};
 if(receipt.run_id)result.run_id=receipt.run_id;return checkBuildResult(result,platform,work,receipt.run_id);
}

// 模块先完成初始化，资源模块才能反向导入本文件的唯一校验；异步CLI在独立Promise中执行。

// 本产品在独立编译与调度编译中均清理自己的生成物。
export function cleanBuildPath(path,options={},environment=executions.getStore()?.buildEnvironment||process.env){
 const work=environment.PRODUCT_WORK_DIR||[...Object.keys(contract.platforms).map(platform=>fixedWork('build/'+platform)),fixedWork('test')].find(work=>path?.startsWith(work+sep));if(typeof work!=='string'||typeof path!=='string'||resolve(path)!==path||!path.startsWith(work+sep))fail('编译清理路径越界');
 checkFixedWork(work);let parent=dirname(path);while(!existsSync(parent))parent=dirname(parent);if(realpathSync(parent)!==parent)fail('编译清理父目录经过链接');
 rmSync(path,options);
}
export function cleanShellPaths(args,environment=process.env){
 const paths=args.filter(value=>!value.startsWith('-')),options={recursive:args.some(value=>/^-[^-]*[rR]/u.test(value)),force:args.some(value=>/^-[^-]*f/u.test(value))};if(!paths.length)fail('清理路径缺失');for(const path of paths)cleanBuildPath(resolve(path),options,environment);
}


async function runCLI(){
 const [operation,platform,flag,work]=process.argv.slice(2);
 if(operation==='execute'&&process.env.PRODUCT_RESOURCE_FD!=='4'){if(flag!=='--work'||work!==fixedWork('build/'+platform))fail('平台编译现场不符');return withFixedWork('build/'+platform,()=>runCommand(),{environment:process.env,retain:process.env.PRODUCT_HOST_FD==='3'});}
 if(operation==='execute')return runCommand();
 if(['resources','prepare','build'].includes(operation)&&flag==='--work'){
  checkWork(work);
  return withFixedWork(taskScope(work),()=>runCommand(),{environment:process.env,retain:process.env.PRODUCT_HOST_FD==='3'||process.env.PRODUCT_RESOURCE_FD==='4'});
 }
 return runCommand();
}
async function runCommand(){
 const [command,platform,option,work,...extra]=process.argv.slice(2);
 if(command==='describe'){if(process.argv.length!==3)fail('产品声明不接受额外参数');process.stdout.write(JSON.stringify(contract)+'\n');return;}
 if(command==='dev'){
  if(option!==undefined||work!==undefined||extra.length||platform!==undefined&&!/^[1-9]\d{0,4}$/u.test(platform))fail('官网启动命令参数无效');
  const controller=new AbortController();for(const name of ['SIGTERM','SIGINT'])process.once(name,()=>controller.abort());
  await startDevelopment({port:platform?Number(platform):5199,signal:controller.signal});return;
 }
 if(command==='test'){
  if(platform!=='web'||(option!==undefined&&(option!=='--work'||work!==fixedWork('test')))||extra.length)fail('Web产品测试命令参数无效');
  process.stdout.write(JSON.stringify(await productTests())+'\n');return;
 }
 if(command==='clean'){cleanShellPaths(process.argv.slice(3));return;}

 if(command==='temporary-root') {
  if(platform!=='web'||option!==undefined||work!==undefined||extra.length)fail('Web临时入口参数无效');
  process.stdout.write(temporaryRoot('web','tmp')+'\n');
 } else {

 if(!['requirements','resources','prepare','build','execute'].includes(command)||option!=='--work'||extra.some(x=>x!=='--offline')||extra.length>1||extra.length&&!['resources','execute'].includes(command))fail('固定入口参数无效');
 if(command==='execute'){platformContract(platform);if(work!==fixedWork('build/'+platform))fail('平台编译现场不符');}else checkWork(work);
 if(command==='requirements')process.stdout.write(JSON.stringify(requirements(platform,work))+'\n');
 else{
  const cancellation=new AbortController();for(const name of ['SIGTERM','SIGINT'])process.once(name,()=>cancellation.abort());
  let input='';for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>2*1024*1024)fail('公开输入超限');}
  const request=input?JSON.parse(input):{},options={environment:process.env,signal:cancellation.signal,offline:extra.includes('--offline')};
  let result;
  if(command==='execute'&&process.env.PRODUCT_RESOURCE_FD==='4'){
   if(process.env.PRODUCT_RESOURCE_FD!=='4')fail('编译资源供给通道缺失');
   result=await execute(platform,work,request,options);
  }else if(command==='execute'){
   const node=await bootstrapNode(work,options);
   if(createHash('sha256').update(readFileSync(process.execPath)).digest('hex')!==createHash('sha256').update(readFileSync(node.path)).digest('hex')){
    const environment=Object.fromEntries(['HOME','USER','LOGNAME','LANG','LC_ALL','PRODUCT_TOOL_ROOT','PRODUCT_DEPENDENCY_ROOT','PRODUCT_HOST_FD','PRODUCT_WORK_LEASE'].filter(k=>typeof process.env[k]==='string').map(k=>[k,process.env[k]]));
    result=JSON.parse((await runBuildProcess(node.path,[fileURLToPath(import.meta.url),command,platform,option,work,...extra],workEnvironment(environment),root,{capture:true,streamError:true,input:JSON.stringify(request),signal:cancellation.signal,passHost:environment.PRODUCT_HOST_FD==='3'})).stdout);
   }else result=await execute(platform,work,request,options);
  }else if(command==='resources')result=await resources(platform,work,request,options);
  else result=await executions.run({signal:cancellation.signal},()=>command==='prepare'?prepare(platform,work,request,process.env):build(platform,work,request,process.env));
  process.stdout.write(JSON.stringify(result)+'\n');
 }
}
}

const buildPublic={contract,checkWork,temporaryRoot,resourceEnvironment,requirements,lockedSources};
const resourceRuntime=await(async()=>{
const {fixedScratch,trackWorkProcess,workEnvironment,checkScratchPath}=targetRuntime;
const {AsyncLocalStorage}=await import('node:async_hooks');
const {writeFileSync:writeGroupRecord,existsSync,readFileSync,constants}=await import('node:fs');
const {createHash,randomUUID}=await import('node:crypto');
const {lstat,realpath,readdir,readlink,symlink,copyFile,readFile,writeFile,mkdir,mkdtemp,rename,rm:removeResourcePath,chmod,open}=await import('node:fs/promises');
const {dirname,join,resolve,relative,isAbsolute,sep,parse,win32,posix}=await import('node:path');
const {fileURLToPath,pathToFileURL}=await import('node:url');
const {homedir}=await import('node:os');
const {gunzipSync,inflateRawSync}=await import('node:zlib');
const {spawn}=await import('node:child_process');
const {createRequire}=await import('node:module');
const supplyGroups=new Map();
const resourceSupplies=new AsyncLocalStorage();
// 工具返回只在主进程和整组后代退出后完成；未确认的输入目录禁止后续清理或改权限。
const retainedResourceRoots=new Set();
function retainedResourcePath(path) {
 const value=resolve(String(path));
 return [...retainedResourceRoots].some(root=>value===root||value.startsWith(root+sep)||root.startsWith(value+sep));
}
async function rm(path,options) {
 if(retainedResourcePath(path))throw Error('资源工具退出未确认，保留工作目录');

 if(retainedResourcePath(path))throw Error('资源工具退出未确认，保留工作目录');
 return removeResourcePath(path,options);
}
function runResourceProcess(command,args,{signal,maxBuffer=8*1024**2,timeout=3600000,encoding='utf8',quietOutput=false,...options}={}) {
 const supplied=resourceSupplies.getStore();if(supplied&&!supplied.preparingTool){if(typeof supplied.runCommand!=='function')fail('供给未交付执行能力');return supplied.runCommand(command,args,{...options,maxBuffer,timeout,encoding,quietOutput,signal});}

 signal?.throwIfAborted();
 if(!Number.isSafeInteger(maxBuffer)||maxBuffer<=0||!Number.isSafeInteger(timeout)||timeout<=0)throw Error('资源进程边界参数无效');
 return new Promise((ok,reject)=>{
  const child=spawn(command,args,{...options,env:workEnvironment(options.env),detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
  trackWorkProcess(child.pid);
  const supply=resourceSupplies.getStore(),groups=supply?.work?(supplyGroups.get(supply.work)||new Set()):null;
  const record=()=>{if(groups)writeGroupRecord(join(supply.work,'.resource-active.json'),JSON.stringify({pid:process.pid,groups:[...groups]})+'\n');};
  if(groups&&Number.isSafeInteger(child.pid)){supplyGroups.set(supply.work,groups);groups.add(child.pid);record();}
  const output=[],errors=[];let bytes=0,done=false,closed=false,failure=null,probe=null,force=null,limit=null;
  const groupExists=()=>{
   if(process.platform==='win32')return !closed;
   if(!child.pid)return false;
   try{process.kill(-child.pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;return true;}
  };
  const stop=hard=>{
   if(!child.pid)return;
   // 进程组已接收信号时立即返回，禁止同轮再次向组内主进程发送相同信号。
   if(process.platform!=='win32')try{process.kill(-child.pid,hard?'SIGKILL':'SIGTERM');return;}catch(error){if(error.code!=='ESRCH'){failure=Error('资源工具取消无法确认');return;}}
   if(!closed)try{child.kill(hard?'SIGKILL':'SIGTERM');}catch{failure=Error('资源工具取消无法确认');}
  };
  const finish=(error,result)=>{
   if(done)return;done=true;if(groups&&closed&&!groupExists()){groups.delete(child.pid);record();}clearTimeout(timer);clearTimeout(force);clearTimeout(limit);clearTimeout(probe);signal?.removeEventListener('abort',cancel);
   error?reject(error):ok(result);
  };
  const retain=()=>{
   for(const path of [options.cwd,options.env?.PRODUCT_WORK_DIR])if(typeof path==='string'&&isAbsolute(path))retainedResourceRoots.add(resolve(path));
   finish(Error('资源工具退出未确认，保留工作目录'));
  };
  const confirm=()=>{
   if(done)return;
   if(closed&&!groupExists()) {
    const stdout=Buffer.concat(output),stderr=Buffer.concat(errors);
    finish(failure,{stdout:encoding==='buffer'?stdout:stdout.toString(encoding),stderr:encoding==='buffer'?stderr:stderr.toString(encoding)});return;
   }
   probe=setTimeout(confirm,50);
  };
  const requestStop=error=>{
   if(done||force!==null)return;failure=error;stop(false);
   force=setTimeout(()=>stop(true),8000);limit=setTimeout(retain,12000);
   if(probe===null)confirm();
  };
  const cancel=()=>requestStop(signal.reason instanceof Error?signal.reason:Error('资源进程已取消'));
  const timer=setTimeout(()=>requestStop(Error('资源进程超时')),timeout);
  signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  for(const [stream,parts]of [[child.stdout,output],[child.stderr,errors]])stream.on('data',chunk=>{
   if(done)return;bytes+=chunk.length;
   if(bytes>maxBuffer){requestStop(Error('资源进程输出超限'));return;}
   parts.push(chunk);if(!quietOutput)process.stderr.write(chunk);
  });
  child.once('error',()=>{if(!child.pid){closed=true;finish(Error('资源工具无法启动'));}else requestStop(Error('资源工具进程错误'));});
  child.once('close',(code,termination)=>{
   closed=true;
   if(!failure&&(code!==0||termination))failure=Error('资源工具失败');
   if(groupExists())requestStop(failure||Error('资源工具后代未结束'));
   if(probe===null)confirm();
  });
 });
}
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=message=>{throw Error('产品资源：'+message);};
const safePath=value=>typeof value==='string'&&value.length>0&&!isAbsolute(value)&&!/[\\\x00-\x1f]/u.test(value)&&value.split('/').every(x=>x&&x!=='.'&&x!=='..');
const inside=(base,path)=>path.startsWith(base+sep);
const stat=async path=>lstat(path).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
async function regular(path){const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||await realpath(path)!==path)fail('非独占普通文件：'+path);return s;}
async function directory(path,create=false){if(!isAbsolute(path)||resolve(path)!==path||path===parse(path).root)fail('目录不是准确绝对路径');let at=parse(path).root;for(const name of relative(at,path).split(sep)){at=join(at,name);if(create&&!await stat(at))await mkdir(at,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});const s=await lstat(at);if(!s.isDirectory()||s.isSymbolicLink()||await realpath(at)!==at)fail('目录经过链接或特殊项：'+at);}return path;}
// 普通资源清单保持独占文件要求；工具内部硬链接只由同一扫描器的私有验真现场核对。
async function inventory(base,path=base){return inventoryFiles(base,path);}
function inventoryStatMatches(before,after){
 return ['dev','ino','nlink','mode','uid','gid','size','mtimeMs','ctimeMs','birthtimeMs'].every(key=>before[key]===after[key]);
}
async function inventoryFiles(base,path,toolScan){
 if(toolScan){
  const info=await lstat(path);
  if(!info.isDirectory()||info.isSymbolicLink()||await realpath(path)!==path)fail('工具原件目录边界无效');
  toolScan.entries.push({path,info});
 }
 const files=[];
 for(const name of (await readdir(path)).sort()){
  const file=join(path,name),s=await lstat(file),key=relative(base,file),entry={path:file,info:s};
  if(s.isSymbolicLink()){
   const target=relative(base,await realpath(file));if(!safePath(target))fail('链接越界');
   entry.target=target;files.push({path:key,target});
  }else if(s.isDirectory())files.push({path:key,directory:true},...await inventoryFiles(base,file,toolScan));
  else if(s.isFile()){
   let bytes;
   if(toolScan){
    if(!safePath(key)||await realpath(file)!==file)fail('工具原件文件边界无效');
    const id=s.dev+':'+s.ino;let group=toolScan.hardlinks.get(id);
    if(!group)toolScan.hardlinks.set(id,group={nlink:s.nlink,paths:[]});
    if(group.nlink!==s.nlink)fail('工具清单读取期间硬链接计数变化');
    group.paths.push(file);
    // 不跟随末级链接；打开和读取后均核对同一文件身份，禁止替换或改权限后继续验真。
    const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
    try{
     if(!inventoryStatMatches(s,await handle.stat()))fail('工具清单读取期间文件变化');
     bytes=await handle.readFile();
     if(!inventoryStatMatches(s,await handle.stat()))fail('工具清单读取期间文件变化');
    }finally{await handle.close();}
   }else{
    if(s.nlink!==1)fail('共享硬链接');bytes=await readFile(file);
   }
   files.push({path:key,sha256:hash(bytes),executable:Boolean(s.mode&0o111)});
  }else fail('特殊文件');
  if(toolScan&&!s.isDirectory())toolScan.entries.push(entry);
 }
 return files;
}
async function permissions(path,writable){
 if(retainedResourcePath(path))throw Error('资源工具退出未确认，保留工作目录');const s=await lstat(path);if(s.isSymbolicLink())return;if(s.isDirectory()){if(writable)await chmod(path,0o700);for(const name of await readdir(path))await permissions(join(path,name),writable);if(!writable)await chmod(path,0o555);}else await chmod(path,writable?0o600:s.mode&0o111?0o555:0o444);}
function checkedURL(input){const url=new URL(input);if(url.protocol!=='https:'||url.username||url.password||url.hash)fail('来源必须是无凭据HTTPS');return url.href;}
function digestSpec(entry){if(entry.sha256&&/^[a-f0-9]{64}$/u.test(entry.sha256))return ['sha256',Buffer.from(entry.sha256,'hex')];const m=/^(sha256|sha512)-([A-Za-z0-9+/]+={0,2})$/u.exec(entry.integrity||'');if(!m)fail('来源缺少锁定摘要');const b=Buffer.from(m[2],'base64');if(b.toString('base64')!==m[2]||b.length!==({sha256:32,sha512:64}[m[1]]))fail('完整性不是规范摘要');return [m[1],b];}
function verifyBytes(bytes,entry){const [algorithm,digest]=digestSpec(entry);if(!createHash(algorithm).update(bytes).digest().equals(digest))fail('锁定来源摘要不符');return hash(bytes);}
// 不持下载锁。每个候选独占生成，提交使用同对象短锁与排他重命名，竞争者核验同一字节。
// 候选下载、解包和编译归本产品当前target现场；永久原件只在验真提交后接收。
async function resourceWork(work) {
 const owner=buildPublic;const path=work||owner.temporaryRoot(undefined,'tmp');
 checkScratchPath(path);return directory(join(path,'resource-pending'),true);
}
async function acquireArchive(entry,{store,work,optional,offline=false,fetcher=fetch,signal,maxBytes=4*1024**3}={}){
 const supplied=resourceSupplies.getStore();if(supplied)return supplied.acquireOriginal(entry,{kind:store===join(supplied.toolRoot,'archives')?'tool':'dependency',offline,signal,maxBytes});
 const url=checkedURL(entry.url);digestSpec(entry);await directory(store,true);const coordinate=hash(JSON.stringify([url,entry.sha256||entry.integrity]));const target=join(store,coordinate+'.blob');
 const check=async path=>{await regular(path);const b=await readFile(path);if(!b.length||b.length>maxBytes)fail('原件大小超限');verifyBytes(b,entry);return path;};
 if(await stat(target))return check(target);
 // 可选目录只按准确内容摘要读取，绝不读取它的产品白名单或版本登记。
 if(optional&&await stat(optional)){await directory(optional);let digest=entry.sha256;if(!digest&&entry.integrity){const index=join(dirname(optional),'index.json');if(await stat(index)){await regular(index);if((await lstat(index)).size>32*1024**2)fail('可选原件索引超限');const data=await readDependencySupply(optional);digest=data.packages?.flatMap(x=>x.archives||[]).find(x=>x.url===entry.url&&x.integrity===entry.integrity)?.sha256;}}if(digest&&!/^[a-f0-9]{64}$/u.test(digest))fail('可选供给摘要无效');const supplied=digest?join(optional,digest+'.blob'):null;if(supplied&&await stat(supplied)){await check(supplied);const candidate=join(await resourceWork(work),'.'+coordinate+'.'+randomUUID()+'.pending');try{await copyFile(supplied,candidate,constants.COPYFILE_EXCL);await chmod(candidate,0o444);await commitCandidate(candidate,target,{signal,verify:check});return await check(target);}finally{await rm(candidate,{force:true});}}}
 if(offline)fail('离线缺少锁定资源：'+url);signal?.throwIfAborted();let response,current=url;
 for(let i=0;i<=5;i++){response=await fetcher(current,{redirect:'manual',signal});if([301,302,303,307,308].includes(response.status)){await response.body?.cancel();if(i===5)fail('来源重定向超限');current=checkedURL(new URL(response.headers.get('location'),current).href);continue;}break;}
 if(!response?.ok||!response.body)fail('来源获取失败：'+url);const length=Number(response.headers.get('content-length'));if(length>maxBytes)fail('来源声明超限');
 const temporary=join(await resourceWork(work),'.'+coordinate+'.'+randomUUID()+'.pending'),h=await open(temporary,'wx',0o600);let bytes=0;const [algorithm,digest]=digestSpec(entry),checksum=createHash(algorithm);
 try{for await(const chunk of response.body){signal?.throwIfAborted();bytes+=chunk.length;if(bytes>maxBytes)fail('来源数据超限');checksum.update(chunk);let offset=0;while(offset<chunk.length){const n=await h.write(chunk,offset,chunk.length-offset);if(!n.bytesWritten)fail('原件写入中断');offset+=n.bytesWritten;}}if(!bytes||!checksum.digest().equals(digest))fail('锁定来源摘要不符');if(length&&length!==bytes)fail('来源数据不完整');await h.sync();await h.close();signal?.throwIfAborted();await chmod(temporary,0o444);await commitCandidate(temporary,target,{signal,verify:check});return await check(target);}finally{await h.close().catch(()=>{});await rm(temporary,{force:true});await response.body?.cancel().catch(()=>{});}
}
// 解包先解析全部成员并验证闭包，之后才写入；链接不得指向归档外部或成为文件父目录。
async function extractArchive(input,destination,{prefix='',signal,tar,maxBytes=8*1024**3}={}){
 await regular(input);if(await stat(destination))fail('解包目标已存在');let bytes=await readFile(input),entries=[];const seen=new Set();
 const add=(path,type,data,mode=0o644,target)=>{path=path.replace(/\/$/u,'').replace(/^\.\//u,'');if(path==='.'||!path)return;if(!safePath(path))fail('归档成员越界');if(entries.length>=400000||seen.has(path))fail('归档成员重复或超限');seen.add(path);entries.push({path,type,data,mode,target});};
 if(bytes[0]===0x50&&bytes[1]===0x4b){let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}if(end<0)fail('ZIP目录缺失');const count=bytes.readUInt16LE(end+10);let cursor=bytes.readUInt32LE(end+16),total=0;for(let n=0;n<count;n++){signal?.throwIfAborted();if(bytes.readUInt32LE(cursor)!==0x02014b50)fail('ZIP成员无效');const method=bytes.readUInt16LE(cursor+10),size=bytes.readUInt32LE(cursor+24),compressed=bytes.readUInt32LE(cursor+20),nameLength=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),mode=bytes.readUInt32LE(cursor+38)>>>16,offset=bytes.readUInt32LE(cursor+42),name=bytes.subarray(cursor+46,cursor+46+nameLength).toString('utf8');if(bytes.readUInt16LE(cursor+8)&1||size===0xffffffff||offset===0xffffffff)fail('ZIP加密或Zip64未声明');total+=size;if(total>maxBytes)fail('ZIP解压超限');if(bytes.readUInt32LE(offset)!==0x04034b50)fail('ZIP本地记录无效');const start=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28),data=bytes.subarray(start,start+compressed),output=method===0?data:method===8?inflateRawSync(data,{maxOutputLength:Math.max(1,size)}):fail('ZIP压缩方式未声明');if(output.length!==size)fail('ZIP长度不符');add(name,name.endsWith('/')?'directory':(mode&0o170000)===0o120000?'symlink':'file',output,mode||0o644,output.toString());cursor+=46+nameLength+extra+comment;}}
 else{if(bytes[0]===0x1f&&bytes[1]===0x8b)bytes=gunzipSync(bytes,{maxOutputLength:maxBytes});else if(bytes[0]===0xfd&&bytes[1]===0x37){if(!tar)fail('XZ需要已验真基础归档工具');fail('XZ应通过受控tar清单提取');}
  const number=b=>{const v=b.toString().replace(/\0.*$/su,'').trim();if(!/^[0-7]*$/u.test(v))fail('TAR数字无效');return parseInt(v||'0',8);};let pax={},global={};
  for(let cursor=0;cursor+512<=bytes.length;){signal?.throwIfAborted();const block=bytes.subarray(cursor,cursor+512);if(block.every(x=>x===0))break;let sum=0;for(let i=0;i<512;i++)sum+=(i>=148&&i<156)?32:block[i];if(sum!==number(block.subarray(148,156)))fail('TAR头摘要不符');const size=number(block.subarray(124,136)),type=String.fromCharCode(block[156]||48),str=(a,b)=>block.subarray(a,b).toString().replace(/\0.*$/su,''),data=bytes.subarray(cursor+512,cursor+512+size);if(data.length!==size||size>maxBytes)fail('TAR内容超限');cursor+=512+Math.ceil(size/512)*512;
   if(type==='x'||type==='g'){const values={};let at=0;while(at<data.length){const space=data.indexOf(32,at),length=Number(data.subarray(at,space).toString());if(!Number.isInteger(length)||length<=space-at+1||at+length>data.length)fail('PAX长度无效');const record=data.subarray(space+1,at+length-1).toString(),eq=record.indexOf('=');if(eq<1)fail('PAX字段无效');values[record.slice(0,eq)]=record.slice(eq+1);at+=length;}if(type==='g')global={...global,...values};else pax=values;continue;}
   if(type==='L'){pax.path=data.toString().replace(/\0.*$/su,'');continue;}if(type==='K'){pax.linkpath=data.toString().replace(/\0.*$/su,'');continue;}
   const attrs={...global,...pax};pax={};if(Object.keys(attrs).some(x=>x.startsWith('GNU.sparse')))fail('TAR稀疏文件未声明');const name=attrs.path||[str(345,500),str(0,100)].filter(Boolean).join('/'),target=attrs.linkpath||str(157,257);if(!['0','5','2','1'].includes(type))fail('TAR特殊成员未声明');add(name,{'0':'file','5':'directory','2':'symlink','1':'hardlink'}[type],data,number(block.subarray(100,108)),target);
  }
 }
 const selected=entries.filter(e=>!prefix||e.path===prefix||e.path.startsWith(prefix+'/')).map(e=>({...e,path:prefix?e.path.slice(prefix.length).replace(/^\//u,''):e.path})).filter(e=>e.path);if(!selected.length)fail('归档根缺失');const table=new Map(selected.map(e=>[e.path,e]));
 for(const entry of selected){let parent=dirname(entry.path);while(parent!=='.'){if(table.has(parent)&&table.get(parent).type!=='directory')fail('归档父目录不是目录');parent=dirname(parent);}if(['symlink','hardlink'].includes(entry.type)){const target=entry.type==='symlink'?posix.normalize(posix.join(posix.dirname(entry.path),entry.target)):prefix?entry.target.replace(new RegExp('^'+prefix+'/'),''):entry.target;if(!safePath(target)||!table.has(target))fail('归档链接越界或缺失');entry.resolved=target;}}
 await mkdir(destination,{mode:0o700});try{for(const entry of selected.filter(x=>['file','directory'].includes(x.type))){signal?.throwIfAborted();const file=join(destination,entry.path);await mkdir(dirname(file),{recursive:true,mode:0o700});if(entry.type==='directory')await mkdir(file,{recursive:true,mode:0o700});else await writeFile(file,entry.data,{flag:'wx',mode:entry.mode&0o111?0o755:0o644});}
 for(const entry of selected.filter(x=>['symlink','hardlink'].includes(x.type))){signal?.throwIfAborted();const file=join(destination,entry.path);await mkdir(dirname(file),{recursive:true});if(entry.type==='hardlink'){const source=table.get(entry.resolved);if(source.type!=='file')fail('硬链接目标不是普通文件');await copyFile(join(destination,entry.resolved),file,constants.COPYFILE_EXCL);}else await symlink(entry.target,file);}await inventory(destination);return destination;}catch(e){await permissions(destination,true);await rm(destination,{recursive:true});throw e;}
}
// XZ由验真POSIX tar处理；双遍清单、无链接父目录与候选物化后的清单一起保护边界。
const toolDefinitions=Object.freeze([{"id":"node","title":"Node.js","version":"25.2.1","source":"https://nodejs.org/dist/v25.2.1/SHASUMS256.txt","command":"node","archive":{"url":"https://nodejs.org/dist/v25.2.1/node-v25.2.1-darwin-arm64.tar.gz","sha256":"be87e21bd235a451fad02c89e5bf7cb17e206e4cd89dd5664f20d19e7dfde6f9","root":"node-v25.2.1-darwin-arm64","executable":"bin/node","kind":"extract"},"managed":true,"requires":[]}]);
const cleanEnvironment=environment=>Object.fromEntries(['HOME','USER','LOGNAME','LANG','LC_ALL'].filter(k=>typeof environment[k]==='string').map(k=>[k,environment[k]]));
const objectRecipe=tool=>hash(JSON.stringify([tool,'locked-extract-v1']));
function toolArchive(tool){if(tool?.id!=='node'||tool.archive?.kind!=='extract')fail('Web仅支持锁定Node发行件');return tool.archive;}
async function verifyToolObject(directory,tool){
  if(!await stat(directory))return null;await directoryCheck(directory);const payload=join(directory,'payload'),archive=toolArchive(tool),path=join(payload,archive.executable);
  await directoryCheck(payload);const info=await regular(path);if(!(info.mode&0o111))fail('工具入口不可执行');return {path,version:tool.version};
 }
const directoryCheck=path=>directory(path);
async function commitCandidate(pending,target,{signal,verify}={}){
 const supplied=resourceSupplies.getStore();if(supplied){if(typeof supplied.publishCandidate!=='function')fail('供给未交付提交能力');return supplied.publishCandidate(pending,target);}

 // 下载与编译已完成后才取得短锁；等待可取消，已有对象永不覆盖。
 const lock=target+'.lock';let handle;for(let n=0;n<500;n++){signal?.throwIfAborted();try{handle=await open(lock,'wx',0o600);break;}catch(e){if(e.code!=='EEXIST')throw e;await new Promise(r=>setTimeout(r,20));}}if(!handle)fail('原件提交锁等待超限');
 try{signal?.throwIfAborted();if(await stat(target)){if(verify)await verify(target);}else await rename(pending,target);}finally{await handle.close();await rm(lock);}
}
async function installTool(library,tool,options){
 const archive=toolArchive(tool);if(library.installed.has('node'))return library.installed.get('node');
 const supplied=resourceSupplies.getStore();
 if(supplied&&!supplied.preparingTool){const value=await supplied.acquireTool(supplyRequirements().tools[0]);library.installed.set('node',value);return value;}
 const shared=join(library.root,'shared');await directory(shared,true);
 const target=join(shared,archive.sha256+'-'+objectRecipe(tool)),verify=path=>verifyToolObject(path,tool);
 let value=await verify(target);
 if(value){library.installed.set('node',value);return value;}
 if(options.offline)fail('离线缺少锁定Node');
 const pending=await fixedScratch(join(await resourceWork(library.work),'.'+archive.sha256+'-'));
 const canonical=join(pending,'library/shared',archive.sha256+'.pending'),payload=join(canonical,'payload'),original=join(canonical,'archive');
 await directory(canonical,true);
 try{
  const source=await acquireArchive(archive,{work:library.work,store:join(library.root,'archives'),optional:options.optionalDependencies,offline:options.offline,fetcher:options.fetcher,signal:options.signal});
  await copyFile(source,original);
  const unpacked=join(canonical,'unpack');await extractArchive(original,unpacked,{signal:options.signal});
  const content=join(unpacked,archive.root);await directory(content);await rename(content,payload);
  await permissions(payload,false);options.signal?.throwIfAborted();
  await commitCandidate(canonical,target,{signal:options.signal,verify});value=await verify(target);
  library.installed.set('node',value);return value;
 }finally{if(await stat(pending)){await permissions(pending,true);await rm(pending,{recursive:true});}}
}
async function checkedLock(path){await regular(path);const s=await lstat(path);if(s.size>32*1024**2)fail('锁文件超限');return readFile(path,'utf8');}
async function packageOriginal(entry,options){return acquireArchive(entry,{work:options.library.work,store:join(options.dependencyRoot||join(options.library.root,'..','rely'),'archives'),optional:options.optionalDependencies,offline:options.offline,fetcher:options.fetcher,signal:options.signal});}
function bundledOwner(packages,path,entry){
 if(entry?.inBundle!==true||!entry.version)fail('npm内置包身份无效');
 let owner=path;
 for(;;){
  const marker=owner.lastIndexOf('/node_modules/');if(marker<0)fail('npm内置包没有准确上游');
  owner=owner.slice(0,marker);const parent=packages[owner];if(!parent?.version)fail('npm内置包上游缺失');
  if(parent.resolved&&parent.integrity)return owner;
  if(parent.inBundle!==true)fail('npm内置包上游未锁定');
 }
}
async function prepareNpm(locks,work,options){
 const cache=join(work,'npm');await directory(cache,true);
 const node=options.library.installed.get('node').path,require=createRequire(join(dirname(node),'../lib/node_modules/npm/bin/npm-cli.js')),cacache=require('cacache');
 for(const lock of locks){
  const document=JSON.parse(await checkedLock(lock));if(![2,3].includes(document.lockfileVersion)||!document.packages)fail('npm原始锁格式无效');
  for(const [path,entry]of Object.entries(document.packages)){
   if(!path||entry.link)continue;
   // inBundle 成员从上游锁定 tarball 取得，不存在单独 URL/SRI；逐层核对父包身份。
   if(entry.inBundle===true){bundledOwner(document.packages,path,entry);continue;}
   if(!entry.resolved||!entry.integrity||!entry.version)fail('npm包未锁定来源');
   const file=await packageOriginal({url:entry.resolved,integrity:entry.integrity},options);
   await cacache.put(join(cache,'_cacache'),'make-fetch-happen:request-cache:'+entry.resolved,await readFile(file),{integrity:entry.integrity,metadata:{time:Date.now(),url:entry.resolved,reqHeaders:{},resHeaders:{'content-type':'application/octet-stream'}}});
  }
 }
 return {npmCache:cache};
}
// 可选供给遵循唯一原件协议，产品独立解析本仓锁，拒绝旧快照和状态库回退。
async function readDependencySupply(objects) {
 if(!objects||!await stat(objects))return null;await directory(objects);const file=join(dirname(objects),'index.json');await regular(file);
 if((await lstat(file)).size>32*1024**2)fail('可选原件索引超限');const value=JSON.parse(await readFile(file,'utf8'));
 if(!value||typeof value!=='object'||Array.isArray(value)||JSON.stringify(Object.keys(value).sort())!==JSON.stringify(['git_sources','packages','pods','schema_version'])||value.schema_version!==2||!Array.isArray(value.packages)||!Array.isArray(value.git_sources)||!Array.isArray(value.pods))fail('可选原件索引协议无效');return value;
}
function resourceDeclarations(){return {tools:toolDefinitions};}
// 完整入口可由调用方的启动Node进入；产品自行取得锁定Node并重新进入自己的入口。
// 启动Node只执行内置下载/摘要/解包，不成为产品编译工具版本的第二真源。
async function bootstrapNode(work,options={}) {
 const owner=buildPublic;owner.checkWork(work);const environment=options.environment||process.env;
 if(process.platform!=='darwin'||process.arch!=='arm64')fail('本机入口仅支持声明的macOS ARM宿主');
 const store=options.storeRoot||join(homedir(),'.local/share/product-resources');
 if(inside(root,store)||inside(store,root)||inside(work,store)||inside(store,work)||store===work)fail('启动原件库边界交叉');
 const library={root:join(store,'tools'),work,tools:toolDefinitions,installed:new Map()};await directory(library.root,true);
 const context={environment,offline:false,fetcher:fetch,...options,library,
  optionalDependencies:environment.PRODUCT_DEPENDENCY_ROOT?join(environment.PRODUCT_DEPENDENCY_ROOT,'objects'):undefined};
 return installTool(library,toolDefinitions.find(x=>x.id==='node'),context);
}

async function resources(platform,work,previous={},options={}){
 if(options.supply){const receipt=await options.supply(previous);if(receipt?.run_id!==previous.run_id)fail('资源供给任务身份不符');const owner=buildPublic;owner.resourceEnvironment(platform,work,receipt,options.environment||{});return receipt;}
 return materializeResources(platform,work,previous,options);
}
async function prepareResourceSupply(platform,work,previous,options){
 if(!options||typeof options.acquireOriginal!=='function'||!options.toolRoot||!options.dependencyRoot)fail('供给准备缺少公开能力');
 const receipt=await resourceSupplies.run({...options,work},()=>materializeResources(platform,work,previous,options));
 receipt.environment??={};receipt.environment["CITIZENWEB_RESOURCE_MODE"]='provided';return receipt;
}
async function materializeResources(platform,work,previous={},options={}){
 const owner=buildPublic;owner.checkWork(work);const request=()=>owner.requirements(platform,work);const requirement=request(),environment=options.environment||process.env;
 if(previous.schema!==undefined&&(previous.schema!==1||previous.product_id!==requirement.product_id||previous.platform!==platform||previous.work!==work))fail('资源请求身份无效');options={environment,fetcher:fetch,offline:false,...options};options.signal?.throwIfAborted();
 const store=options.storeRoot||join(homedir(),'.local/share/product-resources'),optionalDependencies=options.dependencyRoot?join(options.dependencyRoot,'objects'):environment.PRODUCT_DEPENDENCY_ROOT?join(environment.PRODUCT_DEPENDENCY_ROOT,'objects'):undefined;
 await directory(store,true);if(inside(root,store)||inside(store,root)||inside(work,store)||inside(store,work)||store===work)fail('原件库与源码或工作区交叉');
 // tools承载工具发行件/编译输入，rely承载产品依赖原件；不把可写任务缓存混入任一原件库。
 const library={root:options.toolRoot||join(store,'tools'),work,tools:toolDefinitions,requested:requirement.tools,installed:new Map()};await directory(library.root,true);options={...options,platform,optionalDependencies,library,dependencyRoot:options.dependencyRoot||join(store,'rely'),sources:requirement.sources};
 for(const request of requirement.tools){const definition=toolDefinitions.find(x=>x.id===request.id);if(!definition||definition.version!==request.version)fail('需求与产品自己的工具配方不一致：'+request.id);}
 // Web 的完整构建只执行锁定 Node/npm 与本仓 npm 原锁；不准备原生源码工具链。
 const node=toolDefinitions.find(x=>x.id==='node');if(process.platform!=='darwin'||process.arch!=='arm64')fail('本机资源配方仅支持已声明macOS ARM宿主');await installTool(library,node,options);if(hash(await readFile(process.execPath))!==hash(await readFile(library.installed.get('node').path)))fail('运行Node不是产品声明的官方入口字节');
 const receipt={schema:1,product_id:requirement.product_id,platform,work,tools:Object.fromEntries(library.installed),dependencies:{},archives:{},environment:{},offline:true};for(const key of ['run_id','program_digest'])if(previous[key]!==undefined)receipt[key]=previous[key];
 receipt.environment={PATH:dirname(library.installed.get('node').path),PRODUCT_WORK_DIR:work};
 if(requirement.sources.length||requirement.archives.length||requirement.locks.length!==1
  ||requirement.locks[0].ecosystem!=='npm'||requirement.locks[0].path!=='package-lock.json')fail('Web资源闭包越出本产品npm原锁');
 const target=join(work,'dependencies/own');await directory(target,true);
 receipt.dependencies.own={request:JSON.stringify(requirement.locks),...await prepareNpm([join(root,'package-lock.json')],target,options)};
 options.signal?.throwIfAborted();if(JSON.stringify(request())!==JSON.stringify(requirement)){if((options.depth||0)>=8)fail('资源递归闭包超限');return materializeResources(platform,work,receipt,{...options,depth:(options.depth||0)+1});}owner.resourceEnvironment(platform,work,receipt,cleanEnvironment(environment));return receipt;
}

// 公开声明与候选配方；供给对象的领取、提交及删除只由调度方实现。
function supplyRequirements(){
 const node=toolDefinitions.find(tool=>tool.id==='node');
 return {tools:[{...node,slots:[node.archive.executable]}]};
}
function assertWorkQuiescent(work){for(const pid of supplyGroups.get(work)||[])try{process.kill(-pid,0);fail('资源工具退出未确认');}catch(error){if(error.code!=='ESRCH')throw error;}if(retainedResourcePath(work))fail('资源工具退出未确认');}
async function prepareToolSupply(tool,{original,payload,work,signal,offline,acquireOriginal,publishCandidate,environment}){
 if(tool?.id!=='node'||tool.version!==toolDefinitions[0].version
   ||JSON.stringify(tool.archive)!==JSON.stringify(toolDefinitions[0].archive)
   ||JSON.stringify(tool.requires)!=='[]')fail('Web工具配方只接受锁定Node');
 const at=await fixedScratch(join(work,'.tool-recipe-'+tool.id+'-'+randomUUID()));
 const library={root:at,work,tools:toolDefinitions,installed:new Map(),requested:[],};
 const context={work,toolRoot:at,dependencyRoot:join(work,'dependencies'),acquireOriginal,publishCandidate,preparingTool:true};
 try{return await resourceSupplies.run(context,async()=>{
  const value=await installTool(library,toolDefinitions[0],{library,signal,offline,environment});
  const built=value.path.slice(0,-tool.archive.executable.length-1);await chmod(built,0o700);await rm(payload,{recursive:true,force:true});await rename(built,payload);
  return {schema:1,id:tool.id,version:tool.version,payload,original};
 });}finally{assertWorkQuiescent(work);await rm(at,{recursive:true,force:true});}
}

// Build 仅公开 Node、npm 原锁所需的资源能力；门禁策略归门禁文件。
const resourceSupport=Object.freeze({root,hash,safePath,inside,stat,regular,directory,permissions,directoryCheck,retainedResourcePath,toolDefinitions,toolArchive,objectRecipe,verifyToolObject,prepareNpm,bundledOwner,cleanEnvironment,runResourceProcess,inventory,acquireArchive,extractArchive,resources,rm});

return Object.freeze({runResourceProcess,inventory,acquireArchive,extractArchive,readDependencySupply,resourceDeclarations,bootstrapNode,resources,prepareResourceSupply,supplyRequirements,assertWorkQuiescent,prepareToolSupply,resourceSupport});
})();
export const {runResourceProcess,inventory,acquireArchive,extractArchive,readDependencySupply,resourceDeclarations,bootstrapNode,resources,prepareResourceSupply,supplyRequirements,assertWorkQuiescent,prepareToolSupply,resourceSupport}=resourceRuntime;

export function productTestSources(){return ['scripts/build.mjs'];}
export async function productTests({signal}={}){
 if(process.version!=='v'+JSON.parse(readFileSync(join(root,'package.json'),'utf8')).engines.node)fail('产品测试Node版本无效');
 const sources=productTestSources();const environment={PATH:dirname(process.execPath),LANG:'C.UTF-8',LC_ALL:'C.UTF-8',HOME:checkFixedWork(fixedWork('test'),{create:true})};
 const files=[];
 for(const source of sources){
  const result=await runBuildProcess(process.execPath,['--test','--test-reporter=tap',source],environment,root,{capture:true,signal,timeout:3600000});
  process.stderr.write(result.stdout+result.stderr);
  const number=label=>{const matches=[...result.stdout.matchAll(new RegExp('^# '+label+' (\\d+)$','gm'))];if(matches.length!==1)fail('产品测试计数缺失：'+label);return Number(matches[0][1]);};
  const counts={tests:number('tests'),passed:number('pass'),failed:number('fail'),skipped:number('skipped'),todo:number('todo'),cancelled:number('cancelled')};
  if(!counts.passed||counts.failed||counts.skipped||counts.todo||counts.cancelled||counts.tests!==counts.passed)fail('产品测试未完整成功：'+source);
  files.push({path:join(root,source),counts});
 }
 const counts=Object.fromEntries(Object.keys(files[0].counts).map(key=>[key,files.reduce((total,file)=>total+file.counts[key],0)]));
 return {schema:1,product_id:'citizenweb',platform:'web',sources,counts,files};
}

// HTTPS开发服务只终止本次领取的进程组；端口被占用由Vite准确失败，不清理其它进程。
export async function startDevelopment({port=5199,signal,environment=process.env}={}){
 if(!Number.isSafeInteger(port)||port<1||port>65535||process.version!=='v'+JSON.parse(readFileSync(join(root,'package.json'),'utf8')).engines.node)fail('官网启动端口或Node版本无效');
 for(const name of ['CITIZENWEB_TLS_CERT_FILE','CITIZENWEB_TLS_KEY_FILE'])if(typeof environment[name]!=='string'||!isAbsolute(environment[name]))fail('官网HTTPS材料路径无效');
 const work=fixedWork('build/web'),node=process.execPath,npmCli=join(dirname(node),'../lib/node_modules/npm/bin/npm-cli.js');
 return withFixedWork('build/'+Object.keys(contract.platforms)[0],async()=>{
  const project=createView(root,join(work,'source'));
  for(const name of ['home','cache'])mkdirSync(join(work,name),{recursive:true});
  const env={PATH:dirname(node),HOME:join(work,'home'),LANG:'C.UTF-8',LC_ALL:'C.UTF-8',npm_config_cache:join(work,'cache/npm'),
   CITIZENWEB_TLS_CERT_FILE:environment.CITIZENWEB_TLS_CERT_FILE,CITIZENWEB_TLS_KEY_FILE:environment.CITIZENWEB_TLS_KEY_FILE};
  await runBuildProcess(node,[npmCli,'ci','--ignore-scripts','--no-audit','--no-fund'],env,project,{signal});
  await runBuildProcess(node,[packageBinary(project,'vite','vite'),'--config','config/vite.config.ts','--host','127.0.0.1','--port',String(port),'--strictPort'],env,project,{signal,timeout:24*60*60*1000});
 },{environment:{}});
}

// CLI拒绝必须真实失败，不能留成未完成顶层await或输出成功回执。
if(!(process.env.NODE_TEST_CONTEXT && process.argv.length === 2) && process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 void runCLI().catch(error=>{console.error(error);process.exitCode=1;});
}

// Web编译边界由当前产品真实文件检验；错误源不运行npm。
if(process.env.NODE_TEST_CONTEXT&&process.argv.length===2&&process.argv[1]===import.meta.filename){
 const {test}=await import('node:test'),{default:assert}=await import('node:assert/strict');
 test('产品源码视图内编译拒绝版本输入漂移',async()=>{
  await withFixedWork('test',async work=>{
   const project=createView(root,join(work,'web-source'));
   const packageFile=join(project,'package.json'),value=JSON.parse(readFileSync(packageFile,'utf8'));value.version='9.9.9';writeFileSync(packageFile,JSON.stringify(value));
   await assert.rejects(compileWeb(project,work,{node:process.execPath,npmCli:'/invalid/npm-cli.js',offline:true}),/源码视图不属于本产品/u);
   assert.equal(lstatSync(join(work,'stage/compile'),{throwIfNoEntry:false}),undefined);
  });
 });
 test('HTTPS启动在任何资源获取前拒绝错误输入',async()=>{
  await assert.rejects(startDevelopment({port:0,environment:{}}),/端口或Node/u);
  await assert.rejects(startDevelopment({port:5199,environment:{}}),/HTTPS材料/u);
 });
}

// 正式实现结束；仅直接使用 node --test 执行本文件时注册以下回归。
if (process.env.NODE_TEST_CONTEXT && process.argv.length === 2 && !process.execArgv.some(value=>/^(?:-e|--eval(?:=|$)|--input-type(?:=|$))/u.test(value)) && process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL((await import('node:path')).resolve(process.argv[1])).href) {

// 产品独立入口：真实只读需求、资源身份、路径隔离与锁定归档失败关闭。
const {test} = await import('node:test');
const {spawnSync} = await import('node:child_process');
const {default:assert} = await import('node:assert/strict');
const {existsSync,lstatSync,mkdtempSync,readFileSync,readdirSync,realpathSync,rmSync,mkdirSync,symlinkSync,writeFileSync} = await import('node:fs');
const tmpdir = testRoot;
const {dirname,join,resolve} = await import('node:path');


const {default:fs}=await import('node:fs');

// 本产品测试使用固定根；资源夹具的内部目录不成为另一套工作根。
const scripts=import.meta.dirname;
function fixtureWork(){const work=fixedWork('build/'+Object.keys(contract.platforms)[0]);if(fs.existsSync(work))finishFixedWork(work);return checkFixedWork(work,{create:true});}
function removeFixture(path,options={}){if(path===fixedWork('build/'+Object.keys(contract.platforms)[0])||path===fixedWork('test')){if(fs.existsSync(path))clearFixedWork(path);return;}fs.rmSync(path,options);}

function writeFixture(path,data,options){
 fs.writeFileSync(path,data,options);
}

function copyFixture(source,destination,...options){
 fs.copyFileSync(source,destination,...options);
}

const sandbox=fixtureWork;
const root=resolve(import.meta.dirname,'..');
const fixture=work=>{
 const platform='web',own={npmCache:join(work,'npmCache')};mkdirSync(own.npmCache);
 return {schema:1,product_id:contract.product_id,platform,work,offline:true,
 tools:Object.fromEntries(contract.platforms[platform].tools.map(tool=>[tool.id,{version:tool.version,path:process.execPath}])),
 dependencies:{own},archives:{},environment:{PATH:dirname(process.execPath),PRODUCT_WORK_DIR:work}};
};
test('GitHub检出提交仅接受独立HEAD中的准确SHA',()=>{
 const work=sandbox(),git=join(work,'.git'),head=join(git,'HEAD');try{
  mkdirSync(git);writeFixture(head,'a'.repeat(40)+'\n');assert.equal(checkoutSHA(work),'a'.repeat(40));
  writeFixture(head,'ref: refs/heads/main\n');assert.throws(()=>checkoutSHA(work),/提交身份/u);
  rmSync(head);symlinkSync(join(work,'outside'),head);assert.throws(()=>checkoutSHA(work),/提交身份|ENOENT/u);
 }finally{removeFixture(work,{recursive:true});}
});
test('官网白皮书静态正文保留图片且缺少原件时失败',async()=>{
 const {whitepaperContent}=await import('../config/vite.config.ts');
 const source='# 白皮书\n<img src="./assets/diagram.png">';
 const output=JSON.parse(whitepaperContent(source,name=>{
  assert.equal(name,'diagram.png');return Buffer.from('image bytes');
 }));
 assert.equal(output.markdown,'# 白皮书\n<img src="data:image/png;base64,aW1hZ2UgYnl0ZXM=">');
 assert.throws(()=>whitepaperContent(source,()=>{throw Error('图片原件缺失');}),/图片原件缺失/);
});
test('Web只从本仓npm原锁只读提出准确需求',async()=>{
 const work=sandbox();try{const before=readdirSync(work),result=await requirements('web',work);
  assert.equal(result.product_id,'citizenweb');assert.equal(result.schema,1);assert.equal(result.platform,'web');
  assert.deepEqual(result.locks,[{ecosystem:'npm',path:'package-lock.json'}]);assert.deepEqual(result.sources,[]);assert.deepEqual(result.archives,[]);
  assert.ok(result.tools.every(value=>value.id&&value.version));assert.deepEqual(readdirSync(work),before);
 }finally{removeFixture(work,{recursive:true});}
});
test('平台、源码内工作根和链接工作根在任何写入前拒绝',async()=>{
 const work=sandbox();try{
  await assert.rejects(async()=>requirements('unknown',work),/平台/);
  assert.throws(()=>checkWork(root),/本产品target/);
  mkdirSync(join(work,'actual'));symlinkSync(join(work,'actual'),join(work,'linked'));
  assert.throws(()=>checkWork(join(work,'linked')),/固定目录/);
 }finally{removeFixture(work,{recursive:true});}
});
test('资源回执隔离产品、平台、工作根，准确工具版本且禁止注入',()=>{
 const work=sandbox();try{
  const receipt=fixture(work),platform=receipt.platform;
  assert.throws(()=>resourceEnvironment(platform,work,{...receipt,product_id:'another'}),/身份/);
  assert.throws(()=>resourceEnvironment(platform,work,{...receipt,offline:false}),/身份/);
  assert.throws(()=>resourceEnvironment(platform,work,{...receipt,tools:{}}),/工具/);
  assert.throws(()=>resourceEnvironment(platform,work,{...receipt,tools:{...receipt.tools,git:receipt.tools.node}}),/闭包/);
  assert.throws(()=>resourceEnvironment(platform,work,{...receipt,environment:{NODE_OPTIONS:'--inspect'}}),/注入/);
  const id=Object.keys(receipt.tools)[0];assert.throws(()=>resourceEnvironment(platform,work,{...receipt,tools:{...receipt.tools,[id]:{...receipt.tools[id],version:'wrong'}}}),/版本/);
  const env=resourceEnvironment(platform,work,receipt,{HOME:'/home',TOKEN:'private',INJECTED_CONTEXT:'/private'});
  assert.equal(env.TOKEN,undefined);assert.equal(env.INJECTED_CONTEXT,undefined);assert.equal(env.npm_config_offline,'true');
  assert.equal(env[contract.product_id.toUpperCase()+'_WORK_DIR'],work);
 }finally{removeFixture(work,{recursive:true});}
});
test('原始锁需要的依赖必须显式交付，不能使用用户默认缓存',()=>{
 const work=sandbox();try{
  const receipt=fixture(work),own=receipt.dependencies.own;
  for(const key of Object.keys(own)){const missing={...own};delete missing[key];
   assert.throws(()=>resourceEnvironment(receipt.platform,work,{...receipt,dependencies:{own:missing}}),/依赖回执/);}
  const key=Object.keys(own)[0];if(key){
   const linked=join(work,'linked');symlinkSync(own[key],linked);
   assert.throws(()=>resourceEnvironment(receipt.platform,work,{...receipt,dependencies:{own:{...own,[key]:linked}}}),/依赖回执/);
  }
 }finally{removeFixture(work,{recursive:true});}
});
test('工程复制在同轮解析包并隔离写入，内部链接重新指向副本',()=>{
 const work=sandbox();try{
  const source=join(work,'input'),output=join(work,'view');mkdirSync(source);
  writeFixture(join(source,'package.json'),'{"name":"input"}');
  writeFixture(join(source,'code.js'),'source');symlinkSync('code.js',join(source,'linked.js'));
  mkdirSync(join(source,'node_modules'));writeFixture(join(source,'node_modules/old'),'generated');
  createView(source,output);writeFixture(join(output,'package.json'),'{"name":"generated"}');
  assert.equal(readFileSync(join(source,'package.json'),'utf8'),'{"name":"input"}');
  assert.equal(realpathSync(join(output,'linked.js')),join(output,'code.js'));
  assert.equal(existsSync(join(output,'node_modules')),false);
  assert.throws(()=>createView(source,output),/已存在/);
 }finally{removeFixture(work,{recursive:true});}
});
test('工程输出的父链接和输入外部链接均拒绝，不能写入第三方目录',()=>{
 const work=sandbox();try{
  const source=join(work,'source'),external=join(work,'external');mkdirSync(source);mkdirSync(external);
  writeFixture(join(source,'code'),'source');symlinkSync(external,join(work,'linked'));
  assert.throws(()=>createView(source,join(work,'linked/view')),/链接/);assert.deepEqual(readdirSync(external),[]);
  symlinkSync('/etc/passwd',join(source,'outside'));
  assert.throws(()=>createView(source,join(work,'bad-view')),/越界/);
 }finally{removeFixture(work,{recursive:true});}
});
test('未经本产品锁声明的归档回执不能用于编译',async()=>{
 const work=sandbox();try{
  const receipt=fixture(work);
  // 同一工具回执不能为归档注入增加来源；验证在任何暂存写入前结束。
  await assert.rejects(checkArchives(receipt.platform,work,{...receipt,archives:{injected:[{name:'unknown',version:'1.0.0',url:'https://example.invalid/archive',sha256:'a'.repeat(64),path:join(work,'missing')}]}}),/原生归档/u);
 }finally{removeFixture(work,{recursive:true});}
});

// 真实命令行只读自身入口；清除私有环境与工具搜索路径，不能从控制台补齐执行条件。
test('独立命令行从自身声明输出JSON，未知平台失败且不写工作根',async()=>{
 const work=sandbox();try{
  for(const platform of Object.keys(contract.platforms)){
   const before=readdirSync(work),result=spawnSync(process.execPath,[join(root,'scripts/build.mjs'),'requirements',platform,'--work',work],{env:{HOME:work,LANG:'C',LC_ALL:'C',NODE_TEST_CONTEXT:process.env.NODE_TEST_CONTEXT,PRODUCT_TEST_SESSION:testSession},encoding:'utf8'});
   assert.equal(result.status,0,result.stderr);const value=JSON.parse(result.stdout);assert.equal(value.product_id,contract.product_id);assert.equal(value.platform,platform);
   assert.deepEqual(readdirSync(work),before);
  }
  const invalid=spawnSync(process.execPath,[join(root,'scripts/build.mjs'),'requirements','unknown','--work',work],{env:{HOME:work,NODE_TEST_CONTEXT:process.env.NODE_TEST_CONTEXT,PRODUCT_TEST_SESSION:testSession},encoding:'utf8'});
  assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/平台/);
 }finally{removeFixture(work,{recursive:true});}
});

// 完整入口控制边界：替身只替换耗时阶段，不调用真实编译或用户安全存储。
test('产品独立execute完成全部自有阶段后才返回唯一结果',async()=>{
 const work=sandbox(),platform=Object.keys(contract.platforms)[0],declared=contract.platforms[platform],calls=[];
 try{
  const result={schema:1,product_id:contract.product_id,platform,work,completion:declared.completion,run_id:'123456789',files:[]};
  const stages={requirements:async()=>{calls.push('requirements');},resources:async()=>{calls.push('resources');return {};},prepare:async()=>{calls.push('prepare');},build:async()=>{
   calls.push('build');for(const name of declared.files){const path=join(work,name);mkdirSync(dirname(path),{recursive:true});writeFixture(path,'isolated-candidate-fixture');result.files.push({path,sha256:outputDigest(path)});}return result;
  }};
  assert.deepEqual(await execute(platform,work,{run_id:'123456789'},{stages}),result);
  assert.deepEqual(calls,['requirements','resources','prepare','requirements','resources','build']);
  assert.equal(existsSync(work),false,'独立执行结束必须删除本轮现场');
  result.files=[]; calls.length=0;
  assert.deepEqual(await execute(platform,work,{run_id:'123456789'},{stages}),result);
  assert.equal(existsSync(work),false,'下一轮结束仍须删除本轮现场');
 }finally{removeFixture(work,{recursive:true});}
});
test('失败、取消、并发和伪造终态不能复用工作根或留下成功回执',async()=>{
 const platform=Object.keys(contract.platforms)[0];
 for(const failure of ['resources','prepare','build','identity','cancel']){
  const work=sandbox(),abort=new AbortController(),calls=[];
  try{
   const stages={requirements:()=>{},resources:async()=>{calls.push('resources');if(failure==='resources')throw Error('fixture failure');return {};},prepare:async()=>{calls.push('prepare');if(failure==='prepare')throw Error('fixture failure');if(failure==='cancel')abort.abort();},build:async()=>{calls.push('build');if(failure==='build')throw Error('fixture failure');return {schema:1,product_id:'forged'};}};
   await assert.rejects(execute(platform,work,{}, {stages,signal:abort.signal}));
   assert.equal(existsSync(join(work,'build-result.json')),false);assert.equal(existsSync(join(work,'.product-build.lock')),false);
   if(['resources','prepare','cancel'].includes(failure))assert.equal(calls.includes('build'),false);
  }finally{removeFixture(work,{recursive:true});}
 }
 const work=sandbox();try{writeFixture(join(work,'.product-build.lock'),'owned');await assert.rejects(execute(platform,work,{}));assert.equal(readFileSync(join(work,'.product-build.lock'),'utf8'),'owned');}finally{rmSync(join(work,'.product-build.lock'),{force:true});removeFixture(work,{recursive:true});}
});

test('产品取消等待工具进程组退出，不提前交付结果',async()=>{
 const work=sandbox(),abort=new AbortController();let polling,deadline;
 try{
  const pidFile=join(work,'descendant.pid');
  const script="const fs=require('node:fs'),{spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(process.argv[1],String(child.pid));setInterval(()=>{},1000);";
  const execution=runBuildProcess(process.execPath,['-e',script,pidFile],process.env,work,{capture:true,signal:abort.signal,timeout:5000});
  polling=setInterval(()=>{if(existsSync(pidFile))abort.abort();},20);deadline=setTimeout(()=>abort.abort(),2000);
  await assert.rejects(execution,/取消/);assert.ok(existsSync(pidFile));const pid=Number(readFileSync(pidFile,'utf8'));
  assert.throws(()=>process.kill(pid,0),error=>error.code==='ESRCH');
 }finally{clearInterval(polling);clearTimeout(deadline);removeFixture(work,{recursive:true});}
});

// 覆盖独立入口、单/多平台物理边界和源码输入排除，统一测试阶段才执行。
test('本仓target由当前平台声明决定，外部或链接工作根不能越界',()=>{
 for(const platform of Object.keys(contract.platforms)){
  const expected=join(root,'target');
  assert.equal(productTarget(platform),expected);
 }
 assert.throws(()=>productTarget('undeclared-platform'));
 assert.throws(()=>checkWork(join(root,'..','foreign-work')),/target/);
 assert.throws(()=>checkWork(join(root,'target')),/target/);
 const work=sandbox();try{assert.equal(checkWork(work),work);assert.throws(()=>checkWork(join(work,'nested')),/固定目录/);}finally{removeFixture(work,{recursive:true,force:true});}
});


// 公开入口独立交付唯一声明，错误参数在获取资源前拒绝。
test('Build公开声明、普通导入与错误命令边界',()=>{
 const file=join(root,'scripts/build.mjs'),options={cwd:root,env:{PATH:dirname(process.execPath),LANG:'C.UTF-8'},encoding:'utf8',timeout:5000};
 const imported=spawnSync(process.execPath,['--input-type=module','--eval',
  "await import("+JSON.stringify(file)+");process.stdout.write('module-ready\\n');"],options);
 assert.equal(imported.status,0);assert.equal(imported.stdout,'module-ready\n');
 const described=spawnSync(process.execPath,[file,'describe'],options);
 assert.equal(described.status,0);assert.deepEqual(JSON.parse(described.stdout),contract);
 for(const args of [['describe','extra'],['package','unknown','--work',fixedWork('build')],['test','web','--work',fixedWork('build')]]){
  const result=spawnSync(process.execPath,[file,...args],options);assert.notEqual(result.status,0);assert.equal(result.stdout,'');
 }
});

async function nodeProjectFixture(t) {

 const root=realpathSync(mkdtempSync(join(tmpdir(),'product-node-view-')));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const product=join(root,'repo with spaces/product'),cache=join(root,'work'),view=join(cache,'source-view');
 mkdirSync(join(product,'src'),{recursive:true});mkdirSync(cache);
 writeFixture(join(product,'package.json'),'{"type":"module"}');
 writeFixture(join(product,'src/main.js'),'export {default} from "fixture-dependency";\n');
 const execute=(input=product,output=view)=>createView(input,output);
 return {root,product,cache,view,execute};
}
test('产品Node输入与依赖同根解析，构建写入不改变主检出',async t=>{
 const {product,view,execute}=await nodeProjectFixture(t),original=readFileSync(join(product,'src/main.js'),'utf8');
 execute();const dep=join(view,'node_modules/fixture-dependency');mkdirSync(dep,{recursive:true});
 writeFixture(join(dep,'package.json'),'{"type":"module","exports":"./index.js"}');writeFixture(join(dep,'index.js'),'export default 37;\n');
 const loaded=spawnSync(process.execPath,['--input-type=module','-e','import value from "./src/main.js"; if(value!==37)process.exit(2);'],{cwd:view,encoding:'utf8'});
 assert.equal(loaded.status,0,loaded.stderr);assert.equal(existsSync(join(product,'node_modules')),false);
 writeFixture(join(view,'src/main.js'),'export default 99;');assert.equal(readFileSync(join(product,'src/main.js'),'utf8'),original);
 assert.throws(()=>execute(),/已存在/);
});
test('产品Node输入保留本仓普通文件及内部链接，排除旧生成缓存',async t=>{
 const {product,view,execute}=await nodeProjectFixture(t);
 symlinkSync('main.js',join(product,'src/linked.js'));
 for(const name of ['.git','node_modules','dist']){mkdirSync(join(product,name));writeFixture(join(product,name,'old'),'generated');}
 writeFixture(join(product,'worker-configuration.d.ts'),'bindings');writeFixture(join(product,'tsconfig.tsbuildinfo'),'generated');
 execute();assert.equal(realpathSync(join(view,'src/linked.js')),join(view,'src/main.js'));
 for(const name of ['.git','node_modules','dist','tsconfig.tsbuildinfo'])assert.equal(existsSync(join(view,name)),false);
 writeFixture(join(view,'worker-configuration.d.ts'),'new');assert.equal(readFileSync(join(product,'worker-configuration.d.ts'),'utf8'),'bindings');
});
test('产品Node工程不自动镜像相邻产品、个人目录或私仓',async t=>{
 const {root,view,execute}=await nodeProjectFixture(t);
 for(const name of ['neighbor','Desktop','private-console']){mkdirSync(join(root,name));writeFixture(join(root,name,'private'),'excluded');}
 execute();for(const name of ['neighbor','Desktop','private-console'])assert.equal(existsSync(join(view,name)),false);
});
test('产品Node输入拒绝源码根链接、输出父链接和外部源码链接',async t=>{
 const {root,product,cache,execute}=await nodeProjectFixture(t),alias=join(root,'alias');
 symlinkSync(product,alias);assert.throws(()=>execute(alias,join(cache,'alias-view')),/边界/);
 const external=join(root,'external');mkdirSync(external);symlinkSync(external,join(cache,'linked'));
 assert.throws(()=>execute(product,join(cache,'linked/view')),/链接/);
 writeFixture(join(external,'code'),'external');symlinkSync(join(external,'code'),join(product,'src/escape'));
 assert.throws(()=>execute(),/越界/);assert.equal(readFileSync(join(external,'code'),'utf8'),'external');
});


// 完整宿主通道由调用方核验结果并收尾；独立执行仍必须立即清空。
test('宿主完整Build在调用方消费前保留成功或失败现场，独立入口仍清空',async()=>{
 const platform=Object.keys(contract.platforms)[0],declared=contract.platforms[platform];
 for(const [host,failure] of [['3',false],['3',true],['4',false],[undefined,false]]){
  const work=sandbox();try{
   let result;
   const stages={requirements:()=>{},resources:async()=>({}),prepare:async()=>{writeFixture(join(work,'partial'),'本轮现场');if(failure)throw Error('宿主失败夹具');},build:async()=>{
    result={schema:1,product_id:contract.product_id,platform,work,completion:declared.completion,run_id:'123456789',files:declared.files.map(name=>{const path=join(work,name);mkdirSync(dirname(path),{recursive:true});writeFixture(path,'当前产物');return {path,sha256:outputDigest(path)};})};return result;
   }};
   const pending=execute(platform,work,{run_id:'123456789'},{stages,environment:host?{PRODUCT_HOST_FD:host}:{}});
   if(failure)await assert.rejects(pending,/宿主失败夹具/);else assert.deepEqual(await pending,result);
   assert.equal(existsSync(join(work,'.product-build.lock')),false);
   if(host==='3'){
    assert.equal(existsSync(join(work,'partial')),true);
    if(!failure){assert.equal(existsSync(join(work,'build-result.json')),true);for(const file of result.files)assert.equal(outputDigest(file.path),file.sha256);}
    clearWork(work);
   }
   assert.equal(existsSync(work),false);
  }finally{removeFixture(work,{recursive:true,force:true});}
 }
});

}

// 供给模式只接收所属任务资源，通道失败不切换为独立准备。
export function createResourceSupplyClient(stream,signal){
 let buffer='',sequence=0,pending=null,closed=false;
 const reject=message=>{closed=true;if(pending){clearTimeout(pending.timer);pending.reject(Error(message));pending=null;}stream.destroy();};
 const abort=()=>reject('资源供给已取消');
 signal?.addEventListener('abort',abort,{once:true});
 stream.setEncoding?.('utf8');
 stream.on('data',chunk=>{buffer+=chunk.toString();if(Buffer.byteLength(buffer)>2*1024**2)return reject('资源供给回执超限');
  let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
   try{const reply=JSON.parse(line);if(!pending||reply.id!==pending.id||Object.keys(reply).sort().join(',')!==(reply.ok===true?'id,ok,value':'error,id,ok'))throw Error();
    const entry=pending;pending=null;clearTimeout(entry.timer);if(reply.ok!==true){entry.reject(Error(reply.error));reject('资源供给失败');return;}entry.resolve(reply.value);
   }catch{reject('资源供给帧或请求身份无效');return;}
  }
 });
 stream.on('error',()=>reject('资源供给通道失败'));stream.on('end',()=>reject('资源供给通道中断'));stream.on('close',()=>reject('资源供给通道中断'));
 const request=value=>new Promise((resolve,rejectPromise)=>{if(closed||pending||signal?.aborted)return rejectPromise(Error('资源供给不可用，禁止独立下载'));
  const id=String(++sequence),timer=setTimeout(()=>reject('资源供给超时'),7200000);pending={id,timer,resolve,reject:rejectPromise};
  stream.write(JSON.stringify({...value,id,operation:'prepare'})+'\n');
 });
 request.close=()=>{signal?.removeEventListener('abort',abort);reject('资源供给已关闭');};return request;
}

// 本仓本机编译正文只有此处一份；不生成独立编译脚本。

// 固定现场及资源所属回归由同一Build入口登记。
// 正式实现结束；仅直接使用 node --test 执行本文件时注册以下回归。
if (process.env.NODE_TEST_CONTEXT && process.argv.length === 2 && !process.execArgv.some(value=>/^(?:-e|--eval(?:=|$)|--input-type(?:=|$))/u.test(value)) && process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL((await import('node:path')).resolve(process.argv[1])).href) {
// 本产品真实固定目录入口的领取、并发拒绝、失败收尾与恢复验收。
const {default:test} = await import('node:test');
const {default:assert} = await import('node:assert/strict');
const {default:fs} = await import('node:fs');
const {join} = await import('node:path');
const {execFileSync} = await import('node:child_process');

const root=join(import.meta.dirname,'..');
const isEmpty=()=>assert.deepEqual(fs.readdirSync(fixedWork('test')),[]);

// 各平台并发领取自己的工作根，正常退出后只删除本平台目录。
test('平台编译现场独立领取且结束删除',async()=>{
 const platforms=Object.keys(contract.platforms).slice(0,2),joined=[];let release;const both=new Promise(resolve=>{release=resolve;});
 await Promise.all(platforms.map(platform=>withFixedWork('build/'+platform,async work=>{
  fs.writeFileSync(join(work,'platform'),platform);joined.push(platform);if(joined.length===platforms.length)release();
  await both;assert.equal(fs.readFileSync(join(work,'platform'),'utf8'),platform);
 })));
 assert.deepEqual(joined.sort(),platforms.sort());for(const platform of platforms)assert.equal(fs.existsSync(fixedWork('build/'+platform)),false);
});

test('固定根拒绝任意任务目录、平台目录和外部临时根',()=>{
 for(const path of [join(root,'target'),join(root,'target/test/other'),join(root,'target/macos/test'),join(root,'target/build/run-123'),'/tmp/test'])assert.throws(()=>checkFixedWork(path),/固定目录/);
});
test('成功入口清空全部现场并保留固定目录',async()=>{
 await withFixedWork('test',async work=>{fs.mkdirSync(join(work,'dependencies'));fs.writeFileSync(join(work,'dependencies/fixture'),'input');fs.chmodSync(join(work,'dependencies'),0o555);});isEmpty();assertTargetTopology();
});
test('失败入口同样清空，不由测试代替被测入口清理',async()=>{
 await assert.rejects(withFixedWork('test',async work=>{fs.writeFileSync(join(work,'partial'),'partial');throw Error('synthetic failure');}),/synthetic failure/);isEmpty();
});
test('第二个真实进程不能领取活跃固定根或清理前一任务',async()=>{
 await withFixedWork('test',async work=>{
  fs.writeFileSync(join(work,'sentinel'),'owned');
  const module=join(import.meta.dirname,'build.mjs');
  assert.throws(()=>execFileSync(process.execPath,['--input-type=module','-e','import {withFixedWork} from '+JSON.stringify(module)+'; await withFixedWork("test",()=>{});'],{env:{PATH:process.env.PATH,NODE_TEST_CONTEXT:process.env.NODE_TEST_CONTEXT,PRODUCT_TEST_SESSION:testSession},stdio:['ignore','pipe','pipe']}),/活跃任务/);
  assert.equal(fs.readFileSync(join(work,'sentinel'),'utf8'),'owned');
 });isEmpty();
});
test('活跃标记损坏时拒绝覆盖和清理',async()=>{
 await withFixedWork('test',async work=>{const path=join(work,'.active.json'),bytes=fs.readFileSync(path);fs.writeFileSync(path,'{}');try{assert.throws(()=>finishFixedWork(work),/身份无效/);}finally{fs.writeFileSync(path,bytes);}});isEmpty();
});
test('嵌套内部步骤使用同一个任务，外层结束才清空',async()=>{
 await withFixedWork('test',async work=>{await withFixedWork('test',async inner=>{assert.equal(inner,work);fs.writeFileSync(join(work,'nested'),'owned');});assert.equal(fs.readFileSync(join(work,'nested'),'utf8'),'owned');});isEmpty();
});

test('真实工具超时和取消后停止进程组并清场',async()=>{
 const {runResourceProcess}=await import('./build.mjs');
 const run=(work,signal,timeout)=>runResourceProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{cwd:work,env:{PATH:process.env.PATH,PRODUCT_WORK_DIR:work},signal,timeout});
 for(const kind of ['timeout','cancel']){await assert.rejects(withFixedWork('test',async work=>{fs.writeFileSync(join(work,'partial'),'partial');const abort=new AbortController();const timer=kind==='cancel'?setTimeout(()=>abort.abort(Error('synthetic cancel')),50):null;try{await run(work,abort.signal,kind==='timeout'?50:10000);}finally{clearTimeout(timer);}}),/超时|取消|synthetic cancel|失败/);isEmpty();}
});

test('清场删除断开的链接且不跟随链接删除其它固定根',async()=>{
 await withFixedWork('test',async testWork=>{const keep=join(testWork,'keep');fs.writeFileSync(keep,'protected');await withFixedWork('build/'+Object.keys(contract.platforms)[0],async buildWork=>{fs.symlinkSync(keep,join(buildWork,'external'));fs.symlinkSync(join(buildWork,'missing'),join(buildWork,'broken'));});assert.equal(fs.readFileSync(keep,'utf8'),'protected');assert.equal(fs.existsSync(fixedWork('build/'+Object.keys(contract.platforms)[0])),false);});isEmpty();
});

test('实际任务被强制终止后下一轮在同一固定根恢复并清场',async()=>{
 const {spawn}=await import('node:child_process');
 const module=join(import.meta.dirname,'build.mjs');
 const code='import {withFixedWork} from '+JSON.stringify(module)+';import fs from "node:fs";await withFixedWork("test",async work=>{fs.writeFileSync(work+"/interrupted","partial");process.stdout.write("ready");await new Promise(()=>{setInterval(()=>{},1000);});});';
 const child=spawn(process.execPath,['--input-type=module','-e',code],{env:{PATH:process.env.PATH,NODE_TEST_CONTEXT:process.env.NODE_TEST_CONTEXT,PRODUCT_TEST_SESSION:testSession},stdio:['ignore','pipe','pipe']});
 const finished=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('任务领取超时')),5000);child.once('error',reject);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});});child.kill('SIGKILL');assert.equal((await finished).signal,'SIGKILL');
  assert.equal(fs.readFileSync(join(fixedWork('test'),'interrupted'),'utf8'),'partial');
  await withFixedWork('test',async work=>{assert.equal(fs.existsSync(join(work,'interrupted')),false);fs.writeFileSync(join(work,'next'),'new task');});isEmpty();
 }finally{child.kill('SIGKILL');await finished;}
});

}

// 本产品收尾拒绝异任务与仍存活的资源后代。
if(process.env.NODE_TEST_CONTEXT&&process.argv.length===2&&process.argv[1]===import.meta.filename){
 const {test}=await import('node:test'),{default:assert}=await import('node:assert/strict'),{spawn}=await import('node:child_process'),fs=await import('node:fs');
 test('收尾必须匹配本轮编号并等待资源后代退出',async()=>{
  const work=fixedWork('test');await withFixedWork('test',()=>withFixedWork('test',async()=>{fs.writeFileSync(join(work,'keep'),'owned');},{run_id:'owned-run'}),{retain:true});
  assert.throws(()=>finishFixedWork(work,{run_id:'other-run'}),/任务编号/);assert.equal(fs.readFileSync(join(work,'keep'),'utf8'),'owned');
  const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'}),closed=new Promise(resolve=>child.once('close',resolve));
  const marker=join(work,'.supply-active.json');fs.writeFileSync(marker,JSON.stringify({pid:process.pid,groups:[child.pid]}));
  try{assert.throws(()=>finishFixedWork(work,{run_id:'owned-run'}),/退出未确认/);assert.equal(fs.readFileSync(join(work,'keep'),'utf8'),'owned');}
  finally{process.kill(-child.pid,'SIGTERM');await closed;fs.writeFileSync(marker,JSON.stringify({pid:process.pid,groups:[]}));finishFixedWork(work,{run_id:'owned-run'});}
  assert.deepEqual(fs.readdirSync(work),[]);
 });
}

// 正式实现结束；仅直接使用 node --test 执行本文件时注册以下回归。
if (process.env.NODE_TEST_CONTEXT && process.argv.length === 2 && !process.execArgv.some(value=>/^(?:-e|--eval(?:=|$)|--input-type(?:=|$))/u.test(value)) && process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL((await import('node:path')).resolve(process.argv[1])).href) {
// 使用真实文件事务与受控HTTPS数据，禁止测试下载或安装真实工具。
const {test} = await import('node:test');
const {default:assert} = await import('node:assert/strict');
const {createHash} = await import('node:crypto');
const {mkdtemp,realpath,mkdir,readFile,writeFile,readdir,rm,symlink,link,chmod,lstat,rename} = await import('node:fs/promises');
const {dirname,join,resolve} = await import('node:path');
const tmpdir=testRoot;
const {spawnSync} = await import('node:child_process');
const {gzipSync} = await import('node:zlib');


const hash=b=>createHash('sha256').update(b).digest('hex');
async function sandbox(t){const root=await realpath(await mkdtemp(join(tmpdir(),contract.product_id+'-resources-')));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
test('npm内置依赖必须可追溯到带SRI的准确父包',async()=>{
 const packages=JSON.parse(await readFile(join(root,'package-lock.json'),'utf8')).packages;
 const bundled=Object.entries(packages).filter(([,entry])=>entry.inBundle===true);
 assert.equal(bundled.length,6);
 for(const [path,entry]of bundled)assert.equal(resourceSupport.bundledOwner(packages,path,entry),'node_modules/@tailwindcss/oxide-wasm32-wasi');
 const [path,entry]=bundled[0],parent='node_modules/@tailwindcss/oxide-wasm32-wasi';
 assert.throws(()=>resourceSupport.bundledOwner({...packages,[parent]:{version:'4.2.2'}},path,entry),/上游未锁定/u);
 assert.throws(()=>resourceSupport.bundledOwner(packages,'node_modules/unknown/node_modules/child',entry),/上游缺失/u);
});
function tar(entries){const records=[];for(const {name,body='',type='0',target=''}of entries){const b=Buffer.from(body),h=Buffer.alloc(512);h.write(name,0,100);h.write('0000644\0',100);h.write('0000000\0',108);h.write('0000000\0',116);h.write(b.length.toString(8).padStart(11,'0')+'\0',124);h.write('00000000000\0',136);h.fill(32,148,156);h.write(type,156);h.write(target,157,100);h.write('ustar\0',257);h.write('00',263);h.write([...h].reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148);records.push(h,b,Buffer.alloc((512-b.length%512)%512));}return gzipSync(Buffer.concat([...records,Buffer.alloc(1024)]));}
const archive=(body,url='https://example.invalid/locked.tgz')=>({url,sha256:hash(body)});
test('首次按锁取得；再次复用不联网，损坏原件不覆盖',async t=>{
 const root=await sandbox(t),body=Buffer.from('locked-source'),entry=archive(body);let requests=0;
 const options={store:root,fetcher:async()=>{requests++;return new Response(body);}};
 const file=await acquireArchive(entry,options);assert.equal(await readFile(file,'utf8'),'locked-source');
 assert.equal(await acquireArchive(entry,{...options,offline:true,fetcher:()=>assert.fail('离线联网')}),file);assert.equal(requests,1);
 await chmod(file,0o600);await writeFile(file,'corrupt');await assert.rejects(acquireArchive(entry,options),/摘要/);assert.equal(requests,1);assert.equal(await readFile(file,'utf8'),'corrupt');
});
test('错摘要、错来源、离线缺失、来源越权均失败关闭且无正式原件',async t=>{
 const root=await sandbox(t),body=Buffer.from('source'),entry=archive(body);let requests=0;
 await assert.rejects(acquireArchive(entry,{store:root,offline:true,fetcher:()=>assert.fail('离线联网')}),/离线/);
 await assert.rejects(acquireArchive(entry,{store:root,fetcher:async()=>{requests++;return new Response('wrong');}}),/摘要/);
 await assert.rejects(acquireArchive({...entry,url:'http://example.invalid/source'},{store:root}),/HTTPS/);
 const file=await acquireArchive(entry,{store:root,fetcher:async()=>new Response(body)});
 await assert.rejects(acquireArchive({...entry,url:'https://example.invalid/other'},{store:root,offline:true}),/离线/);
 assert.equal(await readFile(file,'utf8'),'source');assert.equal(requests,1);assert.equal((await readdir(root)).filter(x=>x.endsWith('.pending')||x.endsWith('.lock')).length,0);
});
test('可选供给按准确内容摘要验真，独立运行不需要供给目录',async t=>{
 const root=await sandbox(t),store=join(root,'store'),optional=join(root,'objects'),body=Buffer.from('shared-source'),entry=archive(body),source=join(optional,entry.sha256+'.blob');await mkdir(dirname(source),{recursive:true});await writeFile(source,body);
 const file=await acquireArchive(entry,{store,optional,offline:true,fetcher:()=>assert.fail('供给命中联网')});assert.equal(await readFile(file,'utf8'),'shared-source');await writeFile(source,'altered');assert.equal(await readFile(file,'utf8'),'shared-source');
 await assert.rejects(acquireArchive(entry,{store:join(root,'other'),optional,offline:true}),/摘要/);
});
test('取消下载清理本次候选；短锁只在提交阶段取得',async t=>{
 const root=await sandbox(t),entry=archive(Buffer.from('ab')),abort=new AbortController();
 const fetcher=async()=>new Response(new ReadableStream({start(controller){controller.enqueue(Buffer.from('a'));abort.abort();controller.close();}}));
 await assert.rejects(acquireArchive(entry,{store:root,fetcher,signal:abort.signal}));assert.deepEqual(await readdir(root),[]);
 let state;const file=await acquireArchive(entry,{store:root,fetcher:async()=>{state=await readdir(root);return new Response('ab');}});assert.deepEqual(state,[]);assert.equal(await readFile(file,'utf8'),'ab');
});
test('同对象并发提交只保留一份验真原件，不留全局下载锁',async t=>{
 const root=await sandbox(t),body=Buffer.from('concurrent'),entry=archive(body);let calls=0;const options={store:root,fetcher:async()=>{calls++;await new Promise(r=>setTimeout(r,10));return new Response(body);}};
 const paths=await Promise.all(Array.from({length:8},()=>acquireArchive(entry,options)));assert.equal(new Set(paths).size,1);assert.equal(await readFile(paths[0],'utf8'),'concurrent');assert.equal(calls,8);assert.deepEqual(await readdir(root),[paths[0].slice(root.length+1)]);
});
test('归档安全解包并隔离不同任务，拒绝路径和链接越界',async t=>{
 const root=await sandbox(t),source=join(root,'source.tgz'),data=tar([{name:'package/a',body:'source'},{name:'package/b',type:'2',target:'a'}]);await writeFile(source,data);
 const first=join(root,'first'),second=join(root,'second');await extractArchive(source,first,{prefix:'package'});await extractArchive(source,second,{prefix:'package'});assert.equal(await realpath(join(first,'b')),join(first,'a'));await writeFile(join(first,'a'),'task1');assert.equal(await readFile(join(second,'a'),'utf8'),'source');
 for(const [name,entries]of [['path',[{name:'../outside',body:'x'}]],['link',[{name:'package/a',body:'x'},{name:'package/b',type:'2',target:'../../outside'}]],['parent',[{name:'package/a',type:'2',target:'b'},{name:'package/a/child',body:'x'},{name:'package/b',body:'x'}]]]){const file=join(root,name+'.tgz');await writeFile(file,tar(entries));await assert.rejects(extractArchive(file,join(root,name),{prefix:name==='path'?'':'package'}),/越界|父目录/);assert.equal((await readdir(root)).includes(name),false);}
});
test('链接原件目录、重复成员与解包取消拒绝且不写第三方目录',async t=>{
 const root=await sandbox(t),external=join(root,'external'),link=join(root,'link');await mkdir(external);await symlink(external,link);await assert.rejects(acquireArchive(archive(Buffer.from('source')),{store:link,offline:true}),/链接/);assert.deepEqual(await readdir(external),[]);
 const input=join(root,'input.tgz');await writeFile(input,tar([{name:'a',body:'x'},{name:'a',body:'y'}]));await assert.rejects(extractArchive(input,join(root,'duplicate')),/重复/);
 const signal=AbortSignal.abort();await assert.rejects(extractArchive(input,join(root,'cancelled'),{signal}));assert.equal((await readdir(root)).includes('cancelled'),false);
});
test('产品配方覆盖自身需求和递归工具，模块只使用内置依赖，独立CLI拒绝错误输入',async t=>{
 const root=await sandbox(t),declarations=resourceDeclarations(),tools=new Map(declarations.tools.map(x=>[x.id,x]));for(const platform of Object.values(contract.platforms))for(const tool of platform.tools){assert.equal(tools.get(tool.id)?.version,tool.version);}
 for(const tool of tools.values())for(const id of tool.requires||[])assert.ok(tools.has(id),'缺少递归工具 '+id);
 assert.deepEqual([...tools.keys()],['node']);assert.deepEqual(supplyRequirements().tools.map(tool=>tool.id),['node']);assert.equal(Object.hasOwn(supplyRequirements(),'apple'),false);
 const source=await readFile(new URL('./build.mjs',import.meta.url),'utf8');assert.ok([...source.matchAll(/^import .*? from ['"]([^'"]+)['"]/gmu)].every(m=>m[1].startsWith('node:')));
 const result=spawnSync(process.execPath,[join(import.meta.dirname,'build.mjs'),'resources','unknown','--work',root,'--offline'],{env:{HOME:root,LANG:'C',PATH:''},encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/平台|固定目录/);assert.deepEqual(await readdir(root),[]);
});

test('资源子进程可取消，不能继续输出成功回执',async()=>{
 const signal=AbortSignal.timeout(150);await assert.rejects(runResourceProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{signal,env:{PATH:''}}),/abort|timeout|取消/iu);
});

// Node 与 npm 原件仍按准确摘要入库，文件事务和输出验真实际执行。
test('空可选供给不阻断产品取得，npm SRI原件按准确来源复用',async t=>{
 const root=await sandbox(t),body=Buffer.from('sri-original'),entry={url:'https://example.invalid/sri.tgz',integrity:'sha512-'+createHash('sha512').update(body).digest('base64')};
 const file=await acquireArchive(entry,{store:join(root,'first'),optional:join(root,'absent'),fetcher:async()=>new Response(body)});assert.equal(await readFile(file,'utf8'),'sri-original');
 const optional=join(root,'shared/objects'),digest=hash(body),original=join(optional,digest+'.blob');await mkdir(dirname(original),{recursive:true});await writeFile(original,body);await writeFile(join(root,'shared/index.json'),JSON.stringify({schema_version:2,packages:[{archives:[{...entry,sha256:digest}]}],git_sources:[],pods:[]}));
 const cached=await acquireArchive(entry,{store:join(root,'second'),optional,offline:true,fetcher:()=>assert.fail('SRI供给命中联网')});assert.equal(await readFile(cached,'utf8'),'sri-original');
});

test('资源取消等待真实工具清理并确认退出后才返回失败',{timeout:20000},async t=>{
 const directory=await sandbox(t),ready=join(directory,'ready'),closed=join(directory,'closed');
 const code=`import {writeFileSync} from 'node:fs';process.once('SIGTERM',()=>setTimeout(()=>{writeFileSync(${JSON.stringify(closed)},'closed');process.exit(0);},600));writeFileSync(${JSON.stringify(ready)},'ready');setInterval(()=>{},1000);`;
 const controller=new AbortController();const running=runResourceProcess(process.execPath,['--input-type=module','-e',code],{cwd:directory,env:{PRODUCT_WORK_DIR:directory},signal:controller.signal});
 for(let n=0;n<200;n++){try{await readFile(ready);break;}catch{await new Promise(ok=>setTimeout(ok,10));}}
 assert.equal(await readFile(ready,'utf8'),'ready');const start=Date.now();controller.abort(Error('资源进程取消'));
 await assert.rejects(running,/取消/u);assert.equal(await readFile(closed,'utf8'),'closed');assert.ok(Date.now()-start>=500);
});
test('资源超时等待退出，错误入口和输出超限不产生成功回执',{timeout:20000},async t=>{
 const directory=await sandbox(t),closed=join(directory,'timeout-closed');
 const code=`import {writeFileSync} from 'node:fs';process.once('SIGTERM',()=>setTimeout(()=>{writeFileSync(${JSON.stringify(closed)},'closed');process.exit(0);},400));setInterval(()=>{},1000);`;
 await assert.rejects(runResourceProcess(process.execPath,['--input-type=module','-e',code],{cwd:directory,timeout:500}),/超时/u);
 assert.equal(await readFile(closed,'utf8'),'closed');
 await assert.rejects(runResourceProcess(join(directory,'missing'),[],{cwd:directory}),/无法启动/u);
 await assert.rejects(runResourceProcess(process.execPath,['-e','process.stdout.write("x".repeat(4096))'],{cwd:directory,maxBuffer:64}),/输出超限/u);
});

// 依赖供给夹具只写真实独占文件，覆盖唯一协议及任务视图隔离，不下载和安装工具。
async function dependencySupplyFixture(t,packages=[],pods=[]){const root=await sandbox(t),objects=join(root,'supply/objects'),work=join(root,'work');await mkdir(objects,{recursive:true});await mkdir(work);const index={schema_version:2,packages,git_sources:[],pods};await writeFile(join(dirname(objects),'index.json'),JSON.stringify(index));return {root,objects,work,index};}
test('可选供给索引只用于本仓npm原件，错误schema与快照拒绝',async t=>{
 const f=await dependencySupplyFixture(t);assert.equal(await readDependencySupply(join(f.root,'absent')),null);
 assert.deepEqual((await readDependencySupply(f.objects)).packages,[]);
 for(const value of [null,[],{schema_version:1,packages:[],git_sources:[],pods:[]},{...f.index,snapshots:[]}]){
  await writeFile(join(dirname(f.objects),'index.json'),JSON.stringify(value));await assert.rejects(readDependencySupply(f.objects),/协议/);
 }
});

// 真实文件事务验证下载候选的归属，不执行真实工具安装或编译。
test('资源下载候选只属于当前产品target现场，永久库不接收半包',async t=>{
 const root=await sandbox(t),work=join(root,'work'),store=join(root,'originals');await mkdir(work);await mkdir(store);
 const body=Buffer.from('owned-pending'),entry=archive(body);let inspected=false;
 const fetcher=async()=>({ok:true,headers:new Headers(),body:{async *[Symbol.asyncIterator](){
  const candidates=await readdir(join(work,'resource-pending'));
  assert.equal(candidates.filter(name=>name.endsWith('.pending')).length,1);
  assert.deepEqual(await readdir(store),[]);inspected=true;yield body;
 },cancel:async()=>{}}});
 const file=await acquireArchive(entry,{store,work,fetcher});assert.equal(inspected,true);
 assert.equal(await readFile(file,'utf8'),body.toString());assert.deepEqual(await readdir(join(work,'resource-pending')),[]);
 await assert.rejects(acquireArchive(archive(Buffer.from('other')),{store,work:dirname(resolve(import.meta.dirname,'..')),fetcher}),/target/);
});


// 夹具复制本仓完整资源实现，只替换文件IO边界并暴露已有私有验真函数，生产接口不新增出口。



// 全文复制本仓模块，合成回执逐次重算文件清单；只在测试副本暴露已有私有入口，不执行工具。




}

// 同文件回归只准备夹具归档，验证候选职责和失败清理，不下载或运行产品编译。
if(process.env.NODE_TEST_CONTEXT&&process.argv.length===2&&process.argv[1]===import.meta.filename){
 const {test,after}=await import('node:test'),{default:assert}=await import('node:assert/strict'),{execFileSync}=await import('node:child_process');
 const {mkdir,writeFile,chmod,lstat,readdir,rename}=await import('node:fs/promises');
 after(async()=>{await withFixedWork('build/'+Object.keys(contract.platforms)[0],async()=>{});});
 for(const failure of [false,true])test('编译供给候选归属与失败收尾：'+failure,()=>withFixedWork('test',async work=>{
  const tool=supplyRequirements().tools.find(tool=>tool.id==='node'),base=join(work,'fixture');await mkdir(join(base,tool.archive.root,'bin'),{recursive:true});await writeFile(join(base,tool.archive.root,'bin/node'),'#!/bin/sh\nexit 0\n',{mode:0o755});
  const archive=join(work,'fixture.tgz');execFileSync('/usr/bin/tar',['-czf',archive,'-C',base,tool.archive.root]);const payload=join(work,'payload');await mkdir(payload);let acquired=0,committed=0;
  const options={original:archive,payload,work,environment:{HOME:work},acquireOriginal:async entry=>{acquired++;assert.equal(entry.url,tool.archive.url);if(failure)throw Error('原件缺失');return archive;},acquireTool:()=>assert.fail('Node无前置工具'),acquireApple:()=>assert.fail('Node不需要Apple'),publishCandidate:async(candidate,target)=>{assert.ok(candidate.startsWith(work+'/')&&target.startsWith(work+'/'));committed++;await mkdir(dirname(target),{recursive:true});await rename(candidate,target);}};
  if(failure)await assert.rejects(prepareToolSupply(tool,options),/原件缺失/);else{const result=await prepareToolSupply(tool,options);assert.equal(result.payload,payload);assert.ok((await lstat(join(payload,'bin/node'))).mode&0o111);assert.equal(committed,1);}
  assert.equal(acquired,1);assert.equal((await readdir(work)).some(name=>name.startsWith('.tool-recipe-')),false);
 }));
}

// 只运行下载组件的纯解析段；合成GitHub回执不触发真实网络或产品编译。
if(process.env.NODE_TEST_CONTEXT&&process.argv.length===2&&process.argv[1]===import.meta.filename){
 const {test}=await import('node:test'),{default:assert}=await import('node:assert/strict');
 const {stripTypeScriptTypes}=await import('node:module');
 test('公民链平台下载直达最新成功Run的唯一GitHub正式安装包',async()=>{
  const source=readFileSync(join(root,'src/components/DownloadButton.tsx'),'utf8');
  const start=source.indexOf('export type CitizenChainPlatform'),end=source.indexOf('interface DownloadButtonProps');
  assert.ok(start>0&&end>start);
  const code=stripTypeScriptTypes(source.slice(start,end));
  assert.match(code,/async function resolveCitizenChainDownload/u);
  const {resolveCitizenChainDownload}=await import('data:text/javascript,'+encodeURIComponent(code.replace('async function resolveCitizenChainDownload','export async function resolveCitizenChainDownload')));
  const sha='b'.repeat(40),digest='a'.repeat(64);
  const target={macos:['macOS','dmg','macos.yml'],windows:['Windows','exe','windows.yml'],
   'linux-arm':['LinuxARM','deb','linuxarm.yml'],'linux-amd':['LinuxAMD','deb','linuxamd.yml']};
  const release=(platform,version,run)=>{
   const [stem,extension,workflow]=target[platform],tag=`citizenchain-${platform}-v${version}-r${run}-a1`;
   const name=`citizenchain-node-${stem}-v${version}.${extension}`;
   const url=`https://github.com/crcfrcn/citizenchain/releases/download/${tag}/${name}`;
   const asset={name,state:'uploaded',size:8,digest:'sha256:'+digest,browser_download_url:url};
   const proof={schema:1,repository:'crcfrcn/citizenchain',product_id:'citizenchain',platform,
    workflow:'.github/workflows/'+workflow,tag,version,run_id:run,run_attempt:1,source_sha:sha,
    assets:[{name,size:8,sha256:digest}]};
   return {tag_name:tag,draft:false,prerelease:false,published_at:'2026-10-13T00:00:00Z',
    target_commitish:sha,body:`<!-- automation:${JSON.stringify(proof)} -->`,assets:[asset]};
  };
  const releases=[release('macos','1.2.3',42),release('macos','1.2.4',43),release('windows','1.2.3',44),
   release('linux-arm','1.2.3',45),release('linux-amd','1.2.3',46)];
  const calls=[];
  const request=async url=>{calls.push(url);assert.ok(url.startsWith('https://api.github.com/repos/crcfrcn/citizenchain/'));
   if(url.includes('/releases?'))return Response.json(releases);
   const run=Number(url.split('/').at(-1));return Response.json({id:run,run_attempt:1,status:'completed',
    conclusion:run===43?'failure':'success',event:'workflow_dispatch',head_branch:'main',head_sha:sha,
    path:'.github/workflows/'+(run===44?'windows.yml':run===45?'linuxarm.yml':run===46?'linuxamd.yml':'macos.yml'),
    repository:{full_name:'crcfrcn/citizenchain'}});
  };
  for(const platform of Object.keys(target)){
   const url=await resolveCitizenChainDownload(platform,request);
   assert.equal(url,releases.find(value=>value.tag_name.startsWith('citizenchain-'+platform+'-v1.2.3'))?.assets[0].browser_download_url);
  }
  assert.ok(calls.every(url=>!url.includes('/api/download')));
  await assert.rejects(resolveCitizenChainDownload('macos',async()=>Response.json([])),/尚无/u);
  await assert.rejects(resolveCitizenChainDownload('macos',async()=>Response.json([], {status:403})),/限额/u);
  const wrong=release('macos','1.2.3',42);wrong.assets[0].browser_download_url='https://example.test/other';
  await assert.rejects(resolveCitizenChainDownload('macos',async()=>Response.json([wrong])),/尚无/u);
  const forged=release('macos','1.2.3',42);forged.body='<!-- automation:{} -->';
  await assert.rejects(resolveCitizenChainDownload('macos',async()=>Response.json([forged])),/尚无/u);
  await assert.rejects(resolveCitizenChainDownload('macos',async()=>Response.json(Array(101).fill(release('macos','1.2.3',42)))),/列表无效/u);
 });
}
