import { buildExample } from "./endpoints";
import { formatJson } from "./format";

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
