type NamedModel = { id: string; name?: string; description?: string };

// Display-only classification. Never use a vendor label to select a protocol or
// infer capabilities; those continue to come from real endpoint checks.
const VENDORS = [
  { id: "openai", label: "OpenAI", namespaces: ["openai"], pattern: /^(?:gpt|chatgpt|codex)(?=$|[\d\s._-])|^o[134](?=$|[\s._-])/u },
  { id: "anthropic", label: "Anthropic · Claude", namespaces: ["anthropic"], pattern: /^(?:(?:us|eu|apac|global)\.)?(?:anthropic\.)?(?:claude|sonnet|opus|haiku)(?=$|[\d\s._-])/u },
  { id: "deepseek", label: "DeepSeek", namespaces: ["deepseek", "deepseek-ai"], pattern: /^deepseek(?=$|[\d\s._-])/u },
  { id: "google", label: "Google · Gemini", namespaces: ["google"], pattern: /^(?:gemini|gemma)(?=$|[\d\s._-])/u },
  { id: "xai", label: "xAI · Grok", namespaces: ["xai", "x-ai"], pattern: /^grok(?=$|[\d\s._-])/u },
  { id: "zhipu", label: "智谱 · GLM", namespaces: ["zhipu", "zai-org", "thudm"], pattern: /^(?:glm|chatglm)(?=$|[\d\s._-])/u },
  { id: "moonshot", label: "月之暗面 · Kimi", namespaces: ["moonshot", "moonshotai"], pattern: /^(?:kimi|moonshot)(?=$|[\d\s._-])/u },
  { id: "minimax", label: "MiniMax", namespaces: ["minimax", "minimaxai"], pattern: /^minimax(?=$|[\d\s._-])/u },
  { id: "alibaba", label: "阿里 · Qwen", namespaces: ["qwen", "alibaba"], pattern: /^(?:qwen|qwq|qvq)(?=$|[\d\s._-])|^通义千问/u },
  { id: "bytedance", label: "字节 · 豆包", namespaces: ["bytedance"], pattern: /^(?:doubao|seed)(?=$|[\d\s._-])|^豆包/u },
  { id: "baidu", label: "百度 · 文心", namespaces: ["baidu"], pattern: /^ernie(?=$|[\d\s._-])|^文心/u },
  { id: "meta", label: "Meta · Llama", namespaces: ["meta", "meta-llama"], pattern: /^llama(?=$|[\d\s._-])/u },
  { id: "mistral", label: "Mistral", namespaces: ["mistral", "mistralai"], pattern: /^(?:mistral|mixtral|codestral|ministral|devstral|magistral)(?=$|[\d\s._-])/u },
] as const;

export type ModelVendorId = typeof VENDORS[number]["id"] | "other";
export type ModelVendor = { id: ModelVendorId; label: string };
export type ModelVendorGroup<T extends NamedModel> = ModelVendor & { models: T[] };
const OTHER_VENDOR: ModelVendor = { id: "other", label: "其他" };

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/[‐‑‒–—−]/gu, "-");
}

function vendorsFromName(value: string) {
  // Recognize namespaced model IDs, but not arbitrary substring mentions such
  // as "my-gpt-router". Conflicting vendor names remain unclassified.
  const parts = normalized(value).split(/[/:]/u).map((part) => part.trim());
  return VENDORS.filter((vendor) => parts.some((part) => vendor.pattern.test(part)
    || (vendor.namespaces as readonly string[]).includes(part)));
}

export function modelVendor(model: NamedModel): ModelVendor {
  const fromId = vendorsFromName(model.id);
  if (fromId.length) return fromId.length === 1 ? fromId[0] : OTHER_VENDOR;
  const fromName = model.name ? vendorsFromName(model.name) : [];
  return fromName.length === 1 ? fromName[0] : OTHER_VENDOR;
}

/** Stable vendor order; preserve the caller's order within each vendor. */
export function groupModelsByVendor<T extends NamedModel>(models: readonly T[]): ModelVendorGroup<T>[] {
  const groups = new Map<ModelVendorId, ModelVendorGroup<T>>();
  for (const model of models) {
    const vendor = modelVendor(model);
    const group = groups.get(vendor.id) ?? { id: vendor.id, label: vendor.label, models: [] };
    group.models.push(model);
    groups.set(vendor.id, group);
  }
  return [...VENDORS, OTHER_VENDOR].flatMap((vendor) => groups.has(vendor.id) ? [groups.get(vendor.id)!] : []);
}

export function matchesModelSearch(model: NamedModel, search: string): boolean {
  const query = normalized(search);
  return !query || normalized(`${model.id} ${model.name ?? ""} ${model.description ?? ""} ${modelVendor(model).label}`).includes(query);
}
