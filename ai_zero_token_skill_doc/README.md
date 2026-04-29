# AI-Zero-Token Skill 文档包

这个文件包包含：

1. `AI-Zero-Token-Skill.md`
   给 LLM / Vibe Coding 工具读取的 Skill 文档。它告诉 LLM 如何调用 AI-Zero-Token 本地网关。

2. `Designer-Copy-Prompts.md`
   给设计同学复制给 Vibe Coding 工具的常用需求 Prompt。

使用方式：

1. 先启动 AI-Zero-Token：

```bash
npx ai-zero-token start
```

或者：

```bash
npm install -g ai-zero-token
azt start
```

2. 打开本地管理页并登录账号：

```text
http://127.0.0.1:8787
```

3. 在 Vibe Coding 工具里上传 / 粘贴 `AI-Zero-Token-Skill.md`。

4. 复制 `Designer-Copy-Prompts.md` 里的 Prompt，让 LLM 生成网页。
