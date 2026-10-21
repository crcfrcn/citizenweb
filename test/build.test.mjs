import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,rmSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {root,automationDisplayName,nextVersion,retainedRuns,candidate,automate,cleanupRuns,run} from '../scripts/build.mjs';
import {initialVersion,platforms,repository} from '../scripts/config.mjs';
const platform=Object.keys(platforms)[0];
const row=(id,conclusion,status='completed')=>({id,status,conclusion,updated_at:new Date(id*1000).toISOString(),head_sha:'a'.repeat(40),path:'.github/workflows/'+platform+'.yml',head_branch:'main',run_attempt:1,display_title:automationDisplayName(platform,'1.2.3')});
test('配置仅声明和引用，导入不派发、不生成现场',async()=>{
 const config=await import('../scripts/config.mjs');assert.equal(config.describeConfiguration().schema,1);
 const source=readFileSync(join(root,'scripts/config.mjs'),'utf8');assert.doesNotMatch(source,/\b(?:spawn|execFile|fetch|dispatch|readFile|writeFile|nextVersion|cleanupRuns)\s*\(/u);
 assert.equal(Object.hasOwn(config.describeConfiguration().configuration.items[0]||{},'value'),false);
});
test('准确名称和版本边界',()=>{
 assert.match(automationDisplayName(platform,'1.2.3'),/·v1\.2\.3$/u);
 for(const version of ['1.2','01.2.3','1.2.3\n','1.2.3-beta',null])assert.throws(()=>automationDisplayName(platform,version));
 assert.throws(()=>automationDisplayName('other','1.2.3'));
});
test('成功才递增，失败重试沿用候选',()=>{
 assert.equal(nextVersion(platform,[]),initialVersion);assert.equal(nextVersion(platform,[row(1,'success'),row(2,'failure')]),'1.2.4');
 const invalid=row(3,'success');invalid.display_title=automationDisplayName(platform,'1.2.3')+'extra';assert.throws(()=>nextVersion(platform,[invalid]));
});
test('最新成功和失败各一条，活动Run全部保留',()=>{
 const rows=[row(1,'success'),row(2,'failure'),row(3,'success'),row(4,'cancelled'),row(5,null,'in_progress')];assert.deepEqual([...retainedRuns(rows)].sort(),[3,4,5]);
});
test('活动Run阻止新派发，当前CI原Run不误拒绝',async()=>{
 const read=async()=>({workflow_runs:[row(11,null,'queued')]});await assert.rejects(candidate(platform,{read,currentRun:0}),/活动/u);
 assert.equal(await candidate(platform,{read,currentRun:11}),initialVersion);
});
test('派发回执不确定只请求一次',async()=>{
 let calls=0;await assert.rejects(automate(platform,{read:async()=>({workflow_runs:[]}),dispatch:async()=>{calls++;return {};} }),/不确定/u);assert.equal(calls,1);
});
test('旧失败删除后回查，不碰活动和另一类最新记录',async()=>{
 let rows=[row(1,'failure'),row(2,'failure'),row(3,null,'in_progress')];const deleted=[];
 const read=async path=>{
  if(path.startsWith('actions/workflows/'))return {workflow_runs:rows};if(path.startsWith('releases?'))return [];
  const value=rows.find(row=>path==='actions/runs/'+row.id);if(value)return value;throw Object.assign(Error('HTTP 404'),{status:404});
 };
 const result=await cleanupRuns(platform,{read,remove:async path=>{deleted.push(path);rows=rows.filter(row=>path!=='actions/runs/'+row.id);}});
 assert.equal(result.completed,true);assert.deepEqual(deleted,['actions/runs/1']);assert.deepEqual(rows.map(row=>row.id),[2,3]);
});
test('新成功资产未确认时保留旧成功',async()=>{
 let deleted=0;const rows=[row(1,'success'),row(2,'success')];await assert.rejects(cleanupRuns(platform,{read:async path=>path.startsWith('releases?')?[]:{workflow_runs:rows},remove:async()=>{deleted++;}}),/保留旧成功/u);assert.equal(deleted,0);
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
test('删除Tag后Release失败，重试仍清理原Release与Run',async()=>{
 const old=row(1,'failure'),fresh=row(2,'failure');let rows=[old,fresh],tag=true,release=true,failOnce=true;
 const proof={run_id:1,platform},record={id:10,tag_name:old.display_title,target_commitish:old.head_sha,body:'<!-- automation:'+JSON.stringify(proof)+' -->'};
 const missing=()=>{throw Object.assign(Error('HTTP 404'),{status:404});};
 const read=async path=>{if(path.startsWith('actions/workflows/'))return {workflow_runs:rows};if(path.startsWith('releases?'))return release?[record]:[];if(path==='releases/10')return release?record:missing();if(path.startsWith('git/ref/tags/'))return tag?{object:{type:'commit',sha:old.head_sha}}:missing();return rows.find(value=>path==='actions/runs/'+value.id)||missing();};
 const remove=async path=>{if(path.startsWith('git/refs/tags/'))tag=false;else if(path==='releases/10'){if(failOnce){failOnce=false;throw Error('HTTP 503');}release=false;}else if(path==='actions/runs/1')rows=rows.filter(value=>value.id!==1);};
 await assert.rejects(cleanupRuns(platform,{read,remove}),/503/u);assert.equal(tag,false);assert.equal(release,true);assert.equal(rows.length,2);
 assert.deepEqual((await cleanupRuns(platform,{read,remove})).deleted,[1]);assert.equal(release,false);
});

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


// GitHub传输使用官方REST；删除不能依赖控制台最小PATH中的gh。
test('GitHub REST保留方法、令牌及HTTP状态，不启动命令',async()=>{
 const {github}=await import('../scripts/build.mjs');let called=0;
 assert.equal(await github('actions/runs/1',{method:'DELETE',token:'synthetic',fetchImpl:async(url,options)=>{called++;assert.match(url,/\/actions\/runs\/1$/u);assert.equal(options.method,'DELETE');assert.equal(options.headers.Authorization,'Bearer synthetic');return new Response(null,{status:204});}}),null);
 assert.equal(called,1);
 await assert.rejects(github('actions/runs/1',{fetchImpl:async()=>new Response('',{status:404})}),error=>error.status===404);
});
test('新成功尚未验真不阻挡旧失败实际删除',async()=>{
 let rows=[row(1,'success'),row(2,'failure'),row(3,'success'),row(4,'failure')];const deleted=[];
 const read=async path=>{if(path.startsWith('actions/workflows/'))return {workflow_runs:rows};if(path.startsWith('releases?'))return [];const value=rows.find(value=>path==='actions/runs/'+value.id);if(value)return value;throw Object.assign(Error('HTTP 404'),{status:404});};
 await assert.rejects(cleanupRuns(platform,{read,remove:async path=>{deleted.push(path);rows=rows.filter(value=>path!=='actions/runs/'+value.id);}}),/保留旧成功/u);
 assert.deepEqual(deleted,['actions/runs/2']);assert.deepEqual(rows.map(value=>value.id),[1,3,4]);
});
test('删除后仍存在必须明确清理失败',async()=>{
 const rows=[row(1,'failure'),row(2,'failure')];
 await assert.rejects(cleanupRuns(platform,{read:async path=>path.startsWith('actions/workflows/')?{workflow_runs:rows}:path.startsWith('releases?')?[]:rows[0],remove:async()=>{}}),/旧Run删除未确认/u);
});
// 客户端只派发，工作流自己执行GitHub删除，不向控制台索取清理权限。
test('自动化派发后返回准确Run且不轮询或清理GitHub',async()=>{
 let reads=0,dispatches=0;
 const read=async path=>{assert.ok(path.startsWith('actions/workflows/'));reads++;return {workflow_runs:[]};};
 const receipt=await automate(platform,{read,dispatch:async spec=>{dispatches++;assert.deepEqual(spec,{workflow:platform+'.yml',ref:'main',inputs:{version:initialVersion}});return {workflow_run_id:42};}});
 assert.deepEqual(receipt,{runID:42});assert.equal(reads,1);assert.equal(dispatches,1);
});
test('各平台原工作流末尾用本仓令牌调用清理，不新增Job或重复实现',async()=>{
 const {describeAction}=await import('../scripts/build.mjs');
 for(const target of Object.keys(platforms)){
  assert.throws(()=>describeAction({flow:'cleanup',platform:target}),/尚未声明/u);
  const source=readFileSync(join(root,'.github/workflows',target+'.yml'),'utf8');
  assert.match(source,/permissions:\n  contents: write\n  actions: write/u);
  assert.match(source,/      - name: 清理本平台历史记录\n        if: always\(\)\n        env:\n          GH_TOKEN: \$\{\{ github.token \}\}\n          PRODUCT_RESULT: \$\{\{ job.status \}\}\n        run: node scripts\/build.mjs cleanup "\$PLATFORM"\n$/u);
  assert.equal([...source.matchAll(/^  \w+:\n    name:/gmu)].length,1);
 }
});
test('工作流按真实Job结果保留本轮和活动Run，不改写Run终态',async()=>{
 for(const target of Object.keys(platforms))for(const result of ['success','failure','cancelled']){
  const make=(id,conclusion,status='completed')=>({...row(id,conclusion,status),path:'.github/workflows/'+target+'.yml',display_title:automationDisplayName(target,'1.2.3')});
  const current={...make(3,null,'in_progress'),repository:{full_name:repository},event:'workflow_dispatch'},active=make(4,null,'queued');
  let rows=[make(1,'success'),make(2,'failure'),active];const deleted=[];
  const release={id:10,tag_name:current.display_title,draft:false,prerelease:false,assets:Array.from({length:target==='android'?4:3},()=>({})),body:'<!-- automation:'+JSON.stringify({run_id:3,platform:target})+' -->'};
  const missing=()=>{throw Object.assign(Error('HTTP 404'),{status:404});};
  const read=async path=>{
   if(path.startsWith('actions/workflows/'))return {workflow_runs:rows};
   if(path==='actions/runs/3')return current;
   if(path.startsWith('releases?'))return result==='success'?[release]:[];
   if(path.startsWith('git/ref/tags/'))return {object:{type:'commit',sha:current.head_sha}};
   if(path==='actions/runs/3/artifacts?per_page=100')return {artifacts:[{name:current.display_title,expired:false,size_in_bytes:1}]};
   return rows.find(value=>path==='actions/runs/'+value.id)||missing();
  };
  const receipt=await cleanupRuns(target,{read,remove:async path=>{deleted.push(path);rows=rows.filter(value=>path!=='actions/runs/'+value.id);},currentRun:3,result,sourceSha:current.head_sha,attempt:current.run_attempt});
  assert.equal(receipt.completed,true);assert.deepEqual(deleted,['actions/runs/'+(result==='success'?1:2)]);
  assert.deepEqual([...receipt.kept].sort(),result==='success'?[2,3,4]:[1,3,4]);
  assert.equal(current.status,'in_progress');assert.equal(current.conclusion,null);assert.equal(active.status,'queued');
 }
});
test('本轮输入、仓库、分支、平台、提交及attempt不符均禁止删除',async()=>{
 const current={...row(3,null,'in_progress'),repository:{full_name:repository},event:'workflow_dispatch'};
 for(const invalid of [{id:99},{repository:{full_name:'other/repo'}},{head_branch:'other'},{path:'.github/workflows/other.yml'},{event:'push'},{head_sha:'b'.repeat(40)},{run_attempt:2}]){
  let deleted=0;await assert.rejects(cleanupRuns(platform,{currentRun:3,result:'success',sourceSha:current.head_sha,attempt:1,read:async path=>path.startsWith('actions/workflows/')?{workflow_runs:[]}:{...current,...invalid},remove:async()=>{deleted++;}}),/身份不符/u);assert.equal(deleted,0);
 }
 for(const [currentRun,result]of [[-1,'success'],[3,'unknown'],[0,'failure']])await assert.rejects(cleanupRuns(platform,{currentRun,result,read:async()=>({workflow_runs:[]})}),/输入无效/u);
});
test('清理权限失败真实抛出，不改写本轮状态或触发编译派发',async()=>{
 const current={...row(3,null,'in_progress'),repository:{full_name:repository},event:'workflow_dispatch'},previous=row(1,'failure');
 const read=async path=>path.startsWith('actions/workflows/')?{workflow_runs:[previous]}:path.startsWith('releases?')?[]:path==='actions/runs/3'?current:previous;
 let calls=0;await assert.rejects(cleanupRuns(platform,{read,currentRun:3,result:'failure',remove:async path=>{calls++;assert.equal(path,'actions/runs/1');throw Object.assign(Error('HTTP 403'),{status:403});}}),/HTTP 403/u);
 assert.equal(calls,1);assert.equal(current.status,'in_progress');assert.equal(current.conclusion,null);
});

// 旧push与派发记录属于同一平台历史；候选版本不能因此读取无版本的旧成功记录。
test('清理覆盖旧push及分页，候选仍只查派发，活动记录全部保留',async()=>{
 for(const target of Object.keys(platforms)){
  const make=(id,conclusion,event='workflow_dispatch',status='completed')=>({...row(id,conclusion,status),path:'.github/workflows/'+target+'.yml',event,repository:{full_name:repository}});
  let rows=[make(1,'failure','push'),make(2,'success'),make(3,'failure'),make(4,null,'push','in_progress')];const deleted=[],queries=[];
  const missing=()=>{throw Object.assign(Error('HTTP 404'),{status:404});};
  const read=async path=>{
   if(path.startsWith('actions/workflows/')){
    queries.push(path);const url=new URL('https://api.github.com/'+path);assert.equal(url.searchParams.get('branch'),'main');
    if(url.searchParams.has('event')){assert.equal(url.searchParams.get('event'),'workflow_dispatch');return {workflow_runs:[]};}
    const legacy=Array.from({length:100},(_,index)=>({...make(100+index,'failure','push'),updated_at:new Date(0).toISOString()})).filter(row=>!deleted.includes('actions/runs/'+row.id));
    const all=[...legacy,...rows],page=Number(url.searchParams.get('page'));return {workflow_runs:all.slice((page-1)*100,page*100)};
   }
   if(path.startsWith('releases?'))return [];
   const legacy=/^actions\/runs\/(\d+)$/u.exec(path);if(legacy&&Number(legacy[1])>=100&&Number(legacy[1])<200)return deleted.includes(path)?missing():make(Number(legacy[1]),'failure','push');
   return rows.find(value=>path==='actions/runs/'+value.id)||missing();
  };
  const result=await cleanupRuns(target,{read,remove:async path=>{deleted.push(path);rows=rows.filter(value=>path!=='actions/runs/'+value.id);}});
  assert.equal(result.completed,true);assert.equal(deleted.length,101);assert.ok(deleted.includes('actions/runs/1'));assert.deepEqual(rows.map(row=>row.id),[2,3,4]);assert.deepEqual([...result.kept].sort(),[2,3,4]);
  assert.equal(await candidate(target,{read,currentRun:0}),initialVersion);assert.ok(queries.at(-1).includes('event=workflow_dispatch'));
 }
});
test('清理拒绝其他仓库、平台或分支记录，不删除归属不符对象',async()=>{
 for(const invalid of [{path:'.github/workflows/other.yml'},{head_branch:'other'},{repository:{full_name:'other/repo'}}]){
  let deleted=0;await assert.rejects(cleanupRuns(platform,{read:async()=>({workflow_runs:[{...row(1,'failure'),...invalid}]}),remove:async()=>{deleted++;}}),/归属不符/u);assert.equal(deleted,0);
 }
});
