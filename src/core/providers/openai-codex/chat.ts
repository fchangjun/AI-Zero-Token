import type { OAuthProfile } from "../../types.js";
import { DEFAULT_CODEX_MODEL } from "../../models/openai-codex-models.js";
import { requestText } from "../http-client.js";

const CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";

type CodexSseEvent = {
  type?: string;
  response?: unknown;
  delta?: string;
};

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const data = payload as {
    output_text?: unknown;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
      text?: string;
    }>;
  };

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  for (const item of data.output ?? []) {
    if (typeof item?.text === "string" && item.text.trim()) {
      return item.text.trim();
    }

    for (const part of item?.content ?? []) {
      if ((part?.type === "output_text" || part?.type === "text") && typeof part.text === "string") {
        const trimmed = part.text.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
  }

  return "";
}

function parseSseEvents(body: string): CodexSseEvent[] {
  const events: CodexSseEvent[] = [];
  for (const chunk of body.split("\n\n")) {
    const lines = chunk
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);

    if (lines.length === 0) {
      continue;
    }

    const data = lines.join("\n").trim();
    if (!data || data === "[DONE]") {
      continue;
    }

    try {
      events.push(JSON.parse(data) as CodexSseEvent);
    } catch {
      // ignore malformed SSE chunks
    }
  }
  return events;
}

function extractCodexText(body: string): { text: string; raw: unknown } {
  const events = parseSseEvents(body);
  let responsePayload: unknown;
  let accumulated = "";

  for (const event of events) {
    if (
      event.type === "response.completed" ||
      event.type === "response.done" ||
      event.type === "response.incomplete"
    ) {
      responsePayload = event.response;
    }

    if (typeof event.delta === "string" && event.delta) {
      accumulated += event.delta;
    }
  }

  const completedText = extractOutputText(responsePayload);
  if (completedText) {
    return { text: completedText, raw: responsePayload ?? events };
  }

  return { text: accumulated.trim(), raw: responsePayload ?? events };
}

export async function askOpenAICodex(params: {
  profile: OAuthProfile;
  prompt: string;
  model?: string;
  system?: string;
}): Promise<{ text: string; raw: unknown }> {
  const response = await requestText({
    method: "POST",
    url: CODEX_RESPONSES_URL,
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.profile.access}`,
      "ChatGPT-Account-Id": params.profile.accountId,
      "OpenAI-Beta": "responses=experimental",
      Originator: "pi",
      "User-Agent": "pi (bun demo)",
    },
    body: JSON.stringify({
      model: params.model ?? DEFAULT_CODEX_MODEL,
      store: false,
      stream: true,
      instructions: params.system ?? "",
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: params.prompt }],
        },
      ],
      text: { verbosity: "medium" },
      include: ["reasoning.encrypted_content"],
      tool_choice: "auto",
      parallel_tool_calls: true,
    }),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`调用 Responses API 失败: HTTP ${response.status} via ${response.transport} ${response.body}`);
  }

  return extractCodexText(response.body);
}
