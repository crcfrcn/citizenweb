import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectPackage,releaseNames,preparePublication,publishPages,deployPages} from '../scripts/publish.mjs';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {mkdir,mkdtemp,realpath,rm,writeFile} from 'node:fs/promises';
import {repository} from '../scripts/config.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
test('正式外部附件统一准确产品、平台和版本',()=>{
 assert.deepEqual(releaseNames('1.0.12'),['citizenweb-web-v1.0.12.tgz','citizenweb-web-v1.0.12.json','citizenweb-web-v1.0.12.sha256']);assert.throws(()=>releaseNames('1.0.12\n'));
});
test('官方tar解包拒绝链接和父目录成员',t=>{
 const parent=join(root,'target/test');mkdirSync(parent,{recursive:true});const work=mkdtempSync(join(parent,'archive-'));t.after(()=>rmSync(work,{recursive:true,force:true}));
 writeFileSync(join(work,'input'),'synthetic');symlinkSync('input',join(work,'link'));
 for(const [name,args]of [['link',['link']],['parent',['-s',',input,../escape,','input']]]){
  const archive=join(work,name+'.tgz');execFileSync('/usr/bin/tar',['-czf',archive,'-C',work,...args]);assert.throws(()=>inspectPackage(readFileSync(archive),Buffer.from('{}'),Buffer.from(''),'1.0.12','a'.repeat(40)));
 }
});
test('损坏归档不会变成空的成功产物',()=>{assert.throws(()=>inspectPackage(Buffer.from('invalid archive'),Buffer.from('{}'),Buffer.from(''),'1.0.12','a'.repeat(40)));});

// 发布测试使用自有合成正式包，归档生成与模拟部署均不进入发布执行文件。
const workflow='.github/workflows/web.yml';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const stable=value=>Array.isArray(value)?`[${value.map(stable).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')}}`:JSON.stringify(value);
 const names=releaseNames('1.0.0');
 function fixture({manifestFields={}}={}){
  const source='a'.repeat(40),version='1.0.0',tag='公民官网·Web·v1.0.0';
  const fileBytes=new Map([['package.json',Buffer.from(JSON.stringify({version,devDependencies:{wrangler:'4.121.0'}}))],
   ['package-lock.json',Buffer.from(JSON.stringify({version,packages:{'':{version},'node_modules/wrangler':{version:'4.121.0'}}}))],
   ['dist/index.html',Buffer.from('<html>synthetic</html>')],['dist/app.js',Buffer.from('synthetic')],
   ['dist/assets/Whitepaper.js',Buffer.from('synthetic-whitepaper')]]);
  const assets=[...fileBytes].filter(([path])=>path.startsWith('dist/')).map(([path,bytes])=>({path,sha256:digest(bytes)})).sort((a,b)=>a.path.localeCompare(b.path));
  const assets_sha256=digest(Buffer.from(stable(assets)));
  fileBytes.set('dist/citizenweb-release.json',Buffer.from(JSON.stringify({product_id:'citizenweb',delivery_channel:'web',software_version:version,git_commit_sha:source,assets_sha256})));
  const entries=[...fileBytes].map(([path,bytes])=>({path,sha256:digest(bytes)})).sort((a,b)=>a.path.localeCompare(b.path));
  const manifest=Buffer.from(JSON.stringify({product_id:'citizenweb',delivery_channel:'web',software_version:version,git_commit_sha:source,tools:{node:'25.2.1',npm:'11',vite:'8',wrangler:'4'},assets_sha256,files:entries,...manifestFields}));
  fileBytes.set('release-manifest.json',manifest);
  const sums=Buffer.from([...entries,{path:'release-manifest.json',sha256:digest(manifest)}].sort((a,b)=>a.path.localeCompare(b.path)).map(row=>row.sha256+'  '+row.path).join('\n')+'\n');fileBytes.set('SHA256SUMS',sums);
  const base=fileURLToPath(new URL('../target/test/',import.meta.url));mkdirSync(base,{recursive:true});const work=mkdtempSync(join(base,'release-fixture-')),payload=join(work,'files');mkdirSync(payload);
  let archive;try{for(const [name,bytes]of fileBytes){const file=join(payload,name);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,bytes);}
   const file=join(work,'package.tgz');execFileSync('/usr/bin/tar',['-czf',file,'--format','ustar','-C',payload,'dist','package.json','package-lock.json','release-manifest.json','SHA256SUMS']);archive=readFileSync(file);
  }finally{rmSync(work,{recursive:true,force:true});}
  const body=new Map([[names[0],archive],[names[1],manifest],[names[2],sums]]);
  const run={id:42,run_attempt:1,path:workflow,repository:{full_name:repository},head_branch:'main',event:'workflow_dispatch',status:'completed',conclusion:'success',head_sha:source};
  const release={id:7,tag_name:tag,body:'<!-- automation:'+JSON.stringify({version,run_id:42,run_attempt:1})+' -->',draft:false,prerelease:false,target_commitish:source,assets:names.map((name,index)=>({id:index+1,name,state:'uploaded',size:body.get(name).length,digest:'sha256:'+digest(body.get(name)),url:`https://api.github.com/repos/${repository}/releases/assets/${index+1}`}))};
  const request=async path=>path.startsWith('actions/runs?')?{workflow_runs:[run]}:path.startsWith('releases?')?[release]:path.startsWith('git/ref/tags/')?{ref:'refs/tags/'+tag,object:{type:'commit',sha:source}}:{body:Readable.from([body.get(release.assets.find(asset=>asset.url===path)?.name)])};
  return {run,release,body,request};
 }
 test('成功Web自动化的三件正式资产与全部归档成员独立验真',async()=>{
  const value=await preparePublication({request:fixture().request});assert.equal(value.archive_files,8);assert.equal(value.assets.length,3);assert.equal(value.version,'1.0.0');
  assert.equal(value.tag,'公民官网·Web·v1.0.0');assert.deepEqual(value.assets.map(asset=>asset.name),names);
 });
 test('归档缺失、来源错配与重复成功Run均拒绝',async()=>{
  assert.throws(()=>inspectPackage(Buffer.from('not-gzip'),Buffer.from('{}'),Buffer.from(''),'1.0.0','a'.repeat(40)),/解压失败/u);
  const wrongIdentity=fixture();wrongIdentity.run.head_sha='invalid';await assert.rejects(preparePublication({request:wrongIdentity.request}),/身份/u);
  const broken=fixture();broken.body.set(names[0],Buffer.from('damaged'));
  await assert.rejects(preparePublication({request:broken.request}),/回读/u);
  await assert.rejects(preparePublication({request:async path=>path.startsWith('actions/')?{workflow_runs:[{path:workflow,repository:{full_name:repository},head_branch:'main',event:'workflow_dispatch',status:'completed',conclusion:'success'},{path:workflow,repository:{full_name:repository},head_branch:'main',event:'workflow_dispatch',status:'completed',conclusion:'success'}]}:[]}),/唯一/u);
 });
 test('公开候选字段闭集拒绝越界输入',()=>{
  assert.equal(names.length,3);
  const invalid=fixture({manifestFields:{unknown:true}});
  assert.throws(()=>inspectPackage(invalid.body.get(names[0]),invalid.body.get(names[1]),invalid.body.get(names[2]),'1.0.0',invalid.run.head_sha),/清单身份无效/u);
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
  const {describeConfiguration}=await import('../scripts/config.mjs');
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
  const archive=join(work,'fixture.tgz');await writeFile(archive,source.body.get(names[0]));
  execFileSync('/usr/bin/tar',['-xzf',archive,'-C',work,'--no-same-owner','--no-same-permissions']);await rm(archive);
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


