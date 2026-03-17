import { createGatewayContext } from "../../core/context.js";

export async function runModelsCommand(): Promise<void> {
  const ctx = createGatewayContext();
  console.log("当前 demo 内置支持的模型:");
  for (const model of await ctx.modelService.listModels()) {
    const suffix = model.isDefault ? " (默认)" : "";
    console.log(`- ${model.id}${suffix}`);
  }
}
