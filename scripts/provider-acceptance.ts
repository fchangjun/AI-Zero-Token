import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Run the real production UI/API against disposable state and a local mock upstream.
const acceptanceRoot = await mkdtemp(join(tmpdir(), "azt-provider-acceptance-"));
process.env.AI_ZERO_TOKEN_HOME = join(acceptanceRoot, "gateway");
process.env.CODEX_HOME = join(acceptanceRoot, "codex");
await mkdir(process.env.CODEX_HOME, { recursive: true });
await mkdir(join(process.env.AI_ZERO_TOKEN_HOME, ".state"), { recursive: true });
const profiles = Object.fromEntries(Array.from({ length: 129 }, (_, index) => {
  const id = `demo-${String(index + 1).padStart(3, "0")}`;
  return [id, { provider: "openai-codex", profileId: id, mode: "oauth_account", access: "local-fixture-access", refresh: "local-fixture-refresh", expires: Date.now() + 86400000, accountId: id, codexAccountId: id, email: `${id}@example.test`, quota: { capturedAt: Date.now(), planType: index < 44 ? "plus" : "free", primaryUsedPercent: index < 44 ? 20 : 100, secondaryUsedPercent: 20 } }];
}));
await writeFile(join(process.env.AI_ZERO_TOKEN_HOME, ".state/store.json"), JSON.stringify({ version: 1, activeProfileId: "demo-001", profiles }));
await writeFile(join(process.env.AI_ZERO_TOKEN_HOME, ".state/settings.json"), '{}');
await writeFile(join(process.env.CODEX_HOME, "config.toml"), 'model = "original-model"\n');
const { startProviderFixture } = await import("../tests/fixtures/provider.ts");
const { ExternalProviderService } = await import("../dist/core/services/external-provider-service.js");
const { createApp } = await import("../dist/server/app.js");
const fixture = await startProviderFixture();
fixture.state.models.push({ id: "model-untested" });
const service = new ExternalProviderService();
const provider = await service.create({ name: "验收示例 API", baseUrl: fixture.baseUrl, apiToken: "sk-local-fixture", modelSource: "auto" });
await service.inspect(provider.id, ["model-ready", "model-busy", "text-embedding-3-small"]);
await service.activate(provider.id, ["model-ready", "model-untested"], "model-ready");
await service.create({ name: "备用服务（手动模型）", baseUrl: fixture.baseUrl, apiToken: "sk-local-fixture", modelSource: "manual", manualModelIds: ["deepseek-chat", "qwen-coder"] });
fixture.state.delayMs = 150;
const app = createApp();
await app.listen({ host: "127.0.0.1", port: Number(process.env.AZT_ACCEPTANCE_PORT || 0) });
const address = app.server.address();
if (!address || typeof address === "string") throw new Error("Preview failed to bind");
console.log(JSON.stringify({ url: `http://127.0.0.1:${address.port}/#providers`, upstream: fixture.baseUrl, state: acceptanceRoot, note: "隔离验收环境：使用本地模拟 API，所有接入配置写入临时目录。" }));
async function shutdown() { await app.close(); await fixture.close(); process.exit(0); }
process.on("SIGINT", () => { void shutdown(); });
process.on("SIGTERM", () => { void shutdown(); });
