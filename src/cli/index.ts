import { runAskCommand } from "./commands/ask.js";
import { runClearCommand } from "./commands/clear.js";
import { printHelp } from "./commands/help.js";
import { runLoginCommand } from "./commands/login.js";
import { runModelsCommand } from "./commands/models.js";
import { runServeCommand } from "./commands/serve.js";
import { runStatusCommand } from "./commands/status.js";

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = argv;

  switch (command) {
    case "login":
      await runLoginCommand();
      return;
    case "status":
      await runStatusCommand();
      return;
    case "models":
      await runModelsCommand();
      return;
    case "ask":
      await runAskCommand(rest);
      return;
    case "serve":
      await runServeCommand(rest);
      return;
    case "clear":
      await runClearCommand();
      return;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      return;
    default:
      throw new Error(`未知命令: ${command}`);
  }
}
