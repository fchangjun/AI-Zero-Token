# AI-Zero-Token Local Gateway Skill

## Purpose

This skill tells the LLM how to integrate a webpage, local tool, or Vibe Coding project with the local AI-Zero-Token gateway.

AI-Zero-Token is a local-first personal AI gateway. It exposes OpenAI-style local HTTP APIs so that a frontend page, script, or local automation tool can call available ChatGPT / Codex account capabilities through a local endpoint.

Use this skill when the user wants to build:

- AI chat assistant
- text generation tool
- copywriting generator
- prompt generator
- image generation tool
- image editing / image-to-image tool
- poster generator
- product image generator
- social media cover generator
- icon or logo inspiration generator
- UI inspiration generator
- Vibe Coding webpage that needs AI capability
- local automation workflow that needs LLM or image generation

---

## Local Gateway Assumptions

Assume the user has already started AI-Zero-Token locally.

Default local management page:

```text
http://127.0.0.1:8787
```

OpenAI-compatible Base URL:

```text
http://127.0.0.1:8787/v1
```

When using OpenAI-compatible SDKs or API clients, set:

```text
baseURL = "http://127.0.0.1:8787/v1"
apiKey = "local"
```

The API key can be any non-empty placeholder string because the real authentication is handled by the local AI-Zero-Token gateway.

Do not ask the user to provide a real OpenAI API key unless the user explicitly wants to use the official OpenAI API instead of the local gateway.

---

## Startup Command Reference

If the generated project includes user instructions, mention the user can start AI-Zero-Token with:

```bash
npx ai-zero-token start
```

or install globally:

```bash
npm install -g ai-zero-token
azt start
```

After startup, the local management page is usually available at:

```text
http://127.0.0.1:8787
```

The OpenAI-compatible API Base URL is:

```text
http://127.0.0.1:8787/v1
```

If global npm installation fails with `EACCES permission denied`, recommend using:

```bash
npx ai-zero-token start
```

---

## Available Interfaces

### 1. List Models

Use this endpoint when the app needs to show available models.

```http
GET http://127.0.0.1:8787/v1/models
```

Example JavaScript:

```js
async function listModels() {
  const res = await fetch("http://127.0.0.1:8787/v1/models", {
    method: "GET",
    headers: {
      "Authorization": "Bearer local"
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to list models: ${res.status}`);
  }

  return await res.json();
}
```

---

### 2. Text / Reasoning / Coding Generation

Preferred endpoint:

```http
POST http://127.0.0.1:8787/v1/responses
```

Use this endpoint for:

- AI assistant replies
- text generation
- copywriting
- prompt optimization
- coding assistance
- reasoning tasks
- content rewriting
- document drafting

Default recommended model:

```text
gpt-5.5
```

If `gpt-5.5` is not available, allow the user or UI to switch models.

Example request:

```js
async function generateText(input) {
  const res = await fetch("http://127.0.0.1:8787/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer local"
    },
    body: JSON.stringify({
      model: "gpt-5.5",
      input
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Text generation failed: ${res.status} ${errText}`);
  }

  const data = await res.json();

  return (
    data.output_text ||
    data.text ||
    data.content ||
    data.choices?.[0]?.message?.content ||
    JSON.stringify(data, null, 2)
  );
}
```

When building a frontend app, show loading state while the request is pending and display a readable error message if the request fails.

---

### 3. Chat Completions Compatibility

Use this endpoint when the user asks for an OpenAI-compatible chat app or when a template already uses `/v1/chat/completions`.

```http
POST http://127.0.0.1:8787/v1/chat/completions
```

Example request:

```js
async function chat(messages) {
  const res = await fetch("http://127.0.0.1:8787/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer local"
    },
    body: JSON.stringify({
      model: "gpt-5.5",
      messages
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Chat completion failed: ${res.status} ${errText}`);
  }

  const data = await res.json();

  return (
    data.choices?.[0]?.message?.content ||
    data.output_text ||
    JSON.stringify(data, null, 2)
  );
}
```

Use this for chat UI components, OpenAI-compatible templates, or existing chat SDK style code.

---

### 4. Image Generation

Use this endpoint when the user wants image generation.

```http
POST http://127.0.0.1:8787/v1/images/generations
```

Use this endpoint for:

- poster generation
- product image generation
- social media image generation
- cover image generation
- icon inspiration
- logo inspiration
- UI visual inspiration
- marketing image generation
- illustration generation

Default recommended image model:

```text
gpt-image-2
```

Example request:

```js
async function generateImage(prompt, size = "1024x1024") {
  const res = await fetch("http://127.0.0.1:8787/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer local"
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt,
      size,
      n: 1
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Image generation failed: ${res.status} ${errText}`);
  }

  const data = await res.json();

  const image =
    data.data?.[0]?.url ||
    data.data?.[0]?.b64_json ||
    data.output?.[0]?.url ||
    data.url ||
    data.image;

  return {
    raw: data,
    image
  };
}
```

When displaying generated images:

- If the response contains a URL, use it directly as the `src`.
- If the response contains `b64_json`, convert it to a data URL:

```js
const src = `data:image/png;base64,${b64_json}`;
```

- Always show the raw response in a collapsible debug panel if this is a prototype or developer-facing tool.
- Show a helpful error if no image URL or base64 data is found.

---

### 5. Image Editing / Image-to-Image

Use this endpoint when the user wants to edit an existing image or use one or more reference images.

```http
POST http://127.0.0.1:8787/v1/images/edits
```

AI-Zero-Token currently supports the JSON version of this endpoint. Use `images[].image_url` with either:

- an `https://...` image URL
- a `data:image/...;base64,...` data URL
- a bare base64 string, which the gateway treats as a PNG data URL

Do not use `multipart/form-data`, `mask`, or `file_id` unless the user explicitly says their installed AI-Zero-Token version supports them.

Example request:

```js
async function editImage(prompt, imageUrlOrBase64, size = "1024x1024") {
  const res = await fetch("http://127.0.0.1:8787/v1/images/edits", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer local"
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt,
      images: [
        {
          image_url: imageUrlOrBase64
        }
      ],
      size,
      quality: "low",
      response_format: "b64_json"
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Image edit failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const image = data.data?.[0]?.b64_json || data.data?.[0]?.url || data.image;

  return {
    raw: data,
    image
  };
}
```

When building a frontend for image editing:

- Let the user paste an image URL.
- Optionally support local file upload by converting the file to a base64 data URL in the browser, then send it as `images[].image_url`.
- Show the edited image using `data:image/png;base64,...` when the response contains `b64_json`.
- Mention that mask/inpainting is not supported by this JSON integration yet.

---

## Frontend Integration Rules

When generating a web app that uses AI-Zero-Token:

1. Use `http://127.0.0.1:8787/v1` as the default Base URL.
2. Use `local` as the default API Key placeholder.
3. Do not hardcode a real OpenAI API key.
4. Provide editable fields for:
   - Base URL
   - text model name
   - image model name
   - prompt / input
5. Use `gpt-5.5` as the default text model.
6. Use `gpt-image-2` as the default image model.
7. Add loading states.
8. Add error display.
9. Add a clear result area.
10. Add a copy button for text outputs.
11. Add an image preview area for image outputs.
12. For image editing tools, accept either pasted image URLs or local files converted to base64 data URLs.
13. Add a download button for generated or edited images when possible.
14. Keep all calls client-side for local prototype projects unless the user asks for a backend.
15. If the browser reports a CORS error, tell the user to check whether AI-Zero-Token is running and whether the gateway allows browser requests.

---

## Recommended UI Patterns

For a simple Vibe Coding webpage, create:

- A settings panel:
  - Base URL
  - Text model
  - Image model
- A text generation panel:
  - textarea for input
  - button: Generate Text
  - output area
- An image generation panel:
  - textarea for prompt
  - size selector
  - button: Generate Image
  - image preview area
- For image editing tools:
  - image URL input or file picker
  - textarea for edit instruction
  - button: Edit Image
  - before / after image preview
- A debug panel:
  - raw JSON response
  - error message

Use a clean layout that is easy for non-developers to understand.

---

## Default Models

Use these defaults unless the user says otherwise:

```text
Text model: gpt-5.5
Image model: gpt-image-2
```

If a model call fails, suggest:

1. Check whether AI-Zero-Token is running.
2. Open `http://127.0.0.1:8787`.
3. Check whether the account is logged in.
4. Check whether the current account supports the requested model.
5. Try calling `GET /v1/models`.

---

## Example Prompt for Building a Vibe Coding Tool

When the user asks to build a webpage using this skill, generate something like:

```text
Build a local AI tool webpage that connects to AI-Zero-Token.

Use:
Base URL: http://127.0.0.1:8787/v1
API Key: local

Features:
1. A text input area for user requirements.
2. A "Generate Text" button that calls POST /v1/responses with model gpt-5.5.
3. A "Generate Image" button that calls POST /v1/images/generations with model gpt-image-2.
4. If the tool needs image editing, call POST /v1/images/edits with images[].image_url.
5. Show loading states.
6. Show text output in a result panel.
7. Show generated or edited image in an image preview panel.
8. Provide a copy button for text.
9. Provide a download button for image if possible.
10. Show readable errors if the local gateway is not running.
11. Keep the UI simple and friendly for designers.
```

---

## Common Error Handling

### Gateway not running

If request fails with network error, show:

```text
AI-Zero-Token 本地网关未连接，请先运行 npx ai-zero-token start 或 azt start，然后访问 http://127.0.0.1:8787 检查状态。
```

### CORS error

If browser blocks the request, show:

```text
浏览器跨域请求失败，请确认 AI-Zero-Token 网关已开启浏览器访问支持，或改用本地代理 / 后端转发。
```

### Model unavailable

If the model is unavailable, show:

```text
当前账号可能不支持该模型，请打开 AI-Zero-Token 管理页检查账号状态和可用模型。
```

### Image result not found

If the image response does not contain `url` or `b64_json`, show:

```text
接口已返回，但没有找到可展示的图片地址或 base64 数据，请查看调试面板中的原始返回结果。
```

### Image edit unsupported input

If image editing fails because of unsupported input, show:

```text
当前 AI-Zero-Token 的图片编辑接口只支持 JSON 请求中的 image_url。请使用图片 URL，或把本地图片转换成 base64 data URL 后再提交。
```

### npm global install permission error

If the user gets an error like `EACCES permission denied` during global installation, suggest:

```bash
npx ai-zero-token start
```

or explain that global npm installation may require changing the npm global prefix or using a Node version manager.

---

## Important Boundaries

AI-Zero-Token is best for:

- personal experiments
- local prototypes
- Vibe Coding projects
- designer-facing demos
- learning local gateway integration
- low-cost local workflow validation

AI-Zero-Token management page can also manage local account state, including:

- login and import multiple Codex accounts
- switch the active gateway account
- export selected accounts
- apply a saved account to local Codex by updating `~/.codex/auth.json` with an automatic backup

AI-Zero-Token should not be described as:

- a production-grade API gateway
- an official OpenAI API replacement
- a commercial proxy platform
- a multi-user billing platform

For production systems, recommend official APIs or a properly managed backend gateway.

---

## Short Usage Instruction for Designers

Designers do not need to understand this skill document.

They can give this file to a Vibe Coding LLM and say:

```text
请根据这个 Skill，帮我做一个 AI 生图网页。
要求：
1. 输入一句图片需求；
2. 点击按钮调用本地 AI-Zero-Token；
3. 使用 gpt-image-2 生成图片；
4. 图片生成后展示在页面中；
5. 页面要好看，适合设计师使用。
```

Or:

```text
请根据这个 Skill，帮我做一个 AI 文案 + 生图工具。
左侧输入需求，右侧显示 GPT-5.5 生成的文案和 GPT-Image-2 生成的图片。
```
