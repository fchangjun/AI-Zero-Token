import http from "node:http";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { OAuthProfile } from "../../types.js";
import { requestText } from "../http-client.js";
import { generatePKCE } from "./pkce.js";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const REDIRECT_URI = "http://localhost:1455/auth/callback";
const SCOPE = "openid profile email offline_access";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";
const PROFILE_CLAIM_PATH = "https://api.openai.com/profile";
const SUCCESS_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OAuth Success</title>
</head>
<body>
  <p>登录成功，请回到终端继续。</p>
</body>
</html>`;

type AuthorizationResult = {
  code?: string;
  state?: string;
};

type TokenResult = {
  access: string;
  refresh: string;
  idToken?: string;
  expires: number;
};

function createState(): string {
  return randomBytes(16).toString("hex");
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1] ?? "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const decoded = Buffer.from(normalized + padding, "base64").toString("utf8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractEmailFromPayload(payload: Record<string, unknown> | null): string | undefined {
  const profileClaim = payload?.[PROFILE_CLAIM_PATH] as Record<string, unknown> | undefined;
  const nestedEmail = profileClaim?.email;
  if (typeof nestedEmail === "string" && nestedEmail.trim()) {
    return nestedEmail.trim();
  }

  const topLevelEmail = payload?.email;
  if (typeof topLevelEmail === "string" && topLevelEmail.trim()) {
    return topLevelEmail.trim();
  }

  return undefined;
}

function parseAuthorizationInput(value: string): AuthorizationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }

  try {
    const url = new URL(trimmed);
    return {
      code: url.searchParams.get("code") ?? undefined,
      state: url.searchParams.get("state") ?? undefined,
    };
  } catch {
    // ignore
  }

  if (trimmed.includes("#")) {
    const [code, state] = trimmed.split("#", 2);
    return { code, state };
  }

  if (trimmed.includes("code=")) {
    const params = new URLSearchParams(trimmed);
    return {
      code: params.get("code") ?? undefined,
      state: params.get("state") ?? undefined,
    };
  }

  return { code: trimmed };
}

function extractProfile(accessToken: string, refreshToken: string, expires: number, idToken?: string): OAuthProfile {
  const payload = decodeJwtPayload(accessToken);
  const authClaim = payload?.[JWT_CLAIM_PATH] as Record<string, unknown> | undefined;
  const accountId = authClaim?.chatgpt_account_id;
  if (typeof accountId !== "string" || !accountId.trim()) {
    throw new Error("无法从 access token 中提取 accountId。");
  }

  const email = extractEmailFromPayload(payload);

  return {
    provider: "openai-codex",
    profileId: `openai-codex:${accountId}`,
    mode: "oauth_account",
    access: accessToken,
    refresh: refreshToken,
    idToken,
    expires,
    accountId,
    email,
  };
}

async function exchangeAuthorizationCode(code: string, verifier: string): Promise<TokenResult> {
  const response = await requestText({
    method: "POST",
    url: TOKEN_URL,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
    }).toString(),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`授权码换 token 失败: HTTP ${response.status} via ${response.transport} ${response.body}`);
  }

  const json = JSON.parse(response.body) as {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
  };

  if (!json.access_token || !json.refresh_token || typeof json.expires_in !== "number") {
    throw new Error("token 响应缺少 access_token / refresh_token / expires_in。");
  }

  return {
    access: json.access_token,
    refresh: json.refresh_token,
    idToken: json.id_token,
    expires: Date.now() + json.expires_in * 1000,
  };
}

export async function refreshOpenAICodexToken(profile: OAuthProfile): Promise<OAuthProfile> {
  const response = await requestText({
    method: "POST",
    url: TOKEN_URL,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: profile.refresh,
      client_id: CLIENT_ID,
    }).toString(),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`刷新 token 失败: HTTP ${response.status} via ${response.transport} ${response.body}`);
  }

  const json = JSON.parse(response.body) as {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
  };

  if (!json.access_token || !json.refresh_token || typeof json.expires_in !== "number") {
    throw new Error("刷新响应缺少 access_token / refresh_token / expires_in。");
  }

  return extractProfile(
    json.access_token,
    json.refresh_token,
    Date.now() + json.expires_in * 1000,
    json.id_token ?? profile.idToken,
  );
}

function tryOpenBrowser(url: string): boolean {
  try {
    if (process.platform === "darwin") {
      const child = spawn("open", [url], { stdio: "ignore", detached: true });
      child.unref();
      return true;
    }

    if (process.platform === "win32") {
      const child = spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true });
      child.unref();
      return true;
    }

    const child = spawn("xdg-open", [url], { stdio: "ignore", detached: true });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

async function promptLine(message: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question(message)).trim();
  } finally {
    rl.close();
  }
}

async function startLocalCallbackServer(expectedState: string): Promise<{
  close: () => void;
  waitForCode: () => Promise<string | null>;
}> {
  let lastCode: string | null = null;
  let closed = false;

  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || "", "http://127.0.0.1");
      if (url.pathname !== "/auth/callback") {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }

      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      if (state !== expectedState) {
        res.statusCode = 400;
        res.end("State mismatch");
        return;
      }

      if (!code) {
        res.statusCode = 400;
        res.end("Missing authorization code");
        return;
      }

      lastCode = code;
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(SUCCESS_HTML);
    } catch {
      res.statusCode = 500;
      res.end("Internal error");
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(1455, "127.0.0.1", () => resolve());
    server.on("error", () => resolve());
  });

  return {
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      server.close();
    },
    waitForCode: async () => {
      for (let index = 0; index < 600; index += 1) {
        if (lastCode) {
          return lastCode;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return null;
    },
  };
}

async function requestManualCode(expectedState: string): Promise<string> {
  const manual = await promptLine("没有自动回调，请粘贴完整回调 URL 或 code: ");
  const parsed = parseAuthorizationInput(manual);
  if (parsed.state && parsed.state !== expectedState) {
    throw new Error("state 不匹配，已拒绝本次授权结果。");
  }
  if (!parsed.code) {
    throw new Error("没有解析出 authorization code。");
  }
  return parsed.code;
}

export async function loginOpenAICodex(): Promise<OAuthProfile> {
  const { verifier, challenge } = await generatePKCE();
  const state = createState();
  const authorizeUrl = new URL(AUTHORIZE_URL);

  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authorizeUrl.searchParams.set("scope", SCOPE);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("id_token_add_organizations", "true");
  authorizeUrl.searchParams.set("codex_cli_simplified_flow", "true");
  authorizeUrl.searchParams.set("originator", "pi");

  const callbackServer = await startLocalCallbackServer(state);
  const url = authorizeUrl.toString();

  console.log("开始 OpenAI Codex OAuth 登录。");
  console.log(`回调地址: ${REDIRECT_URI}`);
  console.log(`授权地址: ${url}`);
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
    console.log("检测到代理环境变量，token 交换会复用当前终端代理。");
  } else {
    console.log("当前未检测到 HTTP_PROXY / HTTPS_PROXY。");
  }
  if (process.env.OAUTH_DEMO_USE_CURL === "1") {
    console.log("已启用 curl-only 模式进行 token 请求。");
  }

  const opened = tryOpenBrowser(url);
  if (opened) {
    console.log("已尝试打开浏览器。");
  } else {
    console.log("未能自动打开浏览器，请手动打开上面的授权地址。");
  }

  try {
    const code = (await callbackServer.waitForCode()) ?? (await requestManualCode(state));
    console.log("已收到授权回调，正在交换 access token...");
    const token = await exchangeAuthorizationCode(code, verifier);
    console.log("token 交换成功，正在解析账号信息...");
    return extractProfile(token.access, token.refresh, token.expires, token.idToken);
  } finally {
    callbackServer.close();
  }
}
