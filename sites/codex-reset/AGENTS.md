# Codex 情报站

本目录是 AI Zero Token 主仓库中的独立纯前端站点。使用原生 HTML/CSS/ES modules，静态构建工具仅用 Node 内置模块。不要添加 Next/Vinext、Worker、数据库、API 路由或部署时运行的服务端。`scripts/preview.mjs` 只用于本机开发，不进入发布包。定时采集与离线机器翻译仅在 GitHub Actions 或本机维护时运行；其隔离依赖位于 `automation/translation/`，模型缓存位于 `.cache/translation/`，均不得复制到静态产物。

- 主入口：`npm run dev`、`npm run build`、`npm run check`、`npm run package:static`。
- 价格唯一维护源：`public/data/prices.json`；通告：`public/snapshot.json`。保留真实数据日期，失败不覆盖有效快照。
- 定时快照保存于 `codex/intel-data` 分支，主分支快照提供初始数据和人工译文。不要将定时数据提交混入主分支或提交无关 AZT 改动。机器翻译保留原文、模型来源及时间，明确标为自动译文，不参与状态或时间判断。
- 改页面时保持静态预渲染与浏览器渲染一致，核对根路径和子目录部署。
- 分享保留 Tibo 头像、中文、英文、X 原帖与时间；AZT 引流不能遮盖通告或伪装成官方消息。
- SEO/推广地址通过 `site.config.json` 配置。预览默认 noindex；不能仅因配置 indexable 就更改 Sites 的访问权限。
- AZT 桌面/npm 发布与本站发布独立，不触发根仓库的版本发布流程。

## Sites 发布历史与主仓库隔离

**不要在本目录或 AZT 根目录运行 Sites source helper。** 它会创建嵌套 Git，或把主仓库无关改动一起提交。

本机原有 Sites Git 历史完整保留在根仓库已忽略的 `.state/sites/codex-reset-source/`。正式源码始终以本目录为准。发布 Sites 时：

1. 用 Sites `get_site` 和源凭据打开这个独立发布目录；仅在发布目录运行 source helper。
2. 在正式源码完成修改与检查后，运行 `node scripts/sync-publish-source.mjs`，安全同步到既有发布目录。
3. 在发布目录重新构建 `out/`，用 helper 提交、推送和打包，再发布同一项目 ID。保持原访问范围。

新机器若没有发布目录，用 Sites 正式流程在空的独立目录恢复云端源，再同步正式源码。同步脚本不创建仓库、不联网、不保存凭据。保留 `.openai/hosting.json` 的项目 ID。普通静态部署无需 Sites 或发布目录。
