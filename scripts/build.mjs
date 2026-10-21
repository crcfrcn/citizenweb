#!/usr/bin/env node
// 产品流程只调用官方工具；版本与记录保留是本产品自己的规则。
import childProcess,{spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,copyFileSync,cpSync,rmSync,readdirSync,lstatSync,realpathSync,chmodSync,existsSync,rmdirSync} from 'node:fs';
import {join,dirname,resolve,relative,sep,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {tools,repository,platforms,initialVersion,artifactPrefix} from './config.mjs';
export const root=fileURLToPath(new URL('../',import.meta.url));
const controller=new AbortController();
export function automationDisplayName(platform,version){
 if(!Object.hasOwn(platforms,platform)||typeof version!=='string'||version.length>64||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version))throw Error('产品平台或版本无效');
 return artifactPrefix+version;
}
export function nextVersion(platform,rows){
 automationDisplayName(platform,initialVersion);
 const latest=[...rows].filter(row=>row.status==='completed'&&row.conclusion==='success'&&row.display_title?.startsWith(artifactPrefix)).sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at)||b.id-a.id)[0];
 if(!latest)return initialVersion;
 const version=latest.display_title.slice(artifactPrefix.length);automationDisplayName(platform,version);
 const parts=version.split('.');parts[2]=String(BigInt(parts[2])+1n);const value=parts.join('.');automationDisplayName(platform,value);return value;
}
export function retainedRuns(rows,{currentRun=0,result}={}){
 const keep=new Set(),states=new Set();
 for(const row of [...rows].sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at)||b.id-a.id)){
  // 本轮只按收尾前Job结果计算保留类别，不改写GitHub返回的Run终态。
  if(row.status!=='completed'&&row.id!==currentRun){keep.add(row.id);continue;}
  const state=(row.id===currentRun?result:row.conclusion)==='success'?'success':'failure';
  if(row.id===currentRun)keep.add(row.id);
  if(!states.has(state)){states.add(state);keep.add(row.id);}
 }return keep;
}
export function insideTarget(path){const base=join(root,'target');return typeof path==='string'&&resolve(path)===path&&path.startsWith(base+sep);}
function directory(path){
 if(!insideTarget(path))throw Error('任务目录必须归本产品target');
 for(let at=path;at!==resolve(root);at=dirname(at))if(existsSync(at)&&lstatSync(at).isSymbolicLink())throw Error('任务目录经过链接');
 mkdirSync(path,{recursive:true});if(realpathSync(path)!==path)throw Error('任务目录经过链接');return path;
}
function task(kind,platform){automationDisplayName(platform,initialVersion);return mkdtempSync(join(directory(join(root,'target',kind)),platform+'-'));}
function put(path,bytes){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes,{mode:0o600});}
function copy(from,to){mkdirSync(dirname(to),{recursive:true});cpSync(from,to,{recursive:true,verbatimSymlinks:true});}
function sourceView(work,names){
 const project=join(work,'source-view');mkdirSync(project);
 for(const name of names)copy(join(root,name),join(project,name));return project;
}
// 每次调用拥有独立进程组；取消或未退出的后代禁止提前清场。
export async function run(command,args,{cwd=root,env={},capture=false,input,signal=controller.signal}={}){
 signal.throwIfAborted();const environment={...process.env,...env};delete environment.GH_TOKEN;delete environment.GITHUB_TOKEN;
 return new Promise((ok,fail)=>{
  const child=spawn(command,args,{cwd,env:environment,detached:true,stdio:[input===undefined?'ignore':'pipe',capture?'pipe':process.stderr,'pipe']});
  let output='',diagnostic='',failure,timer;
  const kill=name=>{try{process.kill(-child.pid,name);}catch{}};
  const stop=()=>{kill('SIGTERM');timer??=setTimeout(()=>kill('SIGKILL'),2000);};signal.addEventListener('abort',stop,{once:true});
  child.stdout?.on('data',bytes=>{output+=bytes;if(output.length>32*1024**2){failure=Error('工具输出超限');stop();}});
  child.stderr.on('data',bytes=>{diagnostic=(diagnostic+bytes).slice(-8000);process.stderr.write(bytes);});
  child.once('error',error=>{failure=error;});child.stdin?.on('error',()=>{});if(input!==undefined)child.stdin?.end(input);
  child.once('close',async(code,termination)=>{
   signal.removeEventListener('abort',stop);
   // 先保留工具本身的失败；退出确认异常不能覆盖原诊断，也不能触发清场。
   const original=failure||((code!==0||termination||signal.aborted)?Error(basename(command)+'执行失败，退出码='+code+'，信号='+(termination||'无')+(diagnostic?'：'+diagnostic.trim():'')):undefined);
   const unconfirmed=(message,cause)=>{
    clearTimeout(timer);
    const error=Error((original?original.message+'；':'')+message+'，pid='+child.pid+'，pgid='+child.pid,{cause:original||cause});
    error.keepWork=true;error.processId=child.pid;error.groupId=child.pid;error.status=Number(/HTTP (\d{3})/u.exec(diagnostic)?.[1])||undefined;return fail(error);
   };
   if(child.pid)for(let attempt=0;attempt<60;attempt++){
    // ps只读本轮进程组；有效快照必须包含调用进程，空表和查询失败不能视为退出。
    const snapshot=childProcess.spawnSync('/bin/ps',['-axo','pid=,pgid='],{encoding:'utf8',env:environment,timeout:5000,maxBuffer:4*1024**2});
    if(snapshot.error||snapshot.status!==0)return unconfirmed('进程组查询失败：'+(snapshot.error?.code||snapshot.status),snapshot.error);
    const rows=snapshot.stdout.trim().split('\n').map(line=>line.trim().split(/\s+/u));
    if(!rows.length||rows.some(row=>row.length!==2||row.some(value=>!/^\d+$/u.test(value)))||!rows.some(row=>Number(row[0])===process.pid))return unconfirmed('进程组查询结果无效');
    if(!rows.some(row=>Number(row[1])===child.pid))break;
    if(attempt===59)return unconfirmed('工具后代退出未确认，保留本轮现场');
    await new Promise(done=>setTimeout(done,100));
   }
   clearTimeout(timer);
   if(original){original.status=Number(/HTTP (\d{3})/u.exec(diagnostic)?.[1])||undefined;return fail(original);}
   ok(output.trim());
  });
 });
}
function nodeCheck(){if(process.versions.node!==tools.node)throw Error('Node版本不符合本产品声明');}
function claimCache(work){
 const base=join(root,'target/cache'),lock=join(base,'lock');let owned=false;
 try{directory(base);mkdirSync(lock);owned=true;directory(join(base,'npm'));return {base,release(){rmdirSync(lock);}};}
 catch{if(owned)rmdirSync(lock);const base=directory(join(work,'cache'));return {base,release(){}};}
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
// 产品直接使用GitHub官方REST；控制台只交付短期令牌，不依赖宿主PATH中的gh。
export async function github(path,{method='GET',body,token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN,fetchImpl=fetch}={}){
 if(typeof path!=='string'||path.startsWith('/')||path.includes('..')||/[\r\n]/u.test(path))throw Error('GitHub产品路径无效');
 const response=await fetchImpl('https://api.github.com/repos/'+repository+'/'+path,{method,redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)]),
  headers:{...(token?{Authorization:'Bearer '+token}:{}),Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':repository.split('/')[1],'X-GitHub-Api-Version':'2026-03-10'},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(!response.ok)throw Object.assign(Error('GitHub HTTP '+response.status),{status:response.status});
 return response.status===204?null:response.json();
}
async function rowsFor(platform,read){
 automationDisplayName(platform,initialVersion);const rows=[];
 for(let page=1;;page++){const result=await read('actions/workflows/'+platform+'.yml/runs?branch=main&event=workflow_dispatch&per_page=100&page='+page);if(!Array.isArray(result.workflow_runs))throw Error('GitHub Run列表无效');rows.push(...result.workflow_runs);if(result.workflow_runs.length<100)return rows;}
}
export async function candidate(platform,{token=process.env.GH_TOKEN,read=path=>github(path,{token}),currentRun=Number(process.env.GITHUB_RUN_ID)}={}){
 const rows=await rowsFor(platform,read);
 if(rows.some(row=>row.status!=='completed'&&row.id!==currentRun))throw Error('同平台已有活动Run，禁止重复派发');return nextVersion(platform,rows);
}
function releaseProof(release){
 try{return JSON.parse(/^<!-- automation:(\{[^\n]*\}) -->$/mu.exec(release.body||'')?.[1]||'null');}catch{return null;}
}
// 只删除同一产品平台已结束的旧记录；新成功正式资产完整后才能淘汰旧成功。
export async function cleanupRuns(platform,{token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN,read=path=>github(path,{token}),remove=path=>github(path,{method:'DELETE',token}),currentRun=0,result,sourceSha,attempt}={}){
 const rows=await rowsFor(platform,read);let current;
 if(currentRun||result!==undefined){
  if(!Number.isSafeInteger(currentRun)||currentRun<=0||!['success','failure','cancelled'].includes(result))throw Error('本轮清理输入无效');
  current=await read('actions/runs/'+currentRun);
  if(current.id!==currentRun||current.repository?.full_name!==repository||current.event!=='workflow_dispatch'||current.path!=='.github/workflows/'+platform+'.yml'||current.head_branch!=='main'||(sourceSha!==undefined&&current.head_sha!==sourceSha)||(attempt!==undefined&&current.run_attempt!==attempt))throw Error('本轮Run身份不符，禁止清理');
  const index=rows.findIndex(row=>row.id===currentRun);if(index<0)rows.push(current);else rows[index]=current;
 }
 const keep=retainedRuns(rows,{currentRun,result}),stale=rows.filter(row=>row.status==='completed'&&row.id!==currentRun&&!keep.has(row.id));
 if(!stale.length)return {completed:true,deleted:[],kept:[...keep]};
 const releases=[];for(let page=1;;page++){const values=await read('releases?per_page=100&page='+page);releases.push(...values);if(values.length<100)break;}
 const absent=async path=>{try{await read(path);return false;}catch(error){if(error.status===404||/HTTP 404/u.test(error.message))return true;throw error;}};
 const success=rows.find(row=>keep.has(row.id)&&(row.id===currentRun?result==='success':row.conclusion==='success'&&row.status==='completed'));let blocked;
 if(stale.some(row=>row.conclusion==='success'))try{
  const release=releases.find(value=>releaseProof(value)?.run_id===success?.id);
  if(!release||release.draft||release.prerelease||release.tag_name!==success.display_title||release.assets?.length!==assetCount(platform))throw Error('最新成功正式Release或附件未确认，保留旧成功');
  const tag=await read('git/ref/tags/'+encodeURIComponent(release.tag_name));if(tag.object?.type!=='commit'||tag.object.sha!==success.head_sha)throw Error('新成功Tag提交不符，保留旧成功');
  const artifacts=await read('actions/runs/'+success.id+'/artifacts?per_page=100');if(artifacts.artifacts?.filter(value=>value.name===success.display_title&&!value.expired&&value.size_in_bytes>0).length!==1)throw Error('最新成功Artifact未确认，保留旧成功');
 }catch(error){blocked=error;}
 const deleted=[];
 for(const row of stale){
  // 保护旧成功不阻挡旧失败清理；真正DELETE失败立即停止，不冒充清理完成。
  if(blocked&&row.conclusion==='success')continue;
  const fresh=await read('actions/runs/'+row.id);if(fresh.status!=='completed'||fresh.head_sha!==row.head_sha||fresh.path!==row.path||fresh.conclusion!==row.conclusion)throw Error('删除前Run身份或终态变化');
  for(const release of releases){
   const proof=releaseProof(release);
   const historical=Object.keys(platforms).length===1&&release.body===`Source: ${row.head_sha}\nRun: ${row.id} / ${row.run_attempt}`;
   if(!(proof?.run_id===row.id&&proof.platform===platform)&&!historical)continue;
   if(release.target_commitish!==row.head_sha)throw Error('旧Release提交不符');
   const tagPath='git/ref/tags/'+encodeURIComponent(release.tag_name);
   // 先删Tag后删Release，失败重试仍以原Release回执确认归属。
   if(!await absent(tagPath)){const tag=await read(tagPath);if(tag.object?.type!=='commit'||tag.object.sha!==row.head_sha)throw Error('旧Tag归属不符');await remove('git/refs/tags/'+encodeURIComponent(release.tag_name));}
   await remove('releases/'+release.id);
   if(!await absent('releases/'+release.id)||!await absent(tagPath))throw Error('旧Release或Tag删除未确认');
  }
  await remove('actions/runs/'+row.id);if(!await absent('actions/runs/'+row.id))throw Error('旧Run删除未确认');
  if(!await absent('actions/runs/'+row.id+'/logs'))throw Error('旧Run日志删除未确认');
  try{const assets=await read('actions/runs/'+row.id+'/artifacts?per_page=100');if(!Array.isArray(assets.artifacts)||assets.artifacts.length)throw Error('旧Run附件删除未确认');}catch(error){if(error.status!==404&&!/HTTP 404/u.test(error.message))throw error;}
  deleted.push(row.id);
 }
 const remaining=await rowsFor(platform,read);
 if(current){const index=remaining.findIndex(row=>row.id===currentRun);if(index<0)remaining.push(current);else remaining[index]=current;}
 const expected=retainedRuns(remaining,{currentRun,result});
 if(blocked)throw blocked;
 if(remaining.some(row=>row.status==='completed'&&row.id!==currentRun&&!expected.has(row.id)))throw Error('旧记录清理未完成');
 return {completed:true,deleted,kept:[...expected]};
}
// 产品只派发一次并返回原Run；GitHub清理归所属工作流，客户端不执行删除。
export async function automate(platform,{token,read=path=>github(path,{token}),dispatch=spec=>github('actions/workflows/'+spec.workflow+'/dispatches',{method:'POST',body:{ref:spec.ref,inputs:spec.inputs},token})}={}){
 automationDisplayName(platform,initialVersion);const base=directory(join(root,'target/automation')),lock=join(base,platform);mkdirSync(lock);
 try{
  const version=await candidate(platform,{read,currentRun:0}),receipt=await dispatch({workflow:platform+'.yml',ref:'main',inputs:{version}}),runID=receipt?.workflow_run_id;
  if(!Number.isSafeInteger(runID)||runID<=0)throw Error('派发回执不确定，禁止再次派发');return {runID};
 }finally{rmdirSync(lock);}
}
// 控制台仅引用本产品入口；独立CLI与调度共用这些函数。
export function describeAction({flow,platform,inputs={}}){
 automationDisplayName(platform,initialVersion);
 if(flow==='release')return {repository,launch:options=>automate(platform,options)};
 if(['test','build','dev'].includes(flow)&&!(flow==='dev'&&platform!=='web'))return {command:process.execPath,args:[fileURLToPath(import.meta.url),flow,platform],cwd:root,env:{...process.env,...inputs.environment}};
 throw Error('本产品尚未声明该流程：'+flow);
}

const assetCount=()=>3;
// 白皮书是产品交付内容；配置只声明Vite参数，不生成文件。
export function whitepaperContent(markdown,readImage){
 const mime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml'};
 const content=markdown.replace(/\.\/assets\/([A-Za-z0-9._-]+\.(png|jpg|jpeg|webp|gif|svg))/gu,(_match,name,extension)=>`data:${mime[extension]};base64,${readImage(name).toString('base64')}`);
 return JSON.stringify({markdown:content})+'\n';
}
export function httpsOptions(environment=process.env){
 const certificate=environment.CITIZENWEB_TLS_CERT_FILE,key=environment.CITIZENWEB_TLS_KEY_FILE;
 if(!certificate||!key)throw Error('官网HTTPS证书与私钥未配置');return {cert:readFileSync(certificate),key:readFileSync(key),minVersion:'TLSv1.3'};
}
function webEnvironment(work,cache){return {npm_config_cache:join(cache.base,'npm'),TMPDIR:directory(join(work,'tmp')),CI:'true',WRANGLER_SEND_METRICS:'false'};}
async function prepareWeb(work,env){
 const project=sourceView(work,['src','config','scripts','test','index.html','tsconfig.json','package.json','package-lock.json']);
 await run('npm',['ci','--prefer-offline','--no-audit','--no-fund'],{cwd:project,env});
 if(!readFileSync(join(project,'package-lock.json')).equals(readFileSync(join(root,'package-lock.json'))))throw Error('npm原锁改变');return project;
}
async function webChecks(project,env){
 await run('npm',['exec','--no','--','eslint','--config','config/eslint.config.js','.'],{cwd:project,env});
 await run('npm',['exec','--no','--','tsc','-b','tsconfig.json'],{cwd:project,env});
}
export async function testProduct(){
 nodeCheck();await run(process.execPath,['--test','test/build.test.mjs','test/release.test.mjs'],{cwd:root});
 const work=task('test','web'),cache=claimCache(work);let safe=true;
 try{const env=webEnvironment(work,cache),project=await prepareWeb(work,env);await webChecks(project,env);return {tests:true};}
 catch(error){safe=!error.keepWork;throw error;}finally{if(safe){cache.release();rmSync(work,{recursive:true,force:true});}}
}
export async function buildProduct(){
 nodeCheck();const supplied=process.env.PRODUCT_WORK;if(supplied&&!insideTarget(supplied))throw Error('官网编译现场不属于target');
 const work=supplied?directory(supplied):task('build','web'),cache=claimCache(work);let complete=false,safe=true;
 try{
  // 静态检查唯一归test阶段，编译仅由官方Vite执行。
  const env=webEnvironment(work,cache),project=await prepareWeb(work,env),dist=join(work,'dist');
  await run('npm',['exec','--no','--','vite','build','--config','config/vite.config.ts','--outDir',dist],{cwd:project,env});
  put(join(dist,'whitepaper/content.json'),whitepaperContent(readFileSync(join(project,'src/whitepaper.md'),'utf8'),name=>readFileSync(join(project,'src/assets',name))));
  if(!lstatSync(join(dist,'index.html')).isFile())throw Error('官网入口未生成');complete=true;return {work,output:dist};
 }catch(error){safe=!error.keepWork;throw error;}finally{if(safe){cache.release();if(!complete)rmSync(work,{recursive:true,force:true});}}
}
const stable=value=>Array.isArray(value)?'['+value.map(stable).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}':JSON.stringify(value);
export async function packageProduct(){
 const work=process.env.PRODUCT_WORK;if(!insideTarget(work))throw Error('官网正式产物现场无效');
 const version=process.env.PRODUCT_VERSION,title=automationDisplayName('web',version),project=join(work,'source-view'),payload=directory(join(work,'package')),output=directory(join(work,'artifact'));copy(join(work,'dist'),join(payload,'dist'));
 const pkg=JSON.parse(readFileSync(join(project,'package.json'))),lock=JSON.parse(readFileSync(join(project,'package-lock.json')));pkg.version=version;lock.version=version;lock.packages[''].version=version;
 put(join(payload,'package.json'),JSON.stringify(pkg)+'\n');put(join(payload,'package-lock.json'),JSON.stringify(lock)+'\n');
 const collect=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{const path=join(directory,entry.name);if(entry.isSymbolicLink())throw Error('官网产物禁止链接');return entry.isDirectory()?collect(path):[path];});
 const entries=()=>collect(payload).map(file=>({path:relative(payload,file).split(sep).join('/'),sha256:sha(readFileSync(file))})).sort((a,b)=>a.path.localeCompare(b.path));
 const assets=entries().filter(row=>row.path.startsWith('dist/')),assets_sha256=sha(Buffer.from(stable(assets))),source=process.env.GITHUB_SHA;
 put(join(payload,'dist/citizenweb-release.json'),JSON.stringify({product_id:'citizenweb',delivery_channel:'web',software_version:version,git_commit_sha:source,assets_sha256})+'\n');
 const manifest={product_id:'citizenweb',delivery_channel:'web',software_version:version,git_commit_sha:source,tools:{node:tools.node,npm:await run('npm',['--version'],{capture:true}),vite:pkg.devDependencies.vite,wrangler:pkg.devDependencies.wrangler},assets_sha256,files:entries()};
 put(join(payload,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');put(join(payload,'SHA256SUMS'),entries().map(row=>row.sha256+'  '+row.path).join('\n')+'\n');
 await run('/usr/bin/tar',['-czf',join(output,title+'.tgz'),'--format','ustar','-C',payload,'dist','package.json','package-lock.json','release-manifest.json','SHA256SUMS']);
 copy(join(payload,'release-manifest.json'),join(output,title+'.json'));copy(join(payload,'SHA256SUMS'),join(output,title+'.sha256'));
 // 编译产物由编译入口自己回读；发布模块只在获准发布时消费正式包。
 const readback=directory(join(work,'package-readback'));
 await run('/usr/bin/tar',['-xzf',join(output,title+'.tgz'),'-C',readback,'--no-same-owner','--no-same-permissions']);
 const expected=collect(payload).map(file=>relative(payload,file)).sort(),actual=collect(readback).map(file=>relative(readback,file)).sort();
 if(JSON.stringify(actual)!==JSON.stringify(expected)||expected.some(name=>!readFileSync(join(payload,name)).equals(readFileSync(join(readback,name)))))throw Error('构建归档回读不一致');
 put(join(work,'proof.json'),JSON.stringify({schema:1,product_id:'citizenweb',platform:'web',version,source_sha:source,run_id:Number(process.env.GITHUB_RUN_ID),run_attempt:Number(process.env.GITHUB_RUN_ATTEMPT)}));return {output};
}
async function development(){
 nodeCheck();const {createRequire}=await import('node:module'),{createSecureContext}=await import('node:tls');
 const options=httpsOptions();createSecureContext(options);const require=createRequire(join(root,'package.json')),{createServer}=await import(pathToFileURL(require.resolve('vite')));
 const server=await createServer({configFile:join(root,'config/vite.config.ts'),root,server:{https:options,port:5199,strictPort:true,fs:{allow:[root]}}});
 await server.listen();server.printUrls();controller.signal.addEventListener('abort',()=>void server.close(),{once:true});return new Promise(done=>server.httpServer.once('close',done));
}
async function main(){
 const [command,platform='web',...extra]=process.argv.slice(2);if(extra.length||platform!=='web')throw Error('官网参数无效');
 if(command==='test')return testProduct();if(command==='build')return buildProduct();if(command==='package')return packageProduct();if(command==='dev')return development();
 if(command==='candidate')return candidate('web');if(command==='automate')return automate('web',{token:process.env.GH_TOKEN});if(command==='cleanup')return cleanupRuns('web',{currentRun:Number(process.env.GITHUB_RUN_ID||0),result:process.env.PRODUCT_RESULT,sourceSha:process.env.GITHUB_SHA,attempt:process.env.GITHUB_RUN_ATTEMPT===undefined?undefined:Number(process.env.GITHUB_RUN_ATTEMPT)});throw Error('未知官网命令');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)&&!process.env.NODE_TEST_CONTEXT){
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>controller.abort());
 try{const result=await main();process.stdout.write(typeof result==='string'?result+'\n':JSON.stringify(result)+'\n');}catch(error){console.error(error.message);process.exitCode=1;}
}
