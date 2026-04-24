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

## Models

```bash
curl http://127.0.0.1:8787/v1/models
```

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

## Images API

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
- `stream=true` is not supported yet.
- The default listener is `0.0.0.0:8787`, so local-network clients can call the gateway by using the machine IP.

