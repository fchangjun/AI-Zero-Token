import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { dataRoot, runtimePath } from "./paths.mjs";

export async function readRuntime() {
  try {
    return JSON.parse(await fs.readFile(runtimePath(), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function writeRuntime(runtime) {
  await fs.mkdir(dataRoot(), { recursive: true, mode: 0o700 });
  const target = runtimePath();
  const temporary = path.join(
    path.dirname(target),
    `.runtime-${process.pid}-${Date.now()}.json`,
  );
  await fs.writeFile(temporary, `${JSON.stringify(runtime, null, 2)}\n`, {
    mode: 0o600,
  });
  await fs.rename(temporary, target);
  await fs.chmod(target, 0o600).catch(() => {});
}

export async function clearRuntime(expectedInstanceId = null) {
  const runtime = await readRuntime();
  if (
    expectedInstanceId &&
    runtime?.instanceId &&
    runtime.instanceId !== expectedInstanceId
  ) {
    return false;
  }
  await fs.rm(runtimePath(), { force: true });
  return true;
}

export function newRuntimeIdentity() {
  return {
    instanceId: crypto.randomUUID(),
    token: crypto.randomBytes(32).toString("base64url"),
  };
}
