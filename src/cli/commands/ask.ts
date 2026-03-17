import { createGatewayContext } from "../../core/context.js";
import { parseAskArgs } from "../shared.js";

export async function runAskCommand(args: string[]): Promise<void> {
  const { model, prompt } = parseAskArgs(args);
  if (!prompt) {
    throw new Error('ask 需要一个 prompt，例如 bun src/cli.js ask "你好"');
  }

  const ctx = createGatewayContext();
  console.log('model:', ctx);
//   const result = await ctx.chatService.chat({
//     model,
//     input: prompt,
//   });

//   console.log(`provider: ${result.provider}`);
//   console.log(`model: ${result.model}`);
//   console.log("模型回复:");
//   console.log(result.text || "(返回成功，但没有解析出 output_text)");
}
