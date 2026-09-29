# Response Reviewer 迁移到 AI Zero Token

## 本期范围

Reviewer 已作为 AZT 的第一个本地工具接入。AZT 负责配置、启动和停止服务、审阅历史与数据导入；Codex 某条回复旁的 Review 按钮负责选择要审阅的内容。

两侧使用同一套工作台和同一份审阅记录：

- **AZT → 工具 → Response Reviewer**：设置、历史检索、备用工作台和旧数据导入。
- **Codex 回复旁 → Review**：保存该条回复的快照，并在右侧打开审阅工作台。
- **可选 MCP / Skill**：在任务中显式保存一条回复或获取批注汇总，不是使用回复按钮的前提。

Codex 右侧工作台是通过本机调试连接添加的 **DOM 浮层 + iframe**，不是官方原生侧边栏 API。它依赖 Codex 页面结构与嵌入策略，属于实验性接入。旧 Companion / Agent Mate 启动器不迁移；Codex 的接入启动由 AZT 工具页提供一键入口，但不会未经确认强制重启或改写 Codex。

本期不实现问答回复、记忆体管理，也不将 Reviewer 接入模型请求转发链路。后续工具可沿用工具页与本地管理路由的组织方式。

## 首次使用

### 1. 在 AZT 启用服务

1. 运行包含本次迁移代码的 AZT，打开左侧“工具”。
2. 勾选“启用 Reviewer”，点击“保存设置”。服务默认关闭。
3. 点击“打开审阅工作台”，或从“审阅历史”打开某条记录。

设置保存在本地；下次启动 AZT 时按保存的设置恢复。退出 AZT 或取消启用会停止 Reviewer，**不会删除审阅记录**。

### 2. 按需启用 Codex 回复按钮

这是独立的可选开关。仅使用 AZT 工作台或 MCP 时，无需调试端口。

1. 若旧 Companion 正在注入 Review 按钮，先关闭旧注入，避免两套入口冲突。
2. 勾选“Codex 回复旁显示 Review 按钮（实验性）”，确认本机 CDP 端口（默认 `9222`），点击“保存并启动 Codex 接入”。
3. 如果 Codex 已经打开，AZT 会先显示确认框。确认后，AZT 请求 Codex 正常退出，再以 `127.0.0.1:<端口>` 启动；取消不会修改当前 Codex。请在确认前保存未完成内容。
4. 等待连接状态显示已连接。打开一条回复，点击它旁边的 Review 按钮。

如果 Codex 没有正常退出，AZT 不会强制终止它，而会提示你手动完全退出后再次点击。仅在排障或备用场景下，才手动执行 macOS 命令（默认端口 `9222`）：

   ```sh
   open -b com.openai.codex --args --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222
   ```

AZT 只连接用户指定的 `127.0.0.1` 调试端口，不会将端口开放到局域网或公网。若当前 Codex 版本不接受该启动方式、页面结构发生变化，或 iframe 被拦截，请使用 AZT 工作台或可选 MCP 入口。真实 Codex 的兼容性需要在用户明确启用接入后验证。

**调试端口可以控制页面，不是普通业务接口。** 不要开放到局域网、公网，不要做端口转发。取消按钮开关会尽力移除已连接页面中的按钮与浮层；完全退出并正常启动 Codex 可关闭调试端口。

### 3. 批注与反馈

- 选中回复中的文字添加评论或建议替换；不选文字可添加整体意见。
- 需要读取关联的本地文件时，先明确确认当前回复的项目目录。只能读取声明过且位于该项目内的文件，不能借符号链接越界。
- “复制指令”汇总尚未处理的批注，用户自行粘贴和发送。
- “放入对话框”只在用户点击后请求通过深链接预填；不能保证所有 Codex 版本都支持。请检查输入框，失败时使用复制指令。
- Reviewer **不自动发送消息、不自动改写项目文件**，不自动将批注追加到正在编辑的草稿。

## 数据位置与旧记录导入

默认目录：

```text
~/.ai-zero-token/.state/tools/response-reviewer/
  settings.json   启用状态、按钮开关和调试端口
  store.json      回复快照、批注和审阅工作区
  runtime.json    当前运行实例信息（临时，停止时移除）
```

若设置了 `AI_ZERO_TOKEN_HOME`，则使用该目录下的 `.state/tools/response-reviewer/`。以工具页显示的数据目录为准。

旧 Reviewer 默认文件是 `~/.response-reviewer/store.json`。导入不会自动发生：

1. 建议先停止旧 Reviewer 的写入，并保留旧文件备份。
2. 在“数据与迁移”填写旧 `store.json` 的绝对路径。
3. 点击“只读导入旧数据”，检查导入与跳过的数量。

导入支持旧存储格式 v1 / v2、最大 50 MiB；先完整校验，再合并缺失 ID。重复导入不产生重复记录，已有相同 ID 的 AZT 记录及批注不会被覆盖。源文件不被修改或删除。

只迁移快照和批注；**不继承旧项目目录的访问授权、不导入旧发送队列、运行时信息或令牌**。读取关联文件前需要重新确认项目目录。关闭新工具即可停用本次接入，旧项目与旧数据仍保留。

## 可选插件入口

插件源位于 `modules/response-reviewer/`，包含插件清单、MCP、Skill 与工作台资源。npm 包包含该目录；桌面打包配置将该目录放入 `app.asar.unpacked`，便于外部 Node 进程读取。具体绝对路径可在工具页的“可选 MCP / Skill 入口”中查看。

MCP 提供四个工具：

| 工具 | 用途 |
| --- | --- |
| `open_reviewer` | 创建或复用任务审阅工作区 |
| `review_response` | 显式保存一条回复并返回审阅地址 |
| `get_review_prompt` | 汇总指定回复尚未处理的批注 |
| `reviewer_status` | 检查 AZT 管理的 Reviewer 是否运行 |

MCP 只连接 AZT 已启动的服务，**不会再启动独立的旧 Reviewer 服务**。若 AZT 使用自定义 `AI_ZERO_TOKEN_HOME`，MCP 进程也需要相同配置。插件接入需用户另行选择，本次迁移代码不会安装或覆盖全局插件。

工作台地址包含本机访问令牌，不应分享、提交到仓库或记录在公开日志中。令牌属于运行实例，重启后的入口应从 AZT 重新获取。

## 实现位置与验证

- `src/tools/reviewer-service.ts`：配置、生命周期、历史与旧数据导入。
- `src/tools/reviewer-connector.ts`：本机 CDP 连接、按钮注入与连接恢复。
- `src/server/tool-routes.ts`：本地管理路由，预留后续工具注册位置。
- `admin-ui/src/pages/tools/`：AZT 工具页。
- `modules/response-reviewer/`：迁移后的工作台、存储与可选插件。
- `tests/reviewer.test.ts`：生命周期、安全边界、数据导入和 MCP 测试。
- `scripts/reviewer-acceptance.cjs`：隔离 Electron 端到端验收。

开发验证：

```sh
npm run typecheck
npm run build
npm test
npm run pack:dry
./node_modules/.bin/electron scripts/reviewer-acceptance.cjs
```

端到端验收使用临时 AZT 数据目录、临时 Electron 配置和模拟 Codex 页面，验证回复按钮、iframe 批注、共享历史、陈旧连接恢复、移除注入和停止后保留数据。它不连接用户当前的 Codex，不导入真实旧记录，也不能代替真实 Codex 版本的兼容性验收。输出中的截图和测试数据保留在显示的临时目录中。

Reviewer 随 AI Zero Token v2.0.17 提供，默认关闭，不自动迁移用户真实数据。正式 macOS 打包使用项目规定的 `npm run dist:mac`。
