import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { VersionStatus } from "../types.js";
import { requestText } from "../providers/http-client.js";

const VERSION_CACHE_TTL_MS = 10 * 60 * 1000;
const packageJsonPath = path.dirname(fileURLToPath(new URL("../../../package.json", import.meta.url)));

type PackageManifest = {
  name?: string;
  version?: string;
};

type NpmLatestManifest = {
  version?: string;
};

function compareVersionPart(left: string, right: string): number {
  const leftNumber = Number.parseInt(left, 10);
  const rightNumber = Number.parseInt(right, 10);

  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return left.localeCompare(right);
}

function compareSemver(left: string, right: string): number {
  const leftParts = left.split(/[.+-]/);
  const rightParts = right.split(/[.+-]/);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const diff = compareVersionPart(leftParts[index] ?? "0", rightParts[index] ?? "0");
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

async function readPackageManifest(): Promise<Required<Pick<PackageManifest, "name" | "version">>> {
  const raw = await fs.readFile(path.join(packageJsonPath, "package.json"), "utf8");
  const parsed = JSON.parse(raw) as PackageManifest;

  return {
    name: parsed.name ?? "ai-zero-token",
    version: parsed.version ?? "0.0.0",
  };
}

export class VersionService {
  private cache: VersionStatus | null = null;

  private inFlight: Promise<VersionStatus> | null = null;

  async getVersionStatus(options?: { force?: boolean }): Promise<VersionStatus> {
    const now = Date.now();
    if (!options?.force && this.cache && now - this.cache.checkedAt < VERSION_CACHE_TTL_MS) {
      return this.cache;
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.fetchVersionStatus()
      .then((status) => {
        this.cache = status;
        return status;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  private async fetchVersionStatus(): Promise<VersionStatus> {
    const manifest = await readPackageManifest();
    const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(manifest.name)}/latest`;

    try {
      const latestVersion = await this.fetchNpmLatestVersion(registryUrl);
      const needsUpdate = compareSemver(manifest.version, latestVersion) < 0;
      return {
        packageName: manifest.name,
        currentVersion: manifest.version,
        latestVersion,
        checkedAt: Date.now(),
        needsUpdate,
        registryUrl,
        status: needsUpdate ? "update-available" : "ok",
      };
    } catch (error) {
      return {
        packageName: manifest.name,
        currentVersion: manifest.version,
        checkedAt: Date.now(),
        needsUpdate: false,
        registryUrl,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async fetchNpmLatestVersion(registryUrl: string): Promise<string> {
    const response = await requestText({
      method: "GET",
      url: registryUrl,
      timeoutMs: 5000,
      ignoreProxy: true,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`npm registry returned ${response.status}`);
    }

    const parsed = JSON.parse(response.body) as NpmLatestManifest;
    const latestVersion = typeof parsed.version === "string" && parsed.version ? parsed.version : undefined;
    if (!latestVersion) {
      throw new Error("npm registry did not return a version");
    }

    return latestVersion;
  }
}
