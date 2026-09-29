import { execFile } from "node:child_process";

const maxPromptBytes = 24 * 1024;
const threadKeyPattern = /^[A-Za-z0-9_-]{1,200}$/;

export function buildCodexComposerUrl({ threadKey, prompt } = {}) {
  const thread = String(threadKey || "").trim();
  const text = String(prompt || "").replaceAll("\u0000", "").trim();

  if (!thread) throw composerError(409, "当前审阅没有绑定 Codex 任务。");
  if (!threadKeyPattern.test(thread)) {
    throw composerError(400, "当前审阅绑定的 Codex 任务 ID 无效。");
  }
  if (!text) throw composerError(400, "没有可放入输入框的审阅指令。");
  if (Buffer.byteLength(text, "utf8") > maxPromptBytes) {
    throw composerError(413, "审阅指令过长，请使用“复制指令”。");
  }

  const url = new URL(`codex://threads/${encodeURIComponent(thread)}`);
  url.searchParams.set("prompt", text);
  return url.toString();
}

export async function openCodexComposer({
  threadKey,
  prompt,
  platform = process.platform,
  run = execFilePromise,
} = {}) {
  const url = buildCodexComposerUrl({ threadKey, prompt });
  const target = openerFor(platform, url);

  try {
    await run(target.command, target.args, {
      encoding: "utf8",
      maxBuffer: 64 * 1024,
      timeout: 10_000,
      windowsHide: true,
    });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw composerError(502, "未找到可打开 Codex 的系统命令。");
    }
    if (error?.killed || error?.signal) {
      throw composerError(504, "打开 Codex 输入框超时。");
    }
    throw composerError(502, "未能打开对应的 Codex 输入框。");
  }

  return { requested: true, prefilled: false, threadKey: String(threadKey).trim() };
}

function openerFor(platform, url) {
  if (platform === "darwin") return { command: "/usr/bin/open", args: [url] };
  if (platform === "win32") {
    return {
      command: "rundll32.exe",
      args: ["url.dll,FileProtocolHandler", url],
    };
  }
  if (platform === "linux") return { command: "xdg-open", args: [url] };
  throw composerError(501, "当前系统暂不支持自动打开 Codex 输入框。");
}

function execFilePromise(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function composerError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
