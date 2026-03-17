import { runCli } from "./cli/index.js";

runCli().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`错误: ${message}`);
  process.exitCode = 1;
});
