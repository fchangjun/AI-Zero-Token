# Launch Checklist

## 定位

- 项目定位：实验性本地 AI CLI 和本地网关
- 核心卖点：把 `gpt-image-2` 代理成 OpenAI 风格 `POST /v1/images/generations`
- 推荐口径：本地优先、OpenAI 兼容接口、多账号管理、管理页可视化、生图能力可直接接入脚本和前端

## GitHub 发布前

- 确认 `README.md` 顶部已经出现：
  - `gpt-image-2`
  - 管理页截图
  - 生图结果图
  - 一条命令安装
- 仓库描述建议：
  - `Local-first OpenAI-compatible AI CLI and gateway with gpt-image-2 image generation.`
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
  - `fastify`

## npm 发布前

- 运行：

```bash
npm run typecheck
npm run build
npm pack --dry-run
```

- 确认 npm 包里不包含：
  - `.state/`
  - `design/`
  - `artifacts/`
  - `src/`
  - `dist/**/*.map`

## 首发文案方向

### GitHub / X / 即刻 / 朋友圈短文案

```text
做了一个本地优先的 AI CLI / 网关工具：AI Zero Token。

这次重点补了 gpt-image-2 的代理能力，可以直接暴露 OpenAI 风格的 /v1/images/generations，本地脚本、前端和自动化流程都能直接接。

支持：
- OAuth 登录
- 多账号切换
- 本地管理页
- OpenAI 风格 responses / chat.completions / images.generations

项目还在实验阶段，但已经能跑通完整链路。
```

### 更短标题

- `把 gpt-image-2 代理成本地 OpenAI 风格接口`
- `一个可直接接出 gpt-image-2 的本地 AI 网关`
- `把 ChatGPT 图片生成能力接到脚本和前端里`

## 发布后第一波动作

1. GitHub 仓库公开
2. npm 发布最新版本
3. 发一条带截图和生图结果图的主帖
4. 同步到 V2EX、掘金、即刻、Reddit、Hacker News
5. 收集第一批 issue，优先修安装问题和权限问题
