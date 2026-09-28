import { afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Every test uses disposable state, never the user's running gateway or Codex config.
const testRoot = mkdtempSync(join(tmpdir(), "azt-tests-"));
process.env.AI_ZERO_TOKEN_HOME = join(testRoot, "gateway");
process.env.CODEX_HOME = join(testRoot, "codex");
mkdirSync(process.env.CODEX_HOME, { recursive: true });
mkdirSync(join(process.env.AI_ZERO_TOKEN_HOME, ".state"), { recursive: true });
writeFileSync(join(process.env.AI_ZERO_TOKEN_HOME, ".state/store.json"), '{"version":1,"profiles":{}}');
writeFileSync(join(process.env.AI_ZERO_TOKEN_HOME, ".state/settings.json"), '{}');
afterAll(() => rmSync(testRoot, { recursive: true, force: true }));
