import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ensureStateMigrated,
  getCodexRequestDiagnosticsDir,
} from "../store/state-paths.js";

export type RequestDiagnosticRef = {
  id: string;
  createdAt: number;
  bytes: number;
  relativePath: string;
};

export type RequestDiagnosticSummary = {
  directory: string;
  fileCount: number;
  totalBytes: number;
  oldestCreatedAt?: number;
  latestCreatedAt?: number;
};

export type RequestDiagnosticClearResult = RequestDiagnosticSummary & {
  deletedFiles: number;
  deletedBytes: number;
};

export type CodexRequestDiagnosticRecord = {
  version: 1;
  id: string;
  createdAt: number;
  updatedAt?: number;
  requestId?: string;
  method: string;
  endpoint: string;
  model: string;
  source: string;
  remoteAddress?: string;
  userAgent?: string;
  content: Record<string, unknown>;
  response?: Record<string, unknown>;
  error?: Record<string, unknown>;
};

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function dateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function isSafeDiagnosticId(id: string): boolean {
  return /^[a-f0-9-]{36}$/i.test(id);
}

async function collectDirectoryStats(dir: string): Promise<RequestDiagnosticSummary> {
  let fileCount = 0;
  let totalBytes = 0;
  let oldestCreatedAt: number | undefined;
  let latestCreatedAt: number | undefined;

  async function walk(currentDir: string): Promise<void> {
    let entries: Array<import("node:fs").Dirent>;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        return;
      }
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        return;
      }
      const stat = await fs.stat(entryPath).catch(() => null);
      if (!stat) {
        return;
      }
      const createdAt = stat.mtimeMs;
      fileCount += 1;
      totalBytes += stat.size;
      oldestCreatedAt = typeof oldestCreatedAt === "number" ? Math.min(oldestCreatedAt, createdAt) : createdAt;
      latestCreatedAt = typeof latestCreatedAt === "number" ? Math.max(latestCreatedAt, createdAt) : createdAt;
    }));
  }

  await walk(dir);

  return {
    directory: dir,
    fileCount,
    totalBytes,
    oldestCreatedAt,
    latestCreatedAt,
  };
}

export class RequestDiagnosticService {
  private async findCodexRequestPath(id: string): Promise<string | null> {
    if (!isSafeDiagnosticId(id)) {
      return null;
    }

    const rootDir = getCodexRequestDiagnosticsDir();
    if (!(await pathExists(rootDir))) {
      return null;
    }

    const dates = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
    for (const dateDir of dates) {
      if (!dateDir.isDirectory()) {
        continue;
      }
      const targetPath = path.join(rootDir, dateDir.name, `${id}.json`);
      if (await pathExists(targetPath)) {
        return targetPath;
      }
    }

    return null;
  }

  async recordCodexRequest(params: {
    requestId?: string;
    method: string;
    endpoint: string;
    model: string;
    source: string;
    remoteAddress?: string;
    userAgent?: string;
    content: Record<string, unknown>;
  }): Promise<RequestDiagnosticRef> {
    await ensureStateMigrated();
    const createdAt = Date.now();
    const id = randomUUID();
    const rootDir = getCodexRequestDiagnosticsDir();
    const relativePath = path.join(dateKey(createdAt), `${id}.json`);
    const targetPath = path.join(rootDir, relativePath);
    const tempPath = `${targetPath}.${process.pid}.${createdAt}.tmp`;
    const record: CodexRequestDiagnosticRecord = {
      version: 1,
      id,
      createdAt,
      requestId: params.requestId,
      method: params.method,
      endpoint: params.endpoint,
      model: params.model,
      source: params.source,
      remoteAddress: params.remoteAddress,
      userAgent: params.userAgent,
      content: params.content,
    };
    const body = `${JSON.stringify(record, null, 2)}\n`;

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(tempPath, body, "utf8");
    await fs.rename(tempPath, targetPath);

    return {
      id,
      createdAt,
      bytes: Buffer.byteLength(body, "utf8"),
      relativePath,
    };
  }

  async readCodexRequest(id: string): Promise<CodexRequestDiagnosticRecord | null> {
    const targetPath = await this.findCodexRequestPath(id);
    if (!targetPath) {
      return null;
    }

    try {
      const parsed = JSON.parse(await fs.readFile(targetPath, "utf8")) as CodexRequestDiagnosticRecord;
      return parsed.id === id ? parsed : null;
    } catch {
      return null;
    }
  }

  async updateCodexRequest(params: {
    id: string;
    response?: Record<string, unknown>;
    error?: Record<string, unknown>;
  }): Promise<RequestDiagnosticRef | null> {
    const targetPath = await this.findCodexRequestPath(params.id);
    if (!targetPath) {
      return null;
    }

    const existing = await this.readCodexRequest(params.id);
    if (!existing) {
      return null;
    }

    const next: CodexRequestDiagnosticRecord = {
      ...existing,
      updatedAt: Date.now(),
      ...(params.response ? { response: params.response } : {}),
      ...(params.error ? { error: params.error } : {}),
    };
    const body = `${JSON.stringify(next, null, 2)}\n`;
    const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, body, "utf8");
    await fs.rename(tempPath, targetPath);

    return {
      id: next.id,
      createdAt: next.createdAt,
      bytes: Buffer.byteLength(body, "utf8"),
      relativePath: path.relative(getCodexRequestDiagnosticsDir(), targetPath),
    };
  }

  async getCodexRequestSummary(): Promise<RequestDiagnosticSummary> {
    await ensureStateMigrated();
    return collectDirectoryStats(getCodexRequestDiagnosticsDir());
  }

  async clearCodexRequests(): Promise<RequestDiagnosticClearResult> {
    await ensureStateMigrated();
    const dir = getCodexRequestDiagnosticsDir();
    const before = await collectDirectoryStats(dir);
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    return {
      ...(await collectDirectoryStats(dir)),
      deletedFiles: before.fileCount,
      deletedBytes: before.totalBytes,
    };
  }
}
