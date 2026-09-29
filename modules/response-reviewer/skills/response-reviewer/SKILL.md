---
name: response-reviewer
description: Open or reuse the local Response Reviewer workspace for a Codex task, or send a supplied response into it for selection-based annotations and a structured revision request. Use when the user asks to open Response Reviewer, review a long answer, annotate a response, or collect feedback before asking Codex to revise.
---

# Response Reviewer

Use the local review workspace without forcing the user to interrupt the current chat with one message per comment.

## Open the workspace

1. Use the `open_reviewer` MCP tool with the active absolute `projectDir` and, when known, `threadId`.
2. If the service is unavailable, ask the user to enable Reviewer in AI Zero Token → Tools. Do not start the legacy detached server or change installed plugins.
3. Read the result and open its `url` in the Codex in-app browser when that browser control is available. Reuse an existing review tab rather than opening duplicates.
4. If the in-app browser is unavailable, return `[Open Response Reviewer](<url>)`. Do not launch the operating-system default browser automatically.

AI Zero Token owns the service, configuration and data. When using a custom `AI_ZERO_TOKEN_HOME`, the MCP process must receive the same setting. Never promise that an ordinary external link automatically opens Codex's right panel.

## Load a response

- When the `response-reviewer.review_response` MCP tool is available, prefer it for text already present in the conversation. Pass the active project directory, the response text, and the current thread id when known.
- If the user only asks to open the workspace, do not invent or duplicate response content. Open the most recent response already stored for that scope, or an empty workspace.
- Keep response text and annotations local. Placing a compiled review in the Codex composer must only prefill the matching task's input box; it must not send the message or start a turn.

## Review result

The workspace owns selection, annotation persistence, and prompt compilation. When the user asks for the compiled review in chat, use `response-reviewer.get_review_prompt` with the response id, or ask the user to use the workspace's copy/place action.
