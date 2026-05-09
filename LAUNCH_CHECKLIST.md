# Launch Checklist

## 定位

- 项目定位：本地优先的 AI CLI、桌面端和 OpenAI 兼容网关
- 核心卖点：通过 Codex OAuth 账号池把 Responses、Chat Completions 和图片能力代理成本地或远程可用的 OpenAI 风格接口
- 推荐口径：本地优先、Codex CLI/Desktop 自定义 provider、多账号额度轮换、OpenAI 兼容接口、桌面管理台、`gpt-image-2` 生图能力

## GitHub 发布前

- 确认 `README.md` 顶部已经出现：
  - Codex custom provider / `/codex/v1/responses`
  - OpenAI-compatible gateway
  - `gpt-image-2`
  - 管理页截图
  - 一条命令安装
- 仓库描述建议：
  - `Local-first OpenAI-compatible AI CLI and gateway with Codex OAuth, multi-account management, and gpt-image-2 image generation.`
- 仓库 Topics 建议：
  - `ai`
  - `cli`
  - `gateway`
  - `openai`
  - `openai-compatible`
  - `chatgpt`
  - `image-generation`
  - `gpt-image-2`
  - `oauth`
  - `codex`
  - `fastify`

## npm 发布前

- 运行：

```bash
npm run typecheck
npm run build
npm pack --dry-run
```

- 用临时 `AI_ZERO_TOKEN_HOME` 和 `CODEX_HOME` 验证：
  - 设置页保存 `autoSwitch.excludedProfileIds` 后能去重并持久化。
  - Codex provider 写入会把 `IP:端口` 自动归一化成 `http://IP:端口/codex/v1`。
  - 解除接管只移除 AI Zero Token 管理的 provider 配置，并保留备份文件。
  - 普通 `/v1/responses` 的 stream 请求仍返回明确的 `501`，Codex 流式请求走 `/codex/v1/responses`。

- 确认 npm 包里不包含：
  - `.state/`
  - `design/`
  - `artifacts/`
  - `src/`
  - `dist/**/*.map`

## 2.0.5 发布文案方向

### GitHub / X / 即刻 / 朋友圈短文案

```text
AI Zero Token 2.0.5 主要补上了 Codex CLI/Desktop 的自定义 provider 接管能力。

现在可以在桌面管理台一键把 Codex 请求接到本地或远程 AI Zero Token 网关，Codex 的 Responses SSE 流量会走专用的 /codex/v1/responses 透传路径，同时继续使用本机保存的 Codex OAuth 账号池。

支持：
- Codex custom provider 写入/解除
- 本地或远程网关 URL
- 多账号额度自动轮换
- 指定账号不参与自动轮换
- OpenAI 风格 responses / chat.completions / images.generations / images.edits

适合把 Codex、OpenClaw、脚本和本地应用统一接到一个可视化管理的本地网关。
```

### 更短标题

- `一键接管 Codex CLI/Desktop 请求`
- `把 Codex 请求接到本地 OpenAI 兼容网关`
- `支持多账号轮换的 Codex custom provider 网关`

## 发布后第一波动作

1. GitHub 仓库公开
2. npm 发布最新版本
3. 发一条带截图和生图结果图的主帖
4. 同步到 V2EX、掘金、即刻、Reddit、Hacker News
5. 收集第一批 issue，优先修安装问题和权限问题
