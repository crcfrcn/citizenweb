import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const projectPath = resolve(import.meta.dirname, '../../..');
const downloadButtonSource = readFileSync(join(projectPath, 'src/components/DownloadButton.tsx'), 'utf8');
const ecosystemSource = readFileSync(join(projectPath, 'src/pages/Ecosystem.tsx'), 'utf8');
const appSource = readFileSync(join(projectPath, 'src/App.tsx'), 'utf8');
const privacySource = readFileSync(join(projectPath, 'src/pages/Privacy.tsx'), 'utf8');
const supportSource = readFileSync(join(projectPath, 'src/pages/Support.tsx'), 'utf8');
const termsSource = readFileSync(join(projectPath, 'src/pages/Terms.tsx'), 'utf8');
const viteSource = readFileSync(join(projectPath, 'scripts/vite.config.ts'), 'utf8');

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

test('Vite默认把正式构建输出写入CitizenWeb源码外临时目录', () => {
  assert.match(viteSource, /process\.env\.CITIZENWEB_DIST \|\| join\(tmpdir\(\), 'citizenweb', 'dist'\)/u);
  assert.doesNotMatch(viteSource, /new URL\('\.\.\/dist'/u);
  assert.match(viteSource, /command === 'serve' \? developmentTLS\(\) : undefined/u);
});

test('白皮书中英文使用同一MLS设备身份与协议内部密钥', () => {
  const source = readFileSync(join(projectPath, 'src/whitepaper.md'), 'utf8');
  assert.match(source, /同一持久MLS身份/u);
  assert.match(source, /one persistent MLS identity/u);
  assert.match(source, /0x1C/u);
  assert.match(source, /钱包签名不能恢复旧密文/u);
  assert.doesNotMatch(source, /P-256|device subkeys|purpose keys|设备子钥|用途密钥/u);
});
