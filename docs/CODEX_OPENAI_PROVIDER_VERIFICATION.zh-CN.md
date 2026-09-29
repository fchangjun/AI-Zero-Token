# 固定使用内置 openai provider：验证结果

验证日期：2026-09-29。测试对象：本机 Codex `0.158.0-alpha.2.1` 的 app-server。

## 结论

同一个对话可以始终使用内置 `openai` 标识，通过切换目标地址、认证和模型，直接访问第三方服务，再恢复原生 ChatGPT 认证。此路径不需要 AZT 转发请求，也不需要在每次切换时批量改写历史对话的 provider。

但是，仅修改配置文件还不能实现正在打开的对话立即切换。重新加载配置、更新当前对话的模型，以及模型间的历史兼容性，都需要处理。

## 验证方式

- 调用本机实际安装的 Codex app-server，使用独立的临时 `CODEX_HOME`。
- 模拟服务测试直接检查收到的 URL、认证、模型名及历史标记。
- 真实服务测试创建全新的测试对话，发送随机标记，再要求后续模型回忆该标记。未使用用户已有对话的内容。
- 读取测试数据库和 JSONL，检查 thread ID 和 provider 标识。
- 成功切换流程在各阶段重新启动临时 app-server，并在 `thread/resume` 时明确指定模型。
- 正式 `config.toml` 和 `auth.json` 的测试前后哈希一致。临时真实凭证已清理。

## 测试结果

| 场景 | 结果 |
| --- | --- |
| 模拟原生认证 → B → C → 原生认证，分别切换地址、Key、模型目录和模型 | 通过；同一 thread，provider 始终为 `openai`，历史保留 |
| 真实原生 `gpt-6-luna` → 第三方 `gpt-5.6-sol` → 原生 `gpt-6-luna` | 通过；同一 thread，三个阶段都正确返回最初的随机标记 |
| 更改默认模型及目录，但恢复旧对话时不指定模型 | 仍使用旧模型，不能只更新默认配置 |
| app-server 保持运行，仅改地址、Key 和目录，再恢复已加载的对话 | 仍使用旧地址、旧 Key 和旧模型列表 |
| 全新对话使用第三方 `GLM-5.2`，内置 `openai` | 成功；经历 WebSocket 重试后回复，本次约 10.2 秒 |
| 全新对话使用第三方 `GLM-5.2`，自定义 provider 且关闭 WebSocket | 成功；无重连，本次约 2.3 秒 |
| 带入此前 GPT 测试对话的历史，再切到 `GLM-5.2` | 内置 `openai` 返回 HTTP 404；复制历史后用自定义 provider 对照，也返回 HTTP 404 |
| 定义 `[model_providers.openai]` 来关闭 WebSocket | 配置加载失败：内置 provider 标识为保留名称，不能覆盖 |

时延是本次单次测试的观测值，不是性能基准。真实服务测试验证了认证模式和成功调用，没有核对服务商的最终计费账单。

## 关键发现

### 1. 地址可以直接改，provider 标识可以保持不变

使用根级配置：

```toml
model_provider = "openai"
openai_base_url = "https://example.com/v1"
model = "third-party-model"
model_catalog_json = "/absolute/path/selected-models.json"
```

第三方阶段采用 API Key 认证；回到原生阶段时恢复 ChatGPT 认证及原生配置。认证凭证不放入模型目录，也不能通过新建 `[model_providers.openai]` 覆盖内置 provider。

官方文档也明确支持通过 `openai_base_url` 修改内置 provider 的地址：[Advanced Configuration](https://learn.chatgpt.com/docs/config-file/config-advanced)。

### 2. 默认模型与旧对话当前模型不同

`model` 和 `model_catalog_json` 分别控制默认模型和可选模型目录。旧对话会恢复其已有的模型设置，因此切换时还必须明确更新该对话实际使用的模型。

测试通过 app-server `thread/resume` 的 `model` 参数完成这一步。没有修改历史 JSONL 来伪造当前模型。

### 3. 文件更新不等于运行中的连接更新

保持 app-server 运行时，即使配置和凭证文件已经更新，已加载的对话仍然使用旧地址和旧凭证。显式修改这一轮的模型也不会同时更新连接地址。

目前验证通过的是“停止临时后端 → 写配置和认证 → 启动后端 → 用同一 thread ID 恢复并指定模型”。桌面应用中的自动重载流程尚未实现或验证。

### 4. 内置 openai 的传输行为需要兼容

被测第三方服务不支持 WebSocket Responses，返回 HTTP 404。内置 `openai` 先重试 WebSocket，再退回 HTTP 流式请求，产生了额外等待。

同一服务使用自定义 provider 的 `supports_websockets = false` 时没有这段重试。内置 `openai` 不能通过同名 provider 配置来设置这个开关。本次没有验证出可用的内置 provider 关闭 WebSocket 方案。

### 5. 固定 provider 不会自动解决模型间的历史兼容性

`GLM-5.2` 的新对话可以成功，但在本次已有 GPT 历史的场景下，两种 provider 方式都失败。说明这个失败不能仅归因于固定 `openai`；触发 404 的具体历史内容或请求字段仍未定位。

## 对 AZT 实现的要求

1. 第三方接管时，成组更新地址、认证、模型目录和默认模型。
2. 确保 Codex 后端重新加载连接配置，然后更新当前对话的实际模型。
3. 解除接管时，恢复原生认证、地址和模型目录，并为当前对话选择可用的原生模型。
4. 处理第三方 WebSocket 回退，以及不同模型接收已有历史时的兼容性。
5. 对过去已记录 `azt_external_*` 或 `azt_gateway` 的对话，另做一次兼容处理；此次测试没有修改这些真实历史对话。

此次完成的是方案验证，尚未把 AZT 的接管实现改为固定 `openai`。

## 补充验证：固定自定义 provider

后续测试发现，固定自定义标识 `azt_active` 也可以在原生服务与第三方之间切换，且第三方阶段能明确关闭 WebSocket。这证明请求路径可行；后续客户端代码检查发现它不能完整保留原生界面功能，见下方补充。

### 原生状态

```toml
model_provider = "azt_active"
model = "gpt-6-luna"

[model_providers.azt_active]
name = "AI Zero Token active connection"
wire_api = "responses"
requires_openai_auth = true
supports_websockets = true
```

不设置第三方地址或第三方凭证。本机被测版本会使用原生默认地址和 ChatGPT 登录；已用真实账号成功调用。

### 第三方状态

保留同一个 provider 标识，改为第三方地址及其凭证，并设置：

```toml
requires_openai_auth = false
supports_websockets = false
```

第三方凭证通过 provider 自身配置提供，不需要将 `auth.json` 中的原生登录替换为第三方 Key。解除接管时移除第三方地址及凭证，恢复上述原生状态，保留 `azt_active` 定义。

### 新增实测结果

- 模拟原生 → B → C → 原生：同一 thread、同一 provider，历史保留，第三方阶段只使用 HTTP，原生认证文件内容保持一致。
- 真实原生 `gpt-6-luna` → 第三方 `gpt-5.6-sol` → 原生 `gpt-6-luna`：三个阶段均成功回忆最初的随机标记。第三方阶段约 3.5 秒，无重连。
- 一次迁移模拟：先创建使用旧 provider 的对话，再通过 `thread/resume` 指定 `modelProvider = "azt_active"`。删除测试中的旧定义后，后续恢复不再传 provider 覆盖值，也能成功继续。
- 迁移测试没有手工改写数据库或 JSONL。Codex 更新了数据库与后续设置事件；JSONL 最初的 `session_meta` 仍保留旧 provider，故实际迁移不能把“历史中还出现旧名字”直接判定为失败。
- 真实测试前后，正式配置与认证文件哈希一致；临时真实凭证已清理。

这种方案可以解决“解除接管删除 provider 导致旧对话无法打开”的生命周期问题，也能避免本次第三方 WebSocket 重试。但它仍需要后端重新加载和当前模型更新；不同模型间的历史兼容性也仍需处理。这里只验证了本机 app-server，桌面自动恢复流程和 AZT 产品实现尚未完成。

只要现有对话仍依赖固定 provider，就应保留它的定义。彻底移除 AZT 配置前，需要先让相关对话恢复到可独立使用的内置 provider。

## 客户端功能检查：不能把请求成功等同于完整原生体验

只读检查本机 `/Applications/ChatGPT.app/Contents/Resources/app.asar` 中的客户端代码发现：

- `webview/assets/app-initial-d817715f10a0.js` 的一处 usage 状态逻辑在配置的 `model_provider` 不是 `openai` 时直接返回 `null`。
- 同一文件的其他功能还检查当前对话 provider 或配置 provider 是否为 `openai`。
- `webview/assets/app-primary-cca0c1a58f0f.js` 的部分模型、额度相关逻辑同时检查 ChatGPT 认证方式、provider 标识以及其他条件。

因此，`requires_openai_auth = true` 能让自定义 provider 使用原生登录发送请求，但不会把其标识变成内置 `openai`，也不会自动满足这些界面条件。此前固定自定义 provider 的实测不能证明客户端额度入口及其他原生设置完整保留。

若需求包含恢复原生客户端功能，应采用原生状态使用内置 `openai`、第三方状态使用固定自定义 provider 的方式，并在原生与第三方之间切换时同步当前对话的 provider。B 与 C 之间仍可保持自定义标识不变。第三方定义保留到相关对话完成迁移，避免重新触发缺失 provider 错误。

按需让旧对话跟随当前模式需要桌面联动支持，不能仅靠改写默认配置来保证。第三方模式下是否显示某个原生功能，还受认证方式和后端能力限制。

## 关键对照：原生创建的旧对话切到第三方

用同一本机 Codex、隔离模拟接口和合成凭证，对同一个 thread 连续测试：

| 操作 | 恢复后的 provider | 实际请求 |
| --- | --- | --- |
| 使用 `openai` 创建对话并发送第一轮 | `openai` | 原生模拟地址，原生模拟凭证 |
| 全局配置切为 `azt_active`，原后端保持运行 | `openai` | 仍是原生地址和凭证 |
| 重启后端，恢复旧 thread，不传 provider 覆盖值 | `openai` | 仍是原生地址和凭证 |
| 重启后端，恢复同一 thread，明确指定 `modelProvider = "azt_active"` 和第三方模型 | `azt_active` | B 地址、B Key，HTTP，无原生账号请求头 |
| 重启后端，恢复同一 thread，明确指定 `modelProvider = "openai"` 和原生模型 | `openai` | 原生地址和凭证 |

该测试直接记录请求地址与认证匹配结果，没有产生真实额度消费。恢复后的完整请求包含最初的测试标记；thread ID 一直相同。

由此确认：不能把“全局配置已切换”或“客户端已重启”当作旧对话已经切换的依据。切换流程必须同步旧对话实际使用的 provider，并处理运行中的旧连接。如果要求所有受管理的本地旧对话都跟随当前服务，原生与第三方之间切换时需要同步这些对话，或提供经过验证的逐次打开同步机制；目前没有实现桌面逐次打开同步。

第三方 B 与 C 共用 `azt_active` 时不需要反复更改 provider 标识，但仍要重新加载连接并确保对话模型受目标服务支持。同步失败时不能宣称切换成功，也不能继续使用原生服务作为隐式回退。

## 补充对照：是否必须手工修改会话设置事件

本机 Codex `0.158.0-alpha.2.1` 的隔离测试表明：不必由 AZT 手工改写或追加 JSONL 中的 `thread_settings_applied` 事件。

测试先创建原生对话并恢复一次，使 JSONL 已包含原生设置事件。停止测试后端后，更新临时全局配置，并且只修改临时 `state_5.sqlite` 中该 thread 的 `threads.model_provider` 和 `threads.model`。SQL 更新前后 JSONL 的 SHA-256 完全一致。然后启动后端，通过 `thread/resume` 仅传 thread ID，不传 provider 或 model 覆盖值。

| 数据库变更 | JSONL 在变更时的最新设置 | 恢复并发送后的实际请求 |
| --- | --- | --- |
| `openai` → `azt_active`，模型改为 B 模型 | 仍为原生设置 | B 模拟地址、B Key、B 模型 |
| `azt_active` → `openai`，模型恢复原生模型 | 仍为 B 设置 | 原生模拟地址、原生模拟凭证、原生模型 |

两个方向均保留同一 thread ID 和早期对话内容。恢复并继续对话后，Codex 自行追加了新的设置事件，旧设置事件仍在文件中。测试使用本地模拟接口和合成凭证，没有改动真实配置、数据库或会话文件。

因此，不能把“AZT 必须同步改写 JSONL 设置事件”列为必要条件；在这条恢复路径上，数据库字段变更已足以让 Codex 采用目标设置。这也不意味着 JSONL 后续不会变化：Codex 会记录新的设置。直接修改数据库的桌面联动、并发安全、异常恢复和其他版本兼容性尚未验证，不能据此宣称产品方案已经完成。

测试脚本与请求记录：`/var/folders/9d/5vhzpk2j0r538fb5n6dhgkx80000gn/T/azt-db-only-existing-events-71o90ri2/`。

## 产品实现验证

后续已将“原生 `openai` / 第三方 `azt_active`、同步 SQLite、不手工编辑 JSONL”的方案接入 AZT 服务管理，具体行为和验收结果见 [实现方案](./CODEX_PROVIDER_SWITCH_PLAN.zh-CN.md)。前文“尚未实现”描述的是当时的探索阶段，不表示该后续实现仍未开始。

可复现脚本 `scripts/verify-codex-provider-switch.py` 使用实际 AZT 服务代码和本机 Codex app-server，完成同一会话的原生 → B → C → 原生。请求地址、认证匹配、模型、历史标记和推理设置均通过；第三方请求为 HTTP，不带原生账号请求头。测试仅使用临时目录、本地模拟服务和合成凭证。
