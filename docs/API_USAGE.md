# AI Zero Token API Usage

This guide is for Vibe Coding tools, OpenAI-compatible SDKs, local frontends, and scripts that need to call AI Zero Token through HTTP.

## Base URL

Start the local gateway:

```bash
azt start
```

Default API base URL:

```text
http://127.0.0.1:8787/v1
```

For another device on the same network, replace `127.0.0.1` with the gateway machine IP.

## Auth

The local gateway does not require an API key by default.

Most OpenAI-compatible clients still require a non-empty key value. Use a placeholder:

```text
local
```

## Vibe Coding Settings

Use these values in an OpenAI-compatible provider setup:

```text
API Base URL: http://127.0.0.1:8787/v1
API Key: local
Text model: gpt-5.4
Image model: gpt-image-2
```

Use `GET /v1/models` to see the models available through the current local Codex cache.

## OpenClaw Settings

Use the OpenAI-compatible provider mode in OpenClaw:

```text
Provider: OpenAI compatible
Base URL: http://127.0.0.1:8787/v1
API Key: local
Model: gpt-5.4
Chat endpoint: /chat/completions
Streaming: enabled
Tools / function calling: enabled
```

The gateway accepts OpenClaw-style `chat.completions` requests with `tools`, `tool_choice`, `parallel_tool_calls`, `reasoning_effort`, assistant `tool_calls`, and tool-role result messages. It translates those fields to the upstream Codex Responses shape and returns OpenAI-style chat responses.

OpenClaw requests are visible in the management console request log when the client sends an OpenClaw user agent. The log keeps safe summaries only; it does not store full access tokens.

## Codex Custom Provider

Codex CLI/Desktop can route model traffic through AI Zero Token by using a custom Responses provider in `~/.codex/config.toml`. The management console Settings page can write this automatically with "接管 Codex 请求" after you choose the history mode first. The default `openai` mode keeps the native Codex history view; the `AI Zero Token` mode creates a separate provider/history bucket.

Default history-preserving mode:

```toml
model = "gpt-5.4"
model_provider = "openai"
openai_base_url = "http://127.0.0.1:8787/codex/v1"
```

Codex sends `POST /codex/v1/responses` with `Accept: text/event-stream`; the gateway forwards that request to the active Codex OAuth account and streams upstream Responses SSE events back to Codex. Newer Codex versions also call `POST /codex/v1/responses/compact` for remote context compaction, and the gateway forwards that compact stream through the same account pool. The regular `/v1/*` routes remain OpenAI-compatible API routes for non-Codex clients.

For Codex `image_generation` tool requests, Plus, Team, Pro, and other paid plans use the Codex Responses image tool. If `Free account image generation` is enabled in Settings, Free plans use the ChatGPT web image path and receive a synthetic Codex-compatible Responses SSE stream, because Free accounts may have ChatGPT image quota while the Codex `image_generation` tool is unavailable upstream.

Separate AI Zero Token provider mode:

```toml
model = "gpt-5.4"
model_provider = "ai-zero-token"

[model_providers.ai-zero-token]
name = "AI Zero Token"
base_url = "http://127.0.0.1:8787/codex/v1"
wire_api = "responses"
supports_websockets = false
```

## Models

```bash
curl http://127.0.0.1:8787/v1/models
```

## Local Usage Statistics

The management console reads persisted local usage statistics from:

```text
~/.ai-zero-token/.state/usage
```

Fetch the same summary through the admin endpoint:

```bash
curl http://127.0.0.1:8787/_gateway/admin/usage
```

The summary includes today, current-process, lifetime, daily trend, account, model, endpoint, error, image-route, and source breakdowns. Token totals are counted only when the upstream response returns `usage`; requests without upstream usage are counted separately as requests with missing usage. Usage files keep metadata only and do not store prompts, messages, access tokens, or base64 image payloads.

Refresh the local Codex model list:

```bash
azt models --refresh
```

## Responses API

```bash
curl http://127.0.0.1:8787/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4",
    "input": "Reply with OK only."
  }'
```

## Chat Completions API

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4",
    "messages": [
      { "role": "user", "content": "Reply with OK only." }
    ]
}'
```

Streaming chat completions:

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4",
    "stream": true,
    "messages": [
      { "role": "user", "content": "Reply with OK only." }
    ]
  }'
```

Tool-call compatible request:

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4",
    "messages": [
      { "role": "user", "content": "What is the weather tool argument for Shanghai?" }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Get weather for a city.",
          "parameters": {
            "type": "object",
            "properties": {
              "city": { "type": "string" }
            },
            "required": ["city"]
          }
        }
      }
    ],
    "tool_choice": "auto"
  }'
```

## Images API

Image requests are also routed by account plan. Plus, Team, Pro, and other paid plans use the Codex Responses `image_generation` tool. Free accounts use the ChatGPT web image path only when `Free account image generation` is enabled in Settings; otherwise they keep the original Codex image-tool path.

```bash
curl http://127.0.0.1:8787/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "A clean product poster on a white desk with a laptop and glass cup.",
    "size": "1024x1024",
    "quality": "low",
    "response_format": "b64_json"
  }'
```

JSON image edit with a reference image URL or base64 data URL:

```bash
curl http://127.0.0.1:8787/v1/images/edits \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "Use this reference image and make it look like a clean product advertisement.",
    "images": [
      {
        "image_url": "data:image/png;base64,REPLACE_WITH_IMAGE_BASE64"
      }
    ],
    "size": "1024x1024",
    "quality": "low",
    "response_format": "b64_json"
  }'
```

## JavaScript SDK Example

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "local",
  baseURL: "http://127.0.0.1:8787/v1",
});

const response = await client.chat.completions.create({
  model: "gpt-5.4",
  messages: [
    { role: "user", content: "Reply with OK only." },
  ],
});

console.log(response.choices[0]?.message?.content);
```

## Notes

- Login first through the management page or `azt login`.
- A model appearing in `/v1/models` means the local Codex cache lists it. Final availability still depends on the active account.
- `stream=true` is supported for `/v1/chat/completions` through OpenAI-style SSE chunks. Codex passthrough streaming is isolated under `/codex/v1/responses`.
- `n > 1` is not supported for `/v1/chat/completions`.
- Tool/function calling is supported for common OpenAI-compatible clients, including OpenClaw, but exact upstream behavior still depends on the active Codex model and account.
- The default listener is `0.0.0.0:8787`, so local-network clients can call the gateway by using the machine IP.
