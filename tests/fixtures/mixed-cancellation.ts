// Run by mixed-gateway.test.ts in Node, matching Electron's HTTP lifecycle.
import { strict as assert } from "node:assert";
import { createServer, request } from "node:http";
import { MixedGateway } from "../../src/server/mixed-gateway";
import { commitMixedActivation, createExternalProvider, readMixedProviderConfig } from "../../src/core/store/external-provider-store";

async function main() {
  if (!process.env.AI_ZERO_TOKEN_HOME?.includes("azt-tests-") || !process.env.CODEX_HOME?.includes("azt-tests-")) throw new Error("Disposable test homes required.");
  let cancelled = false;
  const upstream = createServer((incoming, outgoing) => {
    incoming.resume();
    outgoing.writeHead(200, { "content-type": "text/event-stream" }); outgoing.write(": keepalive\n\n");
    outgoing.once("close", () => { cancelled = true; });
  });
  const gateway = new MixedGateway(async (_request, body) => JSON.parse(body.toString()));
  try {
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const upstreamPort = (upstream.address() as { port: number }).port;
    const provider = await createExternalProvider({ name: "fixture", baseUrl: `http://127.0.0.1:${upstreamPort}/v1`, token: "fixture", models: [{ id: "fixture" }] });
    const port = await gateway.ensure();
    for (const transport of ["fetch", "curl"]) for (const protocol of ["responses", "chat_completions", "anthropic"] as const) {
      process.env.OAUTH_DEMO_USE_CURL = transport === "curl" ? "1" : "0";
      await commitMixedActivation({ routes: [{ providerId: provider.id, modelId: "fixture", protocol }], defaultModel: { providerId: provider.id, modelId: "fixture" } }, port, async () => {}, {});
      const config = (await readMixedProviderConfig())!;
      cancelled = false;
      await new Promise<void>((resolve, reject) => {
        const client = request(`http://127.0.0.1:${port}/v1/responses`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` } }, (response) => {
          response.once("data", () => { response.destroy(); client.destroy(); resolve(); });
        });
        client.on("error", reject);
        client.end(JSON.stringify({ model: config.defaultModelId, input: "hello", stream: true }));
      });
      for (let i = 0; i < 200 && !cancelled; i++) await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(cancelled, true, `${transport}/${protocol} must cancel upstream`);
    }
    console.log("CANCELLATION_OK: fetch/curl × Responses/Chat/Claude");
  } finally {
    await gateway.close();
    upstream.closeAllConnections(); await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
