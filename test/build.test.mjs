import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,rmSync,existsSync,readdirSync,writeFileSync,chmodSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {root,displayName,run} from '../scripts/build.mjs';
import {constitutionFiles,constitutionTools,describeAction} from '../scripts/config.mjs';
import {initialVersion,platforms,repository} from '../scripts/build.mjs';
const platform=Object.keys(platforms)[0];
test('公民链下载按所选平台取最新正式包',async()=>{
 const source=readFileSync(join(root,'frontend/components/DownloadButton.tsx'),'utf8');
 // 只装载组件中的下载逻辑，Node 回归无需启动 React 或下载安装包。
 const resolver=source.slice(source.indexOf('export type CitizenChainPlatform'),source.indexOf('interface DownloadButtonProps'));
 const script=stripTypeScriptTypes(resolver+'\nexport {resolveCitizenChainDownload};');
 const {resolveCitizenChainDownload}=await import('data:text/javascript;base64,'+Buffer.from(script).toString('base64'));
 function release(stem,extension,version,published_at){
  const tag_name=`公民链·${stem}·v${version}`,name=`citizenchain-${stem}-v${version}.${extension}`;
  return {tag_name,published_at,draft:false,prerelease:false,assets:[{name,state:'uploaded',
   browser_download_url:`https://github.com/crcfrcn/citizenchain/releases/download/${encodeURIComponent(tag_name)}/${name}`}]};
 }
 const targets=[['macos','macOS','dmg'],['windows','Windows','exe'],['linux-arm','LinuxARM','deb'],['linux-amd','LinuxAMD','deb']];
 const latest=targets.map(([,stem,extension])=>release(stem,extension,'1.0.2','2026-11-01'));
 const older=release('macOS','dmg','1.0.1','2026-10-01');
 const preview={...release('macOS','dmg','1.0.3','2026-11-02'),prerelease:true};
 const draft={...release('macOS','dmg','1.0.4','2026-11-03'),draft:true};
 const list=[preview,draft,older,...latest];
 for(const [index,[target]] of targets.entries()){
  let calls=0;
  const url=await resolveCitizenChainDownload(target,async endpoint=>{
   calls++;
   assert.equal(endpoint,'https://api.github.com/repos/crcfrcn/citizenchain/releases?per_page=100&page=1');
   return Response.json(list);
  });
  assert.equal(calls,1);
  assert.equal(url,latest[index].assets[0].browser_download_url);
 }
 await assert.rejects(resolveCitizenChainDownload('macos',async()=>Response.json([
  older,{...latest[0],assets:[]},
 ])),/最新正式版的安装包不可用/u);
});
if(process.env.CONSTITUTION_OUTPUT)test('宪法 Worker 使用实际 Wasm 为多台电脑共享正文',async t=>{
 const dist=process.env.CONSTITUTION_OUTPUT;
 assert.deepEqual(JSON.parse(readFileSync(join(dist,'_routes.json'))),{version:1,include:['/constitution/data'],exclude:[]});
 const wasm=readFileSync(join(dist,'_worker.js/index_bg.wasm')).toString('base64');
 const entry=readFileSync(join(dist,'_worker.js/index.js'),'utf8').replace(
  'import constitutionWasm from "./index_bg.wasm";',
  `const constitutionWasm=new WebAssembly.Module(Uint8Array.from(atob('${wasm}'),char=>char.charCodeAt(0)));`);
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(entry).toString('base64'));
 const records=new Map(),calls={get:0,put:0,origin:0};
 let now=2_000_000,failed=false;
 t.mock.method(Date,'now',()=>now);
 const scheduler=Object.getOwnPropertyDescriptor(globalThis,'scheduler');
 Object.defineProperty(globalThis,'scheduler',{configurable:true,value:{async wait(delay){now+=delay;}}});
 t.after(()=>{if(scheduler)Object.defineProperty(globalThis,'scheduler',scheduler);else delete globalThis.scheduler;});
 const digest='0x'+'1'.repeat(64),body={html:'<h1>宪法</h1>',blake2_256:digest,source:'legislation-raw'};
 t.mock.method(globalThis,'fetch',async request=>{
  calls.origin++;
  assert.equal(request.url,'https://chain.crcfrcn.com/');
  assert.equal(request.method,'POST');
  assert.equal(request.redirect,'error');
  assert.equal(request.headers.get('cf-access-client-id'),'fixture-client');
  assert.equal(request.headers.get('cf-access-client-secret'),'fixture-token');
  assert.deepEqual(await request.json(),[
   {jsonrpc:'2.0',id:1,method:'chain_getBlockHash',params:[0]},
   {jsonrpc:'2.0',id:2,method:'constitution_getDocument',params:[]}]);
  if(failed)return new Response(null,{status:502});
  return Response.json([{jsonrpc:'2.0',id:2,result:body},{jsonrpc:'2.0',id:1,result:digest}]);
 });
 const env={CHAIN_GENESISHASH:digest,CFACCESS_CLIENTID:'fixture-client',CHAIN_SECRET:'fixture-token',
  ASSETS:{async fetch(){return new Response('asset');}},
  CACHE:{
   async get(key){
    calls.get++;assert.equal(key,'constitution');
    const current=records.get(key);
    return current?{etag:current.etag,size:current.bytes.length,uploaded:current.uploaded,body:new Response(current.bytes).body}:null;
   },
   async put(key,bytes,{onlyIf}){
    calls.put++;assert.equal(key,'constitution');
    const current=records.get(key);
    if(onlyIf.etagDoesNotMatch==='*'?current:onlyIf.etagMatches!==current?.etag)return null;
    if(current&&now-current.uploaded.getTime()<1000)throw Error('R2 429');
    const row={etag:createHash('sha256').update(bytes).digest('hex'),bytes:Uint8Array.from(bytes),uploaded:new Date(now)};
    records.set(key,row);
    return {etag:row.etag};
   },
  }};
 const url='https://www.crcfrcn.com/constitution/data';
 const fetch=(ip,options={})=>worker.fetch(new Request(options.url??url,{
  method:options.method??'GET',headers:ip?{'cf-connecting-ip':ip}:undefined}),env);
 assert.equal(await (await fetch(undefined,{url:'https://www.crcfrcn.com/about'})).text(),'asset');
 assert.equal((await fetch('192.0.2.1',{method:'POST'})).status,405);
 assert.equal((await fetch('192.0.2.1',{url:url+'?x=1'})).status,404);
 assert.deepEqual(calls,{get:0,put:0,origin:0});
 const [one,two]=await Promise.all([fetch('192.0.2.1'),fetch('192.0.2.1')]);
 assert.ok(one.ok||two.ok);
 for(const reply of [one,two]){
  if(reply.ok){
   assert.equal(reply.headers.get('cache-control'),'private, max-age=86400');
   assert.deepEqual(await reply.json(),{cached_at:now,...body});
  }else{
   assert.equal(reply.status,503);
   assert.equal(reply.headers.get('retry-after'),'2');
  }
 }
 assert.equal(calls.origin,1);
 assert.equal(records.size,1);
 const firstEtag=records.get('constitution').etag;
 const before={...calls};
 now+=1000;
 for(const ip of ['192.0.2.1','192.0.2.2']){
  const cached=await fetch(ip);
  assert.equal(cached.status,200);
  assert.equal(cached.headers.get('cache-control'),'private, max-age=86399');
  assert.deepEqual(await cached.json(),{cached_at:now-1000,...body});
 }
 assert.deepEqual(calls,{...before,get:before.get+2});
 now+=86_398_999;
 assert.equal((await fetch('192.0.2.1')).headers.get('cache-control'),'private, max-age=0');
 now++;
 assert.equal((await fetch('192.0.2.2')).status,200);
 assert.equal(calls.origin,2);
 assert.notEqual(records.get('constitution').etag,firstEtag);
 now+=86_400_000;
 failed=true;
 assert.equal((await fetch('192.0.2.2')).status,503);
 failed=false;
 const duringFailure={...calls};
 assert.equal((await fetch('192.0.2.1')).status,503);
 now+=29_999;
 assert.equal((await fetch('192.0.2.2')).status,503);
 assert.deepEqual(calls,{...duringFailure,get:duringFailure.get+2});
 now++;
 assert.equal((await fetch('192.0.2.2')).status,200);
 assert.equal(calls.origin,4);
});
if(process.env.PAGES_BUNDLE)test('宪法 Worker 在 Wrangler 装配的 Pages 包中运行',async t=>{
 const dist=process.env.CONSTITUTION_OUTPUT;
 const bytes=readFileSync(process.env.PAGES_BUNDLE);
 const boundary=bytes.toString('ascii',2,bytes.indexOf('\r\n'));
 const parts=await new Response(bytes,{headers:{'content-type':'multipart/form-data; boundary='+boundary}}).formData();
 const {main_module:entry}=JSON.parse(parts.get('metadata'));
 const wasm=[...parts.keys()].find(name=>name.endsWith('.wasm'));
 const contents=Buffer.from(await parts.get(wasm).arrayBuffer());
 assert.deepEqual(contents,readFileSync(join(dist,'_worker.js/index_bg.wasm')));
 // 运行上传包内原样的 JS 和 Wasm，R2 与静态资产在本轮现场隔离。
 const {Miniflare}=await import('miniflare');
 const index=readFileSync(join(dist,'index.html'),'utf8');
 const digest='0x'+'1'.repeat(64),body={html:'<h1>宪法</h1>',blake2_256:digest,source:'legislation-raw'};
 let origin=0;
 const runtime=new Miniflare({host:'127.0.0.1',port:0,cf:false,telemetry:{enabled:false},workers:[{
  config:{
   type:'worker',name:'pages',compatibilityDate:'2026-08-04',
   manifest:{mainModule:entry,modulesRoot:dist,modules:{
    [entry]:{type:'esm',contents:await parts.get(entry).text()},
    [wasm]:{type:'wasm',contents},
   }},
   env:{
    CACHE:{type:'r2',name:'constitution-test'},
    ASSETS:{type:'fetcher',handler:()=>new Response(index)},
    CHAIN_GENESISHASH:{type:'text',value:digest},
    CFACCESS_CLIENTID:{type:'text',value:'fixture-client'},
    CHAIN_SECRET:{type:'text',value:'fixture-token'},
   },
  },
  // 从 HTTP 入口触发真实 R2 的冷缓存和命中，回源只由本轮夹具响应。
  dev:{outboundService:{type:'fetcher',handler:async request=>{
   origin++;
   assert.equal(request.url,'https://chain.crcfrcn.com/');
   assert.equal(request.method,'POST');
   assert.equal(request.headers.get('cf-access-client-id'),'fixture-client');
   assert.equal(request.headers.get('cf-access-client-secret'),'fixture-token');
   return Response.json([{jsonrpc:'2.0',id:1,result:digest},{jsonrpc:'2.0',id:2,result:body}]);
  }}},
 }]});
 t.after(()=>runtime.dispose());
 const url='https://www.crcfrcn.com/constitution/data';
 const request=(target,method='GET')=>runtime.dispatchFetch(target,{method,signal:AbortSignal.timeout(10_000)});
 const response=await request(url);
 assert.equal(response.status,200);
 assert.match(response.headers.get('content-type'),/^application\/json/u);
 const {cached_at,...document}=await response.json();
 assert.ok(Number.isSafeInteger(cached_at));
 assert.deepEqual(document,body);
 assert.deepEqual(await (await request(url)).json(),{cached_at,...body});
 assert.equal(origin,1);
 assert.equal((await request(url,'POST')).status,405);
 assert.equal(await (await request('https://www.crcfrcn.com/constitution')).text(),index);
});
test('配置仅声明和引用，导入不派发、不生成现场',async()=>{
 const config=await import('../scripts/config.mjs');assert.equal(config.describeConfiguration().schema,1);
 const source=readFileSync(join(root,'scripts/config.mjs'),'utf8');assert.doesNotMatch(source,/\b(?:spawn|execFile|fetch|dispatch|readFile|writeFile)\s*\(/u);
 assert.equal(Object.hasOwn(config.describeConfiguration().configuration.items[0]||{},'value'),false);
});
test('准确名称和版本边界',()=>{
 assert.match(displayName(platform,'1.2.3'),/·v1\.2\.3$/u);
 for(const version of ['1.2','01.2.3','1.2.3\n','1.2.3-beta',null])assert.throws(()=>displayName(platform,version));
 assert.throws(()=>displayName('other','1.2.3'));
});

test('真实子进程非零退出和取消均失败',async()=>{
 await assert.rejects(run(process.execPath,['-e','process.exit(7)']),/执行失败/u);
 const controller=new AbortController(),pending=run(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:controller.signal});setTimeout(()=>controller.abort(),50);await assert.rejects(pending);
});
// 钱包装配和官网内容回归均使用所属产品临时现场，不访问真实凭据或GitHub。
if(platform!=='web'){
 const {materializeInputs}=await import('../scripts/build.mjs'),{generatePlatformIcons}=await import('../icons/generate.mjs');
 test('普通平台工程、原锁及官方图标完整交付',t=>{
  const parent=join(root,'target/test');mkdirSync(parent,{recursive:true});const work=mkdtempSync(join(parent,'layout-')),project=join(work,'source-view');mkdirSync(project);t.after(()=>rmSync(work,{recursive:true,force:true}));
  for(const name of ['ios','android','icons','Podfile.lock'])cpSync(join(root,name),join(project,name),{recursive:true});materializeInputs(root,project);
  for(const name of ['ios/Runner.xcodeproj/project.pbxproj','ios/Runner/HardwareSecretvaultPlugin.swift','ios/signer/citizenwallet_signer.podspec','android/app/src/test/kotlin/com/crcfrcn/citizenwallet/HardwareSecretvaultPluginTest.kt'])assert.ok(existsSync(join(project,name)),name);
  assert.ok(readFileSync(join(project,'ios/Podfile.lock')).equals(readFileSync(join(root,'Podfile.lock'))));
  const android=generatePlatformIcons(project,'android'),ios=generatePlatformIcons(project,'ios');assert.equal(readdirSync(android).length,5);assert.ok(existsSync(join(ios,'AppIcon.appiconset/Contents.json')));
  assert.throws(()=>generatePlatformIcons(root,'ios'),/target/u);
 });
}else{
 const {whitepaperContent,httpsOptions}=await import('../scripts/build.mjs');
 test('白皮书正文和内嵌图片交付保持',()=>{
  const names=[],result=JSON.parse(whitepaperContent('# 原文\n![图](./assets/one.png)',name=>{names.push(name);return Buffer.from('synthetic');}));assert.deepEqual(names,['one.png']);assert.equal(result.markdown,'# 原文\n![图](data:image/png;base64,c3ludGhldGlj)');
  assert.equal(JSON.parse(whitepaperContent('纯正文',()=>{throw Error('不应读取图片');})).markdown,'纯正文');
 });
 test('HTTPS缺件明确失败，配置不含生成插件',()=>{assert.throws(()=>httpsOptions({}),/HTTPS/u);const source=readFileSync(join(root,'config/vite.config.ts'),'utf8');assert.doesNotMatch(source,/generateBundle|writeFile|whitepaperContent|readFileSync/u);});
}

// 删除中断不能丢失原正式版本的归属；重试继续同一批终态，不重跑业务。

// 代码职责边界：编译不调用发布入口，发布执行文件不生成归档或测试夹具。
test('构建与发布执行职责分离',()=>{
 const build=readFileSync(join(root,'scripts/build.mjs'),'utf8'),publish=readFileSync(join(root,'scripts/publish.mjs'),'utf8');
 assert.doesNotMatch(build,/publish\.mjs/u);
 assert.doesNotMatch(publish,/node:test|function\s+(?:fixture|buildProduct|packageProduct)\b|['"]-czf['"]/u);
 assert.doesNotMatch(publish,/from\s*['"]\.\/build\.mjs['"]/u);
});

// 用Node内置Mock仅模拟本用例的ps查询拒绝，不修改进程权限。
test('EPERM保留工具原失败与现场，工具退出零也不能冒充收尾成功',async t=>{
 const childProcess=(await import('node:child_process')).default,spawnSync=childProcess.spawnSync;
 t.mock.method(childProcess,'spawnSync',(command,...args)=>command==='/bin/ps'?{error:Object.assign(Error('synthetic ps permission'),{code:'EPERM'}),status:null,stdout:''}:spawnSync(command,...args));
 for(const code of [7,0])await assert.rejects(run(process.execPath,['-e',`process.stderr.write("synthetic-tool-result");process.exit(${code});`]),error=>{
  assert.equal(error.keepWork,true);assert.equal(error.processId>0,true);assert.equal(error.groupId,error.processId);assert.match(error.message,/EPERM/u);
  if(code){assert.match(error.message,/退出码=7/u);assert.match(error.message,/synthetic-tool-result/u);assert.match(error.cause.message,/退出码=7/u);}
  return true;
 });
});

// 无效快照不得成功；真实后代仍在时必须等它完成，才允许消费结果。
test('ps空表和缺少调用进程的结果均保留现场',async t=>{
 const childProcess=(await import('node:child_process')).default;
 for(const stdout of ['', 'invalid', '1 1\n']){
  const mock=t.mock.method(childProcess,'spawnSync',()=>({status:0,stdout}));
  try{await assert.rejects(run(process.execPath,['-e','process.exit(0)']),error=>{assert.equal(error.keepWork,true);assert.match(error.message,/查询结果无效/u);return true;});}finally{mock.mock.restore();}
 }
});
test('真实同组后代完成后才返回工具成功',async t=>{
 const base=join(root,'target/test');mkdirSync(base,{recursive:true});const work=mkdtempSync(join(base,'descendant-')),marker=join(work,'done');t.after(()=>rmSync(work,{recursive:true,force:true}));
 const nested=`setTimeout(()=>{require('node:fs').writeFileSync(${JSON.stringify(marker)},'done');},700);`;
 const source=`require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(nested)}],{stdio:'ignore'}).unref();`;
 await run(process.execPath,['-e',source]);assert.equal(readFileSync(marker,'utf8'),'done');
});

// 客户端只派发，工作流自己执行GitHub删除，不向控制台索取清理权限。

test('各平台Workflow独立生成版本和清理，配置只声明数据',()=>{
 for(const target of Object.keys(platforms)){
  assert.deepEqual(describeAction({flow:'release',platform:target}),{repository,workflow:target+'.yml',ref:'main',inputs:{}});
  const source=readFileSync(join(root,'.github/workflows',target+'.yml'),'utf8');assert.match(source,/gh run delete/u);assert.match(source,/github\.run_number/u);
 }
});

test('Linux 版本作业读取成功产物并精确递增补丁号',async()=>{
 const workflow=readFileSync(join(root,'.github/workflows/web.yml'),'utf8');
 const job=workflow.split('  version:\n')[1].split('\n  compile:')[0];
 const script=job.split('        run: |\n')[1].split('\n').map(line=>line.slice(10)).join('\n');
 const mock=String.raw`
gh() {
  case "$2" in
    */actions/workflows/web.yml/runs\?*) printf '%s\n' "$PREVIOUS";;
    */actions/runs/42/artifacts\?*) printf '%s\n' "$ARTIFACTS";;
    *) return 1;;
  esac
}
`;
 const version=(previous,artifacts)=>run('/bin/bash',['-c',mock+script],{capture:true,env:{
  GITHUB_REPOSITORY:repository,GITHUB_OUTPUT:'/dev/stdout',PREVIOUS:previous,
  ARTIFACTS:JSON.stringify({artifacts:artifacts.map(name=>({name}))}),
 }});
 assert.doesNotMatch(job,/setup-node/u);
 assert.equal(await version('',[]),'version='+JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version);
 assert.equal(await version('42',['other','公民官网·Web·v1.2.999']),'version=1.2.1000');
 assert.equal(await version('42',['公民官网·Web·v1.2.9007199254740999']),'version=1.2.9007199254741000');
 await assert.rejects(version('42',['other']));
});

// 执行工作流原脚本，以命令桩区分缓存命中、缺件和下载失败。
test('宪法自动化复用锁定工具并补齐冷缓存',async t=>{
 const workflow=readFileSync(join(root,'.github/workflows/web.yml'),'utf8');
 const script=workflow.split('      - name: 准备锁定的宪法工具\n')[1].split('        run: |\n')[1]
  .split('      - name: 真实代码回归与严格分析\n')[0].split('\n').map(line=>line.slice(10)).join('\n');
 const parent=join(root,'target/test');mkdirSync(parent,{recursive:true});
 const work=mkdtempSync(join(parent,'constitution-tools-'));t.after(()=>rmSync(work,{recursive:true,force:true}));
 const trace=join(work,'trace'),output=join(work,'env'),{rust,bindgen}=constitutionTools;
 const mock=[
  'rustup() { case "$1 $2" in "run "*) [ "$MODE" = warm ];; "target list") echo wasm32-unknown-unknown;; *) echo "$*" >> "$TRACE";; esac; }',
  'wasm-bindgen() { if [ "$MODE" = warm ]; then echo "wasm-bindgen $BINDGEN_VERSION"; else echo "wasm-bindgen 0.0.0"; fi; }',
  'cargo() { echo "$*" >> "$TRACE"; [ "$3" = --locked ] && { [ "$4" != --offline ] || [ "$MODE" = warm ]; }; }',
  'curl() { echo "$*" >> "$TRACE"; [ "$MODE" != failed ]; }',
  'tar() { cat >/dev/null; echo "extract" >> "$TRACE"; }'
 ].join('\n');
 const fetch=`+${rust} fetch --locked`,manifest='--manifest-path constitution/Cargo.toml';
 for(const mode of ['warm','cold','failed']){
  writeFileSync(trace,'');writeFileSync(output,'');
  const prepare=run('/bin/bash',['-c',mock+'\n'+script],{cwd:work,env:{
   MODE:mode,TRACE:trace,GITHUB_WORKSPACE:work,GITHUB_ENV:output,RUST_VERSION:rust,BINDGEN_VERSION:bindgen
  }});
  if(mode==='failed')await assert.rejects(prepare);else await prepare;
  const calls=readFileSync(trace,'utf8').trim().split('\n');
  if(mode==='warm'){
   assert.deepEqual(calls,[`${fetch} --offline ${manifest}`]);
   assert.equal(readFileSync(output,'utf8'),'WASM_BINDGEN=wasm-bindgen\n');
  }else{
   assert.equal(calls[0],`toolchain install ${rust} --profile minimal --target wasm32-unknown-unknown`);
   assert.ok(calls[1].endsWith(`/${bindgen}/wasm-bindgen-${bindgen}-aarch64-apple-darwin.tar.gz`));
   assert.deepEqual(calls.slice(2),mode==='cold'?['extract',`${fetch} --offline ${manifest}`,`${fetch} ${manifest}`]:['extract']);
   assert.equal(readFileSync(output,'utf8'),mode==='cold'?`WASM_BINDGEN=${work}/target/cache/worker/bin/wasm-bindgen\n`:'');
  }
 }
});

// 执行工作流原脚本与真实归档入口；gh只模拟本轮远端回执，所有文件归产品target现场。
test('ASCII正式附件与中文标签逐件回读，附件损坏和SHA错配均失败并撤回本轮候选',async t=>{
 const workflow=readFileSync(join(root,'.github/workflows/web.yml'),'utf8');
 const block=workflow.split('      - name: 创建正式Tag和Release并逐件回读\n')[1].split('      - name: 保存官方缓存\n')[0];
 const script=block.slice(block.indexOf('        run: |\n')+'        run: |\n'.length).split('\n').map(line=>line.startsWith('          ')?line.slice(10):line).join('\n');
 for(const mode of ['success','missing','corrupt','target','tag']){
  const parent=join(root,'target/test');mkdirSync(parent,{recursive:true});const work=mkdtempSync(join(parent,'release-readback-'));t.after(()=>rmSync(work,{recursive:true,force:true}));
  mkdirSync(join(work,'source-view'));mkdirSync(join(work,'dist'));
  writeFileSync(join(work,'source-view/package.json'),JSON.stringify({version:'0.0.0',devDependencies:{vite:'8',wrangler:'4'}}));
  writeFileSync(join(work,'source-view/package-lock.json'),JSON.stringify({version:'0.0.0',packages:{'':{version:'0.0.0'}}}));
  writeFileSync(join(work,'dist/index.html'),'<html>synthetic</html>');
  for(const member of constitutionFiles){
   const file=join(work,'dist',member);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,'synthetic');
  }
  const env={PRODUCT_WORK:work,PRODUCT_VERSION:'1.0.12',GITHUB_REPOSITORY:repository,GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'42',GITHUB_RUN_ATTEMPT:'1',MOCK_MODE:mode};
  // 子进程走真实CLI；Node测试上下文不应阻止该合成归档入口执行。
  await run(process.execPath,[join(root,'scripts/build.mjs'),'package','web'],{env:{...env,NODE_TEST_CONTEXT:''},capture:true});
  assert.deepEqual(readdirSync(join(work,'artifact')).sort(),['citizenweb-web-v1.0.12.json','citizenweb-web-v1.0.12.sha256','citizenweb-web-v1.0.12.tgz']);
  const state=join(work,'state.json');writeFileSync(state,JSON.stringify({tag:false,deleted:false}));
  writeFileSync(join(work,'gh'),'#!'+process.execPath+'\n'+String.raw`
import {readFileSync,writeFileSync,copyFileSync,readdirSync} from 'node:fs';
import {join,basename} from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),env=process.env,file=join(env.PRODUCT_WORK,'state.json'),state=JSON.parse(readFileSync(file));
const option=name=>args[args.indexOf(name)+1],reply=value=>process.stdout.write(JSON.stringify(value));
if(args[0]==='api'){
 if(option('--method')==='POST'){assert.equal(option('-f'),'ref=refs/tags/公民官网·Web·v1.0.12');assert.ok(args.includes('sha='+env.GITHUB_SHA));state.tag=true;reply({});}
 else if(option('--method')==='DELETE'){state.tag=false;reply({});}
 else if(args[1].includes('/releases/tags/'))reply(state.release);
 else if(args[1].includes('/git/ref/tags/'))reply({object:{type:'commit',sha:env.MOCK_MODE==='tag'?'b'.repeat(40):env.GITHUB_SHA}});
 else throw Error('unexpected API');
}else if(args[0]==='release'){
 if(args[1]==='create'){
  assert.equal(args[2],'公民官网·Web·v1.0.12');
  const files=args.slice(3,args.indexOf('--repo'));assert.equal(files.length,3);
  for(const spec of files){const [path,label]=spec.split('#');assert.match(basename(path),/^citizenweb-web-v1\.0\.12\.(?:tgz|json|sha256)$/u);assert.equal(label,args[2]+'.'+path.split('.').at(-1));}
  state.release={name:args[2],tag_name:args[2],target_commitish:env.MOCK_MODE==='target'?'main':option('--target'),draft:true,prerelease:false,assets:files.map(spec=>({name:basename(spec.split('#')[0]),label:spec.split('#')[1]})),body:readFileSync(option('--notes-file'),'utf8')};
 }else if(args[1]==='download'){
  const names=readdirSync(join(env.PRODUCT_WORK,'artifact'));
  for(const name of names){if(env.MOCK_MODE==='missing'&&name.endsWith('.json'))continue;const path=join(option('--dir'),name);copyFileSync(join(env.PRODUCT_WORK,'artifact',name),path);if(env.MOCK_MODE==='corrupt'&&name.endsWith('.tgz'))writeFileSync(path,'synthetic damage');}
 }else if(args[1]==='edit'){state.release.draft=false;}
 else if(args[1]==='view')reply({body:state.release.body});
 else if(args[1]==='delete'){state.deleted=true;state.tag=false;}
 else throw Error('unexpected release command');
}else throw Error('unexpected gh command');
writeFileSync(file,JSON.stringify(state));
`);chmodSync(join(work,'gh'),0o700);
  const execute=()=>run('/bin/bash',['-c',script],{env:{...env,PATH:work+':'+process.env.PATH},capture:true});
  if(mode==='success')await execute();else await assert.rejects(execute());
  const result=JSON.parse(readFileSync(state));assert.equal(result.deleted,mode!=='success');assert.equal(result.tag,mode==='success');
  if(mode==='success'){assert.equal(result.release.target_commitish,env.GITHUB_SHA);assert.equal(result.release.draft,false);}
 }
});
