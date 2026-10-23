// 按官方要求或推荐实现；必需的工具依赖有就复用，没有就下载；使用最简单的实现方式；本脚本只允许放编译构建代码和注释，禁止增加无关内容，禁止增加复杂的校验阻断。
// config.mjs：只负责配置声明；build.mjs：只负责编译构建实现和必要注释；*.yml：负责全部GitHub流程，包括版本、作业编排、发布及历史清理。
import childProcess,{spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,copyFileSync,cpSync,rmSync,readdirSync,lstatSync,realpathSync,chmodSync,existsSync,rmdirSync} from 'node:fs';
import {join,dirname,resolve,relative,sep,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
// 构建与自动化的参数归本执行入口；配置文件只声明控制台所需配置项。
export const repository='crcfrcn/citizenweb';
export const tools=Object.freeze({node:JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).engines.node});
export const platforms=Object.freeze({web:'Web'});
export const initialVersion='1.0.12';
const artifactPrefix='公民官网·Web·v',artifactFilePrefix='citizenweb-web-v';
export const root=fileURLToPath(new URL('../',import.meta.url));
const controller=new AbortController();
export function displayName(platform,version){
 if(!Object.hasOwn(platforms,platform)||typeof version!=='string'||version.length>64||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version))throw Error('产品平台或版本无效');
 return artifactPrefix+version;
}

export function insideTarget(path){const base=join(root,'target');return typeof path==='string'&&resolve(path)===path&&path.startsWith(base+sep);}
function directory(path){
 if(!insideTarget(path))throw Error('任务目录必须归本产品target');
 for(let at=path;at!==resolve(root);at=dirname(at))if(existsSync(at)&&lstatSync(at).isSymbolicLink())throw Error('任务目录经过链接');
 mkdirSync(path,{recursive:true});if(realpathSync(path)!==path)throw Error('任务目录经过链接');return path;
}
function task(kind,platform){displayName(platform,initialVersion);return mkdtempSync(join(directory(join(root,'target',kind)),platform+'-'));}
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

// 控制台仅引用本产品入口；独立CLI与调度共用这些函数。

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
 const version=process.env.PRODUCT_VERSION;displayName('web',version);
 // 物理文件使用稳定ASCII名；中文显示名由GitHub官方label承载。
 const title=artifactFilePrefix+version,project=join(work,'source-view'),payload=directory(join(work,'package')),output=directory(join(work,'artifact'));copy(join(work,'dist'),join(payload,'dist'));
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
 throw Error('未知官网命令');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)&&!process.env.NODE_TEST_CONTEXT){
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>controller.abort());
 try{const result=await main();process.stdout.write(typeof result==='string'?result+'\n':JSON.stringify(result)+'\n');}catch(error){console.error(error.message);process.exitCode=1;}
}
