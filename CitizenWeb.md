# CitizenWeb 技术文档

## 平台编译现场

本产品编译任务使用本仓 `target/build/<平台>` 独立临时目录，平台键为 `web`。不同平台同时领取并执行；同平台已有活跃任务时立即拒绝再次领取。资源准备、工程副本、缓存和编译输出只写本平台现场；确认进程及后代退出、结果被调用方消费后，删除整个平台目录。`target/build` 仅是父目录，`target/test` 仍用于独立测试。独立执行和控制台调度调用同一本仓编译入口与清理接口。


公民官网的本机 Build 负责资源、固定现场、HTTPS 开发启动和静态编译；正式组包归 GitHub 自动化；GitHub 自动化负责版本、Run、Tag/Release 与正式资产上传；Publish 只读核验自动化产物。Pages 上传及切流尚未实现。

## 工具与依赖的声明和供给职责（2026-10-08）

本产品完全独立管理全部流程所需的工具、依赖及其它资源需求。需求唯一依据为本仓源码、公开声明、锁文件及本产品拥有的准备配方，包括准确版本、平台、官方来源、摘要或固定提交、闭包、验真方式和失败条件；塔塔控制台按当前产品声明提供资源，不维护另一份产品需求或替产品决定版本、来源与流程步骤。

本产品必须能在没有塔塔控制台时完全独立执行全部已实现流程。独立执行时，本产品自行完成可信引导、资源获取、验真、保存、复用及任务工作视图准备，不依赖控制台源码、私有资料、安装位置或资源库。

通过塔塔控制台执行本产品流程时，本产品向控制台声明所需资源并使用其已准备好的供给。控制台先核对并复用已有的匹配工具与依赖；没有的由控制台按本产品声明下载、准备、验真并保存到控制台工具库或依赖库，再交付本产品复用。本产品负责核验交付与自身需求一致并使用资源，不因控制台缺件或供给失败改为自行下载，也不另建同一资源的永久副本；可写包管理器视图与流程过程数据仍归本产品当前任务工作目录。

两种执行方式使用本产品同一声明、锁和流程实现，仅资源供给职责随执行方式改变。该职责适用于本产品全部平台与已实现流程。独立模式下资源缺失由产品处理；控制台模式下资源缺失由控制台处理。显式离线缺件、交付失败、损坏、错误摘要、来源漂移或越界必须据实失败，不自动升级、覆盖可疑原件或切换执行方式。

以上为当前职责规范；本次只更新文档，不代表现有资源协议与运行代码已完成接入或通过真实流程验收。历史记录中的“可选供给”或“产品负责缺件获取”仅描述当时实现，不作为当前职责依据。

本仓现行公开声明由`scripts/build.mjs describe`交付；资源与固定现场由同一个 Build 文件拥有。历史验收只描述当时结果，不作为当前代码通过证据。

## 当前工作目录归属（第8步，2026-10-06）

本产品测试、编译的当前工作目录及收尾只按本文“本机固定执行目录”执行。独立入口与控制台调用共用本仓流程；永久工具与依赖原件保留在所属执行方式的源码外原件库，本轮可写资源视图、工程、下载半包和测试夹具只进入本产品当前现场。

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

白皮书唯一真源位于 `citizenweb/src/whitepaper.md`，官网白皮书页通过 Vite raw import 读取该文件；白皮书图片资源继续通过官网构建流程打包展示。

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

完整编译使用 `scripts/build.mjs execute web --work <本仓绝对路径>/target/build/web`，正式候选由 `.github/workflows/release-web.mjs` 独立组包；二者都由 Build 准备当前任务视图并执行 ESLint、TypeScript 与 Vite，不以 `describe` 的只读声明代替编译结果。

正式候选组包由 Workflow 独立执行原锁安装、ESLint、TypeScript 与 Vite；离线完整编译和门禁验收执行原锁安装、ESLint、TypeScript 与 Vite，产品测试另由本仓公开测试入口执行。通过后由
本仓公开入口生成确定性归档。它不复用
CitizenApp 或后端 workflow，不读取 Cloudflare 生产令牌，也不创建 Pages Deployment。
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

#### 3.4. 产品页下载按钮（CitizenServe 白名单代理）

- 产品页（`pages/Ecosystem.tsx`）三卡右上角各有醒目「下载」按钮（金色 `text-gold-400`、`text-xl`、加粗），点击弹出平台下拉（`components/DownloadButton.tsx`，自带点击外部关闭）。
- 文件下载由 `DownloadButton.tsx` 生成同源 `/api${downloadPath}`，再交给 CitizenServe 的既有
  白名单下载入口解析正式发布记录；CitizenWeb 不直接拼接 GitHub Release 地址或资产名。
- 下载发布指针唯一保存于 CitizenServe 绑定的 D1 `citizenweb-download`；CitizenWeb 只拥有公开页面与
  下载入口展示，不拥有数据库实现、凭据或发布写入逻辑。
- 各卡公开选项与当前服务端路径：
  - 公民 CitizenApp：`iOS`（弹提示去 App Store，无直链）/ `Android` → `/download/citizenapp/android`
  - 公民钱包 CitizenWallet：`iOS`（弹提示）/ `Android` → `/download/citizenwallet/android`
  - 公民链 CitizenChain：`macOS` → `/download/citizenchain/macOS`、`Windows` →
    `/download/citizenchain/Windows`、`LinuxARM` → `/download/citizenchain/LinuxARM`、
    `LinuxAMD` → `/download/citizenchain/LinuxAMD`
- CitizenChain 的 `label` 与公开下载路径平台段使用同一个标准平台名；CitizenServe 在服务端
  类型化边界内映射到既有内部发布键。旧架构拼接路径不保留兼容入口。本次只完成源码合同迁移，
  没有部署 CitizenWeb/CitizenServe，也没有修改 Release Tag、资产名、manifest 或生产 D1。
- iOS 为纯提示文案（`window.alert`），暂无 App Store 直链。

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

本产品执行统一流程规则：本机编译中间物只进入本轮塔塔缓存库的build目录并按终态规则清理；GitHub CI 的作业过程数据只进入该次Runner任务空间；正式Release从干净编译状态执行。源码不进入塔塔缓存库、塔塔依赖库或塔塔产物库。

## CitizenChain 标准下载路径验证（GMB 第 2.6 步，2026-09-02）

- `Ecosystem.tsx` 的 CitizenChain 下载数组精确锁定四个标准平台名及四条同名公开路径；六条旧
  架构拼接或小写路径仅进入负向断言，不能回流到生效页面源码。
- `release_manifest.test.mjs` 9/9 通过；CitizenServe 两个定向测试文件 17/17、跨仓
  `repo_guard` 13/13、外部调用方 静态合同 1/1 和 macOS 原生下载合同 XCTest 1/1 均通过。
- 本步没有执行官网构建、远程 CI、正式 Release、Pages 发布或任何生产部署。

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

链节点内置白皮书必须从已保存、已登记验真的官网固定提交正式生成。源码检查应同时覆盖两种语言，禁止把尚未更新的内置资料当作当前合同。

本轮源码固定提交为 `b9276f147e4b7fc1f14ec1905e8b7225d0d6fbea`；链节点内置资料已从该已保存、已登记的不可变Git原件正式生成。源码测试仍等待整批修改完成后统一运行。


### 产品独立资源与编译入口


本产品平台闭集为`web`。调用格式为`node scripts/build.mjs <requirements|prepare|build> web --work <绝对工作目录>`；requirements只读并输出唯一JSON，prepare/build从标准输入读取schema=1的资源回执。调用方按本仓公开需求交付准确工具执行器及 npm 原锁依赖目录，再在同一固定工作根执行 prepare 与 build；Web 不声明 Git 源码或原生归档。独立调用方按本仓声明准备资源即可运行，无需读取其他产品工作树或私有资料。



## 当前编译、自动化、发布与门禁边界（2026-10-10）

### Build 与本机启动

`scripts/build.mjs` 独立负责本机资源、固定现场、HTTPS 开发启动和静态编译；公开 `describe`、`requirements`、`execute`、`test`、`dev` 等所属入口。它不负责正式 Web 归档，也不读取 Workflow、Publish 或门禁。实际静态编译依照本仓 npm 原锁执行 ESLint、TypeScript 与 Vite；普通 `execute` 只报告编译终态，不代表上线。

### GitHub 自动化

`.github/workflows/release-web.yml` 与同名 MJS 独立从已保存的本仓源码建立 Runner 临时工程，按原锁安装依赖，完成 ESLint、TypeScript、Vite 检查和正式 Web 归档及三件资产回读。版本、Run、Tag、Release、上传和同目标历史清理由该 Workflow 独占；不调用本机 Build。正式资产为 `citizenweb-release.tgz`、`release-manifest.json`、`SHA256SUMS`。

### Publish

`scripts/publish.mjs` 只通过公开 HTTPS 读取唯一成功 Run 对应的正式资产，并验真归档成员、版本和摘要。它不导入 Build 或 Workflow，不创建 Release，也不部署 Pages。Pages 上传与切流尚未接通时按实际状态失败。

### 只读塔塔门禁与验收

`.github/tatagate/tatagate.mjs` 只读核对本仓主检出、目录闭集、流程边界、登记文件和 Node 语法；它不准备资源、不运行 Build 或产品测试。当前变更仅通过语法和差异空白检查，完整产品回归、真实 GitHub Run 和 Pages 部署尚未验收。

### 目录闭集

`scripts/` 仅保留 `build.mjs` 与 `publish.mjs`；产品根保留 `package.json`、`package-lock.json`、`tsconfig.json`，工具配置位于 `config/eslint.config.js`、`config/tsconfig.app.json`、`config/tsconfig.node.json`、`config/vite.config.ts`；`.github/` 仅保留 `workflows/release-web.{yml,mjs}` 与 `tatagate/tatagate.{json,mjs}`。`README.md` 只提供简介和许可入口，白皮书正文仍归 `src/whitepaper.md`。


## GitHub塔塔门禁与同类记录清理

本仓保留自己的.github/tatagate门禁实现和合同。main的push只触发本仓.github/workflows/tatagate.yml，gate与cleanup在这一个文件内执行；检出准确GITHUB_SHA并验证本仓GitHub事件、main引用和HTTPS origin，门禁继续执行本仓现有检查。gate成功时删除本仓该门禁旧成功Run；gate失败时删除旧失败Run；另一类最近记录和活动Run保留。清理前重新验真Run、Attempt和结论，删除后回查；清理错误如实记录并由后续运行补清，不影响gate检查结论。塔塔控制台通过塔塔鹿鹿的一次生物识别保存、推送本仓，并按准确SHA与Run ID追踪独立门禁任务；门禁结果不影响已确认的推送。
