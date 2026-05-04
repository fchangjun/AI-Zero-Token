# AI Zero Token

[English](README.md) | [简体中文](README.zh-CN.md)

Local-first OpenAI-compatible gateway for ChatGPT/Codex OAuth accounts.

AI Zero Token provides a local CLI, web console, and HTTP gateway that expose saved ChatGPT/Codex account capabilities through OpenAI-style endpoints. It is designed for local single-user workflows, prototyping, automation, and OpenAI-compatible clients.

> This is an experimental local tool. It is not an official OpenAI product and is not recommended as a production multi-tenant gateway.

## Features

- OpenAI-compatible local API:
  - `GET /v1/models`
  - `POST /v1/responses`
  - `POST /v1/chat/completions`
  - `POST /v1/images/generations`
  - `POST /v1/images/edits`
- ChatGPT/Codex OAuth login with local token refresh.
- Multi-account management in the web console.
- Account JSON import/export, including selected batch export.
- Apply a saved account to local Codex by backing up and updating `~/.codex/auth.json`.
- `gpt-image-2` image generation and JSON image editing through the ChatGPT internal Responses path.
- Optional quota-exhaustion auto switch to the next saved API account with available quota.
- Optional upstream proxy configuration for OAuth, model refresh, and gateway forwarding.
- Local model discovery from the Codex model cache with manual refresh support.

## Architecture

![AI Zero Token architecture](docs/images/architecture-diagram.png)

AI Zero Token keeps account tokens and gateway settings in local state, exposes OpenAI-compatible HTTP endpoints, and forwards requests to the selected ChatGPT/Codex OAuth account. The web console reads the same local state, so account switching, Codex auth application, proxy settings, and automatic switching are all controlled from one local place.

## Quick Start

```bash
npm install -g ai-zero-token
azt start
```

The command starts the local web console and gateway:

```text
http://127.0.0.1:8787
http://127.0.0.1:8787/v1
```

Use any non-empty API key value when a client requires one. Authentication is handled by the local gateway.

## Desktop Preview

This repository now includes an Electron desktop preview. It starts the existing local gateway from the desktop main process and loads the current web console:

```bash
npm run desktop
```

Build desktop release artifacts:

```bash
npm run dist:mac
npm run dist:win
```

See [docs/DESKTOP_RELEASE.md](docs/DESKTOP_RELEASE.md) for release notes.
Desktop installers will be published on GitHub Releases after each tagged release:

- [GitHub Releases](https://github.com/fchangjun/AI-Zero-Token/releases)

The first desktop version keeps the current default listener:

```text
0.0.0.0:8787
```

For local clients, keep using:

```text
http://127.0.0.1:8787/v1
```

## Web Console

The web console is the recommended entry point:

- Log in with OpenAI Codex OAuth.
- Import one or more account JSON files.
- Switch the active account.
- Export one account or selected accounts.
- Apply a saved account to local Codex.
- Configure the default text model and upstream proxy.
- Enable automatic account switching when the active API account has exhausted its recorded quota.
- Test `models`, `responses`, `chat.completions`, `images.generations`, and `images.edits`.

![AI Zero Token admin dashboard](docs/images/admin-dashboard.jpg)

## API Usage

### Models

```bash
curl http://127.0.0.1:8787/v1/models
```

### Responses

```bash
curl http://127.0.0.1:8787/v1/responses \
  -H "content-type: application/json" \
  -d '{"model":"gpt-5.4","input":"Reply with OK only."}'
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
        "content": "Reply with OK only."
      }
    ]
  }'
```

### Image Generation

```bash
curl http://127.0.0.1:8787/v1/images/generations \
  -H "content-type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "A clean product photo of a red apple on a white background.",
    "size": "1024x1024",
    "quality": "low",
    "response_format": "b64_json"
  }'
```

The gateway returns an OpenAI-style response with `data[].b64_json`.

![AI Zero Token gpt-image-2 output preview](docs/images/gpt-image-2-preview.png)

### Image Editing

`/v1/images/edits` currently supports JSON requests with URL, data URL, or raw base64 image references:

```bash
curl http://127.0.0.1:8787/v1/images/edits \
  -H "content-type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "Use this reference image and create a cleaner product advertisement version.",
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

More examples are available in [docs/API_USAGE.md](docs/API_USAGE.md).

## Account Management

AI Zero Token stores account state locally under:

```text
~/.ai-zero-token/.state
```

The web console supports:

- OAuth login.
- JSON import from a single profile, an array, or a `profiles` bundle.
- Single-account export.
- Selected batch export using checkboxes.
- Account deletion and active-account switching.

Exported account JSON includes authentication tokens and should be treated as a secret.

### Apply to Codex

The `Apply to Codex` action writes the selected account to:

```text
~/.codex/auth.json
```

Before writing, the existing file is backed up as `auth.json.azt-backup-*`. New Codex sessions will use the applied account.

## Configuration

Default listener:

```text
0.0.0.0:8787
```

Local gateway base URL:

```text
http://127.0.0.1:8787/v1
```

Restrict browser CORS origins:

```bash
AZT_CORS_ORIGIN=http://127.0.0.1:8124 azt start
```

Multiple origins can be separated by commas:

```bash
AZT_CORS_ORIGIN=http://127.0.0.1:8124,http://localhost:3000 azt start
```

The persistent state directory can be overridden with:

```bash
AI_ZERO_TOKEN_HOME=/path/to/home azt start
```

The web console settings are persisted in the same local state directory. The quota auto-switch option is stored as `autoSwitch.enabled`; when enabled, the gateway uses the latest saved quota snapshot and moves API traffic away from the active account once that snapshot shows a quota window is exhausted.

The default request body limit is `32 MiB`, which is intended to make JSON base64 image references practical for local image editing. You can override it with:

```bash
AZT_BODY_LIMIT_MB=64 azt start
```

## Image Limits

ChatGPT Images availability and limits are controlled by the upstream account. Free accounts can attempt image generation, but rate limits and feature availability are stricter than paid plans and are not published as fixed public numbers. The gateway forwards image requests and surfaces the upstream response, for example `usage_limit_reached` with reset information.

Image requests use `gpt-5.4-mini` as the internal orchestration model and pass the requested image model, such as `gpt-image-2`, to the `image_generation` tool.

For JSON image editing, base64 payloads are about 33% larger than the original image. With the default `32 MiB` body limit, a raw image around `24 MiB` is the practical upper bound before JSON overhead. For larger images or batch workflows, prefer a reachable image URL.

## Limitations

- This project is intended for local single-user use.
- Streaming request fields are recognized, but full streaming parity is not implemented for every endpoint.
- `/v1/images/generations` currently returns `b64_json`; hosted image URLs are not supported.
- `/v1/images/generations` does not support `n > 1`.
- `/v1/images/edits` currently supports JSON only. `multipart/form-data`, `mask`, and `file_id` are not yet supported.
- Very large base64 JSON requests are constrained by `AZT_BODY_LIMIT_MB` and local memory.
- OpenAI Responses API compatibility is partial and focused on common local client workflows.

## Security

- Access tokens, refresh tokens, and ID tokens are equivalent to login credentials.
- Do not expose the gateway to untrusted networks.
- Do not share exported account JSON outside trusted environments.
- Review files under `~/.ai-zero-token/.state` and `~/.codex/auth.json` before copying or publishing local data.

## Development

Install dependencies:

```bash
npm install
```

Run from source:

```bash
bun src/cli.ts start
```

Validate:

```bash
npm run typecheck
npm run build
```

CLI packaging and release notes are documented in [BUILD_CLI.md](BUILD_CLI.md). User-facing changes are tracked in [CHANGELOG.md](CHANGELOG.md).

## Project Status

AI Zero Token is evolving quickly. The current focus is a reliable local gateway, account transfer workflows, and image generation/editing compatibility for OpenAI-style clients.

Issues and feature requests: [GitHub Issues](https://github.com/fchangjun/AI-Zero-Token/issues)
