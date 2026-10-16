# Codex 情报站

全球订阅比价、Codex 重置动态与中英文通告分享。网站源码放在 AI Zero Token 项目的 `sites/codex-reset/`，可以独立构建和部署，不依赖 AZT 桌面应用、数据库或常驻后端。

## 构建与静态部署

使用 Node.js 22 或以上版本，在本目录运行：

```sh
npm run build
```

构建脚本只使用 Node.js 内置模块；单独生成静态站点不需要安装项目依赖，也可直接运行 `node scripts/build-static.mjs`。构建过程不请求外部接口。

输出目录为 `out/`，包含汇总首页 `index.html`、完整比价页 `prices/index.html`、通告页 `resets/index.html`，以及所有样式、脚本、头像与 JSON 数据。将整个目录上传到支持静态文件的托管平台即可。平台配置：

| 配置项 | 值 |
| --- | --- |
| 项目目录 | `sites/codex-reset` |
| 构建命令 | `node scripts/build-static.mjs` |
| 发布目录 | `out` |
| 服务端 / 数据库 / 环境变量 | 无需配置 |

页面链接和资源使用相对路径，支持独立域名以及 GitHub Pages 一类的子目录部署。导航明确链接到 `index.html`、`prices/index.html` 和 `resets/index.html`，不依赖平台自动补目录首页或服务端路由重写；资产平台、对象存储等按文件路径提供内容的托管方式也可使用。上传 ZIP 时保留目录结构，入口选择根目录的 `index.html`。

首页展示 Plus 与可切换档位的 Pro 美区/最低地区对比，并汇总重置通告。比价详情支持 `prices/index.html?plan=pro200&country=PH&channel=web_direct#regional-prices`。全站统一使用「分享今日情报」：一张精简图片包含最新重置信号、北京时间参考时点、Tibo 中英文摘录，以及 Plus / Pro 最低价；`resets/index.html?share=latest` 会直接打开这一功能，支持目录首页的平台仍可使用旧 `resets/?share=latest` 入口。建议使用 HTTPS，以支持浏览器的剪贴板与系统分享能力；不支持系统分享的浏览器仍可保存 PNG 或复制文字。通过本地 HTTP 服务预览，避免用 `file://` 打开 ES 模块页面。

工程已移除 Next、Vinext、React、Cloudflare Worker、API 路由与数据库脚手架；`package.json` 没有第三方依赖。`npm run dev` 构建并监听文件变化，`npm run preview` 预览当前源码，两者仅启动本机静态文件预览，不是部署所需的服务端。默认地址为 `http://127.0.0.1:4173/`。修改构建脚本后重启预览。

在 AZT 仓库根目录也可以运行：

```sh
npm run site:dev
npm run site:check
npm run site:build
npm run site:package
```

`site:package` 输出 `sites/codex-reset/outputs/codex-intel-static.zip`。解压后直接得到静态站文件，不含 Node 运行时、源码凭据、Worker 或数据库。AZT 桌面和 npm 发布仍使用原来的命令，站点不会进入其安装包。

### 多平台配置

Vercel 和 Netlify 已分别提供 `vercel.json`、`netlify.toml`，导入 AZT 仓库时把项目根目录 / Base directory 设为 `sites/codex-reset`。构建命令 `npm run build`、发布目录 `out`；不要选择 Next.js 框架或配置 Functions。字段参考 [Vercel](https://vercel.com/docs/project-configuration/vercel-json) 与 [Netlify](https://docs.netlify.com/build/configure-builds/file-based-configuration/) 官方文档。其他静态托管平台使用同样目录，或直接上传解压后的 ZIP。

正式站点部署到 [GitHub Pages](https://fchangjun.github.io/AI-Zero-Token/)。根仓库的 `.github/workflows/codex-intel-static.yml` 在 `master` 的站点文件变更后自动检查、打包并部署 `out/`，Pull Request 只检查和打包，也可手动触发。仓库 Settings → Pages 的 Source 设为 GitHub Actions。工作流读取 Pages 的真实 URL，构建时设置 `SITE_URL` 和 `SITE_INDEXABLE=true`，保留 `.nojekyll`，并提供可下载的静态 ZIP；本地默认配置仍用于私有 Sites 预览。

### 正式域名与 SEO

`site.config.json` 集中维护站名、站点 URL、是否允许索引和 AZT 下载/指南/项目地址。当前配置是私有 Sites 预览地址，默认 `indexable: false`。公开部署时填写实际正式域名并将 `indexable` 设为 `true`，或在构建环境设置：

```sh
SITE_URL=https://example.com/intel/ SITE_INDEXABLE=true npm run build
# 或用跨平台命令参数
npm run build -- --site-url https://example.com/intel/ --indexable
```

上面的域名仅为填写格式示例。打包 ZIP 时同样可用 `SITE_URL` / `SITE_INDEXABLE`，也可修改配置后运行 `npm run package:static`。构建生成 canonical、Open Graph、Twitter card、JSON-LD、sitemap.xml、robots.txt 和 404 页，并把榜单、地区表与近期通告预渲染为 HTML。页面不执行 JS 时仍能读到数据和来源；交互筛选及图片分享需要 JS。社交封面已作为本地 PNG 保存。

搜索引擎通常只读取域名根路径的 robots.txt，子目录部署还需由域名所有者在根 robots 中声明相应规则或 sitemap。修改 SEO 配置不会开放私有站点。多个部署镜像建议选择一个正式主域名作为 canonical，避免内容重复。

### AZT 引流入口

三个页面提供桌面下载、使用指南与 GitHub 项目入口；分享图保留 Tibo/X 来源并在底部标注 AZT。链接自动携带 `utm_source=codex-intel`、`utm_medium=website` 和页面对应的 `utm_campaign`。这些参数只是来源标记，不代表已接入访问统计；当前没有第三方统计脚本、追踪 Cookie 或数据收集服务。

## 维护地区价格

`public/data/prices.json` 是地区价格的唯一维护源。报价与汇率分别保留时间，构建不会把旧数据的日期改成今天。

```sh
# 修改 JSON 后检查结构、价格与必要字段
npm run data:check

# 导入已核对的新快照（先校验，再写入维护文件）
npm run data:import -- /absolute/path/to/prices.json

# 只更新汇率，不改写地区价格的核对时间
npm run data:update-fx

# 将更新后的数据重新打包，再部署整个 out/ 目录
npm run build:static
```

价格不需要随每次访问重新采集。建议在确认官方价格或档位发生变化时更新报价；定期复核也应保留每条价格的真实来源和核对时间。不要只修改时间以制造新鲜数据，也不要将未经确认的地区价格填成零。此项目没有创建自动更新任务；以后如需定时更新，可在 CI 中运行审核后的数据更新流程并重新部署。

当前地区报价为历史导入的参考快照，保留官网直购、Apple App Store 渠道和对应官方查询地址；本次源码整理没有逐条重新核验价格，数据中的 `provenance` 明确记录这一状态。后续按官方结账页或 App Store 的可核对结果维护本地 JSON，并保留真实核对时间。标准美元档位参考 [OpenAI 定价说明](https://learn.chatgpt.com/docs/pricing)，核对日期由数据文件记录。构建和浏览器运行均不采集第三方比价页面。

人民币估算 = 当地原价 ÷ 每美元对应当地货币 × 美元兑人民币汇率。排序使用原始精度，显示保留两位小数。Top 3 是各档位、所选渠道内的三个不同地区，同地区只取最低报价；缺失汇率、零元促销和未确认报价不参与排名。比较的是 ChatGPT 月度订阅，不是 API 余额或额外 Codex 点数。税费、银行汇差、支付手续费及购买资格以最终官方结账为准。

## 网络不稳定时

构建会把价格与通告快照直接内嵌到对应 HTML。访问者拿到页面和静态资源后，即使外部汇率或通告接口超时，也能先看到打包时的数据，之后再尝试更新；失败时保留可用快照并显示时间和连接状态。浏览器缓存只是补充，清理缓存不会删除部署包中的快照。

外部汇率用于更新人民币估算，地区原价不会依赖访客实时请求第三方报价网站。汇率来源为 [ExchangeRate.dev](https://exchangerate.dev/docs/api-reference)，免费数据可能有延迟，不应将最近可用汇率标成逐秒实时行情。

这不保证首次完全断网时能打开网站：HTML、脚本、样式仍需从静态托管站点加载。本项目未提供 Service Worker 离线安装。当前方案解决的是外部数据接口不稳定导致页面无内容的问题。

## 通告与分享

浏览器打开页面时读取公开接口，页面在前台时每 5 分钟尝试同步；每 30 秒校准显示中的倒计时和观察有效期。切回前台、恢复联网时会补查消息，并合并重复请求、遵守重试限制。状态与历史独立处理：历史请求失败不会阻挡有效的新状态，已有历史保留并标记不完整；状态请求失败则保留此前的有效进展，不把旧数据标为新同步。

常规新信号、预告和确认不需要手动重新发布网站，前提是公共数据源已收录并且访问者能够连接接口或中央静态快照。GitHub Actions 每 15 分钟采集一次备用快照、补充中文译文，并自动构建部署 JSON 和预渲染 HTML。定时执行可能因 GitHub 排队延迟，不保证秒级同步。网页每轮同步也读取最新发布快照，因此已经打开的页面可以补上新译文。页面关闭后不会发送订阅通知。

自动翻译在 Actions 构建环境中用固定版本的英中开源模型运行，无需翻译 API 密钥或常驻服务端；模型和工具依赖不进入静态包，访客无需下载模型。优先保留人工核对的完整译文与已核对整句规则，只为缺失译文的原文生成标有「自动中文译文」的内容。机器翻译可能误解玩梗或缩写，英文原文始终保留，重置状态和时间只取自公开数据，不从译文推断。失败时保留原文与既有译文，下一次任务重试。工具、固定模型与许可见 [自动翻译说明](automation/translation/README.md)。

每次最多补 20 条译文，优先处理当前信号、预告和最近确认，再补历史缺项。译文按原始全文和来源精确匹配，同一个原帖跨状态可以复用完整译文，状态概述不会跨状态复用。备用数据持久保存到独立的 [`codex/intel-data`](https://github.com/fchangjun/AI-Zero-Token/tree/codex/intel-data) 分支，仅含 `snapshot.json`，避免定时数据提交混入主分支。仓库中的 `public/snapshot.json` 是初始备用数据和人工修订入口，构建会合并数据分支最新快照；接口或数据校验失败不会覆盖有效快照。

维护入口：在仓库 Actions 中运行 `Codex intelligence · GitHub Pages` 可以手动补查和部署。修改主分支源码也会触发同一流程。GitHub Actions 需要允许工作流写入数据分支并部署 Pages；公共仓库长期无活动时 GitHub 可能停用定时任务，停用后从 Actions 重新启用。构建失败可在对应运行记录查看，不把失败时刻伪装成新的数据时间。

内网资产平台上传的静态副本会同时检查本地快照和 `https://fchangjun.github.io/AI-Zero-Token/snapshot.json`，中央快照不可用时保留本地内容和已保存数据。需替换一次支持此机制的新版包；此后新消息和译文不必逐条重新上传，平台仍需允许访问中央 JSON 或公开接口。静态副本的 HTML 本身不会被远程改写，持续完全断网时只能展示已有快照。

本机手动更新数据（普通构建不需要安装翻译工具）：

```sh
ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci --prefix automation/translation --no-audit --no-fund
npm run data:update-resets
```

`public/snapshot.json` 保存已核对的通告快照与中文译文。重置动态使用 [Codex Resets 公共 API](https://codex-resets.com/api/docs) 更新。更新快照时保留 API 生成时间、实际采集时间、原帖地址和原文，译文不确定时不要伪装成完整翻译。

统一情报卡保留 Tibo 头像、X 来源、发布时间、中英文关键消息，以及独立整理的 Plus / Pro 价格。图片固定为 1080 × 1160，长文明确标注摘录，不再分成价格和通告两套分享，也无需选择配色、尺寸或附录。分享使用打开窗口时的价格、汇率与通告快照；后续数据更新不改动已经预览的图片。支持保存 PNG、复制摘要和系统分享回退，所有图片均在浏览器生成。有核对译文时优先显示中文译文。图片不显示长说明、完整来源网址或逐卡报价时间；X 原帖仍在复制摘要中保留，报价与汇率时间集中在各页面的「数据说明」。

分享功能统一由 `public/intel-share.js` 和 `public/intel-card.js` 实现。发布包仅保留当前使用的分享实现；页面页脚使用本站导航和 AZT 项目入口，实际外部接口的说明集中在「数据说明」。

重置区域同时保留两组独立状态：最近一次确认记录，以及下一次重置进展。下一次进展区分观察信号（`active_watch`）、正式预告（`scheduled_reset`）和暂无预告；有效的新观察会在首页置顶，并显示 Tibo 中英文原帖。概率仅为 Codex Resets 的第三方估算，观察有效期不是预计到账时间，到期不代表重置完成。正式预告优先于观察信号；过期、早于最近一次完成或来源无法核验的观察不作为当前信号展示。没有新预告时突出上次确认的北京时间、中英文原帖，下一次以独立状态卡清楚显示“暂无新预告”；有新预告时突出预计北京时间与倒计时，上次确认记录仍然可查看。缺少数据或时间无效时显示等待同步，不把加载失败当成没有预告。

首页优先展示有效的未来预告，或 24 小时内的新公开通告；没有新消息时，订阅比价在前。预告参考时点过后进入等待确认，最多继续置顶 24 小时；超过 24 小时只调整首页顺序，未确认预告仍然保留。较新的公开完成记录或明确取消消息才会结束旧预告，观测记录不替代公开完成确认。分享图仍只选当前重点通告并附 Plus / Pro 好价，保持简洁。原帖仅给出 EOD 等模糊窗口时标为参考时间；不按历史间隔预测，也不把倒计时归零当作已完成。静态预渲染和浏览器使用同一判断规则，打开页面后每 30 秒校准显示。

首页与重置页的「联系作者」提供作者公开微信二维码，用于咨询订阅；该入口不代表网站已提供自动推送后台。价格页页脚也可打开相同联系弹窗，二维码不会加入情报分享图。

## 源码与发布历史

本目录是 AZT 主仓库中的普通目录，不再含嵌套 `.git`。原 Sites 提交历史保留在本机忽略目录 `.state/sites/codex-reset-source/`，仅用于独立同步 Sites 云端源码。不要在正式源码目录或 AZT 根目录运行 Sites source helper，发布约束见 [AGENTS.md](AGENTS.md)。普通静态托管无需该发布目录。

## 验证

```sh
npm run check
npm run data:check
npm run build
npm run package:static
```

静态页面可独立部署，不需要运行 AZT 桌面发布流程。站点是独立第三方信息页，与 OpenAI 无隶属关系；不读取个人额度，不提供代付，也不会代用户向社群发送消息。
