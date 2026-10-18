/** Preserve the existing direct/Responses fallback for existing integrations. */
export const DEFAULT_CONTEXT_WINDOW = 272_000;
/** Used only by Chat/Claude conversion when no manual or provider value exists. */
export const DEFAULT_COMPAT_CONTEXT_WINDOW = 128_000;
export const MAX_CONTEXT_WINDOW = 4_000_000;

type ModelContextWindow = { contextWindow?: number; contextWindowOverride?: number };

export function resolveContextWindow(model: ModelContextWindow): number {
  return model.contextWindowOverride ?? model.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
}

export function resolveMixedContextWindow(model: ModelContextWindow, protocol: "responses" | "chat_completions" | "anthropic"): number {
  return protocol === "responses" ? resolveContextWindow(model)
    : model.contextWindowOverride ?? model.contextWindow ?? DEFAULT_COMPAT_CONTEXT_WINDOW;
}
