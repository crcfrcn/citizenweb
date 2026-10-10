#!/usr/bin/env node
// 官网发布只读核验已完成自动化的公开正式资产；Tag、Release及云部署均不属于此入口。
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

const repository='crcfrcn/citizenweb',workflow='.github/workflows/release-web.yml';
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

function inspectPackage(bytes,manifestBytes,sumsBytes,version,sourceSHA){
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
   ||manifest.files.map(row=>row.path).join('\0')!==[...seen].sort().join('\0'))fail('正式包成员不完整');
 if(source.version!==version||lock.version!==version||lock.packages?.['']?.version!==version)fail('正式包版本不一致');
 if(digest(Buffer.from(stable(assets)))!==manifest.assets_sha256)fail('静态资源清单摘要不一致');
 if(!exact(marker,['product_id','delivery_channel','software_version','git_commit_sha','assets_sha256'])
  ||stable(marker)!==stable({product_id:'citizenweb',delivery_channel:'web',software_version:version,git_commit_sha:sourceSHA,assets_sha256:manifest.assets_sha256}))fail('公开版本标记不一致');
 const rows=[...manifest.files,{path:'release-manifest.json',sha256:digest(manifestBytes)}].sort((a,b)=>a.path.localeCompare(b.path));
 if(sumsBytes.toString('utf8')!==rows.map(row=>row.sha256+'  '+row.path).join('\n')+'\n')fail('正式摘要表无效');
 return {manifest,files:files.size};
}

async function inspectCandidate({run,release,readTag,readAsset}){
 if(run?.path!==workflow||run.repository?.full_name!==repository||run.head_branch!=='main'||run.event!=='workflow_dispatch'
  ||run.status!=='completed'||run.conclusion!=='success'||!positive(run.id)||!positive(run.run_attempt)||!/^[a-f0-9]{40}$/u.test(run.head_sha||''))fail('成功自动化身份无效');
 const match=/^citizenweb-web-v(\d+\.\d+\.\d+)-r([1-9]\d*)-a([1-9]\d*)$/u.exec(release?.tag_name||'');
 if(!match||Number(match[2])!==run.id||Number(match[3])!==run.run_attempt||!positive(release.id)||release.draft||release.prerelease
   ||release.target_commitish!==run.head_sha||!Array.isArray(release.assets)||release.assets.length!==names.length)fail('正式Release身份无效');
 const tag=await readTag(release.tag_name);
 if(tag?.ref!=='refs/tags/'+release.tag_name||tag.object?.type!=='commit'||tag.object.sha!==run.head_sha)fail('正式Tag源码不一致');
 const bytes=new Map(),proof=[];
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
  bytes.set(name,body);proof.push({name,asset_id:asset.id,bytes:total,sha256:digest(body)});
 }
 const product=inspectPackage(bytes.get(names[0]),bytes.get(names[1]),bytes.get(names[2]),match[1],run.head_sha);
 return {schema:1,product_id:'citizenweb',delivery_channel:'web',version:match[1],source_sha:run.head_sha,
  run_id:run.id,run_attempt:run.run_attempt,release_id:release.id,tag:release.tag_name,archive_files:product.files,assets:proof};
}

export async function preparePublication({request=publicRequest}={}){
 const runs=await pages('actions/runs','workflow_runs',request),releases=await pages('releases',null,request);
 const success=runs.filter(run=>run?.path===workflow&&run.repository?.full_name===repository&&run.head_branch==='main'
  &&run.event==='workflow_dispatch'&&run.status==='completed'&&run.conclusion==='success');
 if(success.length!==1)fail('缺少唯一保留成功自动化');
 const run=success[0],suffix='-r'+run.id+'-a'+run.run_attempt;
 const release=releases.filter(value=>value?.tag_name?.startsWith('citizenweb-web-v')&&value.tag_name.endsWith(suffix));
 if(release.length!==1)fail('成功自动化缺少唯一Release');
 return inspectCandidate({run,release:release[0],readTag:tag=>request('git/ref/tags/'+encodeURIComponent(tag)),
  readAsset:async asset=>(await request(asset.url,{raw:true}))?.body});
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
if(direct&&!testing){if(process.argv.length!==3||process.argv[2]!=='prepare')fail('发布只读入口参数无效');void preparePublication().then(value=>process.stdout.write(JSON.stringify(value)+'\n')).catch(error=>{console.error(error.message);process.exitCode=1;});}

if(testing){
 const {test}=await import('node:test'),{default:assert}=await import('node:assert/strict'),{gzipSync}=await import('node:zlib'),{Readable}=await import('node:stream');
 function fixture(){
  const source='a'.repeat(40),version='1.0.0',tag='citizenweb-web-v1.0.0-r42-a1';
  const fileBytes=new Map([['package.json',Buffer.from(JSON.stringify({version}))],['package-lock.json',Buffer.from(JSON.stringify({version,packages:{'':{version}}}))],['dist/index.html',Buffer.from('<html>synthetic</html>')],['dist/app.js',Buffer.from('synthetic')]]);
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
  const release={id:7,tag_name:tag,draft:false,prerelease:false,target_commitish:source,assets:names.map((name,index)=>({id:index+1,name,state:'uploaded',size:body.get(name).length,digest:'sha256:'+digest(body.get(name)),url:`https://api.github.com/repos/${repository}/releases/assets/${index+1}`}))};
  const request=async path=>path.startsWith('actions/runs?')?{workflow_runs:[run]}:path.startsWith('releases?')?[release]:path.startsWith('git/ref/tags/')?{ref:'refs/tags/'+tag,object:{type:'commit',sha:source}}:{body:Readable.from([body.get(release.assets.find(asset=>asset.url===path)?.name)])};
  return {run,release,body,request};
 }
 test('成功Web自动化的三件正式资产与全部归档成员独立验真',async()=>{
  const value=await preparePublication({request:fixture().request});assert.equal(value.archive_files,7);assert.equal(value.assets.length,3);assert.equal(value.version,'1.0.0');
 });
 test('归档缺失、来源错配与重复成功Run均拒绝',async()=>{
  assert.throws(()=>archiveFiles(Buffer.from('not-gzip')),/解压失败/u);
  await assert.rejects(inspectCandidate({run:{},release:{}}),/身份/u);
  const broken=fixture();broken.body.set(names[0],Buffer.from('damaged'));
  await assert.rejects(preparePublication({request:broken.request}),/回读/u);
  await assert.rejects(preparePublication({request:async path=>path.startsWith('actions/')?{workflow_runs:[{path:workflow,repository:{full_name:repository},head_branch:'main',event:'workflow_dispatch',status:'completed',conclusion:'success'},{path:workflow,repository:{full_name:repository},head_branch:'main',event:'workflow_dispatch',status:'completed',conclusion:'success'}]}:[]}),/唯一/u);
 });
 test('只公开只读准备入口，错误参数不能产生正式动作',()=>{
  assert.equal(names.length,3);assert.equal(exact({product_id:'citizenweb',delivery_channel:'web'},['product_id','delivery_channel']),true);
  assert.equal(exact({product_id:'citizenweb',unknown:true},['product_id']),false);
 });
}
