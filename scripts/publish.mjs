#!/usr/bin/env node
// 官网发布独立核验成功自动化的正式资产，拥有Pages上传与部署回读；不创建Tag或Release。
import {createHash} from 'node:crypto';
import {automationDisplayName} from './build.mjs';
import {gunzipSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,rm,writeFile,realpath,lstat,readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const repository='crcfrcn/citizenweb',workflow='.github/workflows/web.yml';
const names=['citizenweb-release.tgz','release-manifest.json','SHA256SUMS'];
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
const positive=value=>Number.isSafeInteger(value)&&value>0;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=message=>{throw Error('CitizenWeb发布：'+message);};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('\0')===[...keys].sort().join('\0');
const stable=value=>Array.isArray(value)?`[${value.map(stable).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')}}`:JSON.stringify(value);

async function pages(path,field,request){
 const rows=[];
 for(let page=1;page<=10000;page++){
  const value=await request(path+'?per_page=100&page='+page),items=field?value?.[field]:value;
  if(!Array.isArray(items)||items.length>100)fail('公开分页无效');
  rows.push(...items);if(items.length<100)return rows;
 }
 fail('公开分页未结束');
}

function archiveFiles(bytes){
 let tar;try{tar=gunzipSync(bytes,{maxOutputLength:256*1024**2});}catch{fail('正式归档解压失败');}
 const files=new Map();let at=0,ended=false;
 const field=part=>new TextDecoder('utf-8',{fatal:true}).decode(part).split('\0')[0];
 while(at+512<=tar.length){
  const header=tar.subarray(at,at+512);
  if(header.every(byte=>byte===0)){if(!tar.subarray(at).every(byte=>byte===0))fail('归档尾部无效');ended=true;break;}
  let path,size,checksum;
  try{path=field(header.subarray(0,100));const count=field(header.subarray(124,136)).trim(),sum=field(header.subarray(148,156)).trim();
   if(!/^[0-7]+$/u.test(count)||!/^[0-7]+$/u.test(sum))fail('归档数字字段无效');size=parseInt(count,8);checksum=parseInt(sum,8);
  }catch{fail('归档头无效');}
  if(header[156]!==48||field(header.subarray(257,263))!=='ustar'||header.subarray(345,500).some(byte=>byte!==0)
    ||!path||path.startsWith('/')||/[\\\x00-\x1f]/u.test(path)||path.split('/').some(part=>!part||part==='.'||part==='..')||files.has(path))fail('归档成员越界或重复');
  const sum=[...header].reduce((total,byte,index)=>total+(index>=148&&index<156?32:byte),0);
  if(sum!==checksum||!Number.isSafeInteger(size)||size<1||at+512+size>tar.length)fail('归档大小或校验和无效');
  files.set(path,tar.subarray(at+512,at+512+size));at+=512+Math.ceil(size/512)*512;
 }
 if(!ended||tar.length%512)fail('归档终止标记缺失');return files;
}

export function inspectPackage(bytes,manifestBytes,sumsBytes,version,sourceSHA){
 const files=archiveFiles(bytes);
 if(!files.get('release-manifest.json')?.equals(manifestBytes)||!files.get('SHA256SUMS')?.equals(sumsBytes))fail('正式资产与归档内清单不一致');
 let manifest,marker,source,lock;
 try{manifest=JSON.parse(manifestBytes);marker=JSON.parse(files.get('dist/citizenweb-release.json'));source=JSON.parse(files.get('package.json'));lock=JSON.parse(files.get('package-lock.json'));}catch{fail('正式包JSON无效');}
 if(!exact(manifest,['product_id','delivery_channel','software_version','git_commit_sha','tools','assets_sha256','files'])
   ||manifest.product_id!=='citizenweb'||manifest.delivery_channel!=='web'||manifest.software_version!==version||manifest.git_commit_sha!==sourceSHA
   ||!exact(manifest.tools,['node','npm','vite','wrangler'])||Object.values(manifest.tools).some(value=>typeof value!=='string'||!value)
   ||!sha(manifest.assets_sha256)||!Array.isArray(manifest.files)||manifest.files.length<4)fail('正式清单身份无效');
 const required=['package.json','package-lock.json','dist/index.html','dist/citizenweb-release.json'],seen=new Set(),assets=[];
 for(const row of manifest.files){
  if(!exact(row,['path','sha256'])||typeof row.path!=='string'||!row.path.match(/^(?:package(?:-lock)?\.json|dist\/[A-Za-z0-9._/-]+)$/u)
   ||row.path.split('/').some(part=>!part||part==='.'||part==='..')||seen.has(row.path)||!sha(row.sha256)||digest(files.get(row.path)||Buffer.alloc(0))!==row.sha256)fail('正式包成员无效');
  seen.add(row.path);if(row.path.startsWith('dist/')&&row.path!=='dist/citizenweb-release.json')assets.push(row);
 }
 if(required.some(path=>!seen.has(path))||files.size!==seen.size+2||files.size!==new Set([...seen,'release-manifest.json','SHA256SUMS']).size
   ||manifest.files.map(row=>row.path).join('\0')!==[...seen].sort((a,b)=>a.localeCompare(b)).join('\0'))fail('正式包成员不完整');
 if(source.version!==version||lock.version!==version||lock.packages?.['']?.version!==version)fail('正式包版本不一致');
 if(digest(Buffer.from(stable(assets)))!==manifest.assets_sha256)fail('静态资源清单摘要不一致');
 if(!exact(marker,['product_id','delivery_channel','software_version','git_commit_sha','assets_sha256'])
  ||stable(marker)!==stable({product_id:'citizenweb',delivery_channel:'web',software_version:version,git_commit_sha:sourceSHA,assets_sha256:manifest.assets_sha256}))fail('公开版本标记不一致');
 const rows=[...manifest.files,{path:'release-manifest.json',sha256:digest(manifestBytes)}].sort((a,b)=>a.path.localeCompare(b.path));
 if(sumsBytes.toString('utf8')!==rows.map(row=>row.sha256+'  '+row.path).join('\n')+'\n')fail('正式摘要表无效');
 return {manifest,files:files.size};
}

async function inspectCandidate({run,release,readTag,readAsset,includeContents=false}){
 if(run?.path!==workflow||run.repository?.full_name!==repository||run.head_branch!=='main'||run.event!=='workflow_dispatch'
  ||run.status!=='completed'||run.conclusion!=='success'||!positive(run.id)||!positive(run.run_attempt)||!/^[a-f0-9]{40}$/u.test(run.head_sha||''))fail('成功自动化身份无效');
 const match=/^公民官网·Web·v(\d+\.\d+\.\d+)$/u.exec(release?.tag_name||'');
 let automationProof;try{automationProof=JSON.parse(/^<!-- automation:(\{[^\n]*\}) -->$/m.exec(release?.body||'')?.[1]||'null');}catch{fail('正式版本证明无效');}
 if(!match||automationProof?.run_id!==run.id||automationProof?.run_attempt!==run.run_attempt||!positive(release.id)||release.draft||release.prerelease
   ||release.target_commitish!==run.head_sha||!Array.isArray(release.assets)||release.assets.length!==names.length)fail('正式Release身份无效');
 const tag=await readTag(release.tag_name);
 if(tag?.ref!=='refs/tags/'+release.tag_name||tag.object?.type!=='commit'||tag.object.sha!==run.head_sha)fail('正式Tag源码不一致');
 const bytes=new Map(),assetProof=[];
 for(const name of names){
  const rows=release.assets.filter(asset=>asset?.name===name);if(rows.length!==1)fail('正式资产缺失或重复');
  const asset=rows[0];
  if(!positive(asset.id)||!positive(asset.size)||asset.state!=='uploaded'||!sha(asset.digest?.slice(7))
    ||asset.digest!=='sha256:'+asset.digest.slice(7)||asset.size>(name.endsWith('.tgz')?256*1024**2:1024*1024)
    ||asset.url!==`https://api.github.com/repos/${repository}/releases/assets/${asset.id}`)fail('正式资产证明无效');
  const stream=await readAsset(asset),chunks=[];let total=0;
  if(!stream||typeof stream[Symbol.asyncIterator]!=='function')fail('正式资产读取通道无效');
  for await(const chunk of stream){if(!(chunk instanceof Uint8Array))fail('正式资产字节无效');total+=chunk.length;if(total>asset.size)fail('正式资产超限');chunks.push(Buffer.from(chunk));}
  const body=Buffer.concat(chunks);if(total!==asset.size||digest(body)!==asset.digest.slice(7))fail('正式资产回读不一致');
  bytes.set(name,body);assetProof.push({name,asset_id:asset.id,bytes:total,sha256:digest(body)});
 }
 const product=inspectPackage(bytes.get(names[0]),bytes.get(names[1]),bytes.get(names[2]),match[1],run.head_sha);
 const proof={schema:1,product_id:'citizenweb',delivery_channel:'web',version:match[1],source_sha:run.head_sha,
  run_id:run.id,run_attempt:run.run_attempt,release_id:release.id,tag:release.tag_name,archive_files:product.files,assets:assetProof};
 return includeContents?{proof,contents:archiveFiles(bytes.get(names[0]))}:proof;
}

async function selectedPublication(request,includeContents=false){
 const runs=await pages('actions/runs','workflow_runs',request),releases=await pages('releases',null,request);
 const success=runs.filter(run=>run?.path===workflow&&run.repository?.full_name===repository&&run.head_branch==='main'
  &&run.event==='workflow_dispatch'&&run.status==='completed'&&run.conclusion==='success');
 if(!success.length)fail('缺少成功自动化');
 success.sort((a,b)=>b.run_number-a.run_number||b.run_attempt-a.run_attempt||b.id-a.id);
 const run=success[0],suffix='-r'+run.id+'-a'+run.run_attempt;
 const release=releases.filter(value=>{try{const proof=JSON.parse(/^<!-- automation:(\{[^\n]*\}) -->$/m.exec(value?.body||'')?.[1]||'null');return value?.tag_name===automationDisplayName('web',proof?.version||'')&&proof?.run_id===run.id&&proof?.run_attempt===run.run_attempt;}catch{return false;}});
 if(release.length!==1)fail('成功自动化缺少唯一Release');
 return inspectCandidate({run,release:release[0],readTag:tag=>request('git/ref/tags/'+encodeURIComponent(tag)),
  readAsset:async asset=>(await request(asset.url,{raw:true}))?.body,includeContents});
}
export async function preparePublication({request=publicRequest}={}){return selectedPublication(request);}

// 正式发布重新读取并验真同一个 Release；只在本轮独占目录物化经过清单约束的成员。

// 产品拥有工具执行、云请求及失败回执；凭据只驻留本轮内存，不写入命令行或日志。
async function runTool(command,args,cwd,environment,signal,{input,protectedValues=[],timeout=300000}={}){
 signal?.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{cwd,env:environment,detached:true,stdio:[input===undefined?'ignore':'pipe','pipe','pipe']});
  let output='',diagnostic='',failure,timer,forced;
  const stop=()=>{try{if(child.pid)process.kill(-child.pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')failure??=error;}
   forced??=setTimeout(()=>{try{if(child.pid)process.kill(-child.pid,'SIGKILL');}catch{}},5000);forced.unref();};
  const abort=()=>{failure??=signal.reason??Error('发布已取消');stop();};
  child.stdout.on('data',chunk=>{if(!protectedValues.length)output=(output+chunk.toString('utf8')).slice(-65536);});
  child.stderr.on('data',chunk=>{if(!protectedValues.length)diagnostic=(diagnostic+chunk.toString('utf8')).slice(-4096);});
  child.once('error',error=>{failure??=error;});
  child.once('close',(code,termination)=>{
   clearTimeout(timer);clearTimeout(forced);signal?.removeEventListener('abort',abort);
   if(child.pid){try{process.kill(-child.pid,0);failure??=Error('发布工具后代未退出');process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')failure??=error;}}
   if(failure||code!==0||termination){
    const detail=protectedValues.length?'':diagnostic.replace(/[\x00-\x1f\x7f]/gu,' ').slice(-1024);
    const error=Error('发布工具失败：'+(failure?.code??code)+'，信号='+(termination||'无')+(failure?'；'+(failure.code||failure.message):'')+(detail?'；'+detail:''),{cause:failure});
    reject(error);
   }else resolve(output);
  });
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  timer=setTimeout(()=>{failure??=Error('发布工具超时');stop();},timeout);timer.unref();
  if(input!==undefined){child.stdin.on('error',error=>{failure??=error;stop();});child.stdin.end(input);}
 });
}
async function publicationFile(work,name,maximum=128*1024**2){
 const path=join(work,name),info=await lstat(path);
 if(!info.isFile()||info.isSymbolicLink()||await realpath(path)!==path||info.size<1||info.size>maximum)fail('发布现场成员无效：'+name);
 return readFile(path);
}
function deploymentCredentials(credentials,{secrets=false}={}){
 if(!credentials||typeof credentials!=='object'||Array.isArray(credentials)
  ||Object.keys(credentials).sort().join('\0')!==(secrets?['account','secrets','token']:['account','token']).join('\0')
  ||!/^[a-f0-9]{32}$/u.test(credentials.account||'')||typeof credentials.token!=='string'||credentials.token.length<20
  ||/[\s\x00-\x1f\x7f]/u.test(credentials.token))fail('本轮部署凭据无效');
 return credentials;
}
async function cloudflareJSON(account,token,path,{request=fetch,signal}={}){
 const response=await request('https://api.cloudflare.com/client/v4/accounts/'+account+'/'+path,
  {method:'GET',redirect:'error',credentials:'omit',headers:{Authorization:'Bearer '+token},
   signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});
 if(!response.ok)fail('Cloudflare公开回读失败（HTTP '+response.status+'）');
 const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>4*1024**2)fail('Cloudflare回读超限');chunks.push(chunk);}
 let value;try{value=JSON.parse(Buffer.concat(chunks));}catch{fail('Cloudflare回读JSON无效');}
 if(value?.success!==true)fail('Cloudflare回读未确认成功');return value.result;
}

// 发布阶段的资源策略与验收归本产品，供应端不补来源或选择离线策略。
export async function publishTools(){
 const version='25.2.1';if(process.version!=='v'+version)fail('发布入口必须使用本产品锁定Node '+version);
 return {node:{version,path:process.execPath}};
}

// 上传与验收归本产品；调度方的deploy回调只承担凭据通道，调用的仍是此入口。
export async function deployPages(payload,credentials,{signal,invoke=runTool,request=fetch,now=Date.now}={}){
 signal?.throwIfAborted();
 if(!exact(payload,['schema','product_id','platform','run_id','release_tag','source_sha','version','archive_sha256','previous_deployment_id','work','node_path'])
  ||payload.schema!==1||payload.product_id!=='citizenweb'||payload.platform!=='web'
  ||!/^[1-9][0-9]{8}$/u.test(payload.run_id||'')||!/^\d+\.\d+\.\d+$/u.test(payload.version||'')
  ||payload.release_tag!==automationDisplayName('web',payload.version)
  ||!/^[a-f0-9]{40}$/u.test(payload.source_sha||'')||!sha(payload.archive_sha256)
  ||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(payload.previous_deployment_id||''))fail('Pages执行身份无效');
 const {work,node_path:node}=payload,base=fileURLToPath(new URL('../target/publish/web/',import.meta.url));
 if(typeof work!=='string'||!work.startsWith(base+payload.run_id+'-')||await realpath(work)!==work
  ||typeof node!=='string'||!node.startsWith('/')||await realpath(node)!==node||!(await lstat(node)).isFile())fail('Pages执行现场无效');
 const {account,token}=deploymentCredentials(credentials),environment={PATH:dirname(node)+':/usr/bin:/bin',HOME:work,CI:'1',WRANGLER_SEND_METRICS:'false'};
 let manifest,marker,source,lock;
 try{manifest=JSON.parse(await publicationFile(work,'release-manifest.json',1024**2));marker=JSON.parse(await publicationFile(work,'dist/citizenweb-release.json',4096));
  source=JSON.parse(await publicationFile(work,'package.json'));lock=JSON.parse(await publicationFile(work,'package-lock.json'));}catch(error){throw Error('官网发布现场JSON无效',{cause:error});}
 if(manifest.product_id!=='citizenweb'||manifest.delivery_channel!=='web'||manifest.software_version!==payload.version||manifest.git_commit_sha!==payload.source_sha
  ||!sha(manifest.assets_sha256)||!Array.isArray(manifest.files)||manifest.files.length<4||manifest.files.length>10000
  ||stable(marker)!==stable({product_id:'citizenweb',delivery_channel:'web',software_version:payload.version,git_commit_sha:payload.source_sha,assets_sha256:manifest.assets_sha256})
  ||source.version!==payload.version||lock.version!==payload.version||lock.packages?.['']?.version!==payload.version
  ||source.devDependencies?.wrangler!=='4.121.0'||lock.packages?.['node_modules/wrangler']?.version!=='4.121.0')fail('Pages正式清单或产品锁不一致');
 const seen=new Set(),assets=[];let total=0;
 for(const row of manifest.files){
  if(!exact(row,['path','sha256'])||typeof row.path!=='string'||!row.path.match(/^(?:package(?:-lock)?\.json|dist\/[A-Za-z0-9._/-]+)$/u)
   ||row.path.split('/').some(part=>!part||part==='.'||part==='..')||seen.has(row.path)||!sha(row.sha256))fail('Pages正式成员无效');
  seen.add(row.path);const bytes=await publicationFile(work,row.path);total+=bytes.length;
  if(total>256*1024**2||digest(bytes)!==row.sha256)fail('Pages正式成员与清单不一致');
  if(row.path.startsWith('dist/')&&row.path!=='dist/citizenweb-release.json')assets.push(row);
 }
 if(!seen.has('dist/index.html')||!seen.has('dist/citizenweb-release.json')||digest(Buffer.from(stable(assets)))!==manifest.assets_sha256)fail('Pages正式页面不完整');
 const wrangler=join(work,'node_modules/wrangler/bin/wrangler.js');await publicationFile(work,'node_modules/wrangler/bin/wrangler.js');
 if((await invoke(node,['--version'],work,environment,signal)).trim()!=='v25.2.1'
  ||!(await invoke(node,[wrangler,'--version'],work,environment,signal)).includes('4.121.0'))fail('Pages执行工具不符合产品锁');
 const read=path=>cloudflareJSON(account,token,'pages/projects/citizenweb'+path,{request,signal});
 const latest=await read('/deployments?env=production&per_page=1'),previous=latest?.[0];
 if(previous?.id!==payload.previous_deployment_id||previous.project_name!=='citizenweb'||previous.environment!=='production'||previous.latest_stage?.status!=='success')fail('Pages上次生产部署已变化');
 const project=await read('');
 if(project?.name!=='citizenweb'||project.production_branch!=='main'||!project.domains?.includes('www.crcfrcn.com')
  ||['github','gitlab'].includes(project.source?.type)&&project.source.config?.production_deployments_enabled!==false)fail('Pages生产项目身份或自动部署设置无效');
 signal?.throwIfAborted();const started=now();
 await invoke(node,[wrangler,'pages','deploy',join(work,'dist'),'--project-name','citizenweb','--branch','main','--commit-hash',payload.source_sha,'--commit-message',payload.release_tag],
  work,{...environment,CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_API_TOKEN:token},signal,{protectedValues:[token]});
 const result=(await read('/deployments?env=production&per_page=1'))?.[0];
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(result?.id||'')||result.project_name!=='citizenweb'||result.environment!=='production'
  ||result.latest_stage?.name!=='deploy'||result.latest_stage.status!=='success'||result.deployment_trigger?.metadata?.branch!=='main'
  ||result.deployment_trigger.metadata.commit_hash!==payload.source_sha||!Number.isFinite(Date.parse(result.created_on))||Date.parse(result.created_on)<started-30000)fail('Pages部署后身份回读失败');
 return {product_id:'citizenweb',platform:'web',project:'citizenweb',release_tag:payload.release_tag,source_sha:payload.source_sha,deployment_id:result.id,deployed:true};
}

export async function publishPages({proof,runID,nodePath=process.execPath,previousID,credentials,deploy=payload=>deployPages(payload,credentials,{signal}),signal,beforeDeploy,request=publicRequest,install=runTool}={}){
 if(proof?.product_id!=='citizenweb'||proof.delivery_channel!=='web'||!positive(proof.run_id)
  ||typeof runID!=='string'||!/^[1-9][0-9]{8}$/u.test(runID)||typeof deploy!=='function'
  ||typeof nodePath!=='string'||!nodePath.startsWith('/')||typeof previousID!=='string'
  ||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(previousID))fail('Pages发布任务身份无效');
 const current=await selectedPublication(request,true);
 if(stable(current.proof)!==stable(proof))fail('正式产物在授权后发生变化');
 const base=fileURLToPath(new URL('../target/publish/web/',import.meta.url));
 await mkdir(base,{recursive:true,mode:0o700});
 const work=await mkdtemp(join(base,runID+'-'));
 try{
  for(const [name,bytes] of current.contents){
   const path=join(work,name);await mkdir(dirname(path),{recursive:true,mode:0o700});
   await writeFile(path,bytes,{flag:'wx',mode:0o600});
  }
  const source=JSON.parse(current.contents.get('package.json'));
  const lock=JSON.parse(current.contents.get('package-lock.json'));
  if(source.devDependencies?.wrangler!=='4.121.0'||lock.packages?.['node_modules/wrangler']?.version!=='4.121.0')fail('正式包Wrangler锁无效');
  const environment={PATH:[dirname(nodePath),'/usr/bin','/bin'].join(':'),HOME:work,
   npm_config_cache:join(work,'npm-cache'),CI:'1',WRANGLER_SEND_METRICS:'false'};
  const npmCLI=join(dirname(nodePath),'../lib/node_modules/npm/bin/npm-cli.js');
  await install(nodePath,[npmCLI,'ci','--ignore-scripts','--no-audit','--no-fund'],work,environment,signal);
  signal?.throwIfAborted();beforeDeploy?.();
  const payload={schema:1,product_id:'citizenweb',platform:'web',run_id:runID,
   release_tag:proof.tag,source_sha:proof.source_sha,version:proof.version,
   archive_sha256:proof.assets.find(asset=>asset.name===names[0])?.sha256,
   previous_deployment_id:previousID,work,node_path:nodePath};
  const result=await deploy(payload);
  if(result?.product_id!=='citizenweb'||result?.platform!=='web'||result?.release_tag!==proof.tag
   ||result?.source_sha!==proof.source_sha||result?.project!=='citizenweb'||result?.deployed!==true)fail('Pages部署回执无效');
  return result;
 }finally{await rm(work,{recursive:true,force:true});}
}

async function publicRequest(path,{raw=false}={}){
 const url=path.startsWith('https:')?new URL(path):new URL(`https://api.github.com/repos/${repository}/${path}`);
 if(url.protocol!=='https:'||url.hostname!=='api.github.com'||!url.pathname.startsWith(`/repos/${repository}/`)||url.username||url.password)fail('GitHub公开来源无效');
 let response=await fetch(url,{method:'GET',redirect:raw?'manual':'error',credentials:'omit',headers:{Accept:raw?'application/octet-stream':'application/vnd.github+json'},signal:AbortSignal.timeout(300000)});
 if(raw&&response.status===302){const next=new URL(response.headers.get('location'));if(next.protocol!=='https:'||next.username||next.password
  ||!['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(next.hostname))fail('资产重定向越界');
  response=await fetch(next,{method:'GET',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(300000)});}
 if(!response.ok)fail('公开读取失败');if(raw)return response;
 let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>8*1024**2)fail('公开JSON超限');chunks.push(chunk);}
 return JSON.parse(Buffer.concat(chunks));
}

const direct=process.argv[1]===import.meta.filename,testing=direct&&Boolean(process.env.NODE_TEST_CONTEXT)&&process.argv.length===2;
if(direct&&!testing){
 const controller=new AbortController();for(const name of ['SIGTERM','SIGINT'])process.once(name,()=>controller.abort(Error('发布已取消')));
 void (async()=>{
  if(process.argv.length!==3||!['prepare','publish','deploy'].includes(process.argv[2]))fail('发布入口参数无效');
  if(process.argv[2]==='prepare')return preparePublication();
  let text='';for await(const chunk of process.stdin){text+=chunk;if(Buffer.byteLength(text)>1024**2)fail('发布输入超限');}
  let value;try{value=JSON.parse(text);}catch{fail('发布输入JSON无效');}
  if(!value||typeof value!=='object'||Array.isArray(value))fail('发布输入无效');
  if(process.argv[2]==='deploy')return deployPages(value.payload,value.credentials,{signal:controller.signal});
  return publishPages({...value,signal:controller.signal});
 })().then(value=>process.stdout.write(JSON.stringify(value)+'\n')).catch(error=>{console.error(error.message);process.exitCode=1;});
}

if(testing){
 const {test}=await import('node:test'),{default:assert}=await import('node:assert/strict'),{gzipSync}=await import('node:zlib'),{Readable}=await import('node:stream');
 function fixture(){
  const source='a'.repeat(40),version='1.0.0',tag='公民官网·Web·v1.0.0';
  const fileBytes=new Map([['package.json',Buffer.from(JSON.stringify({version,devDependencies:{wrangler:'4.121.0'}}))],
   ['package-lock.json',Buffer.from(JSON.stringify({version,packages:{'':{version},'node_modules/wrangler':{version:'4.121.0'}}}))],
   ['dist/index.html',Buffer.from('<html>synthetic</html>')],['dist/app.js',Buffer.from('synthetic')],
   ['dist/assets/Whitepaper.js',Buffer.from('synthetic-whitepaper')]]);
  const assets=[...fileBytes].filter(([path])=>path.startsWith('dist/')).map(([path,bytes])=>({path,sha256:digest(bytes)})).sort((a,b)=>a.path.localeCompare(b.path));
  const assets_sha256=digest(Buffer.from(stable(assets)));
  fileBytes.set('dist/citizenweb-release.json',Buffer.from(JSON.stringify({product_id:'citizenweb',delivery_channel:'web',software_version:version,git_commit_sha:source,assets_sha256})));
  const entries=[...fileBytes].map(([path,bytes])=>({path,sha256:digest(bytes)})).sort((a,b)=>a.path.localeCompare(b.path));
  const manifest=Buffer.from(JSON.stringify({product_id:'citizenweb',delivery_channel:'web',software_version:version,git_commit_sha:source,tools:{node:'25.2.1',npm:'11',vite:'8',wrangler:'4'},assets_sha256,files:entries}));
  fileBytes.set('release-manifest.json',manifest);
  const sums=Buffer.from([...entries,{path:'release-manifest.json',sha256:digest(manifest)}].sort((a,b)=>a.path.localeCompare(b.path)).map(row=>row.sha256+'  '+row.path).join('\n')+'\n');fileBytes.set('SHA256SUMS',sums);
  const blocks=[];for(const [path,bytes]of [...fileBytes].sort(([a],[b])=>a<b?-1:a>b?1:0)){
   const h=Buffer.alloc(512);h.write(path);h.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);h.fill(32,148,156);h[156]=48;h.write('ustar\0',257);h.write([...h].reduce((sum,b)=>sum+b,0).toString(8).padStart(6,'0')+'\0 ',148);
   blocks.push(h,bytes,Buffer.alloc((512-bytes.length%512)%512));
  }blocks.push(Buffer.alloc(1024));
  const archive=gzipSync(Buffer.concat(blocks)),body=new Map([[names[0],archive],[names[1],manifest],[names[2],sums]]);
  const run={id:42,run_attempt:1,path:workflow,repository:{full_name:repository},head_branch:'main',event:'workflow_dispatch',status:'completed',conclusion:'success',head_sha:source};
  const release={id:7,tag_name:tag,body:'<!-- automation:'+JSON.stringify({version,run_id:42,run_attempt:1})+' -->',draft:false,prerelease:false,target_commitish:source,assets:names.map((name,index)=>({id:index+1,name,state:'uploaded',size:body.get(name).length,digest:'sha256:'+digest(body.get(name)),url:`https://api.github.com/repos/${repository}/releases/assets/${index+1}`}))};
  const request=async path=>path.startsWith('actions/runs?')?{workflow_runs:[run]}:path.startsWith('releases?')?[release]:path.startsWith('git/ref/tags/')?{ref:'refs/tags/'+tag,object:{type:'commit',sha:source}}:{body:Readable.from([body.get(release.assets.find(asset=>asset.url===path)?.name)])};
  return {run,release,body,request};
 }
 test('成功Web自动化的三件正式资产与全部归档成员独立验真',async()=>{
  const value=await preparePublication({request:fixture().request});assert.equal(value.archive_files,8);assert.equal(value.assets.length,3);assert.equal(value.version,'1.0.0');
 });
 test('归档缺失、来源错配与重复成功Run均拒绝',async()=>{
  assert.throws(()=>archiveFiles(Buffer.from('not-gzip')),/解压失败/u);
  await assert.rejects(inspectCandidate({run:{},release:{}}),/身份/u);
  const broken=fixture();broken.body.set(names[0],Buffer.from('damaged'));
  await assert.rejects(preparePublication({request:broken.request}),/回读/u);
  await assert.rejects(preparePublication({request:async path=>path.startsWith('actions/')?{workflow_runs:[{path:workflow,repository:{full_name:repository},head_branch:'main',event:'workflow_dispatch',status:'completed',conclusion:'success'},{path:workflow,repository:{full_name:repository},head_branch:'main',event:'workflow_dispatch',status:'completed',conclusion:'success'}]}:[]}),/唯一/u);
 });
 test('公开候选字段闭集拒绝越界输入',()=>{
  assert.equal(names.length,3);assert.equal(exact({product_id:'citizenweb',delivery_channel:'web'},['product_id','delivery_channel']),true);
  assert.equal(exact({product_id:'citizenweb',unknown:true},['product_id']),false);
 });
 test('Pages发布只消费同一正式候选且失败不触发安全部署',async()=>{
  const source=fixture(),proof=await preparePublication({request:source.request});let installs=0,calls=0;
  const deploy=async request=>{calls++;
   assert.equal(request.release_tag,proof.tag);assert.equal(request.archive_sha256,proof.assets[0].sha256);
   assert.equal(request.previous_deployment_id,'00000000-0000-4000-8000-000000000001');
   return {product_id:'citizenweb',platform:'web',release_tag:proof.tag,source_sha:proof.source_sha,project:'citizenweb',deployed:true};};
  const options={proof,runID:'123456789',nodePath:process.execPath,
   previousID:'00000000-0000-4000-8000-000000000001',request:source.request,deploy,
   install:async(_node,_args,work)=>{installs++;assert.ok(work.includes('/target/publish/web/'));}};
  const result=await publishPages(options);assert.equal(result.deployed,true);assert.equal(installs,1);assert.equal(calls,1);
  await assert.rejects(publishPages({...options,proof:{...proof,source_sha:'b'.repeat(40)}}),/授权后发生变化/u);
  assert.equal(calls,1);
  await assert.rejects(publishPages({...options,previousID:'not-a-deployment'}),/任务身份无效/u);
  assert.equal(calls,1);
  await assert.rejects(publishPages({...options,install:async()=>{throw Error('锁定依赖缺失');}}),/锁定依赖缺失/u);
  assert.equal(calls,1);
 });
 test('官网发布配置只声明账户、部署令牌与本产品冷签信任锚',async()=>{
  const {describeConfiguration}=await import('./config.mjs');
  const rows=describeConfiguration().configuration.items;
  assert.deepEqual(rows.map(row=>[row.environment,row.name,row.accessLevel,row.kind]),[
   ['production','CF_ACCOUNT_ID','public','deployment'],
   ['cloudflare','PAGES_DEPLOY','protected','operation'],
   ['citizenweb-approval','COLD_SIGNER_PUBLIC_KEY','protected','authorization']]);
  assert.equal(rows.some(row=>Object.hasOwn(row,'value')),false);
 });
 // 本产品上传回归使用已存在的合成正式包；所有云读取与工具调用均由本用例模拟。
 async function pagesExecutionFixture(t){
  const base=fileURLToPath(new URL('../target/publish/web/',import.meta.url));await mkdir(base,{recursive:true});
  const work=await realpath(await mkdtemp(join(base,'123456789-')));t.after(()=>rm(work,{recursive:true,force:true}));
  const source=fixture(),proof=await preparePublication({request:source.request});
  for(const [name,bytes]of archiveFiles(source.body.get(names[0]))){await mkdir(dirname(join(work,name)),{recursive:true});await writeFile(join(work,name),bytes);}
  await mkdir(join(work,'node_modules/wrangler/bin'),{recursive:true});await writeFile(join(work,'node_modules/wrangler/bin/wrangler.js'),'synthetic');
  const previous='00000000-0000-4000-8000-000000000001',latest='00000000-0000-4000-8000-000000000002';
  const payload={schema:1,product_id:'citizenweb',platform:'web',run_id:'123456789',release_tag:proof.tag,source_sha:proof.source_sha,version:proof.version,
   archive_sha256:proof.assets[0].sha256,previous_deployment_id:previous,work,node_path:await realpath(process.execPath)};
  const credentials={account:'1'.repeat(32),token:'synthetic-pages-credential'},calls=[];let reads=0,mode='success';
  const invoke=async(_node,args,_work,environment,_signal,options={})=>{
   calls.push(args);if(args[0]==='--version')return 'v25.2.1';if(args[1]==='--version')return '4.121.0';
   assert.equal(environment.CLOUDFLARE_API_TOKEN,credentials.token);assert.equal(args.includes(credentials.token),false);assert.deepEqual(options.protectedValues,[credentials.token]);
   if(mode==='tool-failure')throw Error('synthetic upload failure');return '';
  };
  const request=async url=>{
   assert.ok(url.startsWith('https://api.cloudflare.com/client/v4/accounts/'+credentials.account+'/pages/projects/citizenweb'));
   if(!url.includes('/deployments?'))return Response.json({success:true,result:{name:'citizenweb',production_branch:'main',domains:['www.crcfrcn.com']}});
   reads++;return Response.json({success:true,result:[{id:reads===1?(mode==='changed' ? latest : previous):latest,project_name:'citizenweb',environment:'production',
    latest_stage:{name:'deploy',status:'success'},created_on:new Date().toISOString(),deployment_trigger:{metadata:{branch:'main',commit_hash:mode==='wrong-source'?'b'.repeat(40):proof.source_sha}}}]});
  };
  return {payload,credentials,calls,invoke,request,setMode:value=>{mode=value;reads=0;calls.length=0;}};
 }
 test('Pages上传及回读使用本产品入口，凭据不进入命令行',async t=>{
  const f=await pagesExecutionFixture(t),result=await deployPages(f.payload,f.credentials,f);
  assert.equal(result.deployed,true);assert.equal(f.calls.filter(args=>args[1]==='pages').length,1);
  const command=f.calls.find(args=>args[1]==='pages');assert.deepEqual(command.slice(1,4),['pages','deploy',join(f.payload.work,'dist')]);
 });
 test('Pages前态变化、工具失败、错误回读和取消均不返回成功',async t=>{
  const f=await pagesExecutionFixture(t);f.setMode('changed');await assert.rejects(deployPages(f.payload,f.credentials,f),/上次生产部署已变化/u);
  assert.equal(f.calls.some(args=>args[1]==='pages'),false);
  f.setMode('tool-failure');await assert.rejects(deployPages(f.payload,f.credentials,f),/synthetic upload failure/u);assert.equal(f.calls.filter(args=>args[1]==='pages').length,1);
  f.setMode('wrong-source');await assert.rejects(deployPages(f.payload,f.credentials,f),/回读失败/u);
  f.setMode('success');const abort=new AbortController();abort.abort(Error('synthetic cancellation'));
  await assert.rejects(deployPages(f.payload,f.credentials,{...f,signal:abort.signal}),/synthetic cancellation/u);assert.equal(f.calls.length,0);
  await writeFile(join(f.payload.work,'dist/index.html'),'changed');await assert.rejects(deployPages(f.payload,f.credentials,f),/清单不一致/u);assert.equal(f.calls.length,0);
 });

}
