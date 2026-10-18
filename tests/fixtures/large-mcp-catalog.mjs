// Offline MCP fixture: large unused schemas reproduce plugin-heavy Codex prompts.
import { createInterface } from "node:readline";
const tools = [
  { name: "fixture_lookup", description: "fixture_lookup returns a local regression marker.", annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }, inputSchema: {
    type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false,
  } },
  ...Array.from({ length: 100 }, (_, i) => ({ name: `unused_${i}`, description: `Unrelated synthetic tool ${i}. ` + "Unused tool documentation. ".repeat(300), inputSchema: {
    type: "object", properties: { data: { type: "string" } },
  } })),
];
for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  if (message.id === undefined) continue;
  let result;
  if (message.method === "initialize") result = { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "azt-offline-catalog", version: "1.0.0" } };
  else if (message.method === "tools/list") result = { tools };
  else if (message.method === "tools/call" && message.params.name === "fixture_lookup") result = { content: [{ type: "text", text: "fixture_tool_complete" }] };
  else if (message.method === "ping") result = {};
  else { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Unsupported fixture method" } }) + "\n"); continue; }
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }) + "\n");
}
