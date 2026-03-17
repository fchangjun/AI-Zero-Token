import { createGatewayContext } from "../../core/context.js";
import { getStateDir, getStorePath } from "../../store.js";
import { formatExpiry } from "../shared.js";

export async function runLoginCommand(): Promise<void> {
  const ctx = createGatewayContext();
  const profile = await ctx.authService.login("openai-codex");
  console.log("登录成功。");
  console.log(`profileId: ${profile.profileId}`);
  console.log(`accountId: ${profile.accountId}`);
  if (profile.email) {
    console.log(`email: ${profile.email}`);
  }
  console.log(`expires: ${formatExpiry(profile.expires)}`);
  console.log(`stateDir: ${getStateDir()}`);
  console.log(`store: ${getStorePath()}`);
}
