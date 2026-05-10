import { createHash, randomUUID } from "node:crypto";
import type { OAuthProfile } from "../../types.js";

type ChatRequirements = {
  token: string;
  proofToken?: string;
  turnstileToken?: string;
  soToken?: string;
};

type UploadedImage = {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  width: number;
  height: number;
};

export type ChatGPTWebImageRequest = {
  profile: OAuthProfile;
  prompt: string;
  model?: string;
  inputImages?: Array<{ imageUrl: string }>;
  size?: string;
  responseFormat?: "b64_json" | "url";
};

export type ChatGPTWebImageResult = {
  created: number;
  data: Array<{
    b64_json: string;
    revised_prompt?: string;
  }>;
  output_format?: "png" | "webp" | "jpeg";
  size?: string;
};

type ConversationState = {
  text: string;
  conversationId: string;
  fileIds: string[];
  sedimentIds: string[];
  blocked: boolean;
  toolInvoked?: boolean;
  turnUseCase: string;
};

const CHATGPT_BASE_URL = "https://chatgpt.com";
const DEFAULT_CLIENT_VERSION = "prod-be885abbfcfe7b1f511e88b3003d9ee44757fbad";
const DEFAULT_CLIENT_BUILD_NUMBER = "5955942";
const DEFAULT_POW_SCRIPT = "https://chatgpt.com/backend-api/sentinel/sdk.js";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";
const DEFAULT_SEC_CH_UA = '"Microsoft Edge";v="143", "Chromium";v="143", "Not A(Brand";v="24"';
const IMAGE_POLL_TIMEOUT_MS = 120_000;
const IMAGE_POLL_INTERVAL_MS = 4_000;
const CODEX_IMAGE_MODEL = "codex-gpt-image-2";
const SHA3_512_RATE_BYTES = 72;
const UINT64_MASK = (1n << 64n) - 1n;
const KECCAK_ROUND_CONSTANTS = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
];
const KECCAK_ROTATION_OFFSETS = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

const CORES = [8, 16, 24, 32];
const DOCUMENT_KEYS = ["_reactListeningo743lnnpvdg", "location"];

const NAVIGATOR_KEYS = [
  "registerProtocolHandler-function registerProtocolHandler() { [native code] }",
  "storage-[object StorageManager]",
  "locks-[object LockManager]",
  "appCodeName-Mozilla",
  "permissions-[object Permissions]",
  "share-function share() { [native code] }",
  "webdriver-false",
  "vendor-Google Inc.",
  "mediaDevices-[object MediaDevices]",
  "vibrate-function vibrate() { [native code] }",
  "cookieEnabled-true",
  "product-Gecko",
  "credentials-[object CredentialsContainer]",
  "keyboard-[object Keyboard]",
  "gpu-[object GPU]",
  "pdfViewerEnabled-true",
  "language-zh-CN",
  "geolocation-[object Geolocation]",
  "hardwareConcurrency-32",
];

const WINDOW_KEYS = [
  "0",
  "window",
  "self",
  "document",
  "name",
  "location",
  "customElements",
  "history",
  "navigation",
  "innerWidth",
  "innerHeight",
  "screenX",
  "screenY",
  "outerWidth",
  "outerHeight",
  "devicePixelRatio",
  "screen",
  "chrome",
  "navigator",
  "performance",
  "crypto",
  "indexedDB",
  "sessionStorage",
  "localStorage",
  "__NEXT_DATA__",
  "__BUILD_MANIFEST",
];

const sessionIdsByProfile = new Map<string, { deviceId: string; sessionId: string }>();
const cookiesByProfile = new Map<string, Map<string, string>>();
let nativeSha3Supported: boolean | undefined;
let warnedAboutSha3Fallback = false;

function randomChoice<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJson(value: string, context: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`${context} 响应不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeFetchHeaders(headers: Headers): Record<string, string> {
  const normalized: Record<string, string> = {};
  headers.forEach((value, key) => {
    normalized[key.toLowerCase()] = value;
  });

  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === "function") {
    const setCookies = getSetCookie.call(headers);
    if (setCookies.length > 0) {
      normalized["set-cookie"] = setCookies.join(",");
    }
  }

  return normalized;
}

function parsePowResources(html: string): { scriptSources: string[]; dataBuild: string } {
  const scriptSources = Array.from(html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi))
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));
  const dataBuild =
    scriptSources
      .map((source) => /c\/[^/]*\/_/i.exec(source)?.[0])
      .find(Boolean) ??
    /<html[^>]*data-build=["']([^"']*)["']/i.exec(html)?.[1] ??
    "";

  return {
    scriptSources: scriptSources.length > 0 ? scriptSources : [DEFAULT_POW_SCRIPT],
    dataBuild,
  };
}

function getWebSession(profile: OAuthProfile): { deviceId: string; sessionId: string } {
  const key = profile.accountId || profile.profileId;
  const existing = sessionIdsByProfile.get(key);
  if (existing) {
    return existing;
  }
  const created = {
    deviceId: randomUUID(),
    sessionId: randomUUID(),
  };
  sessionIdsByProfile.set(key, created);
  return created;
}

function webSessionKey(profile: OAuthProfile): string {
  return profile.accountId || profile.profileId;
}

function splitSetCookieHeader(value: string): string[] {
  return value.split(/,(?=\s*[^;,=\s]+=)/).map((item) => item.trim()).filter(Boolean);
}

function storeChatGptCookies(profile: OAuthProfile, headers: Record<string, string>): void {
  const setCookie = headers["set-cookie"];
  if (!setCookie) {
    return;
  }

  const key = webSessionKey(profile);
  const jar = cookiesByProfile.get(key) ?? new Map<string, string>();
  for (const cookie of splitSetCookieHeader(setCookie)) {
    const pair = cookie.split(";", 1)[0]?.trim();
    const separator = pair?.indexOf("=") ?? -1;
    if (!pair || separator <= 0) {
      continue;
    }
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1);
    if (!name) {
      continue;
    }
    if (/;\s*max-age=0(?:\s*;|$)/i.test(cookie) || /;\s*expires=thu,\s*01 jan 1970/i.test(cookie)) {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }

  if (jar.size > 0) {
    cookiesByProfile.set(key, jar);
  } else {
    cookiesByProfile.delete(key);
  }
}

function getChatGptCookieHeader(profile: OAuthProfile): string | undefined {
  const jar = cookiesByProfile.get(webSessionKey(profile));
  if (!jar || jar.size === 0) {
    return undefined;
  }
  return Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
}

function legacyEasternTimeParts(): Record<string, string> {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});
}

function buildLegacyTimeString(): string {
  const parts = legacyEasternTimeParts();
  return `${parts.weekday} ${parts.month} ${parts.day} ${parts.year} ${parts.hour}:${parts.minute}:${parts.second} GMT-0500 (Eastern Standard Time)`;
}

function compactJson(value: unknown): string {
  return JSON.stringify(value);
}

function rotateLeft64(value: bigint, bits: number): bigint {
  if (bits === 0) {
    return value & UINT64_MASK;
  }
  const shift = BigInt(bits);
  return ((value << shift) | (value >> (64n - shift))) & UINT64_MASK;
}

function readUInt64LE(buffer: Buffer, offset: number): bigint {
  let value = 0n;
  for (let index = 7; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(buffer[offset + index] ?? 0);
  }
  return value;
}

function writeUInt64LE(buffer: Buffer, value: bigint, offset: number): void {
  let current = value & UINT64_MASK;
  for (let index = 0; index < 8; index += 1) {
    buffer[offset + index] = Number(current & 0xffn);
    current >>= 8n;
  }
}

function keccakF1600(state: bigint[]): void {
  const column = new Array<bigint>(5).fill(0n);
  const delta = new Array<bigint>(5).fill(0n);
  const rotated = new Array<bigint>(25).fill(0n);

  for (const roundConstant of KECCAK_ROUND_CONSTANTS) {
    for (let x = 0; x < 5; x += 1) {
      column[x] =
        (state[x] ?? 0n) ^
        (state[x + 5] ?? 0n) ^
        (state[x + 10] ?? 0n) ^
        (state[x + 15] ?? 0n) ^
        (state[x + 20] ?? 0n);
    }
    for (let x = 0; x < 5; x += 1) {
      delta[x] = (column[(x + 4) % 5] ?? 0n) ^ rotateLeft64(column[(x + 1) % 5] ?? 0n, 1);
    }
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        const index = x + 5 * y;
        state[index] = ((state[index] ?? 0n) ^ (delta[x] ?? 0n)) & UINT64_MASK;
      }
    }
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        const sourceIndex = x + 5 * y;
        const targetIndex = y + 5 * ((2 * x + 3 * y) % 5);
        rotated[targetIndex] = rotateLeft64(state[sourceIndex] ?? 0n, KECCAK_ROTATION_OFFSETS[x]?.[y] ?? 0);
      }
    }
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        const index = x + 5 * y;
        state[index] =
          ((rotated[index] ?? 0n) ^
            ((~(rotated[((x + 1) % 5) + 5 * y] ?? 0n) & UINT64_MASK) &
              (rotated[((x + 2) % 5) + 5 * y] ?? 0n))) &
          UINT64_MASK;
      }
    }
    state[0] = ((state[0] ?? 0n) ^ roundConstant) & UINT64_MASK;
  }
}

function sha3_512DigestJs(chunks: Buffer[]): Buffer {
  const input = Buffer.concat(chunks);
  const remainder = input.length % SHA3_512_RATE_BYTES;
  const paddingLength = SHA3_512_RATE_BYTES - remainder;
  const padded = Buffer.alloc(input.length + paddingLength);
  input.copy(padded);
  padded[input.length] = 0x06;
  padded[padded.length - 1] = (padded[padded.length - 1] ?? 0) | 0x80;

  const state = new Array<bigint>(25).fill(0n);
  for (let blockOffset = 0; blockOffset < padded.length; blockOffset += SHA3_512_RATE_BYTES) {
    for (let lane = 0; lane < SHA3_512_RATE_BYTES / 8; lane += 1) {
      state[lane] = ((state[lane] ?? 0n) ^ readUInt64LE(padded, blockOffset + lane * 8)) & UINT64_MASK;
    }
    keccakF1600(state);
  }

  const output = Buffer.alloc(64);
  for (let lane = 0; lane < output.length / 8; lane += 1) {
    writeUInt64LE(output, state[lane] ?? 0n, lane * 8);
  }
  return output;
}

export function sha3_512Digest(chunks: Buffer[]): Buffer {
  if (nativeSha3Supported !== false && process.env.AZT_FORCE_JS_SHA3 !== "1") {
    try {
      const hash = createHash("sha3-512");
      for (const chunk of chunks) {
        hash.update(chunk);
      }
      nativeSha3Supported = true;
      return hash.digest();
    } catch (error) {
      nativeSha3Supported = false;
      if (!warnedAboutSha3Fallback) {
        warnedAboutSha3Fallback = true;
        console.warn("[gateway:image] native sha3-512 unavailable, using JS fallback", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return sha3_512DigestJs(chunks);
}

function buildPowConfig(userAgent: string, scriptSources: string[], dataBuild: string): unknown[] {
  const nowMs = Date.now();
  const perfMs = performance.now();
  return [
    randomChoice([3000, 4000, 5000]),
    buildLegacyTimeString(),
    4294705152,
    0,
    userAgent,
    randomChoice(scriptSources),
    dataBuild,
    "en-US",
    "en-US,es-US,en,es",
    0,
    randomChoice(NAVIGATOR_KEYS),
    randomChoice(DOCUMENT_KEYS),
    randomChoice(WINDOW_KEYS),
    perfMs,
    randomUUID(),
    "",
    randomChoice(CORES),
    nowMs - perfMs,
  ];
}

function comparePrefix(left: Buffer, right: Buffer): number {
  for (let index = 0; index < right.length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function powGenerate(seed: string, difficulty: string, config: unknown[], limit = 500_000): string {
  const target = Buffer.from(difficulty, "hex");
  const diffLen = Math.floor(difficulty.length / 2);
  const seedBytes = Buffer.from(seed);
  const static1 = Buffer.from(`${compactJson(config.slice(0, 3)).slice(0, -1)},`);
  const static2 = Buffer.from(`,${compactJson(config.slice(4, 9)).slice(1, -1)},`);
  const static3 = Buffer.from(`,${compactJson(config.slice(10)).slice(1)}`);

  for (let nonce = 0; nonce < limit; nonce += 1) {
    const finalJson = Buffer.concat([
      static1,
      Buffer.from(String(nonce)),
      static2,
      Buffer.from(String(nonce >> 1)),
      static3,
    ]);
    const encoded = Buffer.from(finalJson).toString("base64");
    const digest = sha3_512Digest([seedBytes, Buffer.from(encoded)]);
    if (comparePrefix(digest.subarray(0, diffLen), target) <= 0) {
      return encoded;
    }
  }

  return `wQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D${Buffer.from(`"${seed}"`).toString("base64")}`;
}

function buildLegacyRequirementsToken(userAgent: string, scriptSources: string[], dataBuild: string): string {
  const seed = String(Math.random());
  const config = buildPowConfig(userAgent, scriptSources, dataBuild);
  return `gAAAAAC${powGenerate(seed, "0fffff", config)}`;
}

function buildProofToken(seed: string, difficulty: string, userAgent: string, scriptSources: string[], dataBuild: string): string {
  const config = buildPowConfig(userAgent, scriptSources, dataBuild);
  return `gAAAAAB${powGenerate(seed, difficulty, config)}`;
}

class OrderedMap {
  readonly keys: string[] = [];
  readonly values = new Map<string, unknown>();

  add(key: string, value: unknown): void {
    if (!this.values.has(key)) {
      this.keys.push(key);
    }
    this.values.set(key, value);
  }
}

function turnstileToString(value: unknown): string {
  if (typeof value === "undefined" || value === null) {
    return "undefined";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    const special: Record<string, string> = {
      "window.Math": "[object Math]",
      "window.Reflect": "[object Reflect]",
      "window.performance": "[object Performance]",
      "window.localStorage": "[object Storage]",
      "window.Object": "function Object() { [native code] }",
      "window.Reflect.set": "function set() { [native code] }",
      "window.performance.now": "function () { [native code] }",
      "window.Object.create": "function create() { [native code] }",
      "window.Object.keys": "function keys() { [native code] }",
      "window.Math.random": "function random() { [native code] }",
    };
    return special[value] ?? value;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.join(",");
  }
  return String(value);
}

function xorString(text: string, key: string): string {
  if (!key) {
    return text;
  }
  let result = "";
  for (let index = 0; index < text.length; index += 1) {
    result += String.fromCharCode(text.charCodeAt(index) ^ key.charCodeAt(index % key.length));
  }
  return result;
}

export function solveTurnstileToken(dx: string, p: string): string | undefined {
  let tokenList: unknown;
  try {
    const decoded = Buffer.from(dx, "base64").toString("utf8");
    tokenList = JSON.parse(xorString(decoded, p)) as unknown;
  } catch {
    return undefined;
  }

  if (!Array.isArray(tokenList)) {
    return undefined;
  }

  const processMap = new Map<unknown, unknown>();
  const startNs = process.hrtime.bigint();
  let result = "";

  const get = (key: unknown): unknown => processMap.get(key);
  const mustGet = (key: unknown): unknown => {
    if (!processMap.has(key)) {
      throw new Error("turnstile process map missing key");
    }
    return processMap.get(key);
  };
  const set = (key: unknown, value: unknown): void => {
    processMap.set(key, value);
  };

  const func1 = (e: unknown, t: unknown): void => {
    set(e, xorString(turnstileToString(mustGet(e)), turnstileToString(mustGet(t))));
  };
  const func2 = (e: unknown, t: unknown): void => {
    set(e, t);
  };
  const func3 = (e: unknown): void => {
    result = Buffer.from(String(e)).toString("base64");
  };
  const func5 = (e: unknown, t: unknown): void => {
    const current = mustGet(e);
    const incoming = mustGet(t);
    if (Array.isArray(current)) {
      set(e, [...current, incoming]);
      return;
    }
    if (typeof current === "string" || typeof current === "number" || typeof incoming === "string" || typeof incoming === "number") {
      set(e, turnstileToString(current) + turnstileToString(incoming));
      return;
    }
    set(e, "NaN");
  };
  const func6 = (e: unknown, t: unknown, n: unknown): void => {
    const tv = mustGet(t);
    const nv = mustGet(n);
    if (typeof tv === "string" && typeof nv === "string") {
      const value = `${tv}.${nv}`;
      set(e, value === "window.document.location" ? "https://chatgpt.com/" : value);
    }
  };
  const func7 = (e: unknown, ...args: unknown[]): void => {
    const target = mustGet(e);
    const values = args.map((arg) => mustGet(arg));
    if (target === "window.Reflect.set") {
      const [obj, keyName, val] = values;
      if (obj instanceof OrderedMap) {
        obj.add(String(keyName), val);
      }
    } else if (typeof target === "function") {
      (target as (...values: unknown[]) => void)(...values);
    }
  };
  const func8 = (e: unknown, t: unknown): void => {
    set(e, mustGet(t));
  };
  const func14 = (e: unknown, t: unknown): void => {
    set(e, JSON.parse(String(mustGet(t))));
  };
  const func15 = (e: unknown, t: unknown): void => {
    set(e, JSON.stringify(mustGet(t)));
  };
  const func17 = (e: unknown, t: unknown, ...args: unknown[]): void => {
    const callArgs = args.map((arg) => mustGet(arg));
    const target = mustGet(t);
    if (target === "window.performance.now") {
      const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      set(e, elapsedMs + Math.random());
    } else if (target === "window.Object.create") {
      set(e, new OrderedMap());
    } else if (target === "window.Object.keys") {
      if (callArgs[0] === "window.localStorage") {
        set(e, [
          "STATSIG_LOCAL_STORAGE_INTERNAL_STORE_V4",
          "STATSIG_LOCAL_STORAGE_STABLE_ID",
          "client-correlated-secret",
          "oai/apps/capExpiresAt",
          "oai-did",
          "STATSIG_LOCAL_STORAGE_LOGGING_REQUEST",
          "UiState.isNavigationCollapsed.1",
        ]);
      }
    } else if (target === "window.Math.random") {
      set(e, Math.random());
    } else if (typeof target === "function") {
      set(e, (target as (...values: unknown[]) => unknown)(...callArgs));
    }
  };
  const func18 = (e: unknown): void => {
    set(e, Buffer.from(turnstileToString(mustGet(e)), "base64").toString("utf8"));
  };
  const func19 = (e: unknown): void => {
    set(e, Buffer.from(turnstileToString(mustGet(e))).toString("base64"));
  };
  const func20 = (e: unknown, t: unknown, n: unknown, ...args: unknown[]): void => {
    if (mustGet(e) === mustGet(t)) {
      const target = mustGet(n);
      if (typeof target === "function") {
        (target as (...values: unknown[]) => void)(...args.map((arg) => mustGet(arg)));
      }
    }
  };
  const func21 = (): void => undefined;
  const func23 = (e: unknown, t: unknown, ...args: unknown[]): void => {
    const target = mustGet(t);
    if (mustGet(e) !== null && typeof target === "function") {
      (target as (...values: unknown[]) => void)(...args);
    }
  };
  const func24 = (e: unknown, t: unknown, n: unknown): void => {
    const tv = mustGet(t);
    const nv = mustGet(n);
    if (typeof tv === "string" && typeof nv === "string") {
      set(e, `${tv}.${nv}`);
    }
  };

  processMap.set(1, func1);
  processMap.set(2, func2);
  processMap.set(3, func3);
  processMap.set(5, func5);
  processMap.set(6, func6);
  processMap.set(7, func7);
  processMap.set(8, func8);
  processMap.set(9, tokenList);
  processMap.set(10, "window");
  processMap.set(14, func14);
  processMap.set(15, func15);
  processMap.set(16, p);
  processMap.set(17, func17);
  processMap.set(18, func18);
  processMap.set(19, func19);
  processMap.set(20, func20);
  processMap.set(21, func21);
  processMap.set(23, func23);
  processMap.set(24, func24);

  for (const token of tokenList) {
    if (!Array.isArray(token)) {
      continue;
    }
    try {
      const fn = processMap.get(token[0]);
      if (typeof fn === "function") {
        (fn as (...values: unknown[]) => void)(...token.slice(1));
      }
    } catch {
      // The browser-side bytecode tolerates many missing host capabilities.
    }
  }

  return result || undefined;
}

function chatGptHeaders(
  profile: OAuthProfile,
  path: string,
  extra?: Record<string, string | undefined>,
): Record<string, string> {
  const session = getWebSession(profile);
  const headers: Record<string, string> = {
    "User-Agent": DEFAULT_USER_AGENT,
    Origin: CHATGPT_BASE_URL,
    Referer: `${CHATGPT_BASE_URL}/`,
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8,en-US;q=0.7",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    Priority: "u=1, i",
    "Sec-Ch-Ua": DEFAULT_SEC_CH_UA,
    "Sec-Ch-Ua-Arch": '"x86"',
    "Sec-Ch-Ua-Bitness": '"64"',
    "Sec-Ch-Ua-Full-Version": '"143.0.3650.96"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Model": '""',
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Ch-Ua-Platform-Version": '"19.0.0"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "OAI-Device-Id": session.deviceId,
    "OAI-Session-Id": session.sessionId,
    "OAI-Language": "zh-CN",
    "OAI-Client-Version": DEFAULT_CLIENT_VERSION,
    "OAI-Client-Build-Number": DEFAULT_CLIENT_BUILD_NUMBER,
    "X-OpenAI-Target-Path": path,
    "X-OpenAI-Target-Route": path,
    Authorization: `Bearer ${profile.access}`,
  };
  const cookie = getChatGptCookieHeader(profile);
  if (cookie) {
    headers.Cookie = cookie;
  }

  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) {
      headers[key] = value;
    }
  }

  return headers;
}

function imageHeaders(
  profile: OAuthProfile,
  path: string,
  requirements: ChatRequirements,
  params?: { conduitToken?: string; accept?: string },
): Record<string, string> {
  return chatGptHeaders(profile, path, {
    "Content-Type": "application/json",
    Accept: params?.accept ?? "*/*",
    "OpenAI-Sentinel-Chat-Requirements-Token": requirements.token,
    "OpenAI-Sentinel-Proof-Token": requirements.proofToken,
    "OpenAI-Sentinel-Turnstile-Token": requirements.turnstileToken,
    "OpenAI-Sentinel-SO-Token": requirements.soToken,
    "X-Conduit-Token": params?.conduitToken,
    "X-Oai-Turn-Trace-Id": params?.accept === "text/event-stream" ? randomUUID() : undefined,
  });
}

async function requestChatGptText(params: {
  profile: OAuthProfile;
  path: string;
  body?: string;
  headers: Record<string, string>;
  method: "GET" | "POST";
  timeoutMs: number;
  maxAttempts?: number;
}): Promise<{ body: string; status: number; headers: Record<string, string> }> {
  const maxAttempts = params.maxAttempts ?? 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = performance.now();
    try {
      const response = await fetch(`${CHATGPT_BASE_URL}${params.path}`, {
        method: params.method,
        headers: params.headers,
        body: params.body,
        signal: AbortSignal.timeout(params.timeoutMs),
      });
      const normalizedHeaders = normalizeFetchHeaders(response.headers);
      storeChatGptCookies(params.profile, normalizedHeaders);
      const text = await response.text();
      console.info("[gateway:image] ChatGPT web request timing", {
        method: params.method,
        url: `${CHATGPT_BASE_URL}${params.path}`,
        status: response.status,
        transport: "fetch",
        attempt,
        bodyLength: text.length,
        totalMs: roundMs(performance.now() - startedAt),
      });
      return {
        body: text,
        status: response.status,
        headers: normalizedHeaders,
      };
    } catch (error) {
      lastError = error;
      console.warn("[gateway:image] ChatGPT web fetch failed", {
        method: params.method,
        url: `${CHATGPT_BASE_URL}${params.path}`,
        attempt,
        maxAttempts,
        elapsedMs: roundMs(performance.now() - startedAt),
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt < maxAttempts) {
        await sleep(500 * attempt);
      }
    }
  }

  throw new Error(`${params.path} 请求失败: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function requestJson(params: {
  profile: OAuthProfile;
  path: string;
  body?: unknown;
  headers?: Record<string, string | undefined>;
  method?: "GET" | "POST";
  timeoutMs?: number;
}): Promise<unknown> {
  const method = params.method ?? (typeof params.body === "undefined" ? "GET" : "POST");
  const response = await requestChatGptText({
    profile: params.profile,
    path: params.path,
    method,
    headers: chatGptHeaders(params.profile, params.path, {
      Accept: "application/json",
      ...(typeof params.body === "undefined" ? {} : { "Content-Type": "application/json" }),
      ...params.headers,
    }),
    body: typeof params.body === "undefined" ? undefined : JSON.stringify(params.body),
    timeoutMs: params.timeoutMs ?? 60_000,
    maxAttempts: 3,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${params.path} 失败: HTTP ${response.status} ${response.body.slice(0, 600)}`);
  }
  return parseJson(response.body, params.path);
}

async function bootstrap(profile: OAuthProfile): Promise<{ scriptSources: string[]; dataBuild: string }> {
  const response = await requestChatGptText({
    profile,
    path: "/",
    method: "GET",
    headers: chatGptHeaders(profile, "/", {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    }),
    timeoutMs: 30_000,
    maxAttempts: 2,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`ChatGPT 官网预热失败: HTTP ${response.status} ${response.body.slice(0, 600)}`);
  }
  return parsePowResources(response.body);
}

async function getChatRequirements(
  profile: OAuthProfile,
  resources: { scriptSources: string[]; dataBuild: string },
): Promise<ChatRequirements> {
  const path = "/backend-api/sentinel/chat-requirements";
  const p = buildLegacyRequirementsToken(DEFAULT_USER_AGENT, resources.scriptSources, resources.dataBuild);
  const response = await requestJson({
    profile,
    path,
    body: { p },
    timeoutMs: 30_000,
  });
  const data = isRecord(response) ? response : {};
  const arkose = isRecord(data.arkose) ? data.arkose : {};
  if (arkose.required) {
    throw new Error("ChatGPT 官网图片链路要求 Arkose 验证，当前网关无法自动完成。");
  }

  const proofInfo = isRecord(data.proofofwork) ? data.proofofwork : {};
  const proofToken =
    proofInfo.required && typeof proofInfo.seed === "string" && typeof proofInfo.difficulty === "string"
      ? buildProofToken(proofInfo.seed, proofInfo.difficulty, DEFAULT_USER_AGENT, resources.scriptSources, resources.dataBuild)
      : undefined;

  const turnstile = isRecord(data.turnstile) ? data.turnstile : {};
  const turnstileToken =
    turnstile.required && typeof turnstile.dx === "string" ? solveTurnstileToken(turnstile.dx, p) : undefined;

  const token = typeof data.token === "string" ? data.token : "";
  if (!token) {
    throw new Error(`ChatGPT sentinel 响应缺少 token: ${JSON.stringify(data).slice(0, 600)}`);
  }

  return {
    token,
    proofToken,
    turnstileToken,
    soToken: typeof data.so_token === "string" ? data.so_token : undefined,
  };
}

function imageModelSlug(model?: string): string {
  const value = String(model ?? "").trim();
  if (!value) {
    return "auto";
  }
  if (value === "gpt-image-2") {
    return "gpt-5-3";
  }
  if (value === CODEX_IMAGE_MODEL) {
    return value;
  }
  return "auto";
}

function promptWithSize(prompt: string, size?: string): string {
  if (!size) {
    return prompt;
  }
  const hints: Record<string, string> = {
    "1:1": "输出为 1:1 正方形构图，主体居中，适合正方形画幅。",
    "16:9": "输出为 16:9 横屏构图，适合宽画幅展示。",
    "9:16": "输出为 9:16 竖屏构图，适合竖版画幅。",
    "4:3": "输出为 4:3 比例，兼顾宽度与高度，适合展示画面细节。",
    "3:4": "输出为 3:4 比例，纵向构图，适合人物肖像或竖向场景。",
  };
  const normalized = size.trim();
  const hint = hints[normalized] ?? `输出图片，宽高比为 ${normalized}。`;
  return `${prompt.trim()}\n\n${hint}`;
}

function toChatGptSize(size?: string): string | undefined {
  if (!size) {
    return undefined;
  }
  const value = size.trim();
  if (value === "1024x1024") {
    return "1:1";
  }
  if (value === "1536x1024" || value === "1792x1024") {
    return "16:9";
  }
  if (value === "1024x1536" || value === "1024x1792") {
    return "9:16";
  }
  return value;
}

async function prepareImageConversation(params: {
  profile: OAuthProfile;
  requirements: ChatRequirements;
  prompt: string;
  model?: string;
}): Promise<string> {
  const path = "/backend-api/f/conversation/prepare";
  const response = await requestChatGptText({
    profile: params.profile,
    path,
    method: "POST",
    headers: imageHeaders(params.profile, path, params.requirements),
    body: JSON.stringify({
      action: "next",
      fork_from_shared_post: false,
      parent_message_id: randomUUID(),
      model: imageModelSlug(params.model),
      client_prepare_state: "success",
      timezone_offset_min: -480,
      timezone: "Asia/Shanghai",
      conversation_mode: { kind: "primary_assistant" },
      system_hints: ["picture_v2"],
      partial_query: {
        id: randomUUID(),
        author: { role: "user" },
        content: { content_type: "text", parts: [params.prompt] },
      },
      supports_buffering: true,
      supported_encodings: ["v1"],
      client_contextual_info: { app_name: "chatgpt.com" },
    }),
    timeoutMs: 60_000,
    maxAttempts: 2,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${path} 失败: HTTP ${response.status} ${response.body.slice(0, 600)}`);
  }

  const data = parseJson(response.body, path);
  if (!isRecord(data) || typeof data.conduit_token !== "string" || !data.conduit_token) {
    throw new Error(`${path} 响应缺少 conduit_token。`);
  }
  return data.conduit_token;
}

function parseDataUrl(value: string): { bytes: Buffer; mimeType: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/is.exec(value.trim());
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1] || "image/png",
    bytes: Buffer.from(match[2] ?? "", "base64"),
  };
}

async function fetchImageReference(imageUrl: string): Promise<{ bytes: Buffer; mimeType: string; fileName: string }> {
  const parsed = parseDataUrl(imageUrl);
  if (parsed) {
    return {
      bytes: parsed.bytes,
      mimeType: parsed.mimeType,
      fileName: `image.${extensionFromMime(parsed.mimeType)}`,
    };
  }

  if (!/^https?:\/\//i.test(imageUrl)) {
    const raw = imageUrl.includes(",") ? imageUrl.split(",", 2)[1] ?? "" : imageUrl;
    return {
      bytes: Buffer.from(raw, "base64"),
      mimeType: "image/png",
      fileName: "image.png",
    };
  }

  const response = await fetch(imageUrl, {
    headers: {
      "User-Agent": DEFAULT_USER_AGENT,
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`下载参考图失败: HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  const urlPath = new URL(imageUrl).pathname;
  const lastName = urlPath.split("/").filter(Boolean).pop();
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    mimeType: contentType,
    fileName: lastName || `image.${extensionFromMime(contentType)}`,
  };
}

function extensionFromMime(mimeType: string): string {
  const subtype = mimeType.split("/", 2)[1]?.split("+", 1)[0]?.toLowerCase() || "png";
  return subtype === "jpeg" ? "jpg" : subtype;
}

function imageDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes.length >= 24 && bytes.toString("ascii", 1, 4) === "PNG") {
    return {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  }

  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2) {
        break;
      }
      if (
        marker !== undefined &&
        ((marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf))
      ) {
        return {
          height: bytes.readUInt16BE(offset + 5),
          width: bytes.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + length;
    }
  }

  return { width: 1024, height: 1024 };
}

async function uploadImage(profile: OAuthProfile, imageUrl: string, index: number): Promise<UploadedImage> {
  const image = await fetchImageReference(imageUrl);
  const dimensions = imageDimensions(image.bytes);
  const fileName = image.fileName || `image_${index}.${extensionFromMime(image.mimeType)}`;
  const createPath = "/backend-api/files";
  const metadata = await requestJson({
    profile,
    path: createPath,
    body: {
      file_name: fileName,
      file_size: image.bytes.length,
      use_case: "multimodal",
      width: dimensions.width,
      height: dimensions.height,
    },
    timeoutMs: 60_000,
  });
  if (!isRecord(metadata) || typeof metadata.upload_url !== "string" || typeof metadata.file_id !== "string") {
    throw new Error("ChatGPT 文件上传初始化响应缺少 upload_url 或 file_id。");
  }

  const uploadResponse = await fetch(metadata.upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": image.mimeType,
      "x-ms-blob-type": "BlockBlob",
      "x-ms-version": "2020-04-08",
      Origin: CHATGPT_BASE_URL,
      Referer: `${CHATGPT_BASE_URL}/`,
      "User-Agent": DEFAULT_USER_AGENT,
      Accept: "application/json, text/plain, */*",
    },
    body: new Uint8Array(image.bytes),
  });
  if (!uploadResponse.ok) {
    throw new Error(`上传参考图失败: HTTP ${uploadResponse.status} ${await uploadResponse.text().catch(() => "")}`);
  }

  const uploadedPath = `/backend-api/files/${metadata.file_id}/uploaded`;
  await requestJson({
    profile,
    path: uploadedPath,
    body: {},
    timeoutMs: 60_000,
  });

  return {
    fileId: metadata.file_id,
    fileName,
    fileSize: image.bytes.length,
    mimeType: image.mimeType,
    width: dimensions.width,
    height: dimensions.height,
  };
}

function attachmentParts(references: UploadedImage[]): Array<Record<string, unknown> | string> {
  return references.map((item) => ({
    content_type: "image_asset_pointer",
    asset_pointer: `file-service://${item.fileId}`,
    width: item.width,
    height: item.height,
    size_bytes: item.fileSize,
  }));
}

function attachmentMetadata(references: UploadedImage[]): Array<Record<string, unknown>> {
  return references.map((item) => ({
    id: item.fileId,
    mimeType: item.mimeType,
    name: item.fileName,
    size: item.fileSize,
    width: item.width,
    height: item.height,
  }));
}

async function* ssePayloads(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let separator = buffer.indexOf("\n\n");
      while (separator !== -1) {
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const payload = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice("data:".length).trim())
          .join("\n");
        if (payload) {
          yield payload;
        }
        separator = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function readStreamText(body: ReadableStream<Uint8Array>, maxLength = 2000): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (text.length < maxLength) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    if (text.length > maxLength) {
      return text.slice(0, maxLength);
    }
    return text;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function requestChatGptStream(params: {
  profile: OAuthProfile;
  path: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}): Promise<{ status: number; headers: Record<string, string>; body: ReadableStream<Uint8Array> }> {
  const startedAt = performance.now();
  const response = await fetch(`${CHATGPT_BASE_URL}${params.path}`, {
    method: "POST",
    headers: params.headers,
    body: params.body,
    signal: AbortSignal.timeout(params.timeoutMs),
  });
  const normalizedHeaders = normalizeFetchHeaders(response.headers);
  storeChatGptCookies(params.profile, normalizedHeaders);
  console.info("[gateway:image] ChatGPT web stream timing", {
    method: "POST",
    url: `${CHATGPT_BASE_URL}${params.path}`,
    status: response.status,
    transport: "fetch",
    waitForHeadersMs: roundMs(performance.now() - startedAt),
  });
  if (!response.body) {
    throw new Error(`${params.path} 响应缺少 body。`);
  }

  return {
    status: response.status,
    headers: normalizedHeaders,
    body: response.body,
  };
}

function addUnique(target: string[], values: string[]): void {
  for (const value of values) {
    if (value && !target.includes(value)) {
      target.push(value);
    }
  }
}

function extractIdsFromText(text: string): { conversationId?: string; fileIds: string[]; sedimentIds: string[] } {
  return {
    conversationId: /"conversation_id"\s*:\s*"([^"]+)"/.exec(text)?.[1],
    fileIds: Array.from(text.matchAll(/(file[-_][A-Za-z0-9]+)/g)).map((match) => match[1] as string),
    sedimentIds: Array.from(text.matchAll(/sediment:\/\/([A-Za-z0-9_-]+)/g)).map((match) => match[1] as string),
  };
}

function assistantText(event: Record<string, unknown>): string {
  for (const candidate of [event, isRecord(event.v) ? event.v : null]) {
    if (!isRecord(candidate) || !isRecord(candidate.message)) {
      continue;
    }
    const message = candidate.message;
    const author = isRecord(message.author) ? message.author : {};
    const content = isRecord(message.content) ? message.content : {};
    if (author.role !== "assistant" || !Array.isArray(content.parts)) {
      continue;
    }
    return content.parts.filter((part) => typeof part === "string").join("");
  }
  return "";
}

function updateState(state: ConversationState, payload: string, event?: Record<string, unknown>): void {
  const ids = extractIdsFromText(payload);
  if (ids.conversationId && !state.conversationId) {
    state.conversationId = ids.conversationId;
  }
  if (event) {
    if (typeof event.conversation_id === "string") {
      state.conversationId = event.conversation_id;
    }
    const value = isRecord(event.v) ? event.v : null;
    if (value && typeof value.conversation_id === "string") {
      state.conversationId = value.conversation_id;
    }
    if (event.type === "moderation" && isRecord(event.moderation_response) && event.moderation_response.blocked === true) {
      state.blocked = true;
    }
    if (event.type === "server_ste_metadata" && isRecord(event.metadata)) {
      if (typeof event.metadata.tool_invoked === "boolean") {
        state.toolInvoked = event.metadata.tool_invoked;
      }
      if (typeof event.metadata.turn_use_case === "string") {
        state.turnUseCase = event.metadata.turn_use_case;
      }
    }
    const message =
      isRecord(event.message) ? event.message : isRecord(event.v) && isRecord(event.v.message) ? event.v.message : null;
    const metadata = message && isRecord(message.metadata) ? message.metadata : {};
    const author = message && isRecord(message.author) ? message.author : {};
    if (author.role === "tool" && metadata.async_task_type === "image_gen") {
      addUnique(state.fileIds, ids.fileIds);
      addUnique(state.sedimentIds, ids.sedimentIds);
    }
    const nextText = assistantText(event);
    if (nextText) {
      state.text = nextText;
    }
  }
}

async function runImageConversation(params: {
  profile: OAuthProfile;
  requirements: ChatRequirements;
  conduitToken: string;
  prompt: string;
  model?: string;
  references: UploadedImage[];
}): Promise<ConversationState> {
  const path = "/backend-api/f/conversation";
  const parts = attachmentParts(params.references);
  parts.push(params.prompt);
  const metadata: Record<string, unknown> = {
    developer_mode_connector_ids: [],
    selected_github_repos: [],
    selected_all_github_repos: false,
    system_hints: ["picture_v2"],
    serialization_metadata: { custom_symbol_offsets: [] },
  };
  if (params.references.length > 0) {
    metadata.attachments = attachmentMetadata(params.references);
  }
  const response = await requestChatGptStream({
    profile: params.profile,
    path,
    headers: imageHeaders(params.profile, path, params.requirements, {
      conduitToken: params.conduitToken,
      accept: "text/event-stream",
    }),
    body: JSON.stringify({
      action: "next",
      messages: [
        {
          id: randomUUID(),
          author: { role: "user" },
          create_time: Date.now() / 1000,
          content:
            params.references.length > 0
              ? { content_type: "multimodal_text", parts }
              : { content_type: "text", parts: [params.prompt] },
          metadata,
        },
      ],
      parent_message_id: randomUUID(),
      model: imageModelSlug(params.model),
      client_prepare_state: "sent",
      timezone_offset_min: -480,
      timezone: "Asia/Shanghai",
      conversation_mode: { kind: "primary_assistant" },
      enable_message_followups: true,
      system_hints: ["picture_v2"],
      supports_buffering: true,
      supported_encodings: ["v1"],
      client_contextual_info: {
        is_dark_mode: false,
        time_since_loaded: 1200,
        page_height: 1072,
        page_width: 1724,
        pixel_ratio: 1.2,
        screen_height: 1440,
        screen_width: 2560,
        app_name: "chatgpt.com",
      },
      paragen_cot_summary_display_override: "allow",
      force_parallel_switch: "auto",
    }),
    timeoutMs: 300_000,
  });
  if (response.status < 200 || response.status >= 300) {
    const body = await readStreamText(response.body).catch(() => "");
    throw new Error(`${path} 失败: HTTP ${response.status}${body ? ` ${body}` : ""}`);
  }

  const state: ConversationState = {
    text: "",
    conversationId: "",
    fileIds: [],
    sedimentIds: [],
    blocked: false,
    turnUseCase: "",
  };
  for await (const payload of ssePayloads(response.body)) {
    if (payload === "[DONE]") {
      break;
    }
    try {
      const parsed = JSON.parse(payload) as unknown;
      updateState(state, payload, isRecord(parsed) ? parsed : undefined);
    } catch {
      updateState(state, payload);
    }
  }
  return state;
}

function extractImageToolRecords(conversation: unknown): { fileIds: string[]; sedimentIds: string[] } {
  const mapping = isRecord(conversation) && isRecord(conversation.mapping) ? conversation.mapping : {};
  const fileIds: string[] = [];
  const sedimentIds: string[] = [];
  for (const node of Object.values(mapping)) {
    const message = isRecord(node) && isRecord(node.message) ? node.message : null;
    const author = message && isRecord(message.author) ? message.author : {};
    const metadata = message && isRecord(message.metadata) ? message.metadata : {};
    const content = message && isRecord(message.content) ? message.content : {};
    if (author.role !== "tool" || metadata.async_task_type !== "image_gen" || !Array.isArray(content.parts)) {
      continue;
    }
    for (const part of content.parts) {
      const text =
        isRecord(part) && typeof part.asset_pointer === "string"
          ? part.asset_pointer
          : typeof part === "string"
            ? part
            : "";
      addUnique(fileIds, Array.from(text.matchAll(/file-service:\/\/([A-Za-z0-9_-]+)/g)).map((match) => match[1] as string));
      addUnique(sedimentIds, Array.from(text.matchAll(/sediment:\/\/([A-Za-z0-9_-]+)/g)).map((match) => match[1] as string));
    }
  }
  return { fileIds, sedimentIds };
}

async function pollImageIds(profile: OAuthProfile, conversationId: string): Promise<{ fileIds: string[]; sedimentIds: string[] }> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < IMAGE_POLL_TIMEOUT_MS) {
    const conversation = await requestJson({
      profile,
      path: `/backend-api/conversation/${conversationId}`,
      method: "GET",
      timeoutMs: 60_000,
    });
    const ids = extractImageToolRecords(conversation);
    if (ids.fileIds.length > 0 || ids.sedimentIds.length > 0) {
      return ids;
    }
    await sleep(IMAGE_POLL_INTERVAL_MS);
  }
  return { fileIds: [], sedimentIds: [] };
}

async function resolveDownloadUrl(profile: OAuthProfile, conversationId: string, id: string, source: "file" | "sediment"): Promise<string> {
  const path =
    source === "file"
      ? `/backend-api/files/${id}/download`
      : `/backend-api/conversation/${conversationId}/attachment/${id}/download`;
  const response = await requestJson({
    profile,
    path,
    method: "GET",
    timeoutMs: 60_000,
  });
  if (!isRecord(response)) {
    return "";
  }
  return typeof response.download_url === "string"
    ? response.download_url
    : typeof response.url === "string"
      ? response.url
      : "";
}

function imageAcceptHeader(): string {
  return "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
}

function isChatGptUrl(url: URL): boolean {
  return url.hostname === "chatgpt.com" || url.hostname.endsWith(".chatgpt.com");
}

async function fetchImageBytes(url: string, headers: Record<string, string>): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw new Error(`请求失败: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}${body ? ` ${body.slice(0, 300)}` : ""}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function downloadImage(profile: OAuthProfile, url: string): Promise<Buffer> {
  const parsed = new URL(url);
  const path = `${parsed.pathname}${parsed.search}`;
  const browserImageHeaders = {
    "User-Agent": DEFAULT_USER_AGENT,
    Accept: imageAcceptHeader(),
    Referer: `${CHATGPT_BASE_URL}/`,
  };
  const authenticatedHeaders = chatGptHeaders(profile, path, {
    Accept: imageAcceptHeader(),
  });
  const headerCandidates = isChatGptUrl(parsed)
    ? [authenticatedHeaders, browserImageHeaders]
    : [browserImageHeaders, authenticatedHeaders];
  const errors: string[] = [];

  for (const headers of headerCandidates) {
    try {
      return await fetchImageBytes(url, headers);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`下载生成图片失败: ${errors.join("；")}`);
}

async function resolveImages(profile: OAuthProfile, state: ConversationState): Promise<Buffer[]> {
  if (!state.conversationId) {
    throw new Error("ChatGPT 官网图片链路没有返回 conversation_id。");
  }

  let fileIds = state.fileIds.filter((id) => id !== "file_upload");
  let sedimentIds = state.sedimentIds;
  if (fileIds.length === 0 && sedimentIds.length === 0) {
    const polled = await pollImageIds(profile, state.conversationId);
    fileIds = polled.fileIds.filter((id) => id !== "file_upload");
    sedimentIds = polled.sedimentIds;
  }

  const urls: string[] = [];
  for (const fileId of fileIds) {
    const url = await resolveDownloadUrl(profile, state.conversationId, fileId, "file").catch(() => "");
    if (url) {
      urls.push(url);
    }
  }
  if (urls.length === 0) {
    for (const sedimentId of sedimentIds) {
      const url = await resolveDownloadUrl(profile, state.conversationId, sedimentId, "sediment").catch(() => "");
      if (url) {
        urls.push(url);
      }
    }
  }

  if (urls.length === 0) {
    const reason = state.text || "没有解析出生成图片文件。";
    throw new Error(`ChatGPT 官网图片生成失败: ${reason}`);
  }

  const images: Buffer[] = [];
  const errors: string[] = [];
  for (const url of urls) {
    try {
      images.push(await downloadImage(profile, url));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (images.length > 0) {
    if (errors.length > 0) {
      console.warn("[gateway:image] skipped failed generated image downloads", {
        failed: errors.length,
        total: urls.length,
        firstError: errors[0],
      });
    }
    return images;
  }

  throw new Error(`ChatGPT 官网图片下载失败: ${errors.join("；")}`);
}

export async function generateChatGPTWebImage(request: ChatGPTWebImageRequest): Promise<ChatGPTWebImageResult> {
  const chatGptSize = toChatGptSize(request.size);
  const prompt = promptWithSize(request.prompt, chatGptSize);
  const resources = await bootstrap(request.profile);
  const requirements = await getChatRequirements(request.profile, resources);
  const references = await Promise.all(
    (request.inputImages ?? []).map((image, index) => uploadImage(request.profile, image.imageUrl, index + 1)),
  );
  const conduitToken = await prepareImageConversation({
    profile: request.profile,
    requirements,
    prompt,
    model: request.model,
  });
  const state = await runImageConversation({
    profile: request.profile,
    requirements,
    conduitToken,
    prompt,
    model: request.model,
    references,
  });
  const images = await resolveImages(request.profile, state);

  return {
    created: unixSeconds(),
    data: images.map((image) => ({
      b64_json: image.toString("base64"),
      revised_prompt: request.prompt,
    })),
    output_format: "png",
    size: chatGptSize,
  };
}
