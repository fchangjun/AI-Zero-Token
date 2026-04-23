import { runServeCommand } from "./serve.js";

export async function runStartCommand(args: string[]): Promise<void> {
  await runServeCommand(args, {
    openBrowserByDefault: true,
  });
}
