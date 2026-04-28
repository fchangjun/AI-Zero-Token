import fs from "node:fs/promises";
import { createGatewayContext } from "../../core/context.js";
import { formatExpiry } from "../shared.js";

function printProfilesHelp(): void {
  console.log(`用法:

  azt profiles import ./profile.json
  azt profiles export active ./profile.json
  azt profiles export all ./profiles.json
  azt profiles export <profileId> ./profile.json

说明:

  import  导入外部账号 JSON，支持单个对象、对象数组或 { "profiles": [...] }
  export  导出当前账号、全部账号或指定 profileId 的完整凭据 JSON
`);
}

export async function runProfilesCommand(argv: string[]): Promise<void> {
  const [action, target, outputPath] = argv;
  const ctx = createGatewayContext();

  if (action === "import") {
    if (!target) {
      throw new Error("缺少导入文件路径。用法: azt profiles import ./profile.json");
    }

    const raw = await fs.readFile(target, "utf8");
    const profiles = await ctx.authService.importProfiles(JSON.parse(raw));
    console.log(`账号导入成功，共 ${profiles.length} 个。`);
    for (const profile of profiles) {
      console.log(`profileId: ${profile.profileId}`);
      console.log(`accountId: ${profile.accountId}`);
      if (profile.email) {
        console.log(`email: ${profile.email}`);
      }
      console.log(`expires: ${formatExpiry(profile.expires)}`);
    }
    return;
  }

  if (action === "export") {
    const isAll = target === "all";
    const profileId = outputPath && target !== "active" && !isAll ? target : undefined;
    const resolvedOutputPath = outputPath ?? (target !== "active" && !isAll ? target : undefined);
    if (!resolvedOutputPath) {
      throw new Error("缺少导出文件路径。用法: azt profiles export active ./profile.json");
    }

    const exported = isAll
      ? await ctx.authService.exportProfiles()
      : await ctx.authService.exportProfile(profileId);
    await fs.writeFile(resolvedOutputPath, `${JSON.stringify(exported, null, 2)}\n`, "utf8");
    console.log("账号导出成功。");
    if ("profiles" in exported) {
      console.log(`profileCount: ${exported.profiles.length}`);
    } else {
      console.log(`profileId: ${exported.profile_id}`);
      console.log(`accountId: ${exported.account_id}`);
    }
    console.log(`file: ${resolvedOutputPath}`);
    return;
  }

  printProfilesHelp();
}
