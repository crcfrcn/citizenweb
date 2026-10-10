#!/usr/bin/env node
// 本仓本目标的完整自动化只由同名Workflow调用；版本与产物均在GitHub生成。
import { createHash } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const owner = Object.freeze({"product": "citizenweb", "platform": "web", "repository": "crcfrcn/citizenweb", "required_assets": Object.freeze(["citizenweb-release.tgz", "release-manifest.json", "SHA256SUMS"])});
const shaPattern = /^[0-9a-f]{40}$/u;
const fail = message => { throw new Error(message); };
const root = fileURLToPath(new URL('../../', import.meta.url));
const workflowPath = `.github/workflows/release-${owner.platform}.yml`;
const prefix = `${owner.product}-${owner.platform}-v`;

// Web候选和归档的唯一产品实现；正式组包由自动化直接拥有。
const archiveRuntime=await(async()=>{
const {createHash}=await import('node:crypto');
const {execFileSync}=await import('node:child_process');
const {gunzipSync,gzipSync}=await import('node:zlib');
const {copyFileSync,existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,writeFileSync}=await import('node:fs');
const {dirname,join,relative,resolve,sep}=await import('node:path');
const PRODUCT_ID = 'citizenweb';
// Web 是静态制品交付渠道；QR/action 的 platform=web 属于独立签名 wire，禁止在正式制品中双写。
const DELIVERY_CHANNEL = 'web';
const VERSION_MARKER = 'dist/citizenweb-release.json';
const ROOT_PAYLOAD = ['package-lock.json', 'package.json'];

function fail(message) {
  throw new Error(message);
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function prettyStableJson(value) {
  return `${JSON.stringify(JSON.parse(stableJson(value)), null, 2)}\n`;
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} 必须是对象`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(`${label} 字段集合不正确`);
}

function ensureEmptyOutputDirectory(path) {
  if (existsSync(path)) fail(`候选输出目录已存在，拒绝覆盖：${path}`);
  mkdirSync(path, { recursive: true, mode: 0o700 });
}

function regularFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const info = lstatSync(path);
      const relativePath = relative(root, path).split(sep).join('/');
      if (info.isSymbolicLink()) fail(`候选禁止符号链接：${relativePath}`);
      if (info.isDirectory()) visit(path);
      else if (info.isFile()) files.push(relativePath);
      else fail(`候选只允许普通文件和目录：${relativePath}`);
    }
  };
  visit(root);
  return files.sort();
}

function assertNoSecrets(root) {
  const forbiddenNames = /(^|\/)(\.env(?:\.|$)|\.dev\.vars(?:\.|$)|\.wrangler(?:\/|$)|.*\.(?:pem|p8|p12|jks|keystore))$/i;
  const privateMaterial = /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/;
  const secretAssignment = /(?:[A-Z][A-Z0-9_]*(?:_TOKEN|_SECRET|_PASSWORD|_KEY)|DEPLOY)\s*[:=]\s*["'][^"']{6,}["']/;
  for (const relativePath of regularFiles(root)) {
    if (forbiddenNames.test(relativePath)) fail(`候选包含禁止的本地或密钥文件：${relativePath}`);
    const content = readFileSync(join(root, ...relativePath.split('/')), 'utf8');
    if (privateMaterial.test(content) || secretAssignment.test(content)) {
      fail(`候选疑似包含私密材料：${relativePath}`);
    }
  }
}

function parsePackage(projectPath) {
  const packageJson = JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf8'));
  const lockJson = JSON.parse(readFileSync(join(projectPath, 'package-lock.json'), 'utf8'));
  const version = String(packageJson.version || '');
  if (!/^\d+\.\d{1,2}\.\d{1,2}$/.test(version)) fail(`官网软件版本无效：${version}`);
  if (lockJson.version !== version || lockJson.packages?.['']?.version !== version) {
    fail('package.json 与 package-lock.json 官网软件版本不一致');
  }
  return { lockJson, version };
}

function toolVersions(projectPath, lockJson, npmVersion) {
  const version = (name) => String(lockJson.packages?.[`node_modules/${name}`]?.version || '');
  const vite = version('vite');
  const wrangler = version('wrangler');
  if (!/^\d+\.\d+\.\d+/.test(vite) || !/^\d+\.\d+\.\d+/.test(wrangler)) {
    fail('package-lock.json 缺少锁定的 Vite 或 Wrangler 版本');
  }
  return {
    node: process.version.replace(/^v/, ''),
    npm: npmVersion,
    vite,
    wrangler,
  };
}

function copyPayload(sourceRoot, outputRoot, relativePath) {
  const destination = join(outputRoot, ...relativePath.split('/'));
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  copyFileSync(join(sourceRoot, ...relativePath.split('/')), destination);
}

function fileEntries(root, paths) {
  return paths.map((path) => ({ path, sha256: sha256File(join(root, ...path.split('/'))) }));
}

function writeOctal(buffer, offset, length, value) {
  const text = value.toString(8).padStart(length - 1, '0');
  if (text.length >= length) fail('Release 归档字段超过 tar 限制');
  buffer.write(`${text}\0`, offset, length, 'ascii');
}

function deterministicTar(candidatePath) {
  const chunks = [];
  for (const relativePath of regularFiles(candidatePath)) {
    if (Buffer.byteLength(relativePath) > 100) fail(`Release 归档路径过长：${relativePath}`);
    const content = readFileSync(join(candidatePath, ...relativePath.split('/')));
    const header = Buffer.alloc(512);
    header.write(relativePath, 0, 100, 'utf8');
    writeOctal(header, 100, 8, 0o600);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, content.length);
    writeOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] = '0'.charCodeAt(0);
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
    chunks.push(header, content);
    const padding = (512 - (content.length % 512)) % 512;
    if (padding) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

function writeCitizenWebArchive(candidatePath, archivePath) {
  const candidate = resolve(candidatePath);
  verifyCitizenWebRelease(candidate);
  const archive = resolve(archivePath);
  if (existsSync(archive)) fail(`Release 归档已存在，拒绝覆盖：${archive}`);
  mkdirSync(dirname(archive), { recursive: true, mode: 0o700 });
  writeFileSync(archive, gzipSync(deterministicTar(candidate), { level: 9, mtime: 0 }), { mode: 0o600 });
  return sha256File(archive);
}

function readTarOctal(header, offset, length, label) {
  const value = header.subarray(offset, offset + length).toString('ascii').replace(/\0.*$/, '').trim();
  if (!/^[0-7]+$/.test(value)) fail(`Release 归档 ${label} 无效`);
  return Number.parseInt(value, 8);
}

function extractCitizenWebArchive(archivePath, outputPath, expectedGitCommitSha = null) {
  const archive = resolve(archivePath);
  const output = resolve(outputPath);
  if (!existsSync(archive) || !lstatSync(archive).isFile()) fail('Release 归档不存在');
  ensureEmptyOutputDirectory(output);
  const tar = gunzipSync(readFileSync(archive));
  let offset = 0;
  let ended = false;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((byte) => byte === 0)) {
      ended = true;
      break;
    }
    const storedChecksum = readTarOctal(header, 148, 8, 'checksum');
    const checksumHeader = Buffer.from(header);
    checksumHeader.fill(0x20, 148, 156);
    if (storedChecksum !== checksumHeader.reduce((sum, byte) => sum + byte, 0)) {
      fail('Release 归档 header checksum 不一致');
    }
    const nul = header.indexOf(0, 0);
    const relativePath = header.subarray(0, nul < 0 || nul > 100 ? 100 : nul).toString('utf8');
    if (!relativePath || relativePath.startsWith('/') || relativePath.split('/').includes('..')
        || !/^[A-Za-z0-9._/-]+$/.test(relativePath)) fail('Release 归档路径不安全');
    const type = header[156];
    if (type !== 0 && type !== '0'.charCodeAt(0)) fail('Release 归档只允许普通文件');
    const size = readTarOctal(header, 124, 12, 'size');
    if (!Number.isSafeInteger(size) || size < 0 || offset + size > tar.length) fail('Release 归档文件大小无效');
    const destination = join(output, ...relativePath.split('/'));
    if (!destination.startsWith(`${output}${sep}`)) fail('Release 归档路径越界');
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    writeFileSync(destination, tar.subarray(offset, offset + size), { mode: 0o600, flag: 'wx' });
    offset += Math.ceil(size / 512) * 512;
  }
  if (!ended || tar.subarray(offset).some((byte) => byte !== 0)) fail('Release 归档尾部无效');
  const manifest = verifyCitizenWebRelease(output, expectedGitCommitSha);
  // gzip 只是传输封装，不是候选身份；不同 Node/zlib 版本允许产生不同压缩字节。
  // 身份由规范 tar、精确文件集合、manifest 与逐文件 SHA-256 共同确定。
  if (!deterministicTar(output).equals(tar)) {
    fail('Release 归档不是规范的确定性候选');
  }
  return manifest;
}

function verifyCitizenWebRelease(candidatePath, expectedGitCommitSha = null) {
  const candidate = resolve(candidatePath);
  const manifestPath = join(candidate, 'release-manifest.json');
  if (!existsSync(manifestPath)) fail('候选缺少 release-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assertExactKeys(
    manifest,
    ['product_id', 'delivery_channel', 'software_version', 'git_commit_sha', 'tools', 'assets_sha256', 'files'],
    'release manifest',
  );
  if (manifest.product_id !== PRODUCT_ID) fail('候选产品 id 不正确');
  if (manifest.delivery_channel !== DELIVERY_CHANNEL) fail('候选交付渠道不正确');
  if (!/^\d+\.\d{1,2}\.\d{1,2}$/.test(manifest.software_version)) fail('候选软件版本无效');
  if (!/^[0-9a-f]{40}$/.test(manifest.git_commit_sha)) fail('候选 Git SHA 无效');
  if (expectedGitCommitSha !== null && manifest.git_commit_sha !== expectedGitCommitSha) {
    fail('候选 Git SHA 与期望提交不一致');
  }
  assertExactKeys(manifest.tools, ['node', 'npm', 'vite', 'wrangler'], '候选工具版本');
  for (const value of Object.values(manifest.tools)) {
    if (typeof value !== 'string' || !value) fail('候选工具版本无效');
  }
  if (!/^[0-9a-f]{64}$/.test(manifest.assets_sha256)) fail('候选静态资源摘要无效');
  if (!Array.isArray(manifest.files) || manifest.files.length < 4) fail('候选文件清单无效');
  const paths = [];
  for (const [index, entry] of manifest.files.entries()) {
    assertExactKeys(entry, ['path', 'sha256'], `候选文件 ${index + 1}`);
    if (!/^(dist\/|package(?:-lock)?\.json$)[A-Za-z0-9._/-]*$/.test(entry.path)
        || !/^[0-9a-f]{64}$/.test(entry.sha256)) fail('候选文件条目无效');
    const path = join(candidate, ...entry.path.split('/'));
    if (!existsSync(path) || !lstatSync(path).isFile() || sha256File(path) !== entry.sha256) {
      fail(`候选文件哈希不一致：${entry.path}`);
    }
    paths.push(entry.path);
  }
  if (JSON.stringify(paths) !== JSON.stringify([...paths].sort()) || new Set(paths).size !== paths.length) {
    fail('候选文件顺序或唯一性无效');
  }
  for (const required of [...ROOT_PAYLOAD, 'dist/index.html', VERSION_MARKER]) {
    if (!paths.includes(required)) fail(`候选缺少必需文件：${required}`);
  }
  const packageJson = JSON.parse(readFileSync(join(candidate, 'package.json'), 'utf8'));
  const lockJson = JSON.parse(readFileSync(join(candidate, 'package-lock.json'), 'utf8'));
  if (packageJson.version !== manifest.software_version
      || lockJson.version !== manifest.software_version
      || lockJson.packages?.['']?.version !== manifest.software_version) {
    fail('候选软件版本与 package 文件不一致');
  }
  const assetEntries = manifest.files.filter(({ path }) => path.startsWith('dist/') && path !== VERSION_MARKER);
  if (sha256Bytes(stableJson(assetEntries)) !== manifest.assets_sha256) fail('候选静态资源摘要不一致');
  const marker = JSON.parse(readFileSync(join(candidate, ...VERSION_MARKER.split('/')), 'utf8'));
  assertExactKeys(marker, ['product_id', 'delivery_channel', 'software_version', 'git_commit_sha', 'assets_sha256'], '官网版本标记');
  const expectedMarker = {
    product_id: PRODUCT_ID,
    delivery_channel: DELIVERY_CHANNEL,
    software_version: manifest.software_version,
    git_commit_sha: manifest.git_commit_sha,
    assets_sha256: manifest.assets_sha256,
  };
  if (stableJson(marker) !== stableJson(expectedMarker)) fail('官网版本标记与 Release 候选不一致');
  const expectedChecksums = [
    ...manifest.files,
    { path: 'release-manifest.json', sha256: sha256File(manifestPath) },
  ].sort((a, b) => a.path.localeCompare(b.path));
  const checksumText = `${expectedChecksums.map(({ sha256, path }) => `${sha256}  ${path}`).join('\n')}\n`;
  if (readFileSync(join(candidate, 'SHA256SUMS'), 'utf8') !== checksumText) fail('候选 SHA256SUMS 不一致');
  const expectedFiles = [...paths, 'release-manifest.json', 'SHA256SUMS'].sort();
  if (JSON.stringify(regularFiles(candidate)) !== JSON.stringify(expectedFiles)) fail('候选包含未登记文件');
  assertNoSecrets(candidate);
  return manifest;
}

function buildCitizenWebRelease({ projectPath, distPath, outputPath, gitCommitSha, archivePath = null, npmVersion }) {
  const project = resolve(projectPath);
  const sourceDist = resolve(distPath);
  const output = resolve(outputPath);
  if (!/^[0-9a-f]{40}$/.test(gitCommitSha)) fail('Git commit SHA 必须是 40 位小写十六进制');
  if (!existsSync(sourceDist) || !lstatSync(sourceDist).isDirectory()) fail('官网 dist 目录不存在');
  const distFiles = regularFiles(sourceDist);
  if (!distFiles.includes('index.html')) fail('官网 dist 缺少 index.html');
  if (distFiles.includes('citizenweb-release.json')) fail('官网 dist 含上次构建的版本标记，拒绝复用旧产物');
  assertNoSecrets(sourceDist);
  const { lockJson, version } = parsePackage(project);
  ensureEmptyOutputDirectory(output);
  for (const path of distFiles) copyPayload(sourceDist, join(output, 'dist'), path);
  for (const path of ROOT_PAYLOAD) copyPayload(project, output, path);
  const assetPaths = distFiles.map((path) => `dist/${path}`).sort();
  const assets = fileEntries(output, assetPaths);
  const assetsSha256 = sha256Bytes(stableJson(assets));
  const marker = {
    product_id: PRODUCT_ID,
    delivery_channel: DELIVERY_CHANNEL,
    software_version: version,
    git_commit_sha: gitCommitSha,
    assets_sha256: assetsSha256,
  };
  writeFileSync(join(output, ...VERSION_MARKER.split('/')), prettyStableJson(marker), { mode: 0o600 });
  const payloadPaths = [...ROOT_PAYLOAD, ...assetPaths, VERSION_MARKER].sort();
  const manifest = {
    product_id: PRODUCT_ID,
    delivery_channel: DELIVERY_CHANNEL,
    software_version: version,
    git_commit_sha: gitCommitSha,
    tools: toolVersions(project, lockJson, npmVersion),
    assets_sha256: assetsSha256,
    files: fileEntries(output, payloadPaths),
  };
  const manifestPath = join(output, 'release-manifest.json');
  writeFileSync(manifestPath, prettyStableJson(manifest), { mode: 0o600 });
  const checksums = [
    ...manifest.files,
    { path: 'release-manifest.json', sha256: sha256File(manifestPath) },
  ].sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync(
    join(output, 'SHA256SUMS'),
    `${checksums.map(({ sha256, path }) => `${sha256}  ${path}`).join('\n')}\n`,
    { mode: 0o600 },
  );
  const verified = verifyCitizenWebRelease(output, gitCommitSha);
  if (archivePath) writeCitizenWebArchive(output, archivePath);
  return verified;
}


return Object.freeze({buildCitizenWebRelease,verifyCitizenWebRelease,writeCitizenWebArchive,extractCitizenWebArchive});
})();
export const {buildCitizenWebRelease,verifyCitizenWebRelease,writeCitizenWebArchive,extractCitizenWebArchive}=archiveRuntime;


// 正式Tag与历史Run的解释只归本目标自动化，Build不读取GitHub身份。
async function workerRelease(release,platform,readTag){
 if(platform!==owner.platform)fail('正式Web平台无效');
 const tag=release?.tag_name;if(typeof tag!=='string'||!tag.startsWith(prefix))return null;
 const match=/^citizenweb-web-v(\d+\.\d+\.\d+)-r([1-9]\d*)-a([1-9]\d*)$/u.exec(tag);
 if(!match||!Number.isSafeInteger(Number(match[2]))||!Number.isSafeInteger(Number(match[3])))fail('正式Web Tag无效');
 const ref=await readTag(tag);
 if(ref?.ref!=='refs/tags/'+tag||ref.object?.type!=='commit'||!shaPattern.test(ref.object.sha||''))fail('正式Web源码提交无效');
 return {platform:owner.platform,tag,version:match[1],source_sha:ref.object.sha,run_id:Number(match[2]),run_attempt:Number(match[3])};
}

export function context(environment = process.env) {
  const number = name => {
    const value = environment[name];
    if (!/^[1-9][0-9]*$/u.test(value || '') || !Number.isSafeInteger(Number(value))) fail('GitHub运行坐标无效');
    return Number(value);
  };
  if (environment.GITHUB_ACTIONS !== 'true' || environment.GITHUB_REPOSITORY !== owner.repository
    || environment.GITHUB_REF !== 'refs/heads/main' || environment.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || !shaPattern.test(environment.GITHUB_SHA || '')
    || environment.GITHUB_WORKFLOW_REF !== `${owner.repository}/${workflowPath}@refs/heads/main`) fail('所属GitHub运行身份无效');
  return { repository: owner.repository, product_id: owner.product, platform: owner.platform,
    source_sha: environment.GITHUB_SHA, run_id: number('GITHUB_RUN_ID'),
    run_number: number('GITHUB_RUN_NUMBER'), run_attempt: number('GITHUB_RUN_ATTEMPT'), workflow: workflowPath };
}

export async function request(path, { method = 'GET', body, raw = false, size, fetch: send = globalThis.fetch } = {}) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token || /[\s\u0000-\u001f\u007f]/u.test(token)) fail('缺少GitHub任务令牌');
  const url = path.startsWith('https://') ? new URL(path) : new URL(`https://api.github.com/repos/${owner.repository}/${path}`);
  if (!['api.github.com', 'uploads.github.com'].includes(url.hostname) || url.protocol !== 'https:' || url.username || url.password || !url.pathname.startsWith(`/repos/${owner.repository}/`)) fail('GitHub接口地址无效');
  const headers = { Authorization: `Bearer ${token}`, Accept: raw ? 'application/octet-stream' : 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': owner.product };
  if (body !== undefined) headers['Content-Type'] = body?.pipe ? 'application/octet-stream' : 'application/json';
  if(body?.pipe){if(!Number.isSafeInteger(size)||size<=0)fail('资产上传长度无效');headers['Content-Length']=String(size);}
  let response = await send(url, { method, headers, redirect: raw ? 'manual' : 'error', signal: AbortSignal.timeout(300_000),
    ...(body === undefined ? {} : { body: body?.pipe ? body : JSON.stringify(body), ...(body?.pipe ? { duplex: 'half' } : {}) }) });
  if(raw&&response.status===302){
    const location=new URL(response.headers.get('location'));
    if(location.protocol!=='https:'||location.username||location.password
      ||!['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(location.hostname))fail('正式资产回读地址无效');
    response=await send(location,{method:'GET',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(300_000)});
  }
  if (response.status === 404) return null;
  if (!response.ok) fail(`GitHub接口失败：${response.status}，操作未确认`);
  if (raw) return response;
  return response.status === 204 ? {} : response.json();
}

export async function pages(path, field = null, api = request) {
  const rows = [];
  for (let page = 1; ; page++) {
    const data = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const values = field ? data?.[field] : data;
    if (!Array.isArray(values)) fail('GitHub分页数据无效');
    rows.push(...values);
    if (values.length < 100) return rows;
  }
}

function seedVersion() {
  const value=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
  if(value.name!==owner.product||typeof value.version!=='string')fail('本仓软件版本真源无效');
  return value.version;
}

export function nextVersion(seed, versions, runNumber = 1) {
  const parse = value => {
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d?)\.(0|[1-9]\d?)$/u.exec(value);
    if (!match) fail('软件版本无效');
    const parts=match.slice(1).map(Number);if(parts.some(value=>!Number.isSafeInteger(value)))fail('软件版本越界');return parts;
  };
  const values = [seed, ...versions].map(parse).sort((a,b) => a[0]-b[0] || a[1]-b[1] || a[2]-b[2]);
  let [major, minor, patch] = values.at(-1);
  if (versions.length) { if (++patch > 99) { patch = 0; if (++minor > 99) { minor = 0; major++; } } }
  if(!Number.isSafeInteger(runNumber)||runNumber<1)fail('版本运行序号无效');
  const initial=parse(seed),floor=BigInt(initial[0])*10000n+BigInt(initial[1])*100n+BigInt(initial[2])+BigInt(runNumber-1);
  const historical=BigInt(major)*10000n+BigInt(minor)*100n+BigInt(patch);
  if(floor>historical){major=Number(floor/10000n);minor=Number(floor/100n%100n);patch=Number(floor%100n);}
  if(![major,minor,patch].every(Number.isSafeInteger))fail('软件版本越界');
  return `${major}.${minor}.${patch}`;
}

function output(name, value, file = process.env.GITHUB_OUTPUT) {
  if (!file || /[\r\n]/u.test(String(value))) fail('GitHub步骤输出无效');
  appendFileSync(file, `${name}=${value}\n`);
}

export async function prepare() {
  const identity = context();
  const releases = await pages('releases');
  const versions = [];
  for (const release of releases) {
    if (release.draft || release.prerelease || !String(release.tag_name).startsWith(prefix)) continue;
    const notes = (await workerRelease(release,owner.platform,tag=>request('git/ref/tags/'+encodeURIComponent(tag))));
    if (!notes || notes.platform !== owner.platform) continue;
    const run = await request(`actions/runs/${notes.run_id}`);
    if (run?.status === 'completed' && run.conclusion === 'success' && run.path === workflowPath
      &&run.repository?.full_name===owner.repository&&run.head_branch==='main'&&run.event==='workflow_dispatch'
      &&run.head_sha===notes.source_sha&&run.run_attempt===notes.run_attempt) versions.push(notes.version);
  }
  const version = nextVersion(seedVersion(), versions, identity.run_number);
  const tag = `${prefix}${version}-r${identity.run_id}-a${identity.run_attempt}`;
  for (const [name,value] of Object.entries({version, tag, source_sha:identity.source_sha,
    run_id:identity.run_id, run_attempt:identity.run_attempt, run_number:identity.run_number})) output(name,value);
}

function runVersion() {
  const identity = context();
  const version = process.env.RELEASE_VERSION;
  const tag = process.env.RELEASE_TAG;
  nextVersion(version, []);
  if (tag !== `${prefix}${version}-r${identity.run_id}-a${identity.run_attempt}`) fail('本次版本与Tag不一致');
  return {...identity, version, tag};
}

export function job() {
  const identity = runVersion();
  if (execFileSync('git', ['rev-parse','HEAD'], {cwd:root,encoding:'utf8'}).trim() !== identity.source_sha) fail('检出源码不符');
  const work = join(process.env.RUNNER_TEMP, owner.product, owner.platform, String(identity.run_id), String(identity.run_attempt), process.env.GITHUB_JOB);
  mkdirSync(work,{recursive:true});
  const variables = {RELEASE_ASSETS_DIR:join(work,'assets'),TMPDIR:join(work,'tmp'),TMP:join(work,'tmp'),TEMP:join(work,'tmp')};
  for (const path of ['tmp','assets']) mkdirSync(join(work,path),{recursive:true});
  for (const [name,value] of Object.entries(variables)) { process.env[name]=value; output(name,value,process.env.GITHUB_ENV); }
}

function regular(path) {
  const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size<=0)fail('正式产物不是非空普通文件');return stat;
}
async function digestFile(path) { const hash=createHash('sha256');for await(const bytes of createReadStream(path))hash.update(bytes);return hash.digest('hex'); }
function assetName(name) { if(!name||name!==basename(name)||/[\u0000-\u001f\u007f]/u.test(name))fail('正式资产文件名无效');return name; }

// 只接收Build公开包入口交付的三件准确资产；不存在通用路径收集入口。
export async function collectProduced({identity=runVersion(),directory=process.env.RELEASE_ASSETS_DIR,emit=output}={}) {
 if(!directory||!isAbsolute(directory)||resolve(directory)!==directory||!lstatSync(directory).isDirectory())fail('正式产物目录无效');
 if(readdirSync(directory).sort().join('\0')!==[...owner.required_assets].sort().join('\0'))fail('本目标完整正式资产集合不符');
 const files=[];for(const name of owner.required_assets){const path=join(directory,name),stat=regular(path);files.push({name,size:stat.size,sha256:await digestFile(path)});}
 const metadata={schema:1,...identity,assets:files};writeFileSync(join(directory,'automation.json'),JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});
 emit('assets',directory);return metadata;
}



export async function publish(directory) {
  const identity=runVersion();const metadata=JSON.parse(readFileSync(join(directory,'automation.json'),'utf8'));
  if(Object.entries(identity).some(([key,value])=>metadata[key]!==value)||!Array.isArray(metadata.assets)||!metadata.assets.length)fail('完整产物身份无效');
  const files=metadata.assets;
  if(files.map(value=>value?.name).sort().join('\0')!==[...owner.required_assets].sort().join('\0'))fail('正式资产集合与本目标不符');
  if(readdirSync(directory).sort().join('\0')!==[...files.map(value=>value.name),'automation.json'].sort().join('\0'))fail('产物目录与完整资产集合不符');
  for(const file of files){const path=join(directory,assetName(file.name));if(regular(path).size!==file.size||await digestFile(path)!==file.sha256)fail('正式产物在交付前改变');}
  if(await request(`git/ref/tags/${encodeURIComponent(identity.tag)}`)!==null)fail('本次Tag已经存在');
  await request('git/refs',{method:'POST',body:{ref:`refs/tags/${identity.tag}`,sha:identity.source_sha}});
  const release=await request('releases',{method:'POST',body:{tag_name:identity.tag,target_commitish:identity.source_sha,
    name:`${owner.product} · ${owner.platform} · ${identity.version}`,draft:false,prerelease:false,make_latest:'false',
    body:`${owner.product} · ${owner.platform} · ${identity.version}\nSource: ${identity.source_sha}\nRun: ${identity.run_id} / ${identity.run_attempt}`}});
  if(!Number.isSafeInteger(release?.id)||!release.upload_url)fail('正式Release创建未确认');
  for(const file of files){const url=new URL(release.upload_url.replace(/\{.*$/u,''));url.searchParams.set('name',file.name);
    const asset=await request(url.href,{method:'POST',body:createReadStream(join(directory,file.name)),size:file.size});
    if(asset?.name!==file.name||asset.size!==file.size||asset.state!=='uploaded')fail('正式资产上传未确认');
    const response=await request(asset.url,{raw:true});if(!response?.body)fail('正式资产回读失败');
    const hash=createHash('sha256');let size=0;for await(const bytes of response.body){hash.update(bytes);size+=bytes.length;if(size>file.size)fail('正式资产回读超过声明大小');}
    if(size!==file.size||hash.digest('hex')!==file.sha256)fail('GitHub资产逐件回读不一致');
  }
  const readback=await request(`releases/${release.id}`),proved=await workerRelease(readback,owner.platform,tag=>request('git/ref/tags/'+encodeURIComponent(tag)));
  if(proved?.run_id!==identity.run_id||proved.run_attempt!==identity.run_attempt||proved.source_sha!==identity.source_sha||readback.draft||readback.prerelease
    ||readback.assets?.length!==files.length)fail('完整正式Release回查失败');
  for(const file of files){const asset=readback.assets.find(value=>value.name===file.name);if(!asset||asset.state!=='uploaded'||asset.size!==file.size||asset.digest!==`sha256:${file.sha256}`)fail('完整正式资产证明回查失败');}
  output('verified','true');output('release_id',release.id);output('tag',identity.tag);
}

function ownedRun(run) {
  // 每个目标只处理自身现行Workflow；文件缺失不能证明历史任务归属。
  return Number.isSafeInteger(run?.id)&&run.id>0&&run.path===workflowPath
    &&run.head_branch==='main'&&run.event==='workflow_dispatch'
    &&(!run.repository||run.repository.full_name===owner.repository);
}

export function cleanupPlan(runs,current,result) {
  if(!['success','failed'].includes(result)||!ownedRun(current)||!Number.isFinite(Date.parse(current.created_at)))fail('清理所属任务身份无效');
  const earlier=run=>Date.parse(run.created_at)<Date.parse(current.created_at)
    ||Date.parse(run.created_at)===Date.parse(current.created_at)&&run.id<current.id;
  return runs.filter(run=>ownedRun(run)&&run.id!==current.id&&run.status==='completed'&&earlier(run)
    &&(run.conclusion==='success'?'success':'failed')===result).sort((a,b)=>a.id-b.id);
}

async function remove(path,api) { await api(path,{method:'DELETE'});const readPath=path.replace(/^git\/refs\//u,'git/ref/');if(await api(readPath)!==null)fail('删除回查仍存在，清理失败'); }
async function removeRunRelease(run,releases,api) {
  for(const release of releases){
    const metadata=(await workerRelease(release,owner.platform,tag=>api('git/ref/tags/'+encodeURIComponent(tag))));
    if(!metadata||metadata.run_id!==run.id)continue;
    if(metadata.source_sha!==run.head_sha)fail('正式Release与所属Run不一致');
    const tag=metadata.tag;
    const again=await api(`actions/runs/${run.id}`);
    if(again&&again.id!==Number(process.env.GITHUB_RUN_ID)
      &&(again.status!=='completed'||again.run_attempt!==run.run_attempt||again.conclusion!==run.conclusion))fail('所属任务已变化，停止清理');
    await remove(`releases/${release.id}`,api);
    const beforeTag=await api(`actions/runs/${run.id}`);
    if(beforeTag&&beforeTag.id!==Number(process.env.GITHUB_RUN_ID)
      &&(beforeTag.status!=='completed'||beforeTag.run_attempt!==run.run_attempt||beforeTag.conclusion!==run.conclusion))fail('所属任务已变化，停止清理');
    await remove(`git/refs/tags/${encodeURIComponent(tag)}`,api);
  }
}
export async function cleanup(result,identity=context(),api=request) {
  const current=await api(`actions/runs/${identity.run_id}`);
  const plan=cleanupPlan(await pages('actions/runs','workflow_runs',api),current,result);
  const releases=await pages('releases',null,api),removed=[];
  for(const row of plan){const run=await api(`actions/runs/${row.id}`);if(!run){removed.push(row.id);continue;}
    if(run.run_attempt!==row.run_attempt||cleanupPlan([run],current,result).length!==1)continue;
    await removeRunRelease(run,releases,api);
    // 失败若只形成Tag也按它的准确Run坐标处理，不能留下同类孤立产物。
    const tags=await api(`git/matching-refs/tags/${prefix}`);
    if(!Array.isArray(tags))fail('所属Tag集合无效');
    for(const reference of tags){
      const tag=String(reference.ref||'').slice('refs/tags/'.length);
      if(!String(reference.ref||'').startsWith('refs/tags/'+prefix)
        ||!new RegExp(`-r${run.id}-a[1-9][0-9]*$`,'u').test(tag)||Number(tag.slice(tag.lastIndexOf('-a')+2))>run.run_attempt)continue;
      if(reference.object?.type!=='commit'||reference.object.sha!==run.head_sha)fail('所属Tag来源已改变，停止清理');
      const again=await api(`actions/runs/${run.id}`);
      if(!again||cleanupPlan([again],current,result).length!==1)fail('所属任务已改变，停止清理');
      await remove(`git/refs/tags/${encodeURIComponent(tag)}`,api);
    }
    for(const asset of await pages(`actions/runs/${run.id}/artifacts`,'artifacts',api)){
      if(!Number.isSafeInteger(asset.id)||asset.id<=0)fail('所属Artifact坐标无效');
      const again=await api(`actions/runs/${run.id}`);if(!again||again.status!=='completed'||again.run_attempt!==run.run_attempt||again.conclusion!==run.conclusion)fail('历史任务已变化，停止清理');
      await remove(`actions/artifacts/${asset.id}`,api);
    }
    const final=await api(`actions/runs/${run.id}`);
    if(final&&(final.run_attempt!==run.run_attempt||cleanupPlan([final],current,result).length!==1))fail('历史任务状态改变，停止清理');
    if(final)await remove(`actions/runs/${run.id}`,api);removed.push(run.id);
  }
  return removed;
}

export function precedingResult(needs) {
  if(!needs||typeof needs!=='object'||Array.isArray(needs)||!Object.keys(needs).length)fail('前置任务结果缺失');
  return Object.values(needs).every(value=>value?.result==='success')?'success':'failed';
}
async function discardCurrent(identity,api) {
  for(const release of await pages('releases',null,api)){
    const metadata=(await workerRelease(release,owner.platform,tag=>api('git/ref/tags/'+encodeURIComponent(tag))));
    if(metadata?.run_id===identity.run_id&&metadata.run_attempt===identity.run_attempt)
      await removeRunRelease({id:identity.run_id,head_sha:identity.source_sha},[release],api);
  }
  const tag=process.env.RELEASE_TAG;
  if(tag&&tag.startsWith(prefix)&&tag.endsWith(`-r${identity.run_id}-a${identity.run_attempt}`)){
    const path=`git/refs/tags/${encodeURIComponent(tag)}`;
    if(await api(path.replace(/^git\/refs\//u,'git/ref/'))!==null)await remove(path,api);
  }
}
export async function finish(needs=JSON.parse(process.env.RELEASE_NEEDS||'null'),api=request,identity=context()) {
  const result=precedingResult(needs),errors=[];
  const attempt=async action=>{try{return await action();}catch(error){errors.push(error);return null;}};
  let removed;
  if(result==='success') {
    removed=await attempt(()=>cleanup('success',identity,api));
    if(errors.length) {
      await attempt(()=>discardCurrent(identity,api));
      await attempt(()=>cleanup('failed',identity,api));
    }
  } else {
    // 本次撤销失败也必须尝试清理同目标旧失败；各项真实错误均保留。
    await attempt(()=>discardCurrent(identity,api));
    removed=await attempt(()=>cleanup('failed',identity,api));
  }
  if(errors.length)throw new AggregateError(errors,'本目标最后处理失败：'+errors.map(error=>error.message).join('；'));
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`本目标${result==='success'?'成功':'失败'}；已清理同类旧Run：${removed.join('、')||'无'}。\n`);
  if(result==='failed')fail('前置任务未全部成功');
}

// 自动化直接从本仓已保存源码建立私有工程；不调用本机Build。
function workflowProject(work){
 if(typeof work!=='string'||!isAbsolute(work)||resolve(work)!==work
  ||!process.env.RUNNER_TEMP||!work.startsWith(resolve(process.env.RUNNER_TEMP)+'/'))fail('自动化工程根越界');
 if(existsSync(work))fail('自动化工程根已存在');
 mkdirSync(work,{recursive:true});
 const project=join(work,'source');mkdirSync(project);
 const names=execFileSync('git',['ls-files','-z'],{cwd:root,maxBuffer:16*1024*1024}).toString('utf8').split('\0').filter(Boolean);
 if(!names.includes('package-lock.json')||!names.includes('package.json')||!names.includes('index.html'))fail('自动化源码闭集缺失');
 for(const name of names){
  if(name.split('/').some(part=>!part||part==='.'||part==='..'))fail('Git源码路径越界');
  const from=join(root,name),info=lstatSync(from);
  if(!info.isFile()||info.isSymbolicLink())fail('自动化源码含非普通文件：'+name);
  const to=join(project,name);mkdirSync(dirname(to),{recursive:true});copyFileSync(from,to);
 }
 return project;
}
function workflowRun(file,args,cwd){
 const environment={...process.env,CI:'true',WRANGLER_SEND_METRICS:'false',npm_config_cache:join(dirname(cwd),'npm-cache')};
 for(const key of Object.keys(environment))if(key.startsWith('GITHUB_')||key.startsWith('ACTIONS_')||['GH_TOKEN','GH_TOKEN_FILE'].includes(key))delete environment[key];
 const result=spawnSync(file,args,{cwd,env:environment,stdio:'inherit',timeout:3600000});
 if(result.error||result.signal||result.status!==0)fail('自动化产品命令失败：'+basename(file));
}
function workflowCompile(project){
 if(process.version!=='v'+JSON.parse(readFileSync(join(project,'package.json'),'utf8')).engines.node)fail('自动化Node版本与产品声明不符');
 workflowRun('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],project);
 const checks=[];
 workflowRun(process.execPath,[join(project,'node_modules/eslint/bin/eslint.js'),'--config','config/eslint.config.js','.'],project);
 checks.push('eslint');
 workflowRun(process.execPath,[join(project,'node_modules/typescript/bin/tsc'),'-b','tsconfig.json'],project);
 checks.push('typescript');
 workflowRun(process.execPath,[join(project,'node_modules/vite/bin/vite.js'),'build','--config','config/vite.config.ts'],project);
 checks.push('vite');
 const dist=join(project,'dist');if(!existsSync(join(dist,'index.html')))fail('官网正式编译缺少入口');return {dist,checks};
}
async function workflowInvoke(command,input,work){
 const project=workflowProject(work);
 if(command==='test'){
  const {checks}=workflowCompile(project);
  return {schema:1,product_id:owner.product,platform:owner.platform,checks,counts:{tests:checks.length,passed:checks.length,failed:0,skipped:0,todo:0,cancelled:0}};
 }
 if(command!=='package')fail('自动化产品命令无效');
 if(!input||!/^[0-9]+\.[0-9]+\.[0-9]+$/u.test(input.software_version||'')||!/^[a-f0-9]{40}$/u.test(input.source_sha||''))fail('自动化组包输入无效');
 const {dist}=workflowCompile(project);
 for(const name of ['package.json','package-lock.json']){
  const path=join(project,name),value=JSON.parse(readFileSync(path,'utf8'));value.version=input.software_version;
  if(name==='package-lock.json')value.packages[''].version=input.software_version;
  writeFileSync(path,JSON.stringify(value,null,2)+'\n');
 }
 const directory=input.output;
 if(typeof directory!=='string'||!isAbsolute(directory)||resolve(directory)!==directory||!existsSync(directory)||readdirSync(directory).length)fail('自动化资产目录无效');
 const npmVersion=execFileSync('npm',['--version'],{cwd:project,encoding:'utf8'}).trim();
 const manifest=buildCitizenWebRelease({projectPath:project,distPath:dist,outputPath:join(work,'candidate'),gitCommitSha:input.source_sha,archivePath:join(directory,'citizenweb-release.tgz'),npmVersion});
 for(const name of ['release-manifest.json','SHA256SUMS'])copyFileSync(join(work,'candidate',name),join(directory,name));
 return {schema:1,product_id:owner.product,delivery_channel:'web',software_version:manifest.software_version,source_sha:manifest.git_commit_sha,
  assets:owner.required_assets.map(name=>({name,path:join(directory,name),sha256:createHash('sha256').update(readFileSync(join(directory,name))).digest('hex'),bytes:lstatSync(join(directory,name)).size}))};
}
async function productCommand(command,{identity:chosen,environment=process.env,invoke=workflowInvoke}={}){
 if(!['test-product','build-web'].includes(command))return false;
 const identity=chosen??runVersion(environment),parent=dirname(environment.RELEASE_ASSETS_DIR||'');
 if(!environment.RUNNER_TEMP||!isAbsolute(parent)||!(parent===resolve(environment.RUNNER_TEMP)||parent.startsWith(resolve(environment.RUNNER_TEMP)+'/')))fail('自动化工作根未交付');
 const work=join(parent,command==='test-product'?'web-test':'web-build');
 if(command==='test-product'){
  const result=await invoke('test',{},work);
  if(result?.schema!==1||result.product_id!==owner.product||result.platform!==owner.platform
   ||JSON.stringify(result.checks)!==JSON.stringify(['eslint','typescript','vite'])
   ||result.counts?.tests!==result.checks.length||result.counts.passed!==result.checks.length
   ||result.counts.failed||result.counts.skipped||result.counts.todo||result.counts.cancelled)fail('产品测试回执无效');
  return true;
 }
 const directory=environment.RELEASE_ASSETS_DIR;
 if(!directory||!isAbsolute(directory))fail('正式产物目录无效');
 const bundle=await invoke('package',{software_version:identity.version,source_sha:identity.source_sha,output:directory},work);
 if(bundle?.schema!==1||bundle.product_id!==owner.product||bundle.delivery_channel!=='web'||bundle.software_version!==identity.version
  ||bundle.source_sha!==identity.source_sha||!Array.isArray(bundle.assets)||bundle.assets.length!==owner.required_assets.length
  ||bundle.assets.map(value=>value?.name).sort().join('\0')!==[...owner.required_assets].sort().join('\0'))fail('产品正式包归属无效');
 for(const asset of bundle.assets){if(asset.path!==join(directory,asset.name)||!Number.isSafeInteger(asset.bytes)||asset.bytes<1
  ||!/^[a-f0-9]{64}$/u.test(asset.sha256||'')||regular(asset.path).size!==asset.bytes||await digestFile(asset.path)!==asset.sha256)fail('产品正式资产回执无效');}
 return true;
}

const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
const testing=direct&&Boolean(process.env.NODE_TEST_CONTEXT)&&process.argv.length===2;
if(direct&&!testing){
  try{const [command,...args]=process.argv.slice(2);
    if(command==='prepare')await prepare();else if(command==='job')job();
    else if(command==='collect-produced')await collectProduced();else if(command==='publish')await publish(args[0]);else if(command==='finish')await finish();
    else if(!await productCommand(command,args))fail('自动化命令无效');
  }catch(error){console.error(error.message);process.exitCode=1;}
}

if(testing){
  const {default:assert}=await import('node:assert/strict');const {default:test}=await import('node:test');

  test('正式Web历史版本交付平台、Run Attempt与准确源码',async()=>{
    const source='a'.repeat(40),release={tag_name:'citizenweb-web-v1.2.3-r42-a2'};
    const tag=async()=>({ref:'refs/tags/'+release.tag_name,object:{type:'commit',sha:source}});
    assert.deepEqual(await workerRelease(release,'web',tag),{platform:'web',tag:release.tag_name,version:'1.2.3',source_sha:source,run_id:42,run_attempt:2});
    await assert.rejects(workerRelease(release,'other',tag),/平台/u);
    await assert.rejects(workerRelease(release,'web',async()=>({ref:'refs/tags/'+release.tag_name,object:{type:'commit',sha:'b'.repeat(39)}})),/源码/u);
  });
  test('正式资产回读只接受GitHub资产宿主HTTPS跳转',async()=>{
    const previous=process.env.GH_TOKEN;process.env.GH_TOKEN='synthetic';
    try{
      await assert.rejects(request('releases/assets/1',{raw:true,fetch:async()=>new Response(null,{status:302,headers:{location:'https://foreign.example/asset'}})}),/回读地址/u);
      let calls=0;const result=await request('releases/assets/1',{raw:true,fetch:async()=>++calls===1
       ?new Response(null,{status:302,headers:{location:'https://release-assets.githubusercontent.com/asset'}})
       :new Response('synthetic-bytes')});
      assert.equal(calls,2);assert.equal(await result.text(),'synthetic-bytes');
    }finally{if(previous===undefined)delete process.env.GH_TOKEN;else process.env.GH_TOKEN=previous;}
  });

  test('旧入口不能成为任一现行平台的清理归属证明',()=>{
    const current={id:9,path:workflowPath,head_branch:'main',event:'workflow_dispatch',created_at:'2026-01-02T00:00:00Z'};
    const old={...current,id:1,status:'completed',conclusion:'success',created_at:'2026-01-01T00:00:00Z'};
    for(const path of ['.github/workflows/release.yml',`.github/workflows/${owner.product}-${owner.platform}-ci.yml`,'.github/workflows/deleted.yml'])
      assert.deepEqual(cleanupPlan([{...old,path}],current,'success'),[]);
  });
  test('撤销当前产物失败仍处理旧失败且最终失败',async()=>{
    const current={id:9,path:workflowPath,head_branch:'main',event:'workflow_dispatch',created_at:'2026-01-02T00:00:00Z'};
    let releases=0,history=0;
    const api=async path=>{
      if(path.startsWith('releases?')){if(++releases===1)throw Error('撤销中断');return [];}
      if(path==='actions/runs/9')return current;
      if(path.startsWith('actions/runs?')){history++;return {workflow_runs:[]};}
      throw Error('未声明请求');
    };
    await assert.rejects(finish({build:{result:'failure'}},api,{run_id:9}),/撤销中断/);
    assert.equal(history,1);assert.equal(releases,2);
  });
  test('自动化独立测试与组包，三件资产逐件回读',async t=>{
    const {mkdtempSync,realpathSync}=await import('node:fs'),{tmpdir}=await import('node:os');const directory=realpathSync(mkdtempSync(join(tmpdir(),'web-product-')));
    t.after(()=>rmSync(directory,{recursive:true,force:true}));
    const identity={version:'1.0.1',source_sha:'a'.repeat(40),run_id:42,run_attempt:1},calls=[];
    const testResult={schema:1,product_id:owner.product,platform:owner.platform,checks:['eslint','typescript','vite'],counts:{tests:3,passed:3,failed:0,skipped:0,todo:0,cancelled:0}};
    assert.equal(await productCommand('test-product',{identity,environment:{RELEASE_ASSETS_DIR:directory,RUNNER_TEMP:dirname(directory)},invoke:(command,input,work)=>{calls.push([command,input,work]);return testResult;}}),true);
    assert.deepEqual(calls[0],['test',{},join(dirname(directory),'web-test')]);
    const assets=owner.required_assets.map(name=>{const path=join(directory,name),body=Buffer.from('fixture-'+name);writeFileSync(path,body);return {name,path,bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')};});
    const bundle={schema:1,product_id:owner.product,delivery_channel:'web',software_version:identity.version,source_sha:identity.source_sha,assets};
    assert.equal(await productCommand('build-web',{identity,environment:{RELEASE_ASSETS_DIR:directory,RUNNER_TEMP:dirname(directory)},invoke:(command,input,work)=>{calls.push([command,input,work]);return bundle;}}),true);
    assert.deepEqual(calls[1],['package',{software_version:identity.version,source_sha:identity.source_sha,output:directory},join(dirname(directory),'web-build')]);
    await assert.rejects(productCommand('build-web',{identity,environment:{RELEASE_ASSETS_DIR:directory,RUNNER_TEMP:dirname(directory)},invoke:()=>({...bundle,assets:assets.slice(1)})}),/归属/u);
    await assert.rejects(productCommand('build-web',{identity,environment:{RELEASE_ASSETS_DIR:directory,RUNNER_TEMP:dirname(directory)},invoke:()=>({...bundle,assets:[{...assets[0],sha256:'b'.repeat(64)},...assets.slice(1)]})}),/回执/u);
  });
  test('准确三件资产收集拒绝多件或链接',async t=>{
    const {mkdtempSync,realpathSync,symlinkSync}=await import('node:fs'),{tmpdir}=await import('node:os');const directory=realpathSync(mkdtempSync(join(tmpdir(),'web-assets-')));
    t.after(()=>rmSync(directory,{recursive:true,force:true}));
    const identity={schema:1,product_id:owner.product,platform:'web',run_id:42,run_attempt:1},emit=()=>{};
    for(const name of owner.required_assets.slice(0,2))writeFileSync(join(directory,name),'fixture-'+name);
    await assert.rejects(collectProduced({identity,directory,emit}),/集合/u);
    writeFileSync(join(directory,owner.required_assets[2]),'fixture-sums');writeFileSync(join(directory,'extra'),'unexpected');
    await assert.rejects(collectProduced({identity,directory,emit}),/集合/u);rmSync(join(directory,'extra'));
    rmSync(join(directory,owner.required_assets[2]));symlinkSync(join(directory,owner.required_assets[0]),join(directory,owner.required_assets[2]));
    await assert.rejects(collectProduced({identity,directory,emit}),/普通文件/u);
    rmSync(join(directory,owner.required_assets[2]));writeFileSync(join(directory,owner.required_assets[2]),'fixture-sums');
    assert.deepEqual((await collectProduced({identity,directory,emit})).assets.map(value=>value.name),owner.required_assets);
  });
  test('清理旧失败Run同时回收其多个Attempt的准确孤立Tag',async()=>{
    const old={id:2,run_attempt:2,path:workflowPath,head_branch:'main',event:'workflow_dispatch',head_sha:'a'.repeat(40),status:'completed',conclusion:'failure',created_at:'2026-01-01T00:00:00Z'},current={...old,id:9,status:'in_progress',created_at:'2026-01-02T00:00:00Z'};
    const deleted=new Set(),tags=[1,2].map(attempt=>({ref:`refs/tags/${prefix}1.0.0-r2-a${attempt}`,object:{type:'commit',sha:old.head_sha}}));
    const api=async(path,options={})=>{
      if(options.method==='DELETE'){deleted.add(path);return {};}
      if(deleted.has(path)||deleted.has(path.replace('git/ref/','git/refs/')))return null;
      if(path.startsWith('actions/runs?'))return {workflow_runs:[old,current]};
      if(path.startsWith('releases?')||path.includes('/artifacts?'))return path.includes('/artifacts?')?{artifacts:[]}:[];
      if(path.startsWith('git/matching-refs/'))return tags;
      if(path==='actions/runs/2')return old;if(path==='actions/runs/9')return current;
      throw Error('未声明的请求');
    };
    assert.deepEqual(await cleanup('failed',{run_id:9},api),[2]);assert.equal([...deleted].filter(path=>path.startsWith('git/refs/')).length,2);
  });
  test('全部前置成功才成功，其余结论一律失败',()=>{
    assert.equal(precedingResult({build:{result:'success'},publish:{result:'success'}}),'success');
    for(const result of ['failure','cancelled','skipped','timed_out',undefined])assert.equal(precedingResult({build:{result}}),'failed');
    assert.throws(()=>precedingResult({}));
  });
  test('当前Run尚在运行也能清理同目标旧结果，保护其它目标和活动任务',()=>{
    const row=(id,conclusion='success',status='completed',path=workflowPath)=>({id,conclusion,status,path,head_branch:'main',event:'workflow_dispatch',created_at:new Date(1700000000000+id*1000).toISOString()});
    const current=row(6,null,'in_progress');const rows=[row(1),row(2,'failure'),row(3,'success','in_progress'),row(4,'success','completed','.github/workflows/release-other.yml'),current,row(7)];
    assert.deepEqual(cleanupPlan(rows,current,'success').map(row=>row.id),[1]);
    assert.deepEqual(cleanupPlan(rows,current,'failed').map(row=>row.id),[2]);
  });
  test('软件版本进位与错误版本边界',()=>{
    assert.equal(nextVersion('1.0.0',['1.99.99']),'2.0.0');
    assert.throws(()=>nextVersion('invalid',['1.0.0']));
  });
  test('历史完整分页不截断超过1000条记录',async()=>{
    const rows=Array.from({length:1005},(_,id)=>({id}));const api=async path=>rows.slice((Number(/page=(\d+)$/u.exec(path)[1])-1)*100,Number(/page=(\d+)$/u.exec(path)[1])*100);
    assert.equal((await pages('releases',null,api)).length,1005);
  });
  test('失败清理只删除所属旧失败产物及Run，成功和活动任务独立保留',async()=>{
    const row=(id,conclusion,status='completed')=>({id,run_attempt:1,conclusion,status,path:workflowPath,head_branch:'main',event:'workflow_dispatch',repository:{full_name:owner.repository},head_sha:'a'.repeat(40),created_at:new Date(1700000000000+id*1000).toISOString()});
    const current=row(10,null,'in_progress'),rows=[row(1,'success'),row(2,'failure'),row(3,null,'in_progress'),current];
    const gone=new Set(),removed=[];
    const api=async(path,options={})=>{
      if(options.method==='DELETE'){removed.push(path);gone.add(path);return {};}
      if(gone.has(path))return null;
      if(path.startsWith('actions/runs?'))return {workflow_runs:rows};
      if(path.startsWith('releases?')||path.startsWith('git/matching-refs/'))return [];
      if(path.startsWith('actions/runs/2/artifacts?'))return {artifacts:[{id:20}]};
      if(path==='actions/artifacts/20')return {id:20};
      const match=/^actions\/runs\/(\d+)$/u.exec(path);if(match)return rows.find(row=>row.id===Number(match[1]))??null;
      throw Error('未声明的模拟接口：'+path);
    };
    assert.deepEqual(await cleanup('failed',{run_id:10},api),[2]);
    assert.deepEqual(removed,['actions/artifacts/20','actions/runs/2']);
  });

  test('GitHub运行序号保证成功历史清理后版本不会回到初始值',()=>{
    assert.equal(nextVersion('1.0.0',[],4),'1.0.3');
    assert.equal(nextVersion('1.99.99',[],2),'2.0.0');
    assert.equal(nextVersion('1.0.0',['3.0.0'],4),'3.0.1');
    assert.throws(()=>nextVersion('1.0.0',[],0));
  });

}
