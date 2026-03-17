import { createGatewayContext } from "../../core/context.js";
import { startServer } from "../../server/index.js";
import { parseServeArgs } from "../shared.js";

export async function runServeCommand(args: string[]): Promise<void> {
  const { host, port } = parseServeArgs(args);
  const ctx = createGatewayContext();
  const status = await ctx.authService.getStatus();
  const server = await startServer({ host, port });
  console.log("本地网关已启动。");
  console.log(`url: http://${server.host}:${server.port}`);
  console.log(`activeProvider: ${status.activeProvider ?? "none"}`);
  console.log(`defaultModel: ${status.defaultModel}`);
}
