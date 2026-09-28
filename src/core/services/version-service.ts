import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requestText } from "../providers/http-client.js";
import type { ReleaseChannelStatus, VersionStatus } from "../types.js";

const VERSION_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_GITHUB_API_URL = "https://api.github.com/repos/fchangjun/AI-Zero-Token/releases/latest";
const packageJsonPath = path.dirname(fileURLToPath(new URL("../../../package.json", import.meta.url)));

type PackageManifest = {
  name?: string;
  version?: string;
};

type NpmLatestManifest = {
  version?: string;
};

type GitHubRelease = {
  tag_name?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: Array<{
    name?: string;
    browser_download_url?: string;
  }>;
};

type VersionServiceOptions = {
  manifest?: Required<Pick<PackageManifest, "name" | "version">>;
  githubApiUrl?: string;
  registryUrl?: string;
  platform?: NodeJS.Platform;
  arch?: string;
};

type ParsedSemver = {
  core: number[];
  prerelease: string[];
};

function parseSemver(value: string): ParsedSemver | null {
  const normalized = value.trim().replace(/^v(?=\d)/iu, "");
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u.exec(normalized);
  if (!match) {
    return null;
  }

  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split(".") ?? [],
  };
}

function comparePrereleasePart(left: string, right: string): number {
  const leftNumeric = /^\d+$/u.test(left);
  const rightNumeric = /^\d+$/u.test(right);
  if (leftNumeric && rightNumeric) {
    return Number(left) - Number(right);
  }
  if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1;
  }
  return left.localeCompare(right);
}

export function compareSemver(left: string, right: string): number {
  const leftVersion = parseSemver(left);
  const rightVersion = parseSemver(right);
  if (!leftVersion || !rightVersion) {
    throw new Error(`cannot compare invalid versions: ${left} and ${right}`);
  }

  for (let index = 0; index < 3; index += 1) {
    const difference = leftVersion.core[index] - rightVersion.core[index];
    if (difference !== 0) {
      return difference;
    }
  }

  if (leftVersion.prerelease.length === 0 || rightVersion.prerelease.length === 0) {
    if (leftVersion.prerelease.length === rightVersion.prerelease.length) {
      return 0;
    }
    return leftVersion.prerelease.length === 0 ? 1 : -1;
  }

  const maxLength = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftVersion.prerelease[index];
    const rightPart = rightVersion.prerelease[index];
    if (leftPart === undefined || rightPart === undefined) {
      return leftPart === rightPart ? 0 : leftPart === undefined ? -1 : 1;
    }
    const difference = comparePrereleasePart(leftPart, rightPart);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function normalizeReleaseVersion(value: string | undefined): string {
  const normalized = value?.trim().replace(/^v(?=\d)/iu, "") ?? "";
  if (!parseSemver(normalized)) {
    throw new Error("GitHub release did not return a valid version tag");
  }
  return normalized;
}

function normalizeAssetName(value: string): string {
  return value.toLowerCase().replace(/[ ._-]+/gu, "-");
}

function resolveExpectedDesktopAssets(version: string, platform: NodeJS.Platform, arch: string): string[] {
  if (platform === "darwin" && (arch === "arm64" || arch === "x64")) {
    return [`AI Zero Token-${version}-mac-${arch}.dmg`];
  }
  if (platform === "win32" && arch === "x64") {
    return [
      `AI Zero Token Setup ${version}.exe`,
      `AI Zero Token-${version}-win.zip`,
    ];
  }
  return [];
}

function findReleaseAsset(release: GitHubRelease, expectedName: string) {
  const normalizedExpectedName = normalizeAssetName(expectedName);
  return (release.assets ?? []).find((asset) =>
    typeof asset.name === "string" && normalizeAssetName(asset.name) === normalizedExpectedName,
  );
}

function channelStatus(params: {
  currentVersion: string;
  latestVersion: string;
  sourceUrl: string;
  checkedAt: number;
}): ReleaseChannelStatus {
  const comparison = compareSemver(params.currentVersion, params.latestVersion);
  return {
    currentVersion: params.currentVersion,
    latestVersion: params.latestVersion,
    checkedAt: params.checkedAt,
    needsUpdate: comparison < 0,
    sourceUrl: params.sourceUrl,
    status: comparison < 0 ? "update-available" : comparison > 0 ? "ahead" : "ok",
  };
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

  constructor(private readonly options: VersionServiceOptions = {}) {}

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
    const manifest = this.options.manifest ?? await readPackageManifest();
    const checkedAt = Date.now();
    const registryUrl = this.options.registryUrl ?? `https://registry.npmjs.org/${encodeURIComponent(manifest.name)}/latest`;
    const githubApiUrl = this.options.githubApiUrl ?? DEFAULT_GITHUB_API_URL;
    const [desktop, npm] = await Promise.all([
      this.fetchDesktopStatus(manifest.version, githubApiUrl, checkedAt),
      this.fetchNpmStatus(manifest.version, registryUrl, checkedAt),
    ]);

    return {
      packageName: manifest.name,
      checkedAt,
      desktop,
      npm,
    };
  }

  private async fetchDesktopStatus(currentVersion: string, githubApiUrl: string, checkedAt: number): Promise<ReleaseChannelStatus> {
    try {
      const release = await this.fetchGitHubLatestRelease(githubApiUrl);
      const latestVersion = process.env.AZT_FORCE_DESKTOP_LATEST_VERSION
        ? normalizeReleaseVersion(process.env.AZT_FORCE_DESKTOP_LATEST_VERSION)
        : normalizeReleaseVersion(release.tag_name);
      const status = channelStatus({ currentVersion, latestVersion, sourceUrl: githubApiUrl, checkedAt });
      const expectedAssetNames = resolveExpectedDesktopAssets(
        latestVersion,
        this.options.platform ?? process.platform,
        this.options.arch ?? process.arch,
      );
      const availableAssets = expectedAssetNames.flatMap((expectedName) => {
        const asset = findReleaseAsset(release, expectedName);
        return asset ? [asset] : [];
      });

      if (status.status === "update-available" && expectedAssetNames.length > 0 && availableAssets.length !== expectedAssetNames.length) {
        return {
          ...status,
          needsUpdate: false,
          status: "error",
          releaseUrl: release.html_url,
          expectedAssetNames,
          availableAssetNames: availableAssets.flatMap((asset) => asset.name ? [asset.name] : []),
          error: `GitHub release ${latestVersion} is missing an artifact for ${this.options.platform ?? process.platform}-${this.options.arch ?? process.arch}`,
        };
      }

      return {
        ...status,
        releaseUrl: release.html_url,
        expectedAssetNames,
        availableAssetNames: availableAssets.flatMap((asset) => asset.name ? [asset.name] : []),
        downloadUrl: availableAssets[0]?.browser_download_url,
      };
    } catch (error) {
      return {
        currentVersion,
        checkedAt,
        needsUpdate: false,
        sourceUrl: githubApiUrl,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async fetchNpmStatus(currentVersion: string, registryUrl: string, checkedAt: number): Promise<ReleaseChannelStatus> {
    try {
      const latestVersion = process.env.AZT_FORCE_NPM_LATEST_VERSION
        || process.env.AZT_FORCE_LATEST_VERSION
        || await this.fetchNpmLatestVersion(registryUrl);
      return channelStatus({ currentVersion, latestVersion, sourceUrl: registryUrl, checkedAt });
    } catch (error) {
      return {
        currentVersion,
        checkedAt,
        needsUpdate: false,
        sourceUrl: registryUrl,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async fetchGitHubLatestRelease(githubApiUrl: string): Promise<GitHubRelease> {
    const response = await requestText({
      method: "GET",
      url: githubApiUrl,
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "ai-zero-token-version-check",
        "x-github-api-version": "2022-11-28",
      },
      timeoutMs: 5000,
      ignoreProxy: true,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`GitHub releases API returned ${response.status}`);
    }

    const parsed = JSON.parse(response.body) as GitHubRelease;
    if (parsed.draft || parsed.prerelease) {
      throw new Error("GitHub releases API returned a non-production release");
    }
    return parsed;
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
    if (!latestVersion || !parseSemver(latestVersion)) {
      throw new Error("npm registry did not return a valid version");
    }

    return latestVersion;
  }
}
