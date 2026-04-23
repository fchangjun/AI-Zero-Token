import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createGatewayContext } from "../../core/context.js";
import { parseAskArgs } from "../shared.js";

type EncodedArtifact = {
  key: string;
  path: string;
  value: string;
};

function collectEncodedArtifacts(value: unknown, trail: string[] = [], items: EncodedArtifact[] = []): EncodedArtifact[] {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectEncodedArtifacts(item, [...trail, String(index)], items);
    });
    return items;
  }

  if (!value || typeof value !== "object") {
    return items;
  }

  for (const [key, nested] of Object.entries(value)) {
    const nextTrail = [...trail, key];
    if (
      typeof nested === "string" &&
      /(?:^|_)image_b64$/i.test(key) &&
      /^[A-Za-z0-9+/=\r\n]+$/.test(nested) &&
      nested.length > 100
    ) {
      items.push({
        key,
        path: nextTrail.join("."),
        value: nested.replace(/\s+/g, ""),
      });
      continue;
    }

    collectEncodedArtifacts(nested, nextTrail, items);
  }

  return items;
}

function detectImageExtension(buffer: Buffer): string {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "png";
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }

  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "GIF8") {
    return "gif";
  }

  return "bin";
}

async function writeEncodedArtifacts(raw: unknown, outputDir: string): Promise<string[]> {
  const encodedArtifacts = collectEncodedArtifacts(raw);
  if (encodedArtifacts.length === 0) {
    return [];
  }

  await mkdir(outputDir, { recursive: true });
  const writtenFiles: string[] = [];

  for (const [index, artifact] of encodedArtifacts.entries()) {
    const buffer = Buffer.from(artifact.value, "base64");
    const extension = detectImageExtension(buffer);
    const safeName = artifact.path.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const filename = `${String(index + 1).padStart(2, "0")}-${safeName}.${extension}`;
    const target = path.join(outputDir, filename);
    await writeFile(target, buffer);
    writtenFiles.push(target);
  }

  return writtenFiles;
}

export async function runAskCommand(args: string[]): Promise<void> {
  const {
    model,
    prompt,
    payloadFile,
    dumpRawFile,
    writeArtifactsDir,
    printRaw,
    allowUnknownModel,
  } = parseAskArgs(args);
  let codexBody: Record<string, unknown> | undefined;

  if (payloadFile) {
    const content = await readFile(payloadFile, "utf8");
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`payload 文件必须是 JSON object: ${payloadFile}`);
    }
    codexBody = parsed as Record<string, unknown>;
  }

  if (!prompt && !codexBody) {
    throw new Error('ask 需要一个 prompt，例如 azt ask "你好"，或者通过 --payload-file 传实验请求体');
  }

  const ctx = createGatewayContext();
  const result = await ctx.chatService.chat({
    model,
    input: prompt || undefined,
    experimental: {
      codexBody,
      allowUnknownModel: allowUnknownModel || Boolean(codexBody),
    },
  });

  console.log(`provider: ${result.provider}`);
  console.log(`model: ${result.model}`);
  console.log("模型回复:");
  console.log(result.text || "(返回成功，但没有解析出 output_text)");

  if (result.artifacts.length > 0) {
    console.log("候选产物引用:");
    for (const artifact of result.artifacts) {
      console.log(`- [${artifact.source}] ${artifact.path} = ${artifact.value}`);
    }
  }

  if (writeArtifactsDir) {
    const writtenFiles = await writeEncodedArtifacts(result.raw, writeArtifactsDir);
    if (writtenFiles.length === 0) {
      console.log("未发现可写出的 base64 图片产物。");
    } else {
      console.log("图片产物已写入:");
      for (const file of writtenFiles) {
        console.log(`- ${file}`);
      }
    }
  }

  if (dumpRawFile) {
    await writeFile(
      dumpRawFile,
      `${JSON.stringify(
        {
          provider: result.provider,
          model: result.model,
          text: result.text,
          artifacts: result.artifacts,
          raw: result.raw,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    console.log(`raw 已写入: ${dumpRawFile}`);
  }

  if (printRaw) {
    console.log("raw:");
    console.log(JSON.stringify(result.raw, null, 2));
  }
}
