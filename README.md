# AI Zero Token

AI Zero Token 是一个本地优先的单用户 AI CLI 和本地网关。

它的核心目标是：

让个人用户优先复用自己已经拥有的账号订阅和账号授权能力，在本地直接接入高质量 LLM，而不是再单独为优质 API 额度和接口调用链付费。

很多用户已经有 ChatGPT、Claude、Gemini 之类产品的账号、订阅或可用授权能力，但缺少一个统一、可脚本化、可本地集成的入口。AI Zero Token 要做的，就是把这类已有授权能力整理成一个可直接使用的命令行工具和本地接口。

## 为什么做这个项目

如果你只是想在自己的电脑上更低门槛地接入主流 LLM，现实里通常会遇到这几个问题：

- 已经有产品订阅，但还没有开发者 API 方案
- 想把能力接入自己的脚本、前端、本地工作流，但不想每次都手工操作网页
- 想统一本地调用方式，而不是每家产品各写一套接入逻辑
- 想学习 OAuth、CLI、网关、npm CLI、桌面端这类真实工程能力

AI Zero Token 就是围绕这些问题设计的。

## 当前能做什么

- 通过 OpenAI Codex OAuth 登录
- 在本地保存 `access_token` 和 `refresh_token`
- 在 token 过期时自动刷新
- 通过 CLI 发起真实模型请求
- 启动本地 HTTP 网关
- 暴露 OpenAI 风格接口：
  - `GET /v1/models`
  - `POST /v1/responses`


## 适合谁用

- 想把账号授权能力包装成本地工具的人
- 想做自己的 AI 网关、AI CLI、AI 桌面端的人
- 想学习一条完整 OAuth -> token -> CLI -> HTTP API 链路的人
- 想把 AI 能力接入脚本、前端或自动化流程的人


## 环境要求

- Node.js 22+ 推荐
- Bun 可用于开发和直接运行源码
- 终端网络需要可访问：
  - `https://auth.openai.com`
  - `https://chatgpt.com`

## 安装与运行

### 从源码运行

克隆仓库并安装依赖：

```bash
git clone https://github.com/fchangjun/AI-Zero-Token.git
cd AI-Zero-Token
npm install
```

直接运行源码：

```bash
bun src/cli.ts help
```

### 从 npm 安装 CLI

如果你只是想把它当作本地 CLI 和本地网关使用，可以直接全局安装：

```bash
npm install -g ai-zero-token
```

安装后验证：

```bash
azt help
```

如果你是为了开发、构建、`npm link`、`npm pack` 或准备发布，单独看：

- `BUILD_CLI.md`

## 快速开始

登录：
```bash
azt login
```

查看当前状态：

```bash
azt status
```

查看支持的模型：

```bash
azt models
```

发起一次对话：

```bash
azt ask "请只回复 OK"
```

指定模型发起对话：

```bash
azt ask --model gpt-5.3-codex "请只回复 OK"
```

启动本地网关：

```bash
azt serve
```

清空本地状态：

```bash
azt clear
```

如果你当前还没有全局命令，也可以把上面的 `azt` 临时替换成：

```bash
bun src/cli.ts
```

例如：

```bash
bun src/cli.ts login
```

## 网关使用说明

如果你主要把 AI Zero Token 当作本地网关来使用，建议按下面的顺序操作。

### 1. 先完成登录

```bash
azt login
```

这一步会打开浏览器，完成 OpenAI Codex OAuth 登录，并把可用 token 保存到本地。

### 2. 启动本地网关

```bash
azt serve
```

CLI 一旦执行 `serve`，就会进入本地网关模式。

默认监听地址：

```text
http://127.0.0.1:8787
```

### 3. 先确认网关状态

健康检查：

```bash
curl http://127.0.0.1:8787/_gateway/health
```

查看当前网关状态：

```bash
curl http://127.0.0.1:8787/_gateway/status
```

### 4. 查看模型列表

内部模型接口：

```bash
curl http://127.0.0.1:8787/_gateway/models
```

OpenAI 风格模型接口：

```bash
curl http://127.0.0.1:8787/v1/models
```

### 5. 调用对话接口

最小请求示例：

```bash
curl http://127.0.0.1:8787/v1/responses \
  -H "content-type: application/json" \
  -d '{"model":"gpt-5.4","input":"请只回复 OK"}'
```

带 `instructions` 的请求示例：

```bash
curl http://127.0.0.1:8787/v1/responses \
  -H "content-type: application/json" \
  -d '{"model":"gpt-5.4","instructions":"你是一个简洁助手","input":"请只回复 OK"}'
```

### 6. 当前支持的接口

- `GET /_gateway/health`
- `GET /_gateway/status`
- `GET /_gateway/models`
- `GET /v1/models`
- `POST /v1/responses`

### 7. 当前支持的主要参数

`POST /v1/responses` 当前主要支持：

- `model`
- `input`
- `instructions`
- `stream`

### 8. 当前限制

- `stream=true` 目前只识别，不返回真实流式结果
- 还没有完整覆盖 OpenAI Responses API 的全部字段
- 还没有实现 `/v1/chat/completions`
- 网关当前默认面向本地单用户使用

## 本地状态

项目会在仓库目录下写入：

- `.state/store.json`
- `.state/settings.json`

它们分别用于保存：

- OAuth 认证信息
- 默认模型和服务配置

## 项目结构

- `src/cli/`
  CLI 命令解析和命令分发
- `src/core/`
  核心业务逻辑
- `src/core/services/`
  认证、模型、聊天、配置服务
- `src/core/store/`
  本地状态读写
- `src/core/providers/openai-codex/`
  OpenAI Codex provider 实现
- `src/server/`
  本地 HTTP 网关
