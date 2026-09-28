import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { downloadRelease, fetchMacRelease, fetchReleaseAsset, selectMacRelease, type UpdateFetch } from "../src/desktop/update-release.ts";
import { DesktopUpdater, type UpdateInstaller } from "../src/desktop/updater.ts";

const payload = Buffer.from("verified fixture DMG bytes");
const digest = createHash("sha256").update(payload).digest("hex");
const roots: string[] = [];
async function temp() { const root = await fs.mkdtemp(path.join(os.tmpdir(), "azt-updater-test-")); roots.push(root); return root; }
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });

function manifest(version = "2.0.17", arch = "arm64") {
  const name = `AI.Zero.Token-${version}-mac-${arch}.dmg`;
  return { tag_name: `v${version}`, draft: false, prerelease: false, body: "Release notes", assets: [{
    name, state: "uploaded", size: payload.length, digest: `sha256:${digest}`,
    browser_download_url: `https://github.com/fchangjun/AI-Zero-Token/releases/download/v${version}/${name}`,
  }] };
}

describe("trusted desktop releases", () => {
  test("matches normalized GitHub asset names and ignores older/equal releases", () => {
    expect(selectMacRelease(manifest(), "2.0.16", "arm64")?.version).toBe("2.0.17");
    expect(selectMacRelease(manifest(), "2.0.17", "arm64")).toBeNull();
    expect(selectMacRelease(manifest(), "2.0.18", "arm64")).toBeNull();
    expect(selectMacRelease(manifest(), "2.0.17-beta.1", "arm64")?.version).toBe("2.0.17");
    expect(() => selectMacRelease(manifest(), "2.0.16", "x64")).toThrow();
    expect(selectMacRelease(manifest("2.0.17", "x64"), "2.0.16", "x64")?.version).toBe("2.0.17");
  });
  test("rejects drafts, prereleases, ambiguous assets and incomplete uploads", () => {
    for (const patch of [{ draft: true }, { prerelease: true }, { tag_name: "v2.0.17-beta.1" }, { tag_name: "../2.0.17" }, { assets: [] }]) {
      expect(() => selectMacRelease({ ...manifest(), ...patch }, "2.0.16", "arm64")).toThrow();
    }
    const release = manifest();
    release.assets.push(release.assets[0]);
    expect(() => selectMacRelease(release, "2.0.16", "arm64")).toThrow();
    for (const patch of [{ state: "starter" }, { size: 0 }, { size: 3 * 1024 ** 3 }]) {
      const release = manifest(); Object.assign(release.assets[0], patch);
      expect(() => selectMacRelease(release, "2.0.16", "arm64")).toThrow();
    }
  });
  test("rejects asset URLs outside the exact official repository and release", () => {
    for (const url of ["https://evil.example/update.dmg", "http://github.com/update.dmg", manifest().assets[0].browser_download_url.replace("fchangjun", "attacker"), manifest().assets[0].browser_download_url.replace("/v2.0.17/", "/v2.0.18/")]) {
      const release = manifest(); release.assets[0].browser_download_url = url;
      expect(() => selectMacRelease(release, "2.0.16", "arm64")).toThrow();
    }
  });
  test("limits metadata size and blocks redirects to untrusted hosts", async () => {
    await expect(fetchMacRelease(async () => new Response("x".repeat(2 * 1024 ** 2 + 1)), "2.0.16", "arm64", new AbortController().signal)).rejects.toThrow("too large");
    const visited: string[] = [];
    const fetcher: UpdateFetch = async (url) => { visited.push(url); return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }); };
    await expect(fetchReleaseAsset(fetcher, manifest().assets[0].browser_download_url, new AbortController().signal)).rejects.toThrow("Untrusted");
    expect(visited).toHaveLength(1);
  });
});

describe("download verification", () => {
  test("follows the GitHub CDN redirect and writes exactly the verified bytes", async () => {
    const destination = path.join(await temp(), "update.dmg");
    const progress: number[] = [];
    await downloadRelease({ release: selectMacRelease(manifest(), "2.0.16", "arm64")!, destination, signal: new AbortController().signal,
      fetcher: async (url) => url.startsWith("https://github.com/") ? new Response(null, { status: 302, headers: { location: "https://release-assets.githubusercontent.com/file?token=fixture" } }) : new Response(payload),
      onProgress: (value) => progress.push(value),
    });
    expect(await fs.readFile(destination)).toEqual(payload);
    expect(progress.at(-1)).toBe(100);
  });
  test("rejects absent checksums before downloading", async () => {
    let called = false;
    const release = selectMacRelease(manifest(), "2.0.16", "arm64")!; release.sha256 = undefined;
    await expect(downloadRelease({ release, destination: path.join(await temp(), "update.dmg"), signal: new AbortController().signal, fetcher: async () => { called = true; return new Response(payload); }, onProgress() {} })).rejects.toMatchObject({ code: "missing-digest" });
    expect(called).toBe(false);
  });
  test("rejects corrupt, truncated and oversized bytes and removes partial files", async () => {
    for (const bytes of [Buffer.alloc(payload.length), payload.subarray(1), Buffer.concat([payload, payload])]) {
      const destination = path.join(await temp(), "update.dmg");
      await expect(downloadRelease({ release: selectMacRelease(manifest(), "2.0.16", "arm64")!, destination, signal: new AbortController().signal, fetcher: async () => new Response(bytes), onProgress() {} })).rejects.toMatchObject({ code: "integrity" });
      expect(await fs.stat(destination).catch(() => null)).toBeNull();
    }
  });
  test("does not overwrite or delete an existing destination", async () => {
    const destination = path.join(await temp(), "update.dmg"); await fs.writeFile(destination, "existing");
    await expect(downloadRelease({ release: selectMacRelease(manifest(), "2.0.16", "arm64")!, destination, signal: new AbortController().signal, fetcher: async () => new Response(payload), onProgress() {} })).rejects.toThrow();
    expect(await fs.readFile(destination, "utf8")).toBe("existing");
  });
});

async function service(overrides: Partial<UpdateInstaller> = {}, fetchOverride?: UpdateFetch, supported = true) {
  const job = await temp();
  const events: string[] = [];
  const installer: UpdateInstaller = {
    preflight: async () => { events.push("preflight"); }, createJob: async () => { await fs.mkdir(job, { recursive: true }); return job; },
    prepare: async () => { events.push("prepare"); }, handOff: async () => { events.push("handoff"); }, cleanup: async () => { events.push("cleanup"); }, ...overrides,
  };
  let requests = 0;
  const updater = new DesktopUpdater({ currentVersion: "2.0.16", arch: "arm64", supported, installer,
    fetcher: fetchOverride ?? (async (url) => { requests += 1; return url.includes("api.github.com") ? Response.json(manifest()) : new Response(payload); }),
    onAvailable: () => events.push("notify"), onState: (state) => events.push(state.phase), quit: () => events.push("quit"),
  });
  return { updater, events, job, requests: () => requests };
}

describe("update lifecycle", () => {
  test("coalesces checks/downloads, notifies once, and only installs after verification", async () => {
    const { updater, events, requests } = await service();
    await updater.install(); expect(events).not.toContain("quit");
    await Promise.all([updater.check(), updater.check()]); expect(requests()).toBe(1);
    await updater.check(); expect(events.filter((event) => event === "notify")).toHaveLength(1);
    await Promise.all([updater.download(), updater.download()]);
    expect(events.filter((event) => event === "prepare")).toHaveLength(1);
    expect(updater.getState().phase).toBe("ready");
    await updater.check(); expect(updater.getState().phase).toBe("ready");
    await updater.install();
    expect(events.indexOf("handoff")).toBeLessThan(events.indexOf("quit"));
    await updater.stop();
    expect(events).not.toContain("cleanup");
  });
  test("cleans a failed preparation and permits retry without quitting", async () => {
    let attempts = 0;
    const { updater, events } = await service({ prepare: async () => { if (attempts++ === 0) throw new Error("mount failed"); } });
    await updater.check(); await updater.download();
    expect(updater.getState()).toMatchObject({ phase: "error", errorCode: "prepare-failed" });
    expect(events).toContain("cleanup"); expect(events).not.toContain("quit");
    await updater.download();
    expect(updater.getState().phase).toBe("ready");
    expect(attempts).toBe(2);
    await updater.stop();
  });
  test("helper launch failure leaves the current process running", async () => {
    const { updater, events } = await service({ handOff: async () => { throw new Error("cannot spawn"); } });
    await updater.check(); await updater.download(); await updater.install();
    expect(updater.getState()).toMatchObject({ phase: "error", errorCode: "install-failed" });
    expect(events).not.toContain("quit");
    await updater.stop();
  });
  test("cancels an in-progress download and removes the partial file", async () => {
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => { requestStarted = resolve; });
    const { updater, job } = await service({}, async (url, init) => {
      if (url.includes("api.github.com")) return Response.json(manifest());
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(payload.subarray(0, 3)); requestStarted();
        init?.signal?.addEventListener("abort", () => controller.error(new Error("cancelled")), { once: true });
      } }));
    });
    await updater.check(); const download = updater.download(); await started;
    await updater.cancel(); await download;
    expect(updater.getState().phase).toBe("available");
    expect(await fs.stat(path.join(job, "update.dmg")).catch(() => null)).toBeNull();
    await updater.stop();
  });
  test("development/unsupported builds never check, download, or install", async () => {
    const { updater, requests, events } = await service({}, undefined, false);
    updater.start(); await updater.check(); await updater.download(); await updater.install();
    expect(requests()).toBe(0); expect(events).not.toContain("quit");
    expect(updater.getState().phase).toBe("unsupported"); await updater.stop();
  });
});
