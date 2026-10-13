# Codex 情报站独立前端

源码位于 `sites/codex-reset/`，与 AZT 主仓库一起维护，可独立部署为静态网站。使用 HTML、CSS、浏览器 ES modules 和零依赖 Node 构建脚本；不需要业务服务端、数据库、API Key 或 AZT 桌面进程。

在仓库根目录运行：

```sh
npm run site:dev      # 本机预览，修改页面后自动构建
npm run site:check    # 语法与数据、静态输出测试
npm run site:build    # 输出 sites/codex-reset/out/
npm run site:package  # 输出 outputs/codex-intel-static.zip
```

发布时上传 `out/` 内容或解压 ZIP。站点不进入 AZT npm/桌面安装包，不触发 AZT 版本发布。Vercel / Netlify 导入主仓库时把项目目录设为 `sites/codex-reset`；站点提供对应配置。

正式站点使用 GitHub Pages：[Codex 情报站](https://fchangjun.github.io/AI-Zero-Token/)。推送 `sites/codex-reset/**` 或部署工作流到 `master` 后，GitHub Actions 自动检查、构建并发布；Pull Request 只检查和打包。也可在 Actions 中手动运行 `Codex intelligence · GitHub Pages`。

地区价格维护在 `public/data/prices.json`，通告快照维护在 `public/snapshot.json`。价格随页面构建，汇率与通告接口只用于后台更新；接口失败继续使用已有数据，并保留真实时间。手动修改价格后先执行 `npm --prefix sites/codex-reset run data:check`，再构建部署。

站名、默认域名、SEO 索引开关和 AZT 跳转地址统一在 `site.config.json`。Sites 预览保持私有和 noindex；GitHub Pages 工作流从 Pages 读取正式地址，通过构建环境写入 canonical，并开启搜索索引。已包含静态榜单与通告、社交卡片、sitemap、robots、404 和子目录路径支持。

页面分为情报总览 `/`、订阅比价 `/prices/` 和重置动态 `/resets/`。首页突出 Plus 与 Pro 的美区常规价、已收录地区最低价和节省金额；Pro 默认 $200，可切换 $100 / $500。完整地区报价与重置历史在各自详情页查看。

全站统一使用「分享今日情报」：一张 1080 × 1160 图片呈现最新重置信号、参考时间、Tibo 中英文关键消息与 Plus / Pro 最低价。分享冻结打开窗口时的数据，图片仅保留核心消息与价格；来源和更新日期集中在网页折叠的「数据说明」，复制摘要保留 X 原帖链接。

三个页面和分享图包含 AZT 入口。下载与指南指向 AZT GitHub 项目，并附带 UTM 来源标记；未接入第三方访问统计。

GitHub Pages 仅发布 `sites/codex-reset/out/`，不上传主项目源码或本地配置。自动部署流程见 `.github/workflows/codex-intel-static.yml`；仓库 Settings → Pages 的 Source 使用 GitHub Actions。原 Sites Git 历史保留在忽略目录 `.state/sites/codex-reset-source/`，正式源码目录没有嵌套 Git。不要在 AZT 根目录运行 Sites 的自动提交工具。

完整配置和维护步骤见 [站点 README](../sites/codex-reset/README.md)。
