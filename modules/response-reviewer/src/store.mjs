import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataRoot, resolveProjectDir, storePath } from "./paths.mjs";
import { acquireLock } from "./lock.mjs";

const maxReviewFileBytes = 2 * 1024 * 1024;

const emptyStore = () => ({
  version: 2,
  projects: {},
  workspaceBindings: {},
  responses: {},
  outbox: [],
  updatedAt: new Date().toISOString(),
});

let writeQueue = Promise.resolve();

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const validId = (value) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value) && !["__proto__", "constructor", "prototype"].includes(value);

export function normalizeStoredResponse(id, item) {
  const invalid = () => { throw new Error(`Reviewer 记录 ${id} 无效；原数据未覆盖。`); };
  if (!validId(id) || !record(item) || item.id !== id || typeof item.content !== "string" || !Array.isArray(item.annotations)) invalid();
  for (const field of ["title", "contentHtml", "scopeId", "projectDir", "workspaceSource", "threadKey", "turnKey", "sourceUrl"]) {
    if (item[field] != null && typeof item[field] !== "string") invalid();
  }
  for (const field of ["createdAt", "updatedAt"]) {
    if (item[field] != null && (typeof item[field] !== "string" || !Number.isFinite(Date.parse(item[field])))) invalid();
  }
  for (const annotation of item.annotations) {
    if (!record(annotation) || typeof annotation.id !== "string" || typeof annotation.comment !== "string") invalid();
    for (const field of ["quote", "kind", "targetType", "fileId", "filePath", "status", "createdAt"]) {
      if (annotation[field] != null && typeof annotation[field] !== "string") invalid();
    }
    for (const field of ["start", "end", "lineStart", "lineEnd"]) {
      if (annotation[field] != null && (!Number.isSafeInteger(annotation[field]) || annotation[field] < 0)) invalid();
    }
  }
  if (item.files != null && !Array.isArray(item.files)) invalid();
  for (const file of item.files || []) {
    if (!record(file) || typeof file.id !== "string" || typeof file.path !== "string") invalid();
    for (const field of ["name", "relativePath", "reviewability"]) {
      if (file[field] != null && typeof file[field] !== "string") invalid();
    }
  }
  return { ...item, title: item.title || "Codex response", contentHtml: item.contentHtml || "", files: item.files || [],
    scopeId: item.scopeId || unresolvedScopeId(item.threadKey, id), projectDir: item.projectDir || null, threadKey: item.threadKey || null,
    createdAt: item.createdAt || item.updatedAt || new Date(0).toISOString(), updatedAt: item.updatedAt || item.createdAt || new Date(0).toISOString() };
}

export async function readStore() {
  try {
    const parsed = JSON.parse(await fs.readFile(storePath(), "utf8"));
    if (!record(parsed) || ![1, 2].includes(parsed.version) || !record(parsed.responses)) throw new Error("Reviewer 数据格式无效；原文件未覆盖。");
    for (const field of ["projects", "workspaceBindings"]) {
      if (parsed[field] != null && (!record(parsed[field]) || Object.keys(parsed[field]).some((key) => !validId(key)))) throw new Error(`Reviewer ${field} 数据无效。`);
    }
    const responses = Object.fromEntries(Object.entries(parsed.responses).map(([id, item]) => [id, normalizeStoredResponse(id, item)]));
    return {
      ...emptyStore(),
      ...parsed,
      version: 2,
      projects: parsed.projects || {},
      workspaceBindings: parsed.workspaceBindings || {},
      responses,
      outbox: Array.isArray(parsed.outbox) ? parsed.outbox : [],
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return emptyStore();
    }
    throw error;
  }
}

async function writeStoreNow(store) {
  await fs.mkdir(dataRoot(), { recursive: true, mode: 0o700 });
  store.updatedAt = new Date().toISOString();
  const target = storePath();
  const temporary = path.join(
    path.dirname(target),
    `.store-${process.pid}-${Date.now()}.json`,
  );
  await fs.writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, {
    mode: 0o600,
  });
  await fs.rename(temporary, target);
  await fs.chmod(target, 0o600).catch(() => {});
  return store;
}

export function updateStore(updater) {
  const operation = writeQueue.then(async () => {
    const release = await acquireLock(dataRoot(), "write");
    try {
    const store = await readStore();
    const result = await updater(store);
    await writeStoreNow(store);
    return result;
    } finally { await release(); }
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

function shortHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 20);
}

export function scopeIdFor(projectDir, threadKey = null) {
  if (!String(projectDir || "").trim()) {
    throw new Error("Project directory is required for a project scope.");
  }
  const project = resolveProjectDir(projectDir);
  return shortHash(`${project}\n${threadKey || "default"}`);
}

export async function registerProject({ projectDir, threadKey = null }) {
  const resolvedProjectDir = await validateProjectDir(projectDir);
  const scopeId = scopeIdFor(resolvedProjectDir, threadKey);
  await updateStore((store) => {
    store.projects[scopeId] = {
      scopeId,
      projectDir: resolvedProjectDir,
      threadKey: threadKey || null,
      updatedAt: new Date().toISOString(),
    };
    rememberWorkspaceBinding(store, {
      threadKey,
      projectDir: resolvedProjectDir,
      source: "explicit",
    });
  });
  return {
    scopeId,
    projectDir: resolvedProjectDir,
    threadKey: threadKey || null,
  };
}

export async function getWorkspaceBinding(threadKey) {
  const normalizedThreadKey = normalizedKey(threadKey);
  if (!normalizedThreadKey) return null;
  const store = await readStore();
  const binding = store.workspaceBindings[workspaceBindingId(normalizedThreadKey)];
  return binding?.threadKey === normalizedThreadKey ? binding : null;
}

export async function saveResponse(input) {
  if (!record(input) || typeof input.content !== "string") throw httpError(400, "Response must contain text content.");
  for (const field of ["id", "title", "contentHtml", "projectDir", "workspaceSource", "threadKey", "turnKey", "sourceUrl"]) {
    if (input[field] != null && typeof input[field] !== "string") throw httpError(400, `Invalid ${field}.`);
  }
  const content = String(input.content || "").trim();
  if (!content) throw new Error("Response content is required.");
  const requestedSource = normalizedWorkspaceSource(input.workspaceSource);
  let requestedProjectDir = null;
  if (String(input.projectDir || "").trim()) {
    try {
      requestedProjectDir = await validateProjectDir(input.projectDir);
    } catch (error) {
      if (requestedSource !== "codex-project-metadata") throw error;
    }
  }
  const requestedThreadKey = normalizedKey(input.threadKey);
  const now = new Date().toISOString();

  return updateStore((store) => {
    const inferredWorkspace = requestedProjectDir
      ? null
      : inferKnownWorkspaceFromFiles(store, input.files);
    const proposedProjectDir = requestedProjectDir || inferredWorkspace?.projectDir || null;
    const proposedSource = requestedProjectDir
      ? requestedSource
      : inferredWorkspace
        ? "known-workspace-file-match"
        : null;
    const threadKey = requestedThreadKey || inferredWorkspace?.threadKey || null;
    const binding = threadKey
      ? store.workspaceBindings[workspaceBindingId(threadKey)]
      : null;
    const userBindingWins =
      binding?.threadKey === threadKey &&
      binding.source === "user" &&
      proposedSource !== "user";
    const projectDir = (userBindingWins ? binding.projectDir : proposedProjectDir) ||
      (binding?.threadKey === threadKey ? binding.projectDir : null);
    const scopeId = projectDir
      ? scopeIdFor(projectDir, threadKey)
      : unresolvedScopeId(threadKey, input.id);
    const id = String(
      input.id || shortHash(`${scopeId}\n${input.turnKey || ""}\n${content}`),
    );
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id) || ["__proto__", "constructor", "prototype"].includes(id)) {
      throw httpError(400, "Invalid response ID.");
    }

    if (projectDir) {
      store.projects[scopeId] = {
        scopeId,
        projectDir,
        threadKey,
        updatedAt: now,
      };
    }
    const preservesExistingBinding =
      proposedSource === "known-workspace-file-match" &&
      binding?.threadKey === threadKey;
    if (proposedProjectDir && !userBindingWins && !preservesExistingBinding) {
      rememberWorkspaceBinding(store, {
        threadKey,
        projectDir,
        source: proposedSource,
      });
    }
    const previous = store.responses[id];
    const response = {
      id,
      scopeId,
      projectDir,
      workspaceSource: userBindingWins
        ? binding.source
        : proposedProjectDir
          ? proposedSource
        : binding?.source || previous?.workspaceSource || null,
      threadKey,
      turnKey: input.turnKey || null,
      title: String(input.title || "Codex response"),
      content,
      contentHtml: String(input.contentHtml || previous?.contentHtml || ""),
      files: Array.isArray(input.files)
        ? normalizeReviewFiles(projectDir, input.files)
        : previous?.files || [],
      sourceUrl: input.sourceUrl || null,
      annotations: previous?.annotations || [],
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    };
    store.responses[id] = response;
    return response;
  });
}

export async function setResponseWorkspace(responseId, input) {
  if (!validId(responseId)) throw httpError(400, "Invalid response ID.");
  const projectDir = await validateProjectDir(input.projectDir);
  const source = normalizedWorkspaceSource(input.source || "user");
  const now = new Date().toISOString();
  return updateStore((store) => {
    const selected = store.responses[responseId];
    if (!selected) throw httpError(404, "Response was not found.");
    const related = selected.threadKey
      ? Object.values(store.responses).filter(
          (response) => response.threadKey === selected.threadKey,
        )
      : [selected];

    for (const response of related) {
      applyWorkspaceToResponse(response, projectDir, source, now);
      store.projects[response.scopeId] = {
        scopeId: response.scopeId,
        projectDir,
        threadKey: response.threadKey,
        updatedAt: now,
      };
    }
    rememberWorkspaceBinding(store, {
      threadKey: selected.threadKey,
      projectDir,
      source,
    });
    return store.responses[responseId];
  });
}

export async function listResponses({ scopeId = null, limit = 30 } = {}) {
  const store = await readStore();
  return Object.values(store.responses)
    .filter((response) => !scopeId || response.scopeId === scopeId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, Math.max(1, Math.min(Number(limit) || 30, 100)))
    .map(({ content, contentHtml, ...metadata }) => ({
      ...metadata,
      excerpt: content.slice(0, 180),
    }));
}

export async function getResponse(responseId) {
  if (!validId(responseId)) return null;
  const store = await readStore();
  return store.responses[responseId] || null;
}

export async function addAnnotation(responseId, input) {
  if (!validId(responseId)) throw httpError(400, "Invalid response ID.");
  const comment = String(input.comment || "").trim();
  if (!comment) throw new Error("Annotation comment is required.");
  return updateStore((store) => {
    const response = store.responses[responseId];
    if (!response) throw new Error("Response was not found.");
    const targetType = input.targetType === "file" ? "file" : "response";
    const file = targetType === "file"
      ? response.files?.find((candidate) => candidate.id === input.fileId)
      : null;
    if (targetType === "file" && !file) {
      throw new Error("Review file was not found on this response.");
    }
    const lineStart = positiveInteger(input.lineStart);
    const requestedLineEnd = positiveInteger(input.lineEnd);
    const start = nonNegativeInteger(input.start);
    const requestedEnd = nonNegativeInteger(input.end);
    const annotation = {
      id: crypto.randomUUID(),
      kind: input.kind === "suggestion" ? "suggestion" : "comment",
      targetType,
      fileId: file?.id || null,
      filePath: file?.relativePath || null,
      lineStart,
      lineEnd: lineStart
        ? Math.max(lineStart, requestedLineEnd || lineStart)
        : null,
      quote: String(input.quote || ""),
      start,
      end: start !== null && requestedEnd !== null && requestedEnd >= start
        ? requestedEnd
        : null,
      comment,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    response.annotations.push(annotation);
    response.updatedAt = new Date().toISOString();
    return annotation;
  });
}

export async function deleteAnnotation(responseId, annotationId) {
  if (!validId(responseId)) throw httpError(400, "Invalid response ID.");
  return updateStore((store) => {
    const response = store.responses[responseId];
    if (!response) throw new Error("Response was not found.");
    const before = response.annotations.length;
    response.annotations = response.annotations.filter(
      (annotation) => annotation.id !== annotationId,
    );
    response.updatedAt = new Date().toISOString();
    return before !== response.annotations.length;
  });
}

export function compileReviewPrompt(response) {
  const annotations = response.annotations.filter(
    (annotation) => annotation.status !== "resolved",
  );
  if (annotations.length === 0) {
    return "请重新检查并改进这条回复，重点关注准确性、完整性和可执行性。";
  }

  const lines = [
    "请根据下面的结构化审阅意见完成修改：回复类意见用于修订答复，文件类意见用于修改对应项目文件。只处理列出的范围，并保留未提及的内容。",
    "",
  ];
  annotations.forEach((annotation, index) => {
    const quote = compactQuote(annotation.quote);
    const actionLabel = annotation.kind === "suggestion"
      ? "建议替换"
      : "审阅意见";
    if (annotation.targetType === "file") {
      const lineRange = annotation.lineStart
        ? ` L${annotation.lineStart}${annotation.lineEnd && annotation.lineEnd !== annotation.lineStart ? `–L${annotation.lineEnd}` : ""}`
        : "";
      lines.push(`${index + 1}. 文件：${annotation.filePath || annotation.fileId}${lineRange}`);
      if (quote) lines.push(`   - 原文：${quote}`);
      lines.push(`   - ${actionLabel}：${annotation.comment}`);
    } else {
      lines.push(`${index + 1}. ${quote ? "回复选段" : "回复整体"}`);
      if (quote) lines.push(`   - 原文：${quote}`);
      lines.push(`   - ${actionLabel}：${annotation.comment}`);
    }
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}

export async function readResponseFile(responseId, fileId) {
  const response = await getResponse(responseId);
  if (!response) throw httpError(404, "Response was not found.");
  if (!response.projectDir) {
    throw httpError(409, "Set this task's project directory before reviewing files.");
  }
  const file = response.files?.find((candidate) => candidate.id === fileId);
  if (!file) throw httpError(404, "Review file was not found.");
  if (!file.reviewable) {
    throw httpError(403, "This file is outside the active project and cannot be reviewed.");
  }

  const projectRoot = await fs.realpath(response.projectDir).catch(() => response.projectDir);
  const realFilePath = await fs.realpath(file.path).catch((error) => {
    if (error?.code === "ENOENT") throw httpError(404, "Review file no longer exists.");
    throw error;
  });
  if (!isInside(projectRoot, realFilePath)) {
    throw httpError(403, "Review file resolved outside the active project.");
  }
  const stats = await fs.stat(realFilePath);
  if (!stats.isFile()) throw httpError(400, "Review target is not a regular file.");
  if (stats.size > maxReviewFileBytes) {
    throw httpError(413, "Review file is larger than 2 MB.");
  }
  const buffer = await fs.readFile(realFilePath);
  if (buffer.includes(0)) throw httpError(415, "Binary files are not supported yet.");
  let content;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw httpError(415, "Review file must be UTF-8 text.");
  }
  return {
    id: file.id,
    name: file.name,
    path: file.relativePath,
    content,
    size: stats.size,
    language: languageFor(file.path || file.name),
  };
}

export async function enqueuePrompt(responseId) {
  if (!validId(responseId)) throw httpError(400, "Invalid response ID.");
  return updateStore((store) => {
    const response = store.responses[responseId];
    if (!response) throw new Error("Response was not found.");
    const item = {
      id: crypto.randomUUID(),
      responseId,
      threadKey: response.threadKey,
      prompt: compileReviewPrompt(response),
      createdAt: new Date().toISOString(),
      acknowledgedAt: null,
    };
    store.outbox.push(item);
    return item;
  });
}

export async function nextOutboxItem(threadKey) {
  const store = await readStore();
  return (
    store.outbox.find(
      (item) =>
        !item.acknowledgedAt &&
        Boolean(item.threadKey) &&
        Boolean(threadKey) &&
        item.threadKey === threadKey,
    ) || null
  );
}

export async function acknowledgeOutboxItem(itemId) {
  return updateStore((store) => {
    const item = store.outbox.find((candidate) => candidate.id === itemId);
    if (!item) return false;
    item.acknowledgedAt = new Date().toISOString();
    return true;
  });
}

function normalizeReviewFiles(projectDir, files) {
  const seen = new Set();
  const normalized = [];
  for (const input of files.slice(0, 30)) {
    const descriptor = typeof input === "string" ? { path: input } : input || {};
    const target = localTargetFrom(descriptor.path || descriptor.href);
    if (!target) continue;
    const resolvedPath = projectDir
      ? path.resolve(projectDir, target.path)
      : path.isAbsolute(target.path)
        ? path.normalize(target.path)
        : target.path;
    if (seen.has(resolvedPath)) continue;
    seen.add(resolvedPath);
    const reviewable = Boolean(projectDir) && isInside(projectDir, resolvedPath);
    normalized.push({
      id: String(descriptor.id || shortHash(resolvedPath)),
      name: String(descriptor.name || descriptor.label || path.basename(resolvedPath)),
      path: resolvedPath,
      relativePath: reviewable
        ? path.relative(projectDir, resolvedPath) || path.basename(resolvedPath)
        : target.path,
      reviewable,
      reviewability: reviewable
        ? "inside-workspace"
        : projectDir
          ? "outside-workspace"
          : "workspace-unresolved",
      lineStart: positiveInteger(descriptor.lineStart) || target.lineStart,
      lineEnd: positiveInteger(descriptor.lineEnd) || target.lineEnd,
    });
  }
  return normalized;
}

function inferKnownWorkspaceFromFiles(store, files) {
  if (!Array.isArray(files)) return null;
  const absoluteTargets = files
    .map((input) => {
      const descriptor = typeof input === "string" ? { path: input } : input || {};
      return localTargetFrom(descriptor.path || descriptor.href)?.path || null;
    })
    .filter((target) => target && path.isAbsolute(target));
  if (absoluteTargets.length === 0) return null;

  const matchingProjects = Object.values(store.projects || {}).filter((project) =>
    project?.projectDir &&
    absoluteTargets.every((target) => isInside(project.projectDir, target)),
  );
  if (matchingProjects.length === 0) return null;

  const projectDir = matchingProjects
    .map((project) => path.resolve(project.projectDir))
    .sort((left, right) => right.length - left.length)[0];
  const threadKeys = [...new Set(
    matchingProjects
      .filter((project) => path.resolve(project.projectDir) === projectDir)
      .map((project) => normalizedKey(project.threadKey))
      .filter(Boolean),
  )];

  return {
    projectDir,
    threadKey: threadKeys.length === 1 ? threadKeys[0] : null,
  };
}

function applyWorkspaceToResponse(response, projectDir, source, now) {
  response.projectDir = projectDir;
  response.workspaceSource = source;
  response.scopeId = scopeIdFor(projectDir, response.threadKey);
  response.files = normalizeReviewFiles(projectDir, response.files || []);
  for (const annotation of response.annotations || []) {
    if (annotation.targetType !== "file") continue;
    const file = response.files.find((candidate) => candidate.id === annotation.fileId);
    if (file) annotation.filePath = file.relativePath;
  }
  response.updatedAt = now;
}

function rememberWorkspaceBinding(store, { threadKey, projectDir, source }) {
  const normalizedThreadKey = normalizedKey(threadKey);
  if (!normalizedThreadKey || !projectDir) return;
  const id = workspaceBindingId(normalizedThreadKey);
  store.workspaceBindings[id] = {
    id,
    threadKey: normalizedThreadKey,
    projectDir,
    source: normalizedWorkspaceSource(source),
    updatedAt: new Date().toISOString(),
  };
}

function workspaceBindingId(threadKey) {
  return shortHash(`workspace\n${threadKey}`);
}

function unresolvedScopeId(threadKey, responseId) {
  return shortHash(`unresolved\n${threadKey || responseId || "default"}`);
}

function normalizedKey(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizedWorkspaceSource(value) {
  const source = String(value || "").trim();
  return source || "explicit";
}

async function validateProjectDir(projectDir) {
  if (!String(projectDir || "").trim()) {
    throw httpError(400, "Project directory is required.");
  }
  const resolved = resolveProjectDir(projectDir);
  let stats;
  try {
    stats = await fs.stat(resolved);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw httpError(400, "Project directory does not exist.");
    }
    throw error;
  }
  if (!stats.isDirectory()) {
    throw httpError(400, "Project directory must be a directory.");
  }
  return resolved;
}

function localTargetFrom(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("file://")) {
    try {
      const url = new URL(raw);
      const lineRange = lineRangeFromHash(url.hash);
      url.hash = "";
      return { path: fileURLToPath(url), ...lineRange };
    } catch {
      return null;
    }
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return null;
  const hashMatch = raw.match(/#L(\d+)(?:-L?(\d+))?$/i);
  if (hashMatch) {
    return {
      path: raw.slice(0, hashMatch.index),
      lineStart: positiveInteger(hashMatch[1]),
      lineEnd: positiveInteger(hashMatch[2]) || positiveInteger(hashMatch[1]),
    };
  }
  const colonMatch = raw.match(/:(\d+)(?::\d+)?$/);
  if (colonMatch && /^(?:\.{0,2}\/|\/|[a-z]:[\\/])/i.test(raw)) {
    return {
      path: raw.slice(0, colonMatch.index),
      lineStart: positiveInteger(colonMatch[1]),
      lineEnd: positiveInteger(colonMatch[1]),
    };
  }
  return { path: raw, lineStart: null, lineEnd: null };
}

function isInside(projectDir, candidatePath) {
  const relative = path.relative(path.resolve(projectDir), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function lineRangeFromHash(hash) {
  const match = String(hash || "").match(/^#L(\d+)(?:-L?(\d+))?$/i);
  if (!match) return { lineStart: null, lineEnd: null };
  const lineStart = positiveInteger(match[1]);
  return {
    lineStart,
    lineEnd: positiveInteger(match[2]) || lineStart,
  };
}

function compactQuote(value, limit = 360) {
  const quote = String(value || "").trim().replace(/\s+/g, " ");
  if (quote.length <= limit) return quote;
  return `${quote.slice(0, limit - 1)}…`;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function languageFor(fileName) {
  const extension = path.extname(fileName).slice(1).toLowerCase();
  return ({
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    py: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    java: "java",
    swift: "swift",
    css: "css",
    html: "html",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    sh: "shell",
    zsh: "shell",
    sql: "sql",
  })[extension] || extension || "text";
}
