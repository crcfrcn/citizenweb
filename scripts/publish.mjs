#!/usr/bin/env node
// 官网发布独立核验成功自动化的正式资产，拥有Pages上传与部署回读；不创建Tag或Release。
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,rmSync,readdirSync,lstatSync} from 'node:fs';
import {mkdir,mkdtemp,rm,writeFile,realpath,lstat,readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const repository='crcfrcn/citizenweb',workflow='.github/workflows/web.yml';
// 正式附件是产品公开交付格式；发布独立读取，不导入编译入口或配置执行函数。
const artifactPrefix='公民官网·Web·v',artifactFilePrefix='citizenweb-web-v',artifactSuffixes=['tgz','json','sha256'];
// 只按声明读取同一正式版本的附件名称，不创建产物。
function publicationName(version){if(typeof version!=='string'||version.length>64||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version))fail('正式版本无效');return artifactPrefix+version;}
export function releaseNames(version){publicationName(version);return artifactSuffixes.map(suffix=>artifactFilePrefix+version+'.'+suffix);}
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

// tar负责格式解析；产品只约束允许的普通成员、大小和目标目录。
function archiveFiles(bytes){
 const base=fileURLToPath(new URL('../target/publish/',import.meta.url));mkdirSync(base,{recursive:true});
 const work=mkdtempSync(join(base,'inspect-')),archive=join(work,'package.tgz'),output=join(work,'files');
 try{
  writeFileSync(archive,bytes,{mode:0o600});mkdirSync(output);
  // 官方tar读取或解包失败沿用原有错误类别，成员与路径检查继续单独拒绝。
  const invoke=args=>{
   try{return execFileSync('/usr/bin/tar',args,{encoding:'utf8',maxBuffer:8*1024**2,stdio:['ignore','pipe','pipe']});}
   catch(error){throw Error('正式归档解压失败：'+error.message,{cause:error});}
  };
  const names=invoke(['-tzf',archive]).trim().split('\n'),seen=new Set();
  if(!names.length||names.length>10000)fail('归档成员数量无效');
  for(const raw of names){const name=raw.replace(/\/$/u,'');
   if(!name||name.startsWith('/')||name.split('/').some(part=>!part||part==='.'||part==='..')||seen.has(name)||!/^(?:dist(?:\/[A-Za-z0-9._/-]+)?|package(?:-lock)?\.json|release-manifest\.json|SHA256SUMS)$/u.test(name))fail('归档成员越界或重复');seen.add(name);
  }
  let total=0;for(const line of invoke(['-tvzf',archive]).trim().split('\n')){
   if(!['-','d'].includes(line[0]))fail('归档禁止链接或特殊文件');
   const size=Number(line.trim().split(/\s+/u)[4]);if(!Number.isSafeInteger(size)||size<0||size>128*1024**2||(total+=size)>256*1024**2)fail('归档成员大小超限');
  }
  invoke(['-xzf',archive,'-C',output,'--no-same-owner','--no-same-permissions']);
  const files=new Map();function visit(directory,prefix=''){for(const name of readdirSync(directory)){const path=join(directory,name),info=lstatSync(path),entry=prefix+name;
   if(info.isDirectory())visit(path,entry+'/');else if(info.isFile()&&info.nlink===1&&info.size>0)files.set(entry,readFileSync(path));else fail('归档文件类型无效');
  }}visit(output);return files;
 }catch(error){fail(error.message.startsWith('正式归档解压失败：')?error.message:'正式归档校验失败：'+error.message);}finally{rmSync(work,{recursive:true,force:true});}
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
 const names=releaseNames(match?.[1]||'0.0.0');
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
 const run=success[0];
 const release=releases.filter(value=>{try{const proof=JSON.parse(/^<!-- automation:(\{[^\n]*\}) -->$/m.exec(value?.body||'')?.[1]||'null');return value?.tag_name===publicationName(proof?.version||'')&&proof?.run_id===run.id&&proof?.run_attempt===run.run_attempt;}catch{return false;}});
 if(release.length!==1)fail('成功自动化缺少唯一Release');
 return inspectCandidate({run,release:release[0],readTag:tag=>request('git/ref/tags/'+encodeURIComponent(tag)),
  readAsset:async asset=>(await request(asset.url,{raw:true}))?.body,includeContents});
}
export async function preparePublication({request=publicRequest}={}){return selectedPublication(request);}

// 冷签准备只读取成功候选与当前生产部署；凭据仅由原生私有输入管道交付。
export async function preparePublish({credentials,request=fetch,publicationRequest=publicRequest,signal}={}){
 const proof=await preparePublication({request:publicationRequest}),{account,token}=deploymentCredentials(credentials);
 const previous=(await cloudflareJSON(account,token,'pages/projects/citizenweb/deployments?env=production&per_page=1',{request,signal}))?.[0];
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(previous?.id||'')
  ||previous.project_name!=='citizenweb'||previous.environment!=='production'||previous.latest_stage?.status!=='success')fail('Pages当前生产部署未确认');
 return {proof,previousID:previous.id};
}

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
  ||!/^[1-9][0-9]*$/u.test(payload.run_id||'')||!/^\d+\.\d+\.\d+$/u.test(payload.version||'')
  ||payload.release_tag!==publicationName(payload.version)
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
  ||typeof runID!=='string'||!/^[1-9][0-9]*$/u.test(runID)||typeof deploy!=='function'
  ||typeof nodePath!=='string'||!nodePath.startsWith('/')||typeof previousID!=='string'
  ||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(previousID))fail('Pages发布任务身份无效');
 const names=releaseNames(proof?.version||'0.0.0');
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
   npm_config_cache:process.env.npm_config_cache||join(process.env.HOME,'.npm'),npm_config_offline:'true',CI:'1',WRANGLER_SEND_METRICS:'false'};
  const npmCLI=join(dirname(nodePath),'../lib/node_modules/npm/bin/npm-cli.js');
  await install(nodePath,[npmCLI,'ci','--offline','--ignore-scripts','--no-audit','--no-fund'],work,environment,signal);
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


// 冷签业务字节归本产品；控制台只保存准确字节并验签，不解析这些字段。
function approvalText(value){const data=Buffer.from(value,'utf8');let n=BigInt(data.length);if(n<64n)return Buffer.concat([Buffer.from([Number(n<<2n)]),data]);if(n<16384n){const size=Buffer.alloc(2);size.writeUInt16LE(Number((n<<2n)|1n));return Buffer.concat([size,data]);}fail('批准文本过长');}
function approvalHex(value,width){if(typeof value!=='string'||!new RegExp('^[a-f0-9]{'+width*2+'}$','u').test(value)||/^0+$/u.test(value))fail('批准摘要无效');return Buffer.from(value,'hex');}
export function approvalPayload(candidate,context){
 if(!context||!Number.isSafeInteger(context.expires_at)||context.expires_at<=0)fail('批准期限无效');
 const {proof,previousID}=candidate??{};
 if(proof?.product_id!=='citizenweb'||proof.delivery_channel!=='web'||proof.tag!==publicationName(proof.version)||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(previousID||''))fail('官网批准候选身份无效');
 const expiry=Buffer.alloc(8);expiry.writeBigUInt64LE(BigInt(context.expires_at));
 return Buffer.concat([approvalText('citizenweb'),approvalText('web'),approvalText(proof.version),approvalHex(proof.source_sha,20),
  approvalHex(proof.assets.find(asset=>asset.name===releaseNames(proof.version)[0])?.sha256,32),approvalText(previousID),expiry,approvalHex(context.nonce,32)]);
}
function approvalResponse(candidate,context){return {schema:1,product_id:'citizenweb',platform:'web',candidate,
 payload_base64:approvalPayload(candidate,context).toString('base64'),version_tag:candidate.proof.tag,artifact_sha256:candidate.proof.assets.find(asset=>asset.name===releaseNames(candidate.proof.version)[0])?.sha256};}
function approvalInput(value){if(!value||!value.context||typeof value.approvedPayload!=='string'||!Buffer.from(value.approvedPayload,'base64').equals(approvalPayload(value.candidate,value.context))||Buffer.from(value.approvedPayload,'base64').toString('base64')!==value.approvedPayload||value.context.expires_at<Math.floor(Date.now()/1000))fail('本次准确发布批准无效或过期');}

function approvalCredentials(configuration){return {account:configuration?.['production:CLOUDFLARE_ACCOUNT'],token:configuration?.['cloudflare:PAGES_DEPLOY']};}
export async function prepareApproval({configuration,context,...options}={}){return approvalResponse(await preparePublish({credentials:approvalCredentials(configuration),...options}),context);}
export async function publishApproval(value,options={}){approvalInput(value);return publishPages({...value.candidate,runID:value.runID,nodePath:value.nodePath,credentials:approvalCredentials(value.configuration),...options});}

const direct=process.argv[1]===import.meta.filename;
if(direct&&!process.env.NODE_TEST_CONTEXT){
 const controller=new AbortController();for(const name of ['SIGTERM','SIGINT'])process.once(name,()=>controller.abort(Error('发布已取消')));
 void (async()=>{
  if(process.argv.length!==3||!['prepare','publish','deploy'].includes(process.argv[2]))fail('发布入口参数无效');
  let text='';for await(const chunk of process.stdin){text+=chunk;if(Buffer.byteLength(text)>1024**2)fail('发布输入超限');}
  let value;try{value=JSON.parse(text);}catch{fail('发布输入JSON无效');}
  if(!value||typeof value!=='object'||Array.isArray(value))fail('发布输入无效');
  if(process.argv[2]==='prepare')return prepareApproval({...value,signal:controller.signal});
  if(process.argv[2]==='deploy')return deployPages(value.payload,value.credentials,{signal:controller.signal});
  return publishApproval(value,{signal:controller.signal});
 })().then(value=>process.stdout.write(JSON.stringify(value)+'\n')).catch(error=>{console.error(error.message);process.exitCode=1;});
}
