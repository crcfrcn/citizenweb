# CitizenWeb

公民官网，提供产品介绍、公开信息与软件下载入口。

白皮书唯一真源为公民链仓库根目录 `CitizenChainWhitepaper.md`，两张配图位于该仓库 `icons/whitepaper-*.svg`。官网只构建并展示这份内容，不保留可编辑副本。本机默认读取相邻的 `../citizenchain`；独立构建可通过 `CITIZENCHAIN_WHITEPAPER_ROOT` 指定公民链源码目录。GitHub 工作流检出公民链 main 的白皮书及配图，再由相同构建入口装配。目录、正文和返回顶部交互保持原样。

本仓库独立自有代码采用 [MIT](LICENSE) 许可证；第三方代码、依赖及其衍生修改遵循各自原许可证。
