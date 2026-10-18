# CitizenWeb 技术文档

> 当前塔塔鹿鹿：每仓 `.github/tatalulu.yml` 只登记仓库身份；控制台 `.github/tatalulu.mjs` 保存并推送后，以 GitHub `main` 回查结果收口。本文早期推送触发检查记录仅供历史追溯。

## 平台编译现场

本产品编译任务使用本仓 `target/build/<平台>` 独立临时目录，平台键为 `web`。不同平台同时领取并执行；同平台已有活跃任务时立即拒绝再次领取。资源准备、工程副本、缓存和编译输出只写本平台现场；确认进程及后代退出、结果被调用方消费后，删除整个平台目录。`target/build` 仅是父目录，`target/test` 仍用于独立测试。独立执行和控制台调度调用同一本仓编译入口与清理接口。


公民官网的本机 Build 负责资源、固定现场、HTTPS 开发启动和静态编译；正式组包归 GitHub 自动化；GitHub 自动化负责版本、Run、Tag/Release 与正式资产上传；Publish 在独立验真最新成功自动化和正式资产后，经控制台本次 Touch ID、QR 冷签与 Keychain 部署令牌上传既有 Cloudflare Pages 项目 `citizenweb`，并回读生产部署。

## 产品声明与独立资源准备（2026-10-17）

本仓工具、依赖、SDK、原始锁、资源配方、流程与验收由本仓源码和公开接口决定。独立执行及控制台调用使用同一本仓实现，不以控制台工具登记、私有目录或资源通道作为运行条件。

本产品必须能在没有塔塔控制台时完全独立执行全部已实现流程。独立执行时，本产品自行完成可信引导、资源获取、验真、保存、复用及任务工作视图准备，不依赖控制台源码、私有资料、安装位置或资源库。

控制台通过其tata/对应产品唯一接入文件调用本仓公开入口，交付普通参数和已授权输入；本仓完整入口负责自己的资源准备、测试选择、执行与收尾。普通工具路径、令牌、签名材料和取消信号可以作为公开接口输入，不要求控制台源码、固定安装位置或私有宿主协议。

直接执行与外部调度共用本仓声明、锁和实现。资源缺失、显式离线缺件、损坏、来源错误和实际执行错误按本仓接口失败，不因调用方身份隐式切换资源模式、升级依赖或改变工具来源。

本节描述当前候选的职责边界，不代表完整流程已经验收；实际测试、编译、签名、安装与发布结果只按原任务卡记录。本仓已移除旧库协议和索引适配，完整入口只使用本产品资源实现。

本仓现行公开声明由`scripts/build.mjs describe`交付；资源与固定现场由同一个 Build 文件拥有。历史验收只描述当时结果，不作为当前代码通过证据。

## 当前工作目录归属（第8步，2026-10-06）

本产品测试、编译的当前工作目录及收尾只按本文“本机固定执行目录”执行。独立入口与控制台调用共用本仓流程；工具原件继续由既有工具实现管理，依赖原件保留在产品自有缓存，本轮可写资源视图、工程、下载半包和测试夹具只进入本产品当前现场。

第8、9步完成目录与路径实现、根文档迁移及测试源码维护，未运行测试、门禁、编译或安装。本文唯一原件位于<本仓根>/CitizenWeb.md；产品接口及流程直接以本仓实际代码和声明为准，业务字典库与其检查已撤销，不另建登记副本。历史验收事实不表示本轮改造已经通过验收，统一测试在第10步进行。根技术文档由本仓门禁按原文、JSON解码值及既有补丁快照扫描机密，仅报告路径；文档迁出不减少资料安全检查。


## 聊天功能的唯一产品归属

**聊天客户端的逻辑功能只能在 TataChatSDK 中实现；聊天服务端的逻辑功能只能在 CitizenServe.tatachat 中实现。公民、途遇及其他产品只依赖使用。**

CitizenWeb 涉及聊天时只作为依赖使用方；本条不代表尚未接入聊天的产品已经具备聊天能力。

- 消息、会话、群组、加密、协议、传输、同步、重试、聊天存储、附件、通话及聊天界面行为，按客户端与服务端职责分别归 TataChatSDK 和 CitizenServe.tatachat；新增功能、缺陷修复和平台差异也必须在所属产品内完成。
- 消费产品只提供产品入口、身份与业务权益结果、服务地址及授权、主题和公开接口要求的平台配置；只通过公开接口接入，禁止复制、重写、包装成另一套聊天内核或维护产品专属聊天实现。CitizenServe、TuyuServe 的产品身份与权益授权不包含聊天数据面的实现职责。
- 本机开发直接依赖仓库路径；公民、途遇等产品的正式版本依赖塔塔聊天正式 Release；第三方市场分发使用公开市场版本。依赖使用不以公开市场发布为前置条件，也不改变实现归属。

本产品只有 `web` 平台；Build 和测试分别使用本仓 `target/build/web`、`target/test` 工作根，互斥领取并在已确认进程退出后清场。GitHub Runner 的自动化临时目录由本目标 Workflow 独占。

## 2026-09-02 本机 Web 编译入口

外部调用方 已登记 `citizenweb.web.build`。锁定依赖使用受控 npm 公共缓存，单次
`node_modules`、TypeScript/Vite 中间状态和 `dist` 全部位于独立受控工作目录，产品目录只被
直接读取。编译输出仅在`citizenweb/target/build/web/`本轮候选中验真，生成内容只归本产品target工作区；Build不发布网站。

本文是 CitizenWeb 唯一技术事实文档。

ESLint、Vite 与两份 TypeScript 分环境配置位于本仓 `config/`，由 Build 显式调用；产品根的 `tsconfig.json` 只登记这两个 TypeScript 项目。Node 版本约束由根 `package.json` 的 `engines` 唯一声明。

#### 1. 模块定位

`citizenweb/` 是 GMB 官网前端工程，用于对外展示公民区块链与项目基础信息。

该模块只负责公开官网页面、白皮书展示、公民宪法读链展示和 CitizenApp 会员订阅发起页，不承载 CitizenChain、链上中国、CitizenApp 或 CitizenWallet 的信任根逻辑。

白皮书唯一真源位于 `citizenweb/src/whitepaper.md`，官网白皮书页通过 Vite raw import 读取该文件；白皮书图片资源继续通过官网构建流程打包展示。同一次官网构建另生成静态`/whitepaper/content.json`，只含正文Markdown，正文引用的官网图片以数据URI内嵌。公民链节点打开白皮书时固定从`https://www.crcfrcn.com/whitepaper/content.json`读取该文件，在自己的既有目录和正文组件渲染；官网部署生效后节点才可在线读取，节点离线时不能显示白皮书。

公民宪法唯一真源在**链上** `LegislationYuan.LawVersions[0][effective_version].chapters`（创世值 = runtime 内置 `constitution.scale`）。官网不打包宪法正文，改由 Cloudflare Worker 读链下发（见 3.3），与 CitizenApp / 区块链节点 / 链上中国四端同源，修宪后自动更新。

#### 2. 当前技术栈

- 前端框架：React
- 类型系统：TypeScript
- 构建工具：Vite
- 样式：Tailwind CSS Vite 插件与本地 CSS
- 本轮静态产物目录：`citizenweb/target/build/stage/compile/`；正式归档由 GitHub 自动化在 Runner 临时工程组包。
- 白皮书正文：`citizenweb/src/whitepaper.md`
- 会员订阅页尚未实现；当前路由不包含 `/membership`。

#### 3. 本地构建

在 `citizenweb/` 目录使用本仓唯一公开 Build 入口：

```bash
node scripts/build.mjs describe
```

完整编译使用 `scripts/build.mjs execute web --work <本仓绝对路径>/target/build/web`，正式候选由 `.github/workflows/web.yml` 在同一Runner组包；二者都由 Build 准备当前任务视图并执行 ESLint、TypeScript 与 Vite，不以 `describe` 的只读声明代替编译结果。

正式候选由 Workflow 调用本仓 Build 按原锁执行 ESLint、TypeScript 与 Vite；随后在同一 Runner 组装确定性归档，并交由本仓 Publish 校验接口回读。产品测试另由本仓公开测试入口执行。它不复用 CitizenApp 或后端 workflow，不读取 Cloudflare 生产令牌，也不创建 Pages Deployment。
源码初始版本来自 `citizenweb/package.json`；GitHub 本目标自动化按成功历史与运行序号计算正式版本。Build 仅在本轮工程副本写入自动化交付的版本，不改源码清单。

白皮书内容、首页发行量、链上中国卖点、技术页和生态页更新后，必须至少访问首页、技术页、生态页、代币经济页和白皮书页确认页面可正常渲染。

#### 3.2. 会员订阅页规划（尚未实现）

- `/membership` 只介绍自由、民主、薪火三档会员及对应权益，不创建订单、不收款、不保存
  会员状态，也不提供任何外部支付入口。
- 会员购买、续订、取消和换档统一在 CitizenApp 内完成；热钱包签名后提交链上交易，付款唯一
  使用公民币。平台价格唯一真源为 finalized `SquarePost::PlatformPrice`。
- 会员权益真源是链上 `Subscriptions[(cid_number, Platform)]`；CitizenApp Worker / D1 只保存
  可重建的 finalized 镜像与确认记录，不接收外部 webhook，也不得独立授予权益。
- 官网会员页的档位、媒体额度和聊天附件上限必须与 CitizenApp 内置三张会员卡及链上价格
  同步；身份与会员仍是两个独立业务信号，任意身份可购买任意会员档。
- 官网与 API 统一使用 `www.crcfrcn.com`：production 默认同源调用 `/api`，不得恢复 `workers.dev` 或独立 API 子域名；`VITE_API_URL` 仅用于明确的本地联调构建。

#### 3.3. 公民宪法页（读链）

- `/constitution` tab 位于导航「白皮书」与「关于我们」之间（`Header.tsx` navItems），lazy 加载 `pages/Constitution.tsx`，UI 复用白皮书 `whitepaper-*` 样式（左目录树 + 右正文 + 回顶），另加 `constitution-*`（版本标签、不可修改徽章、章标题复位）。
- 数据源：`GET {VITE_API_URL||'/api'}/constitution`（Cloudflare Worker），返回结构化 `citizenapp.constitution`：`{version, content_hash, version_label{cn,en}, immutable_articles[], chapters[章>节>条>款 + 中英]}`。官网用 **JSX 直接渲染**（无 `dangerouslySetInnerHTML`），中英并列、条级「不可修改条款 · Immutable」徽章、顶部版本标签、底部链上内容摘要。
- Worker 侧（`citizenserve/src/chain/constitution.ts`）：经 CF Access 反代用**已放行的 `state_getStorage`** RAW 读 `Laws[0]`→显式 `effective_version`（只展示已生效版，不露待生效修宪版，ADR-027 §6.1）→`LawVersions[0][v]` / `LawVersionLabels[0][v]` / `ConstitutionImmutableManifest`，TS 逐字节 SCALE 解码（字段序对齐 runtime `legislation-yuan`；`houses` 为 `Vec<CidNumber>`，每项按 SCALE `Vec<u8>` 读取），KV 短缓存 `CONSTITUTION_TTL_SECONDS`（缺省 300s，修宪后一个 TTL 内刷新）。安全口径与节点 `constitution_getDocument` 一致（RAW 读，不走可被恶意升级伪造的 runtime API）。
- 该页公开只读，Worker guard 早返回放行、无会话门禁；解码器单测以真 `constitution.scale` 为夹具（`test/constitution.test.ts`）。

#### 3.1. 白皮书结构维护记录

- 2026-07-01：白皮书运行时章节按当前模块边界重排为投票引擎、治理模组、管理员模组、公权业务模组、实体模组、发行模组、交易模组和其他模组。
- 2026-07-01：节点章节拆为节点简介、治理机构、链下清算行；链上中国章节拆为链上中国简介、注册局、链上立法、链上选举。
- 后续更新白皮书时，应继续以 `citizenweb/src/whitepaper.md` 为唯一正文真源，并保持目录锚点与正文标题同步。

#### 3.4. 产品页下载按钮

- 产品页（`pages/Ecosystem.tsx`）三卡右上角各有醒目「下载」按钮（金色 `text-gold-400`、`text-xl`、加粗），点击弹出平台下拉（`components/DownloadButton.tsx`，自带点击外部关闭）。
- 公民与公民钱包的 iOS、Android 首次安装只从官网进入各自应用商店。四个准确商品页尚未公开时，平台项显示“未上架”且不可点击；后续只在本页填入已核验的商店商品 URL，直接导航，不使用服务端下载路径、GitHub APK 资产或搜索结果页。应用内更新属于产品自身流程。
- 公民链四个平台在浏览器直接读取 GitHub 公开 Release 列表，逐件核对本平台正式 Tag、自动化证明、版本、唯一安装包、摘要与准确 `browser_download_url`，并回读候选对应的 GitHub Run 成功终态。按版本、Run 与 Attempt 选最新有效正式版；选择平台后直接导航至 GitHub 安装包，不经 CitizenServe、D1 指针或官网文件代理。缺少正式版、列表超限、GitHub 查询失败及错误资产均显示错误，不回退其它平台或源码归档。
- 各卡公开选项：
  - 公民 CitizenApp：`iOS`、`Android` 各有独立商店项；未上架时禁用。
  - 公民钱包 CitizenWallet：`iOS`、`Android` 各有独立商店项；未上架时禁用。
  - 公民链 CitizenChain：macOS 下载 `.dmg`、Windows 下载 `.exe`、LinuxARM 和 LinuxAMD 各下载本架构 `.deb`；平台键仅用于选择准确 GitHub Release，不形成公民链服务端下载请求。
- 移动端不再出现商店搜索提示或服务端下载回退。商店正式页发布并核实身份后，才为对应平台开放链接。

#### 3.5. 标签页标题与图标

支持页 `src/pages/Support.tsx` 的公开问题链接唯一指向
`https://github.com/crcfrcn/citizenweb/issues`，新窗口使用 `rel="noreferrer"`。
新窗口保护，避免正确地址仅出现在注释而实际跳往错误位置；不改变下载或发布行为。

- `index.html`：`<title>公民链｜中华联邦公民储备委员会</title>`；`<link rel="icon" type="image/png" href="/src/assets/favicon.png">` = 官网国旗图（`src/assets/favicon.png`，由 `src/assets/flag-emblem.png` `sips -Z 128` 生成）。原紫色闪电 `favicon.svg` 已删。

#### 4. 线上部署口径

`release-manifest.json`、`SHA256SUMS` 和确定性 `citizenweb-release.tgz`。公开文件
`dist/citizenweb-release.json` 与 manifest 都必须准确记录 `delivery_channel: web`、
`software_version`、`git_commit_sha` 与全部静态资源摘要。Web 是交付渠道，不是宿主平台；两个
制品使用各自精确字段闭集，禁止旧 `platform`、新旧双写或任意额外身份字段。Release 只固化
准确 Actions run；本机不得重新构建或覆盖同版本不同内容。


## Release 全量构建（第 7.4 步）

正式 Release 固定从干净源码执行全量构建，显式关闭 Rust 增量编译及工具链内置缓存，不读取CI作业缓存且不复用本机编译中间物。版本、签名、校验、产物和发布流程保持原有产品合同。

## 双仓统一流程最终收口（第 7.5 步）

本产品执行统一流程规则：本机编译中间物只进入本轮塔塔缓存库的build目录并按终态规则清理；GitHub CI 的作业过程数据只进入该次Runner任务空间；正式Release从干净编译状态执行。源码不进入塔塔缓存库或塔塔产物库。

## CitizenWeb 交付渠道合同（GMB 第 2.9 步，2026-09-02）

  `0b14e67bd2b80a2ca5f99dfc232e8c2f738fc9211a0db0e2f2a0fd260c62a01d`。两者生成的
  `release-manifest.json` 和 `dist/citizenweb-release.json` 只使用
  `delivery_channel: web`；字段缺失、错误值、旧 `platform`、双写和额外字段全部失败关闭。
- `assets_sha256` 仍只覆盖真实静态资源；公开版本标记继续由 manifest 文件清单与
  `SHA256SUMS` 逐字节绑定。外部调用方 原生发布器在任何 Pages 变更前独立解析并比较两份身份的
  产品、渠道、版本、Git SHA 和静态资源摘要。
- 本机定向验证全部通过：CitizenWeb 合同 11/11、GMB 跨仓守卫 17/17、
  CloudflarePublisher XCTest 40/40，共 69 项；Node语法、Rust格式及两份内嵌
  实现哈希一致性检查也通过。Rust 守卫首轮唯一失败是新断言把三处正确渠道写入误计为两处，
  修正守卫期望后完整 17/17 通过，产品实现没有因此回退。
- QR_V1、action、恢复状态、`citizenweb:web` 目标键以及现有 canonical ID 中的
  `platform=web` 仍是另一项签名或持久化 wire 合同；本步没有局部改名或双写。彻底迁移必须与
  CitizenWeb、TuyuWeb、受控注册表、路由、状态模型和签名端同时原子完成。

- 本步未修改 `product.mjs`、`准确Job的`execute.mjs`、`准确Job目录`、受控 registry/routes、Tag、作业
  ID、资产名或生产数据；未启动、停止、安装或重启 外部调用方，也未运行 Git、远程 CI、正式
  Release、Pages 发布或部署。上线时必须先生成新格式正式 Release，再启用严格新发布器，禁止
  让新发布器消费旧格式候选。
### 产品流程物理归属

本产品每个实际产品、平台、流程身份使用下列独立文件，主 Job 为 `flow`；CI 验证源码，Release 生成正式产物，本步不实现Publish，发布待后续逐产品重建。

## 完整产品组织与执行合同

所有者：`citizenweb`，正式源码根 `<本仓根>`；本说明属于该完整产品。组件不会拆成独立仓库或目录产品。所有执行身份统一为 `产品.平台.流程`，单平台物理目录省略平台层，执行身份仍保留真实平台。

真实平台目标：`web`。

仓库推送仅上传本仓已经保存的main提交。控制台推送的唯一实现为console/tuisong.mjs，每仓一次生物识别，授权成功后建立独立任务，任务栏记录Git进度、准确SHA、取消及成功/失败终态。只执行Git与GitHub main只读回查，不执行源码、依赖、注释、文档、测试、签名或资源门禁；不派发产品Workflow、不运行hooks、不续签或重复认证、不自动重试、合并或强推。

本仓已移除GitHub main推送门禁触发器；main上传后不自动运行产品自动化。自动化由用户单独发起，产品仍拥有自己的Workflow、声明、资源、测试和产物实现；产品不导入控制台源码，不依赖控制台工具库、私有规则或其它仓库工作树。控制台只是可选Git客户端。各仓可独立使用公开Git接口完成仓库操作，公开SDK依赖不构成流程耦合。


技术文档由所属完整产品仓根唯一持有；私有规则和任务库由控制台私仓持有，公开产品不读取它们。公开门禁不依赖私仓资料、安装包源码、其它本机产品或个人账号；必要链真源只读本仓明确固定的公开40位SHA，不在门禁中跟随main。本机开发跨产品验收仍比较三仓已保存快照与各端真实镜像。

### 门禁与开发审查职责

准确中文注释按开发阶段逐项复核，不以保留源码每文件包含汉字作为仓库门禁的开发凭证。初始完整内容、生成文件和上游原件保持原文；真实第一方临时注释、机密、源码输出、Workflow、依赖和适用测试仍由本仓同提交门禁验真。公民门禁只把scripts中的Node命令行结果报告识别为CLI输出；本仓实际执行测试的准确协议拒绝断言不属于新运行协议，字符串、注释、模板和未登记测试中的同文不豁免。保存及推送仍逐仓独立授权，并以本机门禁和同SHA的GitHub门禁双成功为唯一终态。

公网 TLS 由 Cloudflare Edge 提供。Vite 开发与预览只启动 HTTPS，要求调用方通过 CITIZENWEB_TLS_CERT_FILE、CITIZENWEB_TLS_KEY_FILE 传入可信证书/私钥文件路径；缺失、无效或不匹配时失败，不回退明文，静态构建不要求服务证书。测试使用系统临时目录的合成 TLS 材料并实际完成 TLS 1.3 的可信 HTTPS 握手，结束即清理，不进入 target 或源码。

门禁仅对既有两份 TypeScript 配置接受合法 JSONC 注释；普通 JSON 继续严格解析，原注释完整保留。

## 产品介绍与开源许可

根目录 `README.md` 仅提供本产品简明介绍，不承载技术方案、任务记录或验收结论。独立自有代码采用根 `LICENSE` 的MIT；上游代码、衍生修改、依赖及组合分发遵循各自原许可、版权、例外与附加要求。

## 白皮书中的客户端秘密合同

中英文白皮书统一声明：钱包之外，公民客户端使用 TataChatSDK 持久化的同一本机 MLS Ed25519 身份及 MLS 协议内部状态。初次登记由当前 CID 绑定钱包签署 `0x1C` 域的同一32字节 MLS 公钥；普通请求使用该 MLS 身份证明，不增加独立设备认证钥或应用用途钥。私人本地记录由操作系统保护，MLS 网络协议仍负责加密与成员验证。新成员通过有效 KeyPackage、Welcome、Commit 加入；丢失全部 MLS 状态不能用钱包私钥恢复旧组。

链节点不再内置白皮书副本；官网静态正文与官网页面由同一次源码构建生成，节点运行时读取最新已部署内容。白皮书源码检查继续覆盖中英文内容。


### 产品独立资源与编译入口


本产品平台闭集为`web`。调用格式为`node scripts/build.mjs <requirements|prepare|build> web --work <绝对工作目录>`；requirements只读并输出唯一JSON，prepare/build从标准输入读取schema=1的资源回执。调用方按本仓公开需求交付准确工具执行器及 npm 原锁依赖目录，再在同一固定工作根执行 prepare 与 build；Web 不声明 Git 源码或原生归档。独立调用方按本仓声明准备资源即可运行，无需读取其他产品工作树或私有资料。

## 当前编译、自动化、发布与门禁边界（2026-10-10）

### Build 与本机启动

`scripts/build.mjs` 独立负责本机资源、固定现场、HTTPS 开发启动和静态编译；公开 `describe`、`requirements`、`execute`、`test`、`dev` 等所属入口。它不负责正式 Web 归档，也不读取 Workflow、Publish 或门禁。实际静态编译依照本仓 npm 原锁执行 ESLint、TypeScript 与 Vite；普通 `execute` 只报告编译终态，不代表上线。

### GitHub 自动化

`.github/workflows/web.yml` 由 GitHub main 的手动派发启动，在 Xcode 27 ARM64 Runner 上调用本仓 `scripts/build.mjs` 完成静态编译。YAML 在本轮 Runner 临时目录组包，以 `scripts/publish.mjs` 的 `inspectPackage` 核验三件正式资产，创建并回读本平台 Tag/Release。失败时只撤销本次创建的 Release 与 Tag。正式资产为 `citizenweb-release.tgz`、`release-manifest.json`、`SHA256SUMS`。不自动部署 Pages。

GitHub 草稿 Release 不支持按 Tag 的 REST 查询；工作流先把本 Run 的固定提交建成 Tag，再创建草稿，通过 CLI 找草稿 ID 并按 ID 回读及验真资产。确认后公开 Release，失败则分别撤销本轮草稿与 Tag。

正式清单和摘要表中的路径都沿用组包时的 `localeCompare` 顺序；发布验真器用同一顺序核对闭集，大写的白皮书构建文件名也参与完整验真。

公民官网 Web Build 只声明并取得锁定的 Node 25.2.1 发行件，以及 `package-lock.json` 指定的 npm 原件；Node 与 npm/Vite 是静态页面编译的完整工具闭包。产品先对 Node 官方归档做固定 SHA-256 校验、隔离解包和入口核验，再从锁中准备 npm 离线缓存，运行本仓测试、`npm ci --ignore-scripts --offline` 与 Vite 构建。锁中标记 `inBundle` 且没有独立 URL/SRI 的依赖仅在逐级确认其父包存在并有锁定 SRI 时由父包 tarball 承载，孤儿或未锁定父包失败。Git、POSIX、Bash、Grep、Sed 及其 Perl、Python、OpenSSL、Gettext、M4、Bison、Flex 原生源码构建不再属于 Web Build；GitHub 工作流与产品 Build 以同一 Node 只读接口核对固定 checkout 的独立 HEAD 与 GitHub Run SHA，不调用 Git CLI。正式 Release 三件资产、Pages 发布和独立工作现场规则不变。

`package-lock.json` 明确锁定可选 sharp WASM 依赖所需的 `@emnapi/runtime` 及其 SRI；即使目标平台不装 WASM 候选，`npm ci` 也先检查全锁闭包一致性，缺项必须修锁而不能跳过校验。

下载组件只导出 React 组件和页面消费的类型，公民链 Release 解析函数留在组件模块内部供按钮调用；产品回归从同一源码提取纯解析段，在测试副本中临时导出并注入合成 GitHub 回执，符合 Fast Refresh 的组件导出约束。

白皮书正文函数在依赖安装前保持可单独加载；Vite 与 React/Tailwind 插件只在实际调用构建配置时动态加载，因此“先测试、再编译”的测试阶段无需预装前端依赖。测试子进程显式继承本轮测试会话身份，互斥和强制终止回归均针对同一个固定现场，不碰正式 build 工作根。

### Publish

`scripts/publish.mjs` 是本产品唯一正式渠道发布入口。准备阶段只通过公开 HTTPS 读取最新成功 Run 对应的正式资产，验真归档成员、版本和摘要；最终确认后再次读取并比对同一候选，只在本轮独占目录物化经清单约束的静态文件和原锁 Wrangler，调用控制台原生安全接口向既有 Pages 项目 `citizenweb` 的 `main` 生产环境上传，回读部署身份。它不导入 Build 或 Workflow，不创建 Release。Cloudflare Pages 官方 Direct Upload 要求 `CLOUDFLARE_ACCOUNT_ID` 与具备 Pages Edit 权限的 API Token；控制台准备冷签时读取真实的上一次 Pages 生产部署 ID，让离线钱包按既有 `previous_deployment_id` 字段准确展示；最终上传前再次回读同一 ID，变化即要求重签。控制台只在 Touch ID 与本次 QR 冷签后向锁定 Wrangler 的子进程交付令牌，不把值写进产品仓库或日志。[Cloudflare 官方说明](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)

本仓 `scripts/config.mjs` 是控制台只读配置需求接口，只声明官网发布使用的公开 `CF_ACCOUNT_ID`、保密 `PAGES_DEPLOY` 与保密冷签信任公钥 `COLD_SIGNER_PUBLIC_KEY`，不保存配置值。公民服务端的广场媒体配置不归官网登记。Pages 发布要求既有项目的生产分支为 `main`、正式域名包含 `www.crcfrcn.com`，且 Git 集成的自动生产部署必须关闭，防止 main 推送绕过 Release；部署后由 Cloudflare API 回读准确项目、提交、环境及成功状态。[Cloudflare 部署接口](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/)

### 塔塔鹿鹿与验收

本仓 `.github/tatalulu.yml` 仅声明仓库身份；保存推送由控制台直接完成。完整产品回归、真实GitHub自动化和Pages部署仍按各自独立流程验收。

### 目录闭集

`scripts/` 仅保留 `build.mjs` 与 `publish.mjs`；产品根保留 `package.json`、`package-lock.json`、`tsconfig.json`，工具配置位于 `config/eslint.config.js`、`config/tsconfig.app.json`、`config/tsconfig.node.json`、`config/vite.config.ts`；`.github/` 仅保留 `workflows/web.yml` 与 `tatagate/tatagate.{json,mjs}`。`README.md` 只提供简介和许可入口，白皮书正文仍归 `src/whitepaper.md`。


## GitHub塔塔门禁与同类记录清理

本仓保留自己的.github/tatagate门禁实现和合同。main的push只触发本仓.github/workflows/tatagate.yml，gate与cleanup在这一个文件内执行；检出准确GITHUB_SHA并验证本仓GitHub事件、main引用和HTTPS origin，门禁继续执行本仓现有检查。gate成功时删除本仓该门禁旧成功Run；gate失败时删除旧失败Run；另一类最近记录和活动Run保留。清理前重新验真Run、Attempt和结论，删除后回查；清理错误如实记录并由后续运行补清，不影响gate检查结论。塔塔控制台通过塔塔鹿鹿的一次生物识别保存、推送本仓，并按准确SHA与Run ID追踪独立门禁任务；门禁结果不影响已确认的推送。

本仓 GitHub 门禁接受 actions/checkout 的准确 HTTPS origin（同一仓库地址有或没有 `.git` 后缀），仓库、事件、提交和工作流身份仍逐项校验。

门禁清理接口只对 URL 的路径部分拒绝越界，允许 created 查询中的时间范围分隔符；同文件回归直接执行正式 HTTP 参数校验，覆盖时间范围和越界拒绝。

编译入口在同一次任务中由本仓完整 Build 先取得资源回执、运行适用代码回归，全部通过后才执行所选平台正式编译；测试失败或取消均禁止生成正式编译产物。测试清单与所需工具只归本仓 Build，外部调用同一本仓完整入口，资源由本产品自己准备。

## 产品自有编译前测试

完整 Build 由本产品在首次资源回执后运行自己登记的 Node 回归，成功后才进入工程准备和正式编译。测试所需 Node 及其它资源按本仓平台声明验真：独立执行由本产品准备，外部调用直接执行同一完整 Build，资源准备及测试选择由本产品完成。测试夹具的固定根映射到本仓 `target/test/sessions/<本轮随机会话>/`，子进程继承会话身份；退出时由本产品核对守卫和工具进程后仅清理该会话。正式 `target/build/<平台>` 的领取与收尾规则保持。合成阶段注入只在本仓测试上下文有效，正式完整 Build 必须先运行本仓测试。

## 独立执行与外部接入边界

依赖由本产品的原始锁和既有独立实现准备、保存及复用；直接执行与控制台调用使用同一完整入口。控制台通过对应tata产品文件传递动作、普通工具路径、已授权输入与取消信号，不登记或供应产品依赖，不要求私有资源通道。显式离线缺件和真实执行错误按本产品接口失败，不改变版本、来源或SDK提交。

GitHub接口使用普通参数和已授权令牌，返回本仓既有版本计划与Run回执；派发不确定不重发。各平台YAML、Run、Release、Tag规则和增量缓存由本仓保有。控制台接入绑定只在其tata/对应产品唯一文件中实现；平台、流程、动作、布局及控制台任务功能由控制台拥有，本仓不操作控制台任务宿主。产品名称由产品提供，并声明选用的控制台平台和流程。

发布接口只接收普通配置、payload、credentials及公开回执；不接收控制台安全操作名、file或base64帧。控制台安全帧由其tata/唯一接入文件转换，原生层在原授权内调用本仓deploy入口，产品实际上传实现只有本仓这一份。

当前候选仍待运行验收；本轮只补准确业务回归，不追修新增通用自动化夹具，也不向控制台或其它产品添加跨仓准入。scripts/config.mjs及其公开配置合同保持；通过控制台保存推送仍要求本仓.github/tatalulu.yml。 发布prepare只读核验成功正式资产；publish接收本轮普通输入和凭据完成全流程，deploy接收payload与credentials执行同一deployPages实现。上传、项目检查和部署后来源回读由本仓拥有。Node25.2.1与Wrangler4.121.0沿用本仓锁，凭据仅进入本轮内存与子进程输入或环境。
