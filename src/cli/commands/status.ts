import { createGatewayContext } from "../../core/context.js";
import { getSettingsPath } from "../../core/store/settings-store.js";
import { getStateDir, getStorePath } from "../../store.js";
import { formatExpiry } from "../shared.js";

export async function runStatusCommand(): Promise<void> {
  const ctx = createGatewayContext();
  const status = await ctx.authService.getStatus();
  if (!status.loggedIn) {
    console.log("当前没有已保存的登录状态。");
    console.log(`stateDir: ${getStateDir()}`);
    console.log(`store: ${getStorePath()}`);
    return;
  }

  console.log("当前登录状态:");
  console.log(`provider: ${status.activeProvider}`);
  console.log(`profileId: ${status.activeProfileId}`);
  console.log(`defaultModel: ${status.defaultModel}`);
  console.log(`serverHost: ${status.serverHost}`);
  console.log(`serverPort: ${status.serverPort}`);
  if (typeof status.expiresAt === "number") {
    console.log(`expires: ${formatExpiry(status.expiresAt)}`);
    console.log(`expired: ${Date.now() >= status.expiresAt ? "yes" : "no"}`);
  }
  console.log(`stateDir: ${getStateDir()}`);
  console.log(`store: ${getStorePath()}`);
  console.log(`settings: ${getSettingsPath()}`);
}
