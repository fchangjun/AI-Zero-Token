/** Direct takeover's explicit model-list choice; mixed takeover always uses its gateway. */
export const CODEX_CATALOG_MODES = ["dynamic", "local"] as const;
export type CodexCatalogMode = typeof CODEX_CATALOG_MODES[number];
