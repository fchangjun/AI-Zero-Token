import { createGatewayContext } from "../../core/context.js";

export async function runClearCommand(): Promise<void> {
  const ctx = createGatewayContext();
  await ctx.authService.logoutAll();
  console.log("已清空 demo 的本地状态。");
}
