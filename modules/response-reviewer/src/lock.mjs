import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Publish an already populated directory atomically. An empty, partially written
// lock is never visible; stale cleanup cannot remove a new owner's nonempty lock.
export async function acquireLock(root, name) {
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const target = path.join(root, `.${name}.lock`);
  const temporary = await fs.mkdtemp(path.join(root, `.${name}-`));
  const owner = `${process.pid}-${randomUUID()}.json`;
  await fs.writeFile(path.join(temporary, owner), JSON.stringify({ pid: process.pid }), { mode: 0o600 });
  let acquired = false;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await fs.rename(temporary, target); acquired = true; break; }
      catch (error) { if (!["EEXIST", "ENOTEMPTY", "EPERM"].includes(error.code)) throw error; }
      const entries = await fs.readdir(target).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
      if (!entries) continue;
      if (entries.length !== 1 || !/^\d+-[\w-]+\.json$/.test(entries[0])) throw new Error(`Reviewer 锁无效，请检查 ${target}；未改动数据。`);
      const pid = Number(entries[0].split("-")[0]);
      if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Reviewer 锁中的进程号无效。");
      let alive = true;
      try { process.kill(pid, 0); } catch (error) { if (error.code === "ESRCH") alive = false; }
      if (alive) throw new Error("Reviewer 数据目录正由另一个操作或 AZT 实例使用，请稍后重试或关闭原实例。");
      await fs.unlink(path.join(target, entries[0])).catch((error) => { if (error.code !== "ENOENT") throw error; });
      await fs.rmdir(target).catch((error) => { if (!["ENOENT", "ENOTEMPTY"].includes(error.code)) throw error; });
    }
    if (!acquired) throw new Error("无法取得 Reviewer 数据锁，请稍后重试。");
  } finally {
    if (!acquired) { await fs.unlink(path.join(temporary, owner)); await fs.rmdir(temporary); }
  }
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await fs.unlink(path.join(target, owner));
    await fs.rmdir(target);
  };
}
