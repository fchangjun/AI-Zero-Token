import type { AdminConfig, RequestLog } from "@/shared/types";
import { formatDuration, formatJson } from "./format";
import { endpointOrder } from "./endpoints";
import { profileLabel, primaryUsage } from "./profiles";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function buildTrendSeries(config: AdminConfig | null, requestLogs: RequestLog[], offset: number, spanMinutes: number): number[] {
  const profiles = Array.isArray(config?.profiles) ? config.profiles : [];
  const activeUsage = config?.profile ? primaryUsage(config.profile) : 42;
  const base = 620 + activeUsage * 7 + offset * 90;
  const profileMix = profiles.reduce((sum, profile, index) => sum + primaryUsage(profile) * (index + 1), 0);
  const spanFactor = Math.max(1, spanMinutes / 60);

  return Array.from({ length: 12 }, (_, index) => {
    const wave = Math.sin((index + 1 + offset) * (0.65 + spanFactor * 0.08)) * (120 + spanFactor * 18);
    const secondaryWave = Math.cos((index + 1) * (1.05 + spanFactor * 0.06) + offset) * (72 + spanFactor * 10);
    const requestImpact = requestLogs[index] ? requestLogs[index].durationMs * (offset === 0 ? 0.24 : 0.12) : 0;
    const derived = base + wave + secondaryWave + requestImpact + (profileMix % 280);
    return Math.max(220, Math.min(2200, Math.round(derived)));
  });
}

export function makeLinePath(points: number[], width: number, height: number, maxValue: number): string {
  return points
    .map((value, index) => {
      const x = (width / (points.length - 1)) * index;
      const y = height - (value / maxValue) * (height - 16) - 8;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("图片读取结果不是字符串。"));
    };
    reader.onerror = () => reject(reader.error || new Error("图片读取失败。"));
    reader.readAsDataURL(file);
  });
}

export function insertEditImageIntoBody(bodyText: string, imageUrl: string, model: string): string {
  const payload = bodyText.trim() ? JSON.parse(bodyText) : JSON.parse(buildExample("/v1/images/edits", model));
  if (!isJsonObject(payload)) {
    throw new Error("请求体必须是 JSON 对象。");
  }

  const imageReference = { image_url: imageUrl };
  if (Array.isArray(payload.images)) {
    const nextImages = payload.images.length > 0 ? [...payload.images] : [imageReference];
    const firstImage = isJsonObject(nextImages[0]) ? { ...nextImages[0], image_url: imageUrl } : imageReference;
    delete (firstImage as Record<string, unknown>).file_id;
    nextImages[0] = firstImage;
    payload.images = nextImages;
  } else if (Array.isArray(payload.image)) {
    const nextImage = payload.image.length > 0 ? [...payload.image] : [imageReference];
    const firstImage = isJsonObject(nextImage[0]) ? { ...nextImage[0], image_url: imageUrl } : imageReference;
    delete (firstImage as Record<string, unknown>).file_id;
    nextImage[0] = firstImage;
    payload.image = nextImage;
  } else if ("image" in payload && typeof payload.image !== "undefined") {
    payload.image = imageReference;
  } else {
    payload.images = [imageReference];
  }

  return formatJson(payload);
}

export function summarizeJson(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    if (value.length > 280 && /^[A-Za-z0-9+/=_-]+$/.test(value)) {
      return `[base64 ${value.length} chars]`;
    }
    return value.length > 1200 ? `${value.slice(0, 1200)}...` : value;
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if (depth > 4) {
    return "[Object]";
  }
  if (Array.isArray(value)) {
    return value.map((item) => summarizeJson(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      key === "b64_json" && typeof item === "string" ? `[base64 ${item.length} chars]` : summarizeJson(item, depth + 1),
    ]),
  );
}

export function buildExample(endpoint: string, model: string): string {
  if (endpoint === "/v1/models") {
    return "";
  }
  if (endpoint === "/v1/responses") {
    return formatJson({
      model,
      input: "请只回复 OK",
    });
  }
  if (endpoint === "/v1/chat/completions") {
    return formatJson({
      model,
      messages: [{ role: "user", content: "请只回复 OK" }],
    });
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

export function buildSeedRequests(config: AdminConfig, showEmails: boolean): RequestLog[] {
  const profiles = Array.isArray(config.profiles) ? config.profiles : [];
  const now = Date.now();
  return profiles.slice(0, 5).map((profile, index) => {
    const endpoint = endpointOrder[index % endpointOrder.length];
    const meta = config.supportedEndpoints.find((item) => item.path === endpoint) || {
      method: endpoint === "/v1/models" ? "GET" : "POST",
      path: endpoint,
    };
    return {
      id: `seed-${profile.profileId}-${index}`,
      time: now - index * 15 * 60 * 1000,
      method: meta.method,
      endpoint,
      account: profileLabel(profile, showEmails),
      model: endpoint.startsWith("/v1/images/") ? "gpt-image-2" : config.settings.defaultModel,
      statusCode: 200,
      durationMs: 860 + index * 230 + primaryUsage(profile) * 8,
      source: index % 2 === 0 ? "管理页" : "CLI",
    };
  });
}

export function extractPreviewImages(payload: unknown): Array<{ src: string; filename: string; meta: string }> {
  if (!payload || typeof payload !== "object" || !("data" in payload) || !Array.isArray((payload as { data?: unknown }).data)) {
    return [];
  }
  return ((payload as { data: Array<Record<string, unknown>> }).data || [])
    .map((item, index) => {
      const b64 = typeof item.b64_json === "string" ? item.b64_json : "";
      if (!b64) {
        return null;
      }
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
