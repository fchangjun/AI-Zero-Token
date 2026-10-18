import type { ReasoningEffort } from "../openai-compatible/inspect.js";

type Json = Record<string, any>;
function profile(model: string) {
  const match = /(?:^|[^a-z])(opus|sonnet|haiku)[\s_-]*(\d+)(?:[._-](\d+))?/i.exec(model);
  if (!match) return undefined;
  const family = match[1]!.toLowerCase(), major = Number(match[2]), minor = Number(match[3] ?? 0);
  // Do not advertise speculative capabilities for unknown future versions.
  if (!(major === 4 && [5, 6, 7, 8].includes(minor) || major === 5 && [0, 5].includes(minor))) return undefined;
  if (family === "haiku" && !(major === 4 && minor === 5 || major === 5 && minor === 5)) return undefined;
  return { family, major, minor,
    adaptive: major >= 5 || major === 4 && minor >= 6 && family !== "haiku",
    xhigh: major >= 5 || family === "opus" && major === 4 && minor >= 7,
    max: family === "opus" || major >= 5,
    cannotDisable: family === "opus" && major >= 5 && minor >= 5 || family === "sonnet" && major >= 5 && minor >= 5,
  };
}

/** Capability projection only. Never writes a user's saved effort or context window. */
export function anthropicReasoningEfforts(model: string): ReasoningEffort[] {
  const info = profile(model);
  if (!info) return [];
  if (!info.adaptive) return ["none", "low", "medium", "high", "xhigh"];
  return [...(info.cannotDisable ? [] : ["none" as const]), "low", "medium", "high", ...(info.xhigh ? ["xhigh" as const] : []), ...(info.max ? ["max" as const] : [])];
}

export function anthropicReasoningCatalog(model: string) {
  const reasoningEfforts = anthropicReasoningEfforts(model);
  return { reasoningEfforts,
    // Legacy Messages defaults to no thinking. Adding an effort picker must not
    // silently turn on thousands of thinking tokens for an existing connection.
    ...(reasoningEfforts.length ? { defaultReasoningEffort: profile(model)!.adaptive ? "medium" as const : "none" as const } : {}) };
}

export function anthropicOptions(body: Json, model: string, defaultMaxTokens: number): Json {
  const invalid = (message: string): never => { throw Object.assign(new Error(message), { statusCode: 400, code: "mixed_incompatible_input" }); };
  const result: Json = { max_tokens: defaultMaxTokens };
  const format = body.text?.format;
  if (format && format.type !== "text") {
    if (format.type !== "json_schema" || !format.schema || typeof format.schema !== "object" || Array.isArray(format.schema)) invalid("Claude 结构化输出需要有效的 JSON Schema。");
    result.output_config = { format: { type: "json_schema", schema: format.schema } };
  }
  const requested = body.reasoning?.effort;
  if (requested === undefined) return result;
  const info = profile(model);
  if (!info) invalid("尚未识别此 Claude 模型的思考方式，请取消推理强度设置或使用 Responses 接口。");
  const effort = requested === "minimal" ? "low" : requested === "ultra" ? "max" : requested;
  if (!anthropicReasoningEfforts(model).includes(effort)) invalid("此 Claude 模型不支持所选推理强度，请选择该模型列出的档位。");
  if (effort === "none") { result.thinking = { type: "disabled" }; return result; }
  if (info!.adaptive) {
    result.thinking = { type: "adaptive" };
    result.output_config = { ...result.output_config, effort };
  } else {
    if (body.tool_choice === "required" || body.tool_choice && typeof body.tool_choice === "object") invalid("Claude 手动思考不能与强制工具调用同时使用，请改为自动工具选择。");
    const budgets: Record<string, number> = { low: 2048, medium: 4096, high: 8192, xhigh: 16384 };
    const budget = budgets[effort]!;
    const maximum = body.max_output_tokens === undefined ? Math.max(defaultMaxTokens, budget + 2048) : defaultMaxTokens;
    if (maximum <= 1024) invalid("Claude 思考需要 max_output_tokens 大于 1024，且思考与最终回复共用此额度。");
    result.max_tokens = maximum;
    result.thinking = { type: "enabled", budget_tokens: Math.min(budget, maximum - 1) };
  }
  return result;
}
