import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { compareSemver } from "../core/services/version-service.js";
import { UpdateError } from "./update-types.js";

export const RELEASES_URL = "https://github.com/fchangjun/AI-Zero-Token/releases";
export const RELEASE_API_URL = "https://api.github.com/repos/fchangjun/AI-Zero-Token/releases/latest";
const MAX_DOWNLOAD_BYTES = 2 * 1024 ** 3;

export type UpdateRelease = {
  version: string;
  notes: string;
  releaseUrl: string;
  downloadUrl: string;
  size: number;
  sha256?: string;
};

export type UpdateFetch = (url: string, init?: RequestInit) => Promise<Response>;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid release metadata");
  return value as Record<string, unknown>;
}

export function selectMacRelease(value: unknown, currentVersion: string, arch: string): UpdateRelease | null {
  const release = record(value);
  if (release.draft !== false || release.prerelease !== false) throw new Error("Not a stable release");
  const tag = release.tag_name;
  if (typeof tag !== "string" || !/^v?\d+\.\d+\.\d+$/.test(tag)) throw new Error("Invalid stable release tag");
  const version = tag.replace(/^v/, "");
  if (compareSemver(version, currentVersion) <= 0) return null;
  if (arch !== "arm64" && arch !== "x64") throw new Error("Unsupported architecture");
  const normalize = (name: string) => name.toLowerCase().replace(/[ ._-]+/g, "-");
  const expected = normalize(`AI Zero Token-${version}-mac-${arch}.dmg`);
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const matches = assets.map(record).filter((asset) => typeof asset.name === "string" && normalize(asset.name) === expected);
  if (matches.length !== 1) throw new Error("Release is missing the matching DMG (or has ambiguous assets)");
  const asset = matches[0];
  const url = new URL(String(asset.browser_download_url));
  const expectedPath = `/fchangjun/AI-Zero-Token/releases/download/${tag}/${asset.name}`;
  if (url.protocol !== "https:" || url.host !== "github.com" || url.username || url.password || url.search || url.hash || decodeURIComponent(url.pathname) !== expectedPath) {
    throw new Error("Release download must belong to the official repository and tag");
  }
  if (asset.state !== "uploaded" || typeof asset.size !== "number" || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > MAX_DOWNLOAD_BYTES) {
    throw new Error("Invalid release asset size or upload state");
  }
  const digest = typeof asset.digest === "string" && /^sha256:[a-f0-9]{64}$/i.test(asset.digest)
    ? asset.digest.slice(7).toLowerCase() : undefined;
  return {
    version,
    notes: typeof release.body === "string" ? release.body.slice(0, 16_000) : "",
    releaseUrl: `${RELEASES_URL}/tag/${encodeURIComponent(tag)}`,
    downloadUrl: url.href,
    size: asset.size,
    sha256: digest,
  };
}

export async function fetchMacRelease(fetcher: UpdateFetch, currentVersion: string, arch: string, signal: AbortSignal): Promise<UpdateRelease | null> {
  const response = await fetcher(RELEASE_API_URL, {
    headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "ai-zero-token-updater" },
    redirect: "error",
    credentials: "omit",
    signal,
  });
  if (!response.ok || !response.body) throw new Error(`Release check returned HTTP ${response.status}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 ** 2) throw new Error("Release metadata is too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return selectMacRelease(JSON.parse(Buffer.concat(chunks).toString("utf8")), currentVersion, arch);
}

// Redirects may go only to GitHub's release CDN. No cookies or authorization are forwarded.
export async function fetchReleaseAsset(fetcher: UpdateFetch, url: string, signal: AbortSignal): Promise<Response> {
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const target = new URL(url);
    if (target.protocol !== "https:" || target.username || target.password || target.port || !["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"].includes(target.hostname)) {
      throw new UpdateError("download-failed", "Untrusted download redirect");
    }
    const response = await fetcher(target.href, { redirect: "manual", signal, credentials: "omit" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (!location) throw new Error("Missing redirect location");
    url = new URL(location, target).href;
  }
  throw new Error("Too many download redirects");
}

export async function downloadRelease(params: {
  release: UpdateRelease;
  destination: string;
  fetcher: UpdateFetch;
  signal: AbortSignal;
  onProgress: (percent: number) => void;
}): Promise<void> {
  const { release, destination, fetcher, signal, onProgress } = params;
  if (!release.sha256) throw new UpdateError("missing-digest", "GitHub has not provided a SHA-256 digest for this asset");
  const response = await fetchReleaseAsset(fetcher, release.downloadUrl, signal);
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel();
    throw new Error(`Download returned HTTP ${response.status}`);
  }
  const reader = response.body.getReader();
  let file: Awaited<ReturnType<typeof fs.open>> | undefined;
  let ownsFile = false;
  let complete = false;
  let size = 0;
  let lastPercent = -1;
  const hash = createHash("sha256");
  try {
    file = await fs.open(destination, "wx", 0o600);
    ownsFile = true;
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > release.size) throw new UpdateError("integrity", "Download exceeded the expected size");
      hash.update(value);
      // FileHandle.write may perform a partial write.
      for (let offset = 0; offset < value.byteLength;) {
        const { bytesWritten } = await file.write(value, offset, value.byteLength - offset);
        if (!bytesWritten) throw new Error("Could not write download");
        offset += bytesWritten;
      }
      const percent = Math.floor(size / release.size * 100);
      if (percent !== lastPercent) { onProgress(percent); lastPercent = percent; }
    }
    signal.throwIfAborted();
    if (size !== release.size || hash.digest("hex") !== release.sha256) throw new UpdateError("integrity", "Downloaded DMG failed size or SHA-256 verification");
    await file.sync();
    complete = true;
  } finally {
    await reader.cancel().catch(() => undefined);
    await file?.close();
    if (ownsFile && !complete) await fs.rm(destination, { force: true });
  }
}
