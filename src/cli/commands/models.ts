import { createGatewayContext } from "../../core/context.js";

export async function runModelsCommand(args: string[] = []): Promise<void> {
  const ctx = createGatewayContext();
  const refresh = args.includes("--refresh");
  const result = refresh
    ? await ctx.modelService.refreshModels()
    : {
        models: await ctx.modelService.listModels(),
        catalog: await ctx.modelService.getCatalog(),
      };

  console.log(refresh ? "已从网络同步 Codex 模型列表:" : "当前 demo 可用模型列表:");
  const sourceLabel = result.catalog.source === "codex-network"
    ? "Codex 网络同步"
    : result.catalog.source === "codex-cache"
      ? "Codex 本地缓存"
      : "项目内置回退列表";
  console.log(`- 来源: ${sourceLabel}`);
  console.log(`- 路径: ${result.catalog.cachePath}`);
  if (result.catalog.fetchedAt) {
    console.log(`- Codex 更新时间: ${result.catalog.fetchedAt}`);
  }
  console.log(`- 数量: ${result.catalog.modelCount}`);

  for (const model of result.models) {
    const suffix = model.isDefault ? " (默认)" : "";
    console.log(`- ${model.id}${suffix}`);
  }
}
