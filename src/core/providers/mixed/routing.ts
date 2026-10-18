import { createHmac } from "node:crypto";

/** A channel-specific optimization, never an inferred policy based on its display name. */
export function mixedSessionHeaders(baseUrl: string, providerId: string, modelId: string, key: string,
  headers: Record<string, string | string[] | undefined>, body: Record<string, unknown>): Record<string, string> {
  if (new URL(baseUrl).hostname !== "oneapi-comate.baidu-int.com") return {};
  const scalar = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 512 ? value : undefined;
  const session = scalar(headers["thread-id"]) ?? scalar(headers["x-session-id"]) ?? scalar(headers["session-id"]) ?? scalar(headers.session_id) ?? scalar(body.prompt_cache_key);
  if (!session) return {};
  // Stable per account/channel/model/thread, without disclosing local thread IDs.
  const namespace = JSON.stringify([providerId, baseUrl, modelId, session, scalar(headers["x-openai-subagent"]), scalar(body.prompt_cache_key)]);
  return { "x-hash-key": createHmac("sha256", key).update(namespace).digest("hex") };
}
