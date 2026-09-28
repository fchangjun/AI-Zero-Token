import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { getCodexModelCatalog, getCodexModelsCachePath, getPreferredCodexModel, refreshCodexModelCatalogFromNetwork } from "../src/core/models/openai-codex-models.ts";
import { createDefaultSettings } from "../src/core/store/settings-store.ts";
import * as http from "../src/core/providers/http-client.ts";

beforeEach(async () => {
  if (!process.env.CODEX_HOME?.includes("azt-tests-")) throw new Error("Run with npm test.");
  await mkdir(process.env.CODEX_HOME, { recursive: true });
  await rm(getCodexModelsCachePath(), { force: true });
});
afterEach(async () => { await rm(getCodexModelsCachePath(), { force: true }); });

test("fresh installations use current fallback models without reading the user's Codex home", async () => {
  expect(getCodexModelsCachePath()).toBe(`${process.env.CODEX_HOME}/models_cache.json`);
  const catalog = await getCodexModelCatalog();
  expect(catalog.catalog.source).toBe("static-fallback");
  expect(catalog.models.map(model => model.id)).toEqual(["gpt-6-luna", "gpt-6-sol", "gpt-6-astra"]);
  expect(await getPreferredCodexModel()).toBe("gpt-6-luna");
  expect(createDefaultSettings().defaultModel).toBe("gpt-6-luna");
});

test("network discovery uses a current client version then follows the upstream model catalog", async () => {
  const upstream = spyOn(http, "requestText").mockImplementation(async init => {
    expect(new URL(init.url).searchParams.get("client_version")).toBe("0.155.0");
    return { status: 200, requestId: "fixture", transport: "fetch", headers: {}, body: JSON.stringify({ models: [{ slug: "future-model", visibility: "list" }, { slug: "hidden-model", visibility: "hide" }] }) };
  });
  try {
    await refreshCodexModelCatalogFromNetwork({ provider: "openai-codex", profileId: "fixture", access: "fixture-access", refresh: "fixture-refresh", expires: Date.now() + 60000, accountId: "fixture" });
    expect((await getCodexModelCatalog()).models.map(model => model.id)).toEqual(["future-model"]);
    expect(await getPreferredCodexModel()).toBe("future-model");
  } finally { upstream.mockRestore(); }
});

test("an existing cache continues to determine the available models", async () => {
  await writeFile(getCodexModelsCachePath(), JSON.stringify({ models: [{ slug: "cached-model", visibility: "list" }] }));
  expect(await getPreferredCodexModel()).toBe("cached-model");
});
