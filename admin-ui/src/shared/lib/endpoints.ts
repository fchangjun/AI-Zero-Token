import type { SupportedEndpoint } from "@/shared/types";
import { formatJson } from "./format";

export const endpointOrder = [
  "/v1/chat/completions",
  "/v1/images/generations",
  "/v1/images/edits",
  "/v1/responses",
  "/v1/models",
];

export const tabLabels: Record<string, string> = {
  "/v1/chat/completions": "Chat",
  "/v1/images/generations": "Images",
  "/v1/images/edits": "Edits",
  "/v1/responses": "Responses",
  "/v1/models": "Models",
};

export function endpointSort(a: SupportedEndpoint, b: SupportedEndpoint): number {
  return endpointOrder.indexOf(a.path) - endpointOrder.indexOf(b.path);
}

export function buildExample(endpoint: string, model: string): string {
  if (endpoint === "/v1/models") return "";
  if (endpoint === "/v1/responses") {
    return formatJson({ model, input: "请只回复 OK" });
  }
  if (endpoint === "/v1/chat/completions") {
    return formatJson({ model, messages: [{ role: "user", content: "请只回复 OK" }] });
  }
  if (endpoint === "/v1/images/generations") {
    return formatJson({
      model: "gpt-image-2",
      prompt: "生成一张白底红苹果商品图，构图简洁，光线干净。",
      size: "1024x1024",
      quality: "low",
      response_format: "b64_json",
    });
  }
  if (endpoint === "/v1/images/edits") {
    return formatJson({
      model: "gpt-image-2",
      prompt: "参考这张图，生成一张更适合科技产品广告的版本。",
      images: [{ image_url: "data:image/png;base64,REPLACE_WITH_IMAGE_BASE64" }],
      size: "1024x1024",
      quality: "low",
      response_format: "b64_json",
    });
  }
  return "{}";
}

export function summarizeJson(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    if (value.length > 280 && /^[A-Za-z0-9+/=_-]+$/.test(value)) {
      return `[base64 ${value.length} chars]`;
    }
    return value.length > 1200 ? `${value.slice(0, 1200)}...` : value;
  }
  if (!value || typeof value !== "object") return value;
  if (depth > 4) return "[Object]";
  if (Array.isArray(value)) return value.map((item) => summarizeJson(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      key === "b64_json" && typeof item === "string" ? `[base64 ${item.length} chars]` : summarizeJson(item, depth + 1),
    ]),
  );
}

export function extractPreviewImages(payload: unknown): Array<{ src: string; filename: string; meta: string }> {
  if (!payload || typeof payload !== "object" || !("data" in payload) || !Array.isArray((payload as { data?: unknown }).data)) {
    return [];
  }
  return ((payload as { data: Array<Record<string, unknown>> }).data || [])
    .map((item, index) => {
      const b64 = typeof item.b64_json === "string" ? item.b64_json : "";
      if (!b64) return null;
      const outputFormat = (payload as { output_format?: unknown }).output_format;
      const format = typeof outputFormat === "string" ? outputFormat : "png";
      return {
        src: `data:image/${format};base64,${b64}`,
        filename: `generated-${index + 1}.${format}`,
        meta: `${format.toUpperCase()} · ${b64.length} chars`,
      };
    })
    .filter(Boolean) as Array<{ src: string; filename: string; meta: string }>;
}
