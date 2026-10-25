# CitizenWeb 技术文档

当前编译入口已在本产品正式main检出原路径最简重建；配置只声明，测试、编译和自动化验收结果以实际执行回执为准。

## 聊天功能的唯一产品归属

**聊天客户端的逻辑功能只能在 TataChatSDK 中实现；聊天服务端的逻辑功能只能在 CitizenServe.tatachat 中实现。公民、途遇及其他产品只依赖使用。**

CitizenWeb 涉及聊天时只作为依赖使用方；本条不代表尚未接入聊天的产品已经具备聊天能力。

- 消息、会话、群组、加密、协议、传输、同步、重试、聊天存储、附件、通话及聊天界面行为，按客户端与服务端职责分别归 TataChatSDK 和 CitizenServe.tatachat；新增功能、缺陷修复和平台差异也必须在所属产品内完成。
- 消费产品只提供产品入口、身份与业务权益结果、服务地址及授权、主题和公开接口要求的平台配置；只通过公开接口接入，禁止复制、重写、包装成另一套聊天内核或维护产品专属聊天实现。CitizenServe、TuyuServe 的产品身份与权益授权不包含聊天数据面的实现职责。
- 本机开发直接依赖仓库路径；公民、途遇等产品的正式版本依赖塔塔聊天正式 Release；第三方市场分发使用公开市场版本。依赖使用不以公开市场发布为前置条件，也不改变实现归属。

本产品只有 `web` 平台；编译和测试分别使用本仓target/build、target/test下的本轮唯一目录，GitHub现场由本目标Workflow独占。

## 产品介绍与开源许可

根目录 `README.md` 仅提供本产品简明介绍，不承载技术方案、任务记录或验收结论。独立自有代码采用根 `LICENSE` 的MIT；上游代码、衍生修改、依赖及组合分发遵循各自原许可、版权、例外与附加要求。

## 白皮书中的客户端秘密合同

中英文白皮书统一声明：钱包之外，公民客户端使用 TataChatSDK 持久化的同一本机 MLS Ed25519 身份及 MLS 协议内部状态。初次登记由当前 CID 绑定钱包签署 `0x1C` 域的同一32字节 MLS 公钥；普通请求使用该 MLS 身份证明，不增加独立设备认证钥或应用用途钥。私人本地记录由操作系统保护，MLS 网络协议仍负责加密与成员验证。新成员通过有效 KeyPackage、Welcome、Commit 加入；丢失全部 MLS 状态不能用钱包私钥恢复旧组。

链节点不再内置白皮书副本；官网静态正文与官网页面由同一次源码构建生成，节点运行时读取最新已部署内容。白皮书源码检查继续覆盖中英文内容。

## 当前编译与自动化合同

scripts/config.mjs仅声明控制台所需的CLOUDFLARE_ACCOUNT、PAGES_DEPLOY和COLDSIGN_PUBLICKEY配置需求；不计算版本、不访问GitHub、不启动进程、不生成文件。scripts/build.mjs拥有本产品入口，独立CLI与控制台调用同一实现；导入不执行命令。控制台不拥有产品依赖或流程，不导入其私有宿主模块。

本机与GitHub均沿原始依赖锁执行，缺缓存按原锁正常取得；真实下载、测试、编译、签名或验收失败必须失败。官方缓存只存可再生依赖与编译状态，不含签名材料；恢复/保存故障不阻塞。每轮现场归target/test或target/build的唯一目录，缓存原子领取且不等待，取消等待本轮进程组退出后清理；无法确认退出则保留现场并明确失败。

产品命令：node scripts/build.mjs test <平台>、build <平台>、candidate <平台>、automate <平台>、cleanup <平台>。自动化按准确main提交和平台Workflow执行，派发前检查活动Run，官方派发回执直接提供Run ID；不确定不补发。控制台恢复只观察原Run，产品cleanup命令独立执行历史收尾。成功版本补丁加一，失败不加。自动化候选版本仅存在本轮派生工程与产物，不回写产品版本和依赖锁。

固定Workflow为产品·平台；Run、Job、Artifact、正式Tag、Release及附件显示标签为产品·平台·vX.Y.Z，必要文件扩展名保留。Release创建时使用官方--target显式交付本轮准确提交SHA。Workflow创建准确源码Tag，正式附件先逐个下载比较再确认正式Release；清理按本产品平台最新成功和非成功终态各留一条，活动任务保留，删除后回查。淘汰旧成功前必须确认新正式Release/Tag与Artifact；不按界面隐藏代替实际删除。

本机测试及编译、塔塔鹿鹿和自动化均通过控制台发起。顺序为开发、测试、编译、塔塔鹿鹿、自动化；应用商店提交和官网部署另行授权，编译或自动化不触发它们。任何失败先查原因、报告推荐方案，待用户确认后修复并继续。

官网平台为web，已核实旧正式版本1.0.11的后续首个候选为1.0.12；后续按准确成功Run递增。Node保持25.2.1，npm按package-lock.json执行npm ci，ESLint、TypeScript、Vite与Wrangler沿本仓原锁。Vite配置只声明官方React/Tailwind插件和默认参数，白皮书正文及内嵌图片的whitepaper/content.json交付归build入口；开发服务使用Vite官方createServer与调用方HTTPS证书，缺件失败且不降级HTTP。

正式外部附件使用ASCII物理文件名citizenweb-web-vX.Y.Z.tgz、.json、.sha256，避免GitHub规范化中文文件名；中文显示标签沿GitHub官方file#label语法设置为公民官网·Web·vX.Y.Z及对应扩展名。构建入口负责生成，发布入口按公开正式附件格式独立读取；归档内部保留dist、版本标记、package.json、package-lock.json及发布清单/摘要。使用系统tar归档、列出与解包，拒绝越界、重复、链接、特殊成员及超限内容，不手写tar格式编解码。scripts/publish.mjs沿同一正式包验真和Pages官方Wrangler上传接口；自动化不调用发布、上传或部署。现有发布回归及合成正式包夹具全部归test/release.test.mjs；test/build.test.mjs覆盖构建及职责边界。

历史正式资产先删除已验真Tag，再删除其Release；中断重试沿原回执清理，不重新执行编译或派发。test/build.test.mjs覆盖该失败边界。

编译、归档创建及构建产物回读只归scripts/build.mjs，构建不导入或调用scripts/publish.mjs。发布文件只读取声明、核验/解包已存在的正式包及执行获准部署，不创建编译产物、不生成测试夹具、不登记测试。构建参数归build.mjs；发布规则归publish.mjs，配置不承担动作转发、命名计算或流程执行。原损坏归档错误类别断言保留，未在本次职责调整中放宽。

已有正式归档的读取、格式识别或解包工具失败沿用“正式归档解压失败”错误类别；路径、重复成员、链接、类型及大小约束仍独立校验。test/release.test.mjs中的原解压失败断言保持不变，不放宽检查来消除失败。该逻辑只处理发布前读取已有正式包，不参与编译或归档创建。
工具退出回执先保留原工具失败及诊断，再以系统ps只读获取PID/PGID表；只在有效快照包含调用进程、且本轮进程组已空时允许收尾。查询错误、无效或不完整快照、后代未退出均明确失败并附本轮PID/PGID、保留现场。现有Node内置Mock回归保留原失败/EPERM/留场断言，另验证无效快照和真实同组后代完成，不新增框架、接口或控制台改动。


ESLint与TypeScript无输出检查唯一归test阶段，build阶段仅执行官方Vite生产构建及白皮书交付，不重复静态检查。测试、编译各自独立现场仍分别按原锁npm ci，不新增共享现场或框架。官网缓存只准备npm，不创建Rust、Pub或Gradle目录；工作流缓存键只声明本产品Node与npm锁，清理只处理本轮现场，不处理钱包钥匙串或描述文件。现有依赖均有实际用途，本次不删除依赖或改动发布入口。



控制台通过scripts/config.mjs读取测试、编译与塔塔自动化声明；测试和编译仍由build.mjs执行，GitHub流程归本仓YAML；独立发布调用publish.mjs的prepare/publish命令。prepare只验真已有成功包并读取当前生产部署，原生冷签批准后publish才消费同一proof及previousID，通过官方Wrangler部署并回读；配置文件不转导出动作，发布不调用编译。

本产品scripts/config.mjs的describeAction仅返回repository、workflow、ref、inputs，或既有本地进程命令声明；不导入构建实现、不派发GitHub请求、不处理令牌、版本或历史。控制台使用统一数据接口直接派发并只读观察准确Run；产品GitHub业务归所属既有YAML。本次自动化Run名称使用运行编号，正式构建及产物保持版本名称。已有工具和依赖复用，缺少时才按原声明准备。

Cloudflare账户配置唯一名称为CLOUDFLARE_ACCOUNT，production环境保管原账户值；发布调用Wrangler时才映射到其官方CLOUDFLARE_ACCOUNT_ID环境变量。

官网原生冷签接入由本产品scripts/config.mjs的describeAction({flow:'publish',platform:'web'})声明，继续采用钱包现有动作15及GMB+0x24域。公钥引用、阶段配置需求和Node版本归本产品公开声明，配置值只经通用原生私有标准输入交付。原prepare/publish命令保持；原来位于控制台的官网SCALE发布载荷编码及Tag/产品/平台/字段检查迁入本产品scripts/publish.mjs，不在控制台保留官网专属分支。

批准绑定版本、源码、正式包摘要、当前生产部署、期限及本次随机挑战。publish重新核对准确载荷、成功正式包和当前生产部署，原Pages上传及回读继续使用已有实现；原锁Wrangler通过npm离线复用已有缓存，缺件明确失败。官网动作15的准确字节及篡改拒绝金标归test/release.test.mjs；控制台只测试通用会话、验签、隔离和私有输入，不解释官网业务字段。

本产品配置项统一为name、description、accessLevel、kind、format五个必填字段；不适用规则明确填写“不适用”。name严格使用两组大写字母和一个下划线，同名共用控制台唯一值，当前页仅汇总实际声明的使用产品。操作列固定写入/更换、查看、删除；保密查看保留生物识别。现有配置消费者随声明同步改名，官方工具/API字段保持官方名称，不新增旧名兼容或配置副本。
