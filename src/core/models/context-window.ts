/** Fallback declared to Codex when the provider supplies no context metadata. */
export const DEFAULT_CONTEXT_WINDOW = 272_000;
export const MAX_CONTEXT_WINDOW = 4_000_000;

export function resolveContextWindow(model: { contextWindow?: number; contextWindowOverride?: number }): number {
  return model.contextWindowOverride ?? model.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
}
