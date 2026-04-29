# 给设计同学复制给 Vibe Coding 工具的 Prompt

把 `AI-Zero-Token-Skill.md` 一起提供给 LLM，然后复制下面任意一个需求。

---

## Prompt 1：AI 生图网页

请根据 `AI-Zero-Token-Skill.md`，帮我做一个 AI 生图网页。

要求：
1. 使用 AI-Zero-Token 本地网关。
2. Base URL 默认使用 `http://127.0.0.1:8787/v1`。
3. API Key 默认填写 `local`。
4. 页面包含一个图片需求输入框。
5. 点击“生成图片”按钮后，调用 `POST /v1/images/generations`。
6. 生图模型使用 `gpt-image-2`。
7. 生成成功后，在页面中展示图片。
8. 如果接口失败，需要显示清晰错误提示。
9. 页面风格要简洁、现代，适合设计师做原型验证。
10. 请保留 Base URL、模型名、图片尺寸的可编辑配置项。

---

## Prompt 2：AI 文案 + 生图工具

请根据 `AI-Zero-Token-Skill.md`，帮我做一个 AI 文案 + 生图工具。

要求：
1. 左侧是需求输入区。
2. 右侧上方显示 GPT-5.5 生成的文案。
3. 右侧下方显示 GPT-Image-2 生成的图片。
4. 文案调用 `POST /v1/responses`。
5. 图片调用 `POST /v1/images/generations`。
6. Base URL 默认使用 `http://127.0.0.1:8787/v1`。
7. API Key 默认使用 `local`。
8. 页面要有 loading 状态、错误提示、复制文案按钮、图片预览和图片下载按钮。
9. 页面风格简洁、有设计感，适合演示和原型验证。

---

## Prompt 3：AI 海报生成器

请根据 `AI-Zero-Token-Skill.md`，帮我做一个 AI 海报生成器网页。

要求：
1. 用户输入海报主题、风格、尺寸、文案关键词。
2. 页面自动拼接成适合 GPT-Image-2 的 prompt。
3. 点击“生成海报”后调用 `POST /v1/images/generations`。
4. 模型使用 `gpt-image-2`。
5. 生成结果展示在页面中。
6. 支持重新生成、下载图片、复制 prompt。
7. 网页默认连接本地 AI-Zero-Token 网关：
   - Base URL: `http://127.0.0.1:8787/v1`
   - API Key: `local`
8. 如果本地网关未启动，提示用户运行：
   - `npx ai-zero-token start`
   - 或 `azt start`
