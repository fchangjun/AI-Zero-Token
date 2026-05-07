import crypto from "node:crypto";
import { loadGithubImageBedStore, updateGithubImageBedToken, clearGithubImageBedStore } from "../store/github-image-bed-store.js";
import {
  appendGithubImageBedHistory,
  clearGithubImageBedHistory,
  findGithubImageBedHistoryItem,
  listGithubImageBedHistory,
  removeGithubImageBedHistoryItem,
  type GithubImageBedHistoryItem,
} from "../store/github-image-bed-history-store.js";

const DEFAULT_REPOSITORY = "azt-img-bed";
const DEFAULT_PREFIX = "images";
const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const USER_AGENT = "AI Zero Token";

type GithubUser = {
  login?: string;
};

type GithubRepository = {
  html_url?: string;
  default_branch?: string;
  private?: boolean;
  name?: string;
  owner?: {
    login?: string;
  };
};

type GithubUploadResponse = {
  content?: {
    html_url?: string;
    download_url?: string;
    path?: string;
    sha?: string;
  };
  commit?: {
    sha?: string;
  };
};

type GithubContentResponse = {
  sha?: string;
  type?: string;
};

export type GithubImageBedConfig = {
  hasToken: boolean;
  repository: string;
  pathPrefix: string;
  defaultBranch: string;
};

export type GithubImageBedConnection = {
  ok: boolean;
  owner: string;
  repository: string;
  repositoryUrl: string;
  branch: string;
  publicUrl: string;
  createdRepository: boolean;
};

export type GithubImageBedUploadResult = {
  filename: string;
  path: string;
  url: string;
  htmlUrl: string;
  downloadUrl: string;
  owner: string;
  repository: string;
  branch: string;
  size: number;
  mimeType: string;
  sha?: string;
};

export type GithubImageBedHistoryResponse = {
  items: GithubImageBedHistoryItem[];
};

function serviceError(message: string, statusCode = 400): Error {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
}

function encodePath(pathValue: string): string {
  return pathValue
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function sanitizeFileName(fileName: string): string {
  const trimmed = fileName.trim() || "image.png";
  const normalized = trimmed.normalize("NFKD").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "image.png";
}

function makeImagePath(fileName: string): string {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const suffix = crypto.randomUUID().slice(0, 8);
  const safeName = sanitizeFileName(fileName);
  return `${DEFAULT_PREFIX}/${yyyy}/${mm}/${dd}/${stamp}-${suffix}-${safeName}`;
}

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Buffer; base64: string } {
  const trimmed = dataUrl.trim();
  const match = /^data:([^;]+);base64,(.+)$/i.exec(trimmed);
  if (!match) {
    throw serviceError("图片内容必须是 data URL。");
  }

  return {
    mimeType: match[1] ?? "application/octet-stream",
    bytes: Buffer.from(match[2] ?? "", "base64"),
    base64: match[2] ?? "",
  };
}

function buildRawUrl(owner: string, repository: string, branch: string, objectPath: string): string {
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/${encodeURIComponent(branch)}/${encodePath(objectPath)}`;
}

async function requestGithubJson<T>(
  token: string,
  path: string,
  options?: {
    method?: "DELETE" | "GET" | "POST" | "PUT";
    body?: unknown;
  },
): Promise<{ status: number; data: T }> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
    body: typeof options?.body === "undefined" ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof parsed === "object" &&
      parsed &&
      "message" in parsed &&
      typeof (parsed as { message?: unknown }).message === "string"
        ? String((parsed as { message: string }).message)
        : typeof parsed === "string"
          ? parsed
          : `${response.status} ${response.statusText}`;
    throw serviceError(`GitHub API 调用失败: ${message}`, response.status);
  }

  return {
    status: response.status,
    data: parsed as T,
  };
}

function readConfigSummary(hasToken: boolean): GithubImageBedConfig {
  return {
    hasToken,
    repository: DEFAULT_REPOSITORY,
    pathPrefix: DEFAULT_PREFIX,
    defaultBranch: "auto",
  };
}

export class GithubImageBedService {
  async getConfig(): Promise<GithubImageBedConfig> {
    const store = await loadGithubImageBedStore();
    return readConfigSummary(Boolean(store.github.token));
  }

  async saveToken(token: string): Promise<GithubImageBedConfig> {
    const trimmed = token.trim();
    if (!trimmed) {
      throw serviceError("请先填写 GitHub token。");
    }

    await updateGithubImageBedToken(trimmed);
    return this.getConfig();
  }

  async clearToken(): Promise<GithubImageBedConfig> {
    await clearGithubImageBedStore();
    return this.getConfig();
  }

  async testConnection(): Promise<GithubImageBedConnection> {
    const { token } = await this.requireToken();
    const owner = await this.getCurrentLogin(token);
    const repo = await this.ensureRepository(token, owner);
    const branch = repo.default_branch?.trim() || "main";

    return {
      ok: true,
      owner,
      repository: DEFAULT_REPOSITORY,
      repositoryUrl: repo.html_url || `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(DEFAULT_REPOSITORY)}`,
      branch,
      publicUrl: repo.html_url || `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(DEFAULT_REPOSITORY)}`,
      createdRepository: false,
    };
  }

  async uploadImage(params: { filename: string; dataUrl: string }): Promise<GithubImageBedUploadResult> {
    const { token } = await this.requireToken();
    const owner = await this.getCurrentLogin(token);
    const repo = await this.ensureRepository(token, owner);
    const branch = repo.default_branch?.trim() || "main";
    const parsed = parseDataUrl(params.dataUrl);
    const objectPath = makeImagePath(params.filename);

    const response = await requestGithubJson<GithubUploadResponse>(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(DEFAULT_REPOSITORY)}/contents/${encodePath(objectPath)}`, {
      method: "PUT",
      body: {
        message: `upload ${params.filename}`,
        content: parsed.base64,
        branch,
      },
    });

    const content = response.data.content;
    const downloadUrl = content?.download_url || buildRawUrl(owner, DEFAULT_REPOSITORY, branch, objectPath);
    const htmlUrl = content?.html_url || `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(DEFAULT_REPOSITORY)}/blob/${encodeURIComponent(branch)}/${encodePath(objectPath)}`;

    return {
      filename: params.filename,
      path: objectPath,
      url: downloadUrl,
      htmlUrl,
      downloadUrl,
      owner,
      repository: DEFAULT_REPOSITORY,
      branch,
      size: parsed.bytes.byteLength,
      mimeType: parsed.mimeType,
      sha: content?.sha || response.data.commit?.sha,
    };
  }

  async listHistory(limit = 50): Promise<GithubImageBedHistoryResponse> {
    return {
      items: await listGithubImageBedHistory(limit),
    };
  }

  async clearHistory(): Promise<GithubImageBedHistoryResponse> {
    await clearGithubImageBedHistory();
    return { items: [] };
  }

  async deleteHistoryItem(id: string): Promise<GithubImageBedHistoryResponse> {
    const item = await findGithubImageBedHistoryItem(id);
    if (!item) {
      throw serviceError("未找到这条上传历史。", 404);
    }

    const { token } = await this.requireToken();
    await this.deleteRemoteFile(token, item);
    await removeGithubImageBedHistoryItem(id);
    return this.listHistory(100);
  }

  async rememberUpload(result: GithubImageBedUploadResult): Promise<void> {
    await appendGithubImageBedHistory({
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      filename: result.filename,
      path: result.path,
      url: result.url,
      htmlUrl: result.htmlUrl,
      downloadUrl: result.downloadUrl,
      owner: result.owner,
      repository: result.repository,
      branch: result.branch,
      size: result.size,
      mimeType: result.mimeType,
      previewUrl: result.url,
      sha: result.sha,
    });
  }

  private async requireToken(): Promise<{ token: string }> {
    const store = await loadGithubImageBedStore();
    const token = store.github.token.trim();
    if (!token) {
      throw serviceError("请先保存 GitHub token。", 400);
    }
    return { token };
  }

  private async getCurrentLogin(token: string): Promise<string> {
    const response = await requestGithubJson<GithubUser>(token, "/user");
    const login = response.data.login?.trim();
    if (!login) {
      throw serviceError("无法读取 GitHub 登录名。", 502);
    }
    return login;
  }

  private async ensureRepository(token: string, owner: string): Promise<GithubRepository> {
    const repositoryPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(DEFAULT_REPOSITORY)}`;
    try {
      const response = await requestGithubJson<GithubRepository>(token, repositoryPath);
      if (response.data.private) {
        throw serviceError(`仓库 ${DEFAULT_REPOSITORY} 必须是公开仓库，才能返回公网图片链接。`, 400);
      }
      return response.data;
    } catch (error) {
      const normalized = error as Error & { statusCode?: number };
      if (normalized.statusCode === 404) {
        throw serviceError(
          `未找到公开仓库 ${DEFAULT_REPOSITORY}。请先在 GitHub 创建一个公开仓库，然后把这个仓库加入 token 的 Repository access，再回来重试。`,
          404,
        );
      }
      throw error;
    }
  }

  private async deleteRemoteFile(token: string, item: GithubImageBedHistoryItem): Promise<void> {
    const owner = item.owner?.trim();
    const repository = item.repository?.trim() || DEFAULT_REPOSITORY;
    const branch = item.branch?.trim() || "main";
    const objectPath = item.path?.trim();
    if (!owner || !objectPath) {
      throw serviceError("历史记录缺少 GitHub 文件路径，无法删除远端文件。", 400);
    }

    const sha = item.sha?.trim() || (await this.readRemoteFileSha(token, owner, repository, objectPath, branch));
    if (!sha) {
      throw serviceError("无法读取远端文件 sha，删除失败。", 502);
    }

    await requestGithubJson<unknown>(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${encodePath(objectPath)}`, {
      method: "DELETE",
      body: {
        message: `delete ${item.filename || objectPath}`,
        sha,
        branch,
      },
    });
  }

  private async readRemoteFileSha(token: string, owner: string, repository: string, objectPath: string, branch: string): Promise<string> {
    const response = await requestGithubJson<GithubContentResponse | GithubContentResponse[]>(
      token,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${encodePath(objectPath)}?ref=${encodeURIComponent(branch)}`,
    );
    const content = Array.isArray(response.data) ? null : response.data;
    const sha = content?.type === "file" || content?.type === "symlink" ? content.sha?.trim() : content?.sha?.trim();
    if (!sha) {
      throw serviceError("无法读取远端文件 sha。", 502);
    }
    return sha;
  }
}
