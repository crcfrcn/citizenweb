import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,rmSync,existsSync,readdirSync,writeFileSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {root,displayName,run} from '../scripts/build.mjs';
import {describeAction} from '../scripts/config.mjs';
import {initialVersion,platforms,repository} from '../scripts/build.mjs';
const platform=Object.keys(platforms)[0];
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
  const env={PRODUCT_WORK:work,PRODUCT_VERSION:'1.0.12',GITHUB_REPOSITORY:repository,GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'42',GITHUB_RUN_ATTEMPT:'1',MOCK_MODE:mode};
  // 子进程走真实CLI；Node测试上下文不应阻止该合成归档入口执行。
  await run(process.execPath,[join(root,'scripts/build.mjs'),'package','web'],{env:{...env,NODE_TEST_CONTEXT:''},capture:true});
  assert.deepEqual(readdirSync(join(work,'artifact')).sort(),['citizenweb-web-v1.0.12.json','citizenweb-web-v1.0.12.sha256','citizenweb-web-v1.0.12.tgz']);
  const state=join(work,'state.json');writeFileSync(state,JSON.stringify({tag:false,deleted:false}));
  writeFileSync(join(work,'gh'),'#!'+process.execPath+'\n'+String.raw`
import {readFileSync,writeFileSync,copyFileSync,readdirSync} from 'node:fs';
import {join,basename} from 'node:path';
import assert from 'node:assert/strict';
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
