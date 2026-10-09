#!/usr/bin/env node
import { remoteEnvironment as productRemoteEnvironment } from '../../build.mjs';
if(!(process.env.NODE_TEST_CONTEXT && process.argv.length === 2)&&process.env.GITHUB_ACTIONS==='true'&&String(process.env.GITHUB_WORKFLOW||'').startsWith('citizenweb.'))Object.assign(process.env,productRemoteEnvironment());
import { spawnSync as runExactProcess } from 'node:child_process';

function validateCandidate() {
  const value=process.env;
if(!/^[0-9a-f]{40}$/.test(value.SOURCE_SHA||'')||!/^[1-9][0-9]*$/.test(value.CI_RUN_ID||'')||!/^\d+\.\d{1,2}\.\d{1,2}$/.test(value.SOFTWARE_VERSION||'')||value.VERSION_TAG!=='citizenweb-web-v'+value.SOFTWARE_VERSION)throw Error('准确Release候选无效');
}

// 本文件只执行 citizenweb.web.release 的 check Job；阶段编号由本仓唯一 Workflow 固定，禁止接收其它身份。
export const EXACT_REMOTE_JOB_IDENTITY = Object.freeze({"pipeline":"citizenweb.web.release","job":"check"});

function requireExactRemoteJobEnvironment() {
  const expected = 'crcfrcn/citizenweb';
  if (!expected || process.env.GITHUB_REPOSITORY !== expected) {
    throw new Error('准确远端Job仓库身份无效');
  }
}
const workflowSteps = Object.freeze({"0":{"shell":"bash","source":"node $GITHUB_WORKSPACE/scripts/release/index.mjs version-tag verify-release-source --ci-run-id \"$GMB_CI_RUN_ID\" --version-tag \"$GMB_VERSION_TAG\" --source-sha \"$GMB_SOURCE_SHA\" --prefix citizenweb-web-v --product-id citizenweb --target web --workflow citizenweb.web.ci"},"1":{"shell":"bash","source":"test \"$(git rev-parse HEAD)\" = \"$GMB_SOURCE_SHA\"\nnode - <<'NODE'\nconst fs = require('node:fs');\nconst version = process.env.GMB_SOFTWARE_VERSION;\nif (!/^\\d+\\.\\d{1,2}\\.\\d{1,2}$/.test(version)) throw new Error('官网候选版本输入无效');\nfor (const path of ['package.json', 'package-lock.json']) {\n  const value = JSON.parse(fs.readFileSync(path, 'utf8'));\n  value.version = version;\n  if (path.endsWith('package-lock.json')) {\n    if (!value.packages?.['']) throw new Error('官网 package-lock 缺少根 package');\n    value.packages[''].version = version;\n  }\n  fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\\n`);\n}\nNODE\n"},"2":{"shell":"bash","source":"npm ci --no-audit --no-fund\n"},"3":{"shell":"bash","source":"npm run lint"},"4":{"shell":"bash","source":"npm test"},"5":{"shell":"bash","source":"npm run build"},"6":{"shell":"bash","source":"node $GITHUB_WORKSPACE/scripts/release/index.mjs citizenweb-release \\\n  --project citizenweb \\\n  --dist dist \\\n  --output \"$RUNNER_TEMP/citizenweb-candidate\" \\\n  --git-sha \"$GMB_SOURCE_SHA\" \\\n  --archive \"$RUNNER_TEMP/citizenweb-release.tgz\"\n"}});

function runExactWorkflowStep(index) {
  requireExactRemoteJobEnvironment();
  if (!/^(?:0|[1-9][0-9]*)$/.test(String(index || '')) || !Object.hasOwn(workflowSteps, String(index))) {
    throw new Error('准确远端Job阶段无效');
  }
  const step = workflowSteps[String(index)];
  const command = step.shell === 'pwsh' ? 'pwsh' : (process.platform === 'win32' ? 'bash' : '/bin/bash');
  const args = step.shell === 'pwsh'
    ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', step.source]
    : ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', step.source];
  const result = runExactProcess(command, args, { cwd: process.cwd(), env: process.env, stdio: 'inherit' });
  if (result.error) throw new Error('准确远端Job阶段无法启动');
  if (result.status !== 0) process.exitCode = Number.isInteger(result.status) ? result.status : 1;
}

if (!(process.env.NODE_TEST_CONTEXT && process.argv.length === 2) && process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL((await import('node:path')).resolve(process.argv[1])).href) {
requireExactRemoteJobEnvironment();
validateCandidate();
if (process.argv[2] !== 'workflow-step') throw new Error('准确Release Job只接受workflow-step');
runExactWorkflowStep(process.argv[3]);
}

// 正式实现结束；仅直接使用 node --test 执行本文件时注册以下回归。
if (process.env.NODE_TEST_CONTEXT && process.argv.length === 2 && !process.execArgv.some(value=>/^(?:-e|--eval(?:=|$)|--input-type(?:=|$))/u.test(value)) && process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL((await import('node:path')).resolve(process.argv[1])).href) {
const {default:assert} = await import('node:assert/strict');
const { readFileSync, realpathSync } = await import('node:fs');
const {default:Module,  createRequire } = await import('node:module');
const { pathToFileURL } = await import('node:url');
const {default:React} = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const {default:ts} = await import('typescript');
const { join, resolve } = await import('node:path');
const { test } = await import('node:test');

const projectPath = resolve(import.meta.dirname, '../../..');
const downloadButtonSource = readFileSync(join(projectPath, 'src/components/DownloadButton.tsx'), 'utf8');
const ecosystemSource = readFileSync(join(projectPath, 'src/pages/Ecosystem.tsx'), 'utf8');
const appSource = readFileSync(join(projectPath, 'src/App.tsx'), 'utf8');
const privacySource = readFileSync(join(projectPath, 'src/pages/Privacy.tsx'), 'utf8');
const supportSource = readFileSync(join(projectPath, 'src/pages/Support.tsx'), 'utf8');
const termsSource = readFileSync(join(projectPath, 'src/pages/Terms.tsx'), 'utf8');

test('公民链四端下载固定走后端白名单代理且保持公开平台名', () => {
  assert.match(downloadButtonSource, /href=\{`\/api\$\{option\.downloadPath\}`\}/);
  const downloads = /name: '公民链'[\s\S]*?downloads: \[([\s\S]*?)\n    \],/.exec(ecosystemSource);
  assert.ok(downloads, '缺少公民链下载项');
  assert.deepEqual(downloads[1].trim().split('\n').map((line) => line.trim()), [
    "{ label: 'macOS', kind: 'file', downloadPath: '/download/citizenchain/macOS' },",
    "{ label: 'Windows', kind: 'file', downloadPath: '/download/citizenchain/Windows' },",
    "{ label: 'LinuxARM', kind: 'file', downloadPath: '/download/citizenchain/LinuxARM' },",
    "{ label: 'LinuxAMD', kind: 'file', downloadPath: '/download/citizenchain/LinuxAMD' },",
  ]);
  assert.doesNotMatch(ecosystemSource, /citizenchain-release|releaseTag:/);
});

test('官网问题渠道和App Store前置页面保持完整', () => {
  const links = [...supportSource.matchAll(/<a\s+([^>]+)>/gu)]
    .map((match) => Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/gu)]
      .map((attribute) => [attribute[1], attribute[2]])));
  assert.equal(links.length, 1);
  assert.equal(links[0].href, 'https://github.com/crcfrcn/citizenweb/issues');
  assert.equal(links[0].target, '_blank');
  assert.ok(links[0].rel.split(/\s+/u).includes('noreferrer'));
  assert.match(appSource, /path="\/terms" element=\{<Terms \/>\}/);
  assert.match(appSource, /path="\/privacy" element=\{<Privacy \/>\}/);
  assert.match(appSource, /path="\/support" element=\{<Support \/>\}/);
  assert.match(privacySource, /公民钱包是离线冷钱包，不声明网络权限/);
  assert.match(supportSource, /禁止附带助记词、私钥、密码、验证码/);
  assert.match(termsSource, /链上已经最终确认的公开记录不能由运营方单方面篡改或删除/);
});

// 实际调用Vite配置工厂，避免旧路径文本断言与真实输出边界脱节。
test('Vite构建输出只接受本产品target，构建不读取服务证书',async()=>{
 const previous=process.env.CITIZENWEB_DIST;
 try{
  const factory=(await import(pathToFileURL(join(projectPath,'scripts/vite.config.ts')).href)).default;
  delete process.env.CITIZENWEB_DIST;const options=factory({command:'build',mode:'production'});
  assert.equal(options.build.outDir,join(projectPath,'target/build/dist'));
  assert.equal(options.server.https,undefined);
  process.env.CITIZENWEB_DIST=join(projectPath,'target/web/test/dist');assert.equal(factory({command:'build',mode:'production'}).build.outDir,process.env.CITIZENWEB_DIST);
  for(const invalid of [projectPath,join(projectPath,'dist'),join(projectPath,'target'),'relative/dist']){process.env.CITIZENWEB_DIST=invalid;assert.throws(()=>factory({command:'build',mode:'production'}),/target/u);}
 }finally{if(previous===undefined)delete process.env.CITIZENWEB_DIST;else process.env.CITIZENWEB_DIST=previous;}
});

// 使用原锁TypeScript与React真正渲染现有组件；不复制页面逻辑或伪造组件结果。
test('法律和支持页面实际渲染正文及安全问题入口',()=>{
 const previous=Module._extensions['.tsx'];
 Module._extensions['.tsx']=(module,file)=>{
  assert.ok(file.startsWith(join(projectPath,'src')+'/'));assert.equal(realpathSync(file),file);
  const output=ts.transpileModule(readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  module._compile(output,file);
 };
 try{
  const require=createRequire(import.meta.url),render=name=>renderToStaticMarkup(React.createElement(require(join(projectPath,'src/pages',name+'.tsx')).default));
  assert.match(render('Privacy'),/公民钱包是离线冷钱包/u);assert.match(render('Terms'),/链上已经最终确认的公开记录/u);
  const support=render('Support');assert.match(support,/禁止附带助记词、私钥、密码、验证码/u);
  assert.match(support,/href="https:\/\/github\.com\/crcfrcn\/citizenweb\/issues"/u);assert.match(support,/rel="[^"]*noreferrer/u);
 }finally{if(previous===undefined)delete Module._extensions['.tsx'];else Module._extensions['.tsx']=previous;}
});

test('白皮书中英文使用同一MLS设备身份与协议内部密钥', () => {
  const source = readFileSync(join(projectPath, 'src/whitepaper.md'), 'utf8');
  assert.match(source, /同一持久MLS身份/u);
  assert.match(source, /one persistent MLS identity/u);
  assert.match(source, /0x1C/u);
  assert.match(source, /钱包签名不能恢复旧密文/u);
  assert.doesNotMatch(source, /P-256|device subkeys|purpose keys|设备子钥|用途密钥/u);
});

}

// 正式实现结束；仅直接使用 node --test 执行本文件时注册以下回归。
if (process.env.NODE_TEST_CONTEXT && process.argv.length === 2 && !process.execArgv.some(value=>/^(?:-e|--eval(?:=|$)|--input-type(?:=|$))/u.test(value)) && process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL((await import('node:path')).resolve(process.argv[1])).href) {
const {default:assert} = await import('node:assert/strict');
const { readFileSync } = await import('node:fs');
const {default:test} = await import('node:test');

test('citizenweb.web.release的check远端Job物理独立', () => {
  const source = readFileSync(new URL('./execute.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('{"pipeline":"citizenweb.web.release","job":"check"}'));
  assert.match(source, /function runExactWorkflowStep\(index\)/u);
  assert.match(source, /function requireExactRemoteJobEnvironment\(\)/u);
});

}
