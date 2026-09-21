import { afterEach, describe, expect, test } from "bun:test";
import { once } from "node:events";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { VersionService } from "../src/core/services/version-service.ts";

type Route = (request: IncomingMessage, response: ServerResponse) => void;

const servers: Server[] = [];

async function startServer(route: Route): Promise<string> {
  const server = createServer(route);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test server did not expose an address");
  }
  return `http://127.0.0.1:${address.port}`;
}

function sendJson(response: ServerResponse, value: unknown, status = 200): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(value));
}

function release(version: string, assets?: string[]) {
  const assetNames = assets ?? [
    `AI Zero Token-${version}-mac-arm64.dmg`,
    `AI Zero Token-${version}-mac-x64.dmg`,
    `AI Zero Token Setup ${version}.exe`,
    `AI Zero Token-${version}-win.zip`,
  ];
  return {
    tag_name: `v${version}`,
    html_url: `https://example.test/releases/v${version}`,
    draft: false,
    prerelease: false,
    assets: assetNames.map((name) => ({
      name,
      browser_download_url: `https://example.test/download/${encodeURIComponent(name)}`,
    })),
  };
}

async function createService(params: {
  currentVersion?: string;
  desktopResponse?: unknown;
  desktopStatus?: number;
  npmVersion?: string;
  platform?: NodeJS.Platform;
  arch?: string;
}) {
  const currentVersion = params.currentVersion ?? "2.0.14";
  const origin = await startServer((request, response) => {
    if (request.url === "/github") {
      sendJson(response, params.desktopResponse ?? release("2.0.15"), params.desktopStatus ?? 200);
      return;
    }
    if (request.url === "/npm") {
      sendJson(response, { version: params.npmVersion ?? "2.0.12" });
      return;
    }
    sendJson(response, { error: "not found" }, 404);
  });

  return new VersionService({
    manifest: { name: "ai-zero-token", version: currentVersion },
    githubApiUrl: `${origin}/github`,
    registryUrl: `${origin}/npm`,
    platform: params.platform ?? "darwin",
    arch: params.arch ?? "arm64",
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  })));
});

describe("VersionService", () => {
  test("compares desktop against GitHub Releases and npm independently", async () => {
    const service = await createService({ npmVersion: "2.0.16" });
    const status = await service.getVersionStatus();

    expect(status.desktop.status).toBe("update-available");
    expect(status.desktop.latestVersion).toBe("2.0.15");
    expect(status.desktop.downloadUrl).toContain("mac-arm64.dmg");
    expect(status.npm.status).toBe("update-available");
    expect(status.npm.latestVersion).toBe("2.0.16");
  });

  test("marks a local desktop version newer than GitHub as unreleased", async () => {
    const service = await createService({
      currentVersion: "2.0.15",
      desktopResponse: release("2.0.14"),
      npmVersion: "2.0.15",
    });
    const status = await service.getVersionStatus();

    expect(status.desktop.status).toBe("ahead");
    expect(status.desktop.needsUpdate).toBe(false);
    expect(status.npm.status).toBe("ok");
  });

  test("does not substitute npm metadata when GitHub checking fails", async () => {
    const service = await createService({
      desktopResponse: { message: "unavailable" },
      desktopStatus: 503,
      npmVersion: "2.0.15",
    });
    const status = await service.getVersionStatus();

    expect(status.desktop.status).toBe("error");
    expect(status.desktop.latestVersion).toBeUndefined();
    expect(status.desktop.needsUpdate).toBe(false);
    expect(status.npm.status).toBe("update-available");
  });

  test("accepts GitHub's dotted asset names and v-prefixed tag", async () => {
    const service = await createService({
      desktopResponse: release("2.0.15", ["AI.Zero.Token-2.0.15-mac-arm64.dmg"]),
    });
    const status = await service.getVersionStatus();

    expect(status.desktop.status).toBe("update-available");
    expect(status.desktop.latestVersion).toBe("2.0.15");
    expect(status.desktop.availableAssetNames).toEqual(["AI.Zero.Token-2.0.15-mac-arm64.dmg"]);
  });

  test("rejects a desktop release without the current architecture artifact", async () => {
    const service = await createService({
      desktopResponse: release("2.0.15", ["AI Zero Token-2.0.15-mac-x64.dmg"]),
      platform: "darwin",
      arch: "arm64",
    });
    const status = await service.getVersionStatus();

    expect(status.desktop.status).toBe("error");
    expect(status.desktop.needsUpdate).toBe(false);
    expect(status.desktop.error).toContain("missing an artifact");
  });

  test("does not turn an older release into an error when its matching artifact is missing", async () => {
    const service = await createService({
      currentVersion: "2.0.16",
      desktopResponse: release("2.0.15", ["AI Zero Token-2.0.15-mac-x64.dmg"]),
      platform: "darwin",
      arch: "arm64",
    });
    const status = await service.getVersionStatus();

    expect(status.desktop.status).toBe("ahead");
    expect(status.desktop.needsUpdate).toBe(false);
  });

  test("requires valid semantic versions in release tags", async () => {
    const service = await createService({
      desktopResponse: { ...release("2.0.15"), tag_name: "desktop-latest" },
    });
    const status = await service.getVersionStatus();

    expect(status.desktop.status).toBe("error");
    expect(status.npm.status).toBe("ahead");
  });
});
