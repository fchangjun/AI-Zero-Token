# AI Zero Token

[English](README.md) | [简体中文](README.zh-CN.md)

AI Zero Token 是一个本地优先的 OpenAI 兼容网关，用于把 ChatGPT/Codex OAuth 账号能力包装成本地 CLI、管理页和 HTTP API。

它适合本地单用户场景、原型验证、自动化脚本和 OpenAI-compatible 客户端接入。

> 这是实验性质的本地工具，不是 OpenAI 官方产品，也不建议作为生产级多租户网关使用。

## 功能

- OpenAI 风格本地接口：
  - `GET /v1/models`
  - `POST /v1/responses`
  - `POST /v1/chat/completions`
  - `POST /v1/images/generations`
  - `POST /v1/images/edits`
- 支持 ChatGPT/Codex OAuth 登录和本地 token 自动刷新。
- 管理页支持多账号保存、切换和删除。
- 支持账号 JSON 导入/导出，以及复选框选择后的批量导出。
- 支持把已保存账号应用到本机 Codex，并自动备份 `~/.codex/auth.json`。
- 支持 `gpt-image-2` 文生图和 JSON 图生图。
- 支持上游代理配置，覆盖 OAuth、模型刷新和接口转发。
- 模型列表优先读取本机 Codex 模型缓存，并支持手动刷新。

## 快速开始

```bash
npm install -g ai-zero-token
azt start
```

启动后会打开本地管理页，并暴露本地网关：

```text
http://127.0.0.1:8787
http://127.0.0.1:8787/v1
```

如果客户端必须填写 API Key，可以填任意非空占位值；真正起作用的是本地网关里的账号授权。

## 管理页

管理页是推荐入口，可以完成：

- OpenAI Codex OAuth 登录。
- 导入一个或多个账号 JSON。
- 切换当前账号。
- 导出单个账号或勾选导出多个账号。
- 将已保存账号应用到本机 Codex。
- 配置默认文本模型和上游代理。
- 测试 `models`、`responses`、`chat.completions`、`images.generations`、`images.edits`。

![AI Zero Token 管理页](docs/images/admin-dashboard.jpg)

## API 使用

### 模型列表

```bash
curl http://127.0.0.1:8787/v1/models
```

### Responses

```bash
curl http://127.0.0.1:8787/v1/responses \
  -H "content-type: application/json" \
  -d '{"model":"gpt-5.4","input":"请只回复 OK"}'
```

### Chat Completions

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "content-type: application/json" \
  -d '{
    "model": "gpt-5.4",
    "messages": [
      {
        "role": "user",
        "content": "请只回复 OK"
      }
    ]
  }'
```

### 文生图

```bash
curl http://127.0.0.1:8787/v1/images/generations \
  -H "content-type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "生成一张白底红苹果商品图，构图简洁，光线干净。",
    "size": "1024x1024",
    "quality": "low",
    "response_format": "b64_json"
  }'
```

响应会返回 OpenAI 风格的 `data[].b64_json`。

![AI Zero Token gpt-image-2 生图预览](docs/images/gpt-image-2-preview.png)

### 图生图

`/v1/images/edits` 当前支持 JSON 请求，图片可以使用 URL、data URL 或裸 base64：

```bash
curl http://127.0.0.1:8787/v1/images/edits \
  -H "content-type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "参考这张图，生成一张更适合科技产品广告的版本。",
    "images": [
      {
        "image_url": "data:image/png;base64,替换为你的图片base64"
      }
    ],
    "size": "1024x1024",
    "quality": "low",
    "response_format": "b64_json"
  }'
```

更多示例见 [docs/API_USAGE.md](docs/API_USAGE.md)。

## 账号管理

AI Zero Token 的账号状态默认保存在：

```text
~/.ai-zero-token/.state
```

管理页支持：

- OAuth 登录。
- 从单个 profile、数组或 `profiles` bundle 导入。
- 导出单个账号。
- 使用复选框批量导出已选择账号。
- 删除账号和切换当前账号。

导出的账号 JSON 包含认证 token，等同于登录凭据，只应在可信环境中使用。

### 应用到 Codex

`应用到 Codex` 会把选中的账号写入：

```text
~/.codex/auth.json
```

写入前会把原文件备份为 `auth.json.azt-backup-*`。新的 Codex 会话会使用该账号。

## 配置

默认监听：

```text
0.0.0.0:8787
```

本地网关 Base URL：

```text
http://127.0.0.1:8787/v1
```

限制浏览器 CORS 来源：

```bash
AZT_CORS_ORIGIN=http://127.0.0.1:8124 azt start
```

多个来源用英文逗号分隔：

```bash
AZT_CORS_ORIGIN=http://127.0.0.1:8124,http://localhost:3000 azt start
```

覆盖持久化状态目录：

```bash
AI_ZERO_TOKEN_HOME=/path/to/home azt start
```

默认请求体上限是 `32 MiB`，用于让 JSON base64 图片在本地图片编辑场景里更实用。可以用下面的环境变量覆盖：

```bash
AZT_BODY_LIMIT_MB=64 azt start
```

## 生图额度

ChatGPT Images 的可用性和额度由上游账号决定。Free 账号可以尝试生图，但限制比付费账号更严格，官方没有公开固定张数。网关不会本地硬拦截 Free 账号，而是展示上游真实返回，例如 `usage_limit_reached` 和重置时间。

图片请求内部使用 `gpt-5.4-mini` 作为编排模型，并把请求里的图片模型（例如 `gpt-image-2`）传给 `image_generation` tool。

对于 JSON 图生图，base64 通常比原始图片大约 33%。在默认 `32 MiB` 请求体上限下，原始图片约 `24 MiB` 是比较实际的上限，再大就容易被 JSON 开销和本地内存影响。大图或批量场景建议优先使用可访问的图片 URL。

## 当前限制

- 项目默认面向本地单用户使用。
- `stream=true` 目前只识别，并未对所有接口实现完整流式兼容。
- `/v1/images/generations` 当前返回 `b64_json`，暂不支持托管图片 URL。
- `/v1/images/generations` 暂不支持 `n > 1`。
- `/v1/images/edits` 当前只支持 JSON，暂不支持 `multipart/form-data`、`mask` 和 `file_id`。
- 超大的 base64 JSON 请求受 `AZT_BODY_LIMIT_MB` 和本地内存限制。
- OpenAI Responses API 兼容范围是常见本地客户端工作流，不是完整实现。

## 安全

- `access_token`、`refresh_token`、`id_token` 都等同于登录凭据。
- 不要把本地网关暴露给不可信网络。
- 不要在不可信环境中传递导出的账号 JSON。
- 复制或发布本地文件前，请检查 `~/.ai-zero-token/.state` 和 `~/.codex/auth.json`。

## 开发

安装依赖：

```bash
npm install
```

源码运行：

```bash
bun src/cli.ts start
```

验证：

```bash
npm run typecheck
npm run build
```

CLI 构建和发布说明见 [BUILD_CLI.md](BUILD_CLI.md)。用户可见变更见 [CHANGELOG.md](CHANGELOG.md)。

## 项目状态

AI Zero Token 仍在快速迭代。当前重点是稳定本地网关、账号迁移工作流，以及 OpenAI 风格客户端的图片生成/编辑兼容性。

反馈和问题：[GitHub Issues](https://github.com/fchangjun/AI-Zero-Token/issues)
