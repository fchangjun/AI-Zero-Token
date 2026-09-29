const params = new URLSearchParams(location.search);
const token = params.get("token") || "";
let responseId = params.get("response");
const scopeId = params.get("scope");

const elements = {
  title: document.getElementById("responseTitle"),
  status: document.getElementById("saveStatus"),
  empty: document.getElementById("emptyState"),
  recent: document.getElementById("recentResponses"),
  workspaceBar: document.getElementById("workspaceBar"),
  workspaceSummary: document.getElementById("workspaceSummary"),
  workspaceNote: document.getElementById("workspaceNote"),
  changeWorkspace: document.getElementById("changeWorkspace"),
  workspaceForm: document.getElementById("workspaceForm"),
  workspaceFormNote: document.getElementById("workspaceFormNote"),
  workspacePath: document.getElementById("workspacePath"),
  cancelWorkspace: document.getElementById("cancelWorkspace"),
  tabs: document.getElementById("reviewTabs"),
  responseTab: document.getElementById("responseTab"),
  fileTabs: document.getElementById("fileTabs"),
  surface: document.getElementById("reviewSurface"),
  response: document.getElementById("responseText"),
  filePanel: document.getElementById("filePanel"),
  fileTitle: document.getElementById("fileTitle"),
  fileMeta: document.getElementById("fileMeta"),
  fileLoading: document.getElementById("fileLoading"),
  fileCode: document.getElementById("fileCode"),
  form: document.getElementById("annotationForm"),
  target: document.getElementById("selectionTarget"),
  quote: document.getElementById("selectedQuote"),
  commentLabel: document.getElementById("annotationCommentLabel"),
  comment: document.getElementById("annotationComment"),
  add: document.getElementById("addAnnotation"),
  count: document.getElementById("annotationCount"),
  list: document.getElementById("annotationList"),
  copy: document.getElementById("copyPrompt"),
  insert: document.getElementById("insertIntoCodex"),
  toast: document.getElementById("toast"),
};

const allowedResponseTags = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "UL",
  "OL",
  "LI",
  "BLOCKQUOTE",
  "PRE",
  "CODE",
  "STRONG",
  "B",
  "EM",
  "I",
  "DEL",
  "S",
  "BR",
  "HR",
  "TABLE",
  "THEAD",
  "TBODY",
  "TFOOT",
  "TR",
  "TH",
  "TD",
  "DL",
  "DT",
  "DD",
  "DETAILS",
  "SUMMARY",
  "KBD",
  "SAMP",
  "SUB",
  "SUP",
]);
const discardedResponseTags = new Set([
  "SCRIPT",
  "STYLE",
  "SVG",
  "PATH",
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "OPTION",
  "VIDEO",
  "AUDIO",
  "CANVAS",
  "NOSCRIPT",
  "IFRAME",
  "OBJECT",
  "EMBED",
]);

let activeResponse = null;
let activeTarget = { type: "response", fileId: null };
let activeFile = null;
let activeAnnotationId = null;
let selectionDraft = null;
let fileSelectionAnchor = null;
let toastTimer = null;
const fileCache = new Map();

elements.response.addEventListener("mouseup", captureResponseSelection);
elements.response.addEventListener("keyup", captureResponseSelection);
elements.response.addEventListener("click", handleResponseClick);
elements.tabs.addEventListener("click", handleTabClick);
elements.fileCode.addEventListener("click", handleFileClick);
elements.fileCode.addEventListener("mouseup", captureFileTextSelection);
elements.form.addEventListener("submit", saveAnnotation);
elements.form.addEventListener("change", handleFormChange);
elements.list.addEventListener("click", handleAnnotationListClick);
elements.copy.addEventListener("click", copyPrompt);
elements.insert.addEventListener("click", insertIntoCodex);
elements.changeWorkspace.addEventListener("click", () => showWorkspaceForm());
elements.cancelWorkspace.addEventListener("click", hideWorkspaceForm);
elements.workspaceForm.addEventListener("submit", saveWorkspace);

initialize().catch(showError);

async function initialize() {
  if (!token) throw new Error("缺少本地访问令牌，请重新打开 Response Reviewer。");
  updateAnnotationMode();
  if (responseId) {
    const loaded = await waitForResponse(responseId, 30);
    if (loaded) return;
  }

  const query = new URLSearchParams();
  if (scopeId) query.set("scopeId", scopeId);
  const result = await api(`/api/responses?${query.toString()}`);
  if (result.responses.length > 0) {
    await selectResponse(result.responses[0].id);
  } else {
    renderEmpty([]);
  }
}

async function waitForResponse(id, attempts) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await selectResponse(id);
      return true;
    } catch (error) {
      if (!error.notFound) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  return false;
}

async function selectResponse(id, { target = null } = {}) {
  const result = await api(`/api/responses/${encodeURIComponent(id)}`);
  activeResponse = result.response;
  activeResponse.annotations = (activeResponse.annotations || []).map(
    (annotation) => ({
      kind: "comment",
      targetType: "response",
      ...annotation,
    }),
  );
  activeResponse.files ||= [];
  responseId = activeResponse.id;

  const nextUrl = new URL(location.href);
  nextUrl.searchParams.set("response", responseId);
  nextUrl.searchParams.set("scope", activeResponse.scopeId);
  history.replaceState(null, "", nextUrl);

  renderResponseShell();
  const requestedTarget = validTarget(target) ? target : { type: "response", fileId: null };
  await activateTarget(requestedTarget.type, requestedTarget.fileId);
}

function renderResponseShell() {
  elements.empty.hidden = true;
  elements.tabs.hidden = false;
  elements.surface.hidden = false;
  elements.title.textContent = activeResponse.title;
  renderWorkspaceContext();
  elements.response.replaceChildren(responseContentFragment(activeResponse));
  applyResponseAnnotationHighlights();
  renderTabs();
  renderAnnotationList();
  elements.copy.disabled = false;
  elements.insert.disabled = false;
  elements.status.textContent = "已保存到本地";
}

function renderEmpty(responses) {
  activeResponse = null;
  elements.empty.hidden = false;
  elements.tabs.hidden = true;
  elements.surface.hidden = true;
  elements.workspaceBar.hidden = true;
  elements.copy.disabled = true;
  elements.insert.disabled = true;
  elements.recent.replaceChildren(...responses.map(recentResponseNode));
}

function renderWorkspaceContext() {
  if (!activeResponse) return;
  elements.workspaceBar.hidden = false;
  elements.workspaceForm.hidden = true;
  const outsideFiles = activeResponse.files.filter((file) => !file.reviewable);
  elements.workspaceFormNote.textContent = activeResponse.threadKey
    ? "保存后会作为该 Codex 任务的文件访问边界，并重新校验此任务已有回复中的文件。"
    : "保存后只会作为当前回复的文件访问边界，并重新校验其中的文件。";
  if (!activeResponse.projectDir) {
    elements.workspaceBar.classList.add("needs-workspace");
    elements.workspaceSummary.textContent = activeResponse.files.length > 0
      ? "已识别文件，但未识别所属项目"
      : "尚未识别此任务的项目目录";
    elements.workspaceNote.textContent = activeResponse.threadKey
      ? "回复已保存，但在设置目录前不会读取任何本地文件；设置一次后会记住此任务。"
      : activeResponse.files.length > 0
        ? `已找到 ${activeResponse.files.length} 个文件引用，但回复没有携带项目目录或 Codex 任务 ID；确认目录后才会读取。`
        : "回复没有携带项目目录或 Codex 任务 ID；本次设置只会应用到当前回复。";
    elements.changeWorkspace.textContent = "设置目录";
    return;
  }

  elements.workspaceBar.classList.toggle("needs-workspace", outsideFiles.length > 0);
  elements.workspaceSummary.textContent = activeResponse.projectDir;
  elements.workspaceNote.textContent = outsideFiles.length > 0
    ? `${outsideFiles.length} 个文件不在这个目录内；如果项目绑定不正确，请更改目录。`
    : activeResponse.workspaceSource === "codex-project-metadata"
      ? "已从当前 Codex 任务自动识别；文件只能在此目录内读取。"
      : activeResponse.workspaceSource === "known-workspace-file-match"
        ? "已根据文件路径匹配到此前确认过的项目；文件只能在此目录内读取。"
        : activeResponse.workspaceSource === "user" && !activeResponse.threadKey
          ? "已为当前回复确认；未识别 Codex 任务 ID，因此不会自动应用到其他回复。"
      : "文件只能在这个任务目录内读取。";
  elements.changeWorkspace.textContent = "更改目录";
}

function showWorkspaceForm() {
  if (!activeResponse) return;
  elements.workspaceForm.hidden = false;
  elements.workspacePath.value = activeResponse.projectDir || "";
  elements.workspacePath.focus();
  elements.workspacePath.select();
}

function hideWorkspaceForm() {
  elements.workspaceForm.hidden = true;
}

async function saveWorkspace(event) {
  event.preventDefault();
  if (!activeResponse) return;
  const projectDir = elements.workspacePath.value.trim();
  if (!projectDir) {
    elements.workspacePath.focus();
    return;
  }
  try {
    elements.status.textContent = "正在校验项目目录…";
    await api(`/api/responses/${encodeURIComponent(responseId)}/workspace`, {
      method: "PATCH",
      body: { projectDir, source: "user" },
    });
    for (const key of [...fileCache.keys()]) {
      if (key.startsWith(`${responseId}:`)) fileCache.delete(key);
    }
    await selectResponse(responseId, {
      target: { type: "response", fileId: null },
    });
    showToast("任务项目目录已更新，文件已重新校验");
  } catch (error) {
    elements.status.textContent = "目录设置失败";
    showToast(error.message || String(error));
    elements.workspacePath.focus();
  }
}

function responseContentFragment(response) {
  if (String(response.contentHtml || "").trim()) {
    const template = document.createElement("template");
    template.innerHTML = response.contentHtml;
    const fragment = document.createDocumentFragment();
    for (const child of template.content.childNodes) {
      fragment.append(safeResponseClone(child));
    }
    if (fragment.textContent.trim()) return fragment;
  }

  const fallback = document.createDocumentFragment();
  for (const block of String(response.content || "").split(/\n{2,}/)) {
    const paragraph = document.createElement("p");
    paragraph.className = "plain-response-block";
    paragraph.textContent = block;
    fallback.append(paragraph);
  }
  return fallback;
}

function safeResponseClone(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.data);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return document.createDocumentFragment();
  }

  const element = node;
  if (discardedResponseTags.has(element.tagName)) {
    return document.createDocumentFragment();
  }

  const fileId = element.getAttribute("data-review-file-id");
  if (fileId) {
    const reference = document.createElement("button");
    reference.type = "button";
    reference.className = "review-file-reference";
    reference.dataset.reviewFileId = fileId;
    reference.textContent = element.textContent || "项目文件";
    return reference;
  }

  let output;
  if (element.tagName === "A") {
    const href = element.getAttribute("href")?.trim() || "";
    if (/^(?:https?:|mailto:)/i.test(href)) {
      output = document.createElement("a");
      output.href = href;
      output.target = "_blank";
      output.rel = "noreferrer";
    } else {
      output = document.createDocumentFragment();
    }
  } else {
    output = allowedResponseTags.has(element.tagName)
      ? document.createElement(element.tagName.toLowerCase())
      : document.createDocumentFragment();
  }

  if (output.nodeType === Node.ELEMENT_NODE) {
    for (const attribute of ["start", "colspan", "rowspan", "open"]) {
      const value = element.getAttribute(attribute);
      if (value !== null) output.setAttribute(attribute, value || "");
    }
  }
  for (const child of element.childNodes) {
    output.append(safeResponseClone(child));
  }
  return output;
}

function recentResponseNode(response) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "recent-response";
  const title = document.createElement("strong");
  title.textContent = response.title;
  const excerpt = document.createElement("span");
  excerpt.textContent = response.excerpt;
  button.append(title, excerpt);
  button.addEventListener("click", () => selectResponse(response.id).catch(showError));
  return button;
}

function renderTabs() {
  const responseCount = annotationsFor({ type: "response" }).length;
  elements.responseTab.replaceChildren(
    document.createTextNode("回复"),
    countBadge(responseCount),
  );
  elements.fileTabs.replaceChildren(
    ...activeResponse.files.map((file) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "review-tab";
      button.dataset.targetType = "file";
      button.dataset.fileId = file.id;
      button.disabled = !file.reviewable;
      button.title = file.reviewable
        ? file.relativePath
        : file.reviewability === "workspace-unresolved"
          ? "请先设置此任务的项目目录"
          : "该文件不在当前任务的项目目录内，不能读取";
      const label = document.createElement("span");
      label.className = "review-tab-label";
      label.textContent = file.name;
      button.append(label, countBadge(annotationsFor({ type: "file", fileId: file.id }).length));
      return button;
    }),
  );
  updateActiveTab();
}

function countBadge(count) {
  const badge = document.createElement("span");
  badge.className = "tab-count";
  badge.textContent = String(count);
  badge.hidden = count === 0;
  return badge;
}

async function activateTarget(type, fileId = null) {
  if (!activeResponse) return;
  const nextTarget = type === "file"
    ? { type: "file", fileId }
    : { type: "response", fileId: null };
  if (!validTarget(nextTarget)) return;

  const activeAnnotation = openAnnotations().find(
    (annotation) => annotation.id === activeAnnotationId,
  );
  if (activeAnnotation && !annotationMatchesTarget(activeAnnotation, nextTarget)) {
    activeAnnotationId = null;
  }

  activeTarget = nextTarget;
  selectionDraft = null;
  fileSelectionAnchor = null;
  clearNativeSelection();
  clearSelectedFileLines();
  updateActiveTab();
  updateActiveAnnotationStyles();
  updateSelectionSummary();

  const reviewingFile = activeTarget.type === "file";
  elements.surface.classList.toggle("is-file-view", reviewingFile);
  elements.response.hidden = reviewingFile;
  elements.filePanel.hidden = !reviewingFile;
  if (reviewingFile) await loadActiveFile();
}

function validTarget(target) {
  if (!activeResponse || !target) return false;
  if (target.type === "response") return true;
  return activeResponse.files.some(
    (file) => file.id === target.fileId && file.reviewable,
  );
}

function updateActiveTab() {
  const buttons = elements.tabs.querySelectorAll("[data-target-type]");
  for (const button of buttons) {
    const active = button.dataset.targetType === activeTarget.type &&
      (activeTarget.type === "response" || button.dataset.fileId === activeTarget.fileId);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

async function loadActiveFile() {
  const descriptor = activeResponse.files.find(
    (file) => file.id === activeTarget.fileId,
  );
  if (!descriptor) return;

  elements.fileTitle.textContent = descriptor.relativePath;
  elements.fileMeta.textContent = "";
  elements.fileLoading.hidden = false;
  elements.fileCode.replaceChildren();
  try {
    const cacheKey = `${responseId}:${descriptor.id}`;
    if (!fileCache.has(cacheKey)) {
      const result = await api(
        `/api/responses/${encodeURIComponent(responseId)}/files/${encodeURIComponent(descriptor.id)}`,
      );
      fileCache.set(cacheKey, result.file);
    }
    if (activeTarget.fileId !== descriptor.id) return;
    activeFile = fileCache.get(cacheKey);
    renderFile(activeFile);
  } catch (error) {
    activeFile = null;
    const message = document.createElement("div");
    message.className = "file-error";
    message.textContent = error.message;
    elements.fileCode.replaceChildren(message);
  } finally {
    elements.fileLoading.hidden = true;
  }
}

function renderFile(file) {
  const lines = file.content.split("\n");
  elements.fileTitle.textContent = file.path;
  elements.fileMeta.textContent = `${file.language} · ${formatBytes(file.size)} · ${lines.length} 行`;
  const annotations = annotationsFor({ type: "file", fileId: file.id });
  const fragment = document.createDocumentFragment();

  lines.forEach((content, index) => {
    const lineNumber = index + 1;
    const row = document.createElement("div");
    row.className = "file-line";
    row.dataset.line = String(lineNumber);
    row.setAttribute("role", "listitem");

    const number = document.createElement("button");
    number.type = "button";
    number.className = "line-number";
    number.dataset.selectLine = String(lineNumber);
    number.textContent = String(lineNumber);
    number.setAttribute("aria-label", `选择第 ${lineNumber} 行`);

    const touching = annotations.filter((annotation) => {
      if (!annotation.lineStart) return false;
      const start = annotation.lineStart;
      const end = annotation.lineEnd || start;
      return lineNumber >= start && lineNumber <= end;
    });
    if (touching.length > 0) {
      row.classList.add("has-annotation");
      row.dataset.annotationIds = touching.map((annotation) => annotation.id).join(",");
    }

    const markers = document.createElement("span");
    markers.className = "line-markers";
    for (const annotation of touching.filter(
      (candidate) => (candidate.lineStart || 1) === lineNumber,
    )) {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "line-annotation-marker";
      marker.dataset.focusAnnotation = annotation.id;
      marker.textContent = String(annotationIndex(annotation.id) + 1);
      marker.title = "查看批注";
      markers.append(marker);
    }

    const code = document.createElement("span");
    code.className = "line-content";
    code.textContent = content || "\u200b";
    row.append(number, markers, code);
    fragment.append(row);
  });

  elements.fileCode.replaceChildren(fragment);
  const descriptor = activeResponse.files.find((candidate) => candidate.id === file.id);
  if (descriptor?.lineStart) {
    requestAnimationFrame(() => {
      elements.fileCode
        .querySelector(`[data-line="${descriptor.lineStart}"]`)
        ?.scrollIntoView({ block: "center" });
    });
  }
}

function renderAnnotationList() {
  const annotations = openAnnotations();
  elements.count.textContent = String(annotations.length);
  elements.list.replaceChildren(...annotations.map(annotationNode));
}

function annotationNode(annotation, index) {
  const item = document.createElement("li");
  item.className = "annotation-item";
  item.dataset.annotationId = annotation.id;

  const focus = document.createElement("button");
  focus.type = "button";
  focus.className = "annotation-focus";
  focus.dataset.focusAnnotation = annotation.id;

  const heading = document.createElement("span");
  heading.className = "annotation-item-heading";
  const number = document.createElement("span");
  number.className = "annotation-number";
  number.textContent = String(index + 1);
  const target = document.createElement("span");
  target.className = "annotation-target-label";
  target.textContent = annotationTargetLabel(annotation);
  const kind = document.createElement("span");
  kind.className = `annotation-kind-badge is-${annotation.kind}`;
  kind.textContent = annotation.kind === "suggestion" ? "建议替换" : "评论";
  heading.append(number, target, kind);
  focus.append(heading);

  if (annotation.quote) {
    const quote = document.createElement("span");
    quote.className = "annotation-quote";
    quote.textContent = `“${annotation.quote}”`;
    focus.append(quote);
  }

  const comment = document.createElement("span");
  comment.className = "annotation-comment";
  comment.textContent = annotation.comment;
  focus.append(comment);

  const footer = document.createElement("footer");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "delete-annotation";
  remove.dataset.deleteAnnotation = annotation.id;
  remove.textContent = "删除";
  footer.append(remove);
  item.append(focus, footer);
  return item;
}

function applyResponseAnnotationHighlights() {
  const annotations = annotationsFor({ type: "response" });
  if (annotations.length === 0) return;
  const fullText = elements.response.textContent;
  const ranges = annotations
    .map((annotation) => ({
      annotation,
      ...resolvedResponseRange(annotation, fullText),
    }))
    .filter((entry) => entry.start !== null && entry.end > entry.start);
  if (ranges.length === 0) return;

  const walker = document.createTreeWalker(elements.response, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let offset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const start = offset;
    offset += node.data.length;
    textNodes.push({ node, start, end: offset });
  }

  const markerPlaced = new Set();
  for (const entry of textNodes) {
    const touching = ranges.filter(
      (range) => range.start < entry.end && range.end > entry.start,
    );
    if (touching.length === 0) continue;
    const boundaries = new Set([0, entry.node.data.length]);
    for (const range of touching) {
      boundaries.add(Math.max(0, range.start - entry.start));
      boundaries.add(Math.min(entry.node.data.length, range.end - entry.start));
    }
    const points = [...boundaries].sort((left, right) => left - right);
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < points.length - 1; index += 1) {
      const localStart = points[index];
      const localEnd = points[index + 1];
      if (localEnd <= localStart) continue;
      const text = entry.node.data.slice(localStart, localEnd);
      const globalStart = entry.start + localStart;
      const globalEnd = entry.start + localEnd;
      const covering = touching.filter(
        (range) => range.start <= globalStart && range.end >= globalEnd,
      );
      if (covering.length === 0) {
        fragment.append(document.createTextNode(text));
        continue;
      }
      const mark = document.createElement("mark");
      mark.className = "annotation-highlight";
      mark.dataset.annotationIds = covering
        .map((range) => range.annotation.id)
        .join(",");
      const freshMarkers = covering.filter(
        (range) => !markerPlaced.has(range.annotation.id),
      );
      if (freshMarkers.length > 0) {
        mark.dataset.marker = freshMarkers
          .map((range) => annotationIndex(range.annotation.id) + 1)
          .join(",");
        freshMarkers.forEach((range) => markerPlaced.add(range.annotation.id));
      }
      mark.textContent = text;
      fragment.append(mark);
    }
    entry.node.replaceWith(fragment);
  }
}

function resolvedResponseRange(annotation, fullText) {
  const quote = String(annotation.quote || "");
  if (
    Number.isInteger(annotation.start) &&
    Number.isInteger(annotation.end) &&
    annotation.start >= 0 &&
    annotation.end <= fullText.length &&
    annotation.end > annotation.start
  ) {
    const selected = fullText.slice(annotation.start, annotation.end);
    if (!quote || selected === quote || selected.trim() === quote.trim()) {
      return { start: annotation.start, end: annotation.end };
    }
  }
  if (quote) {
    const start = fullText.indexOf(quote);
    if (start >= 0) return { start, end: start + quote.length };
  }
  return { start: null, end: null };
}

function captureResponseSelection() {
  if (!activeResponse || activeTarget.type !== "response") return;
  const draft = selectionFrom(elements.response);
  if (!draft) return;
  selectionDraft = { targetType: "response", ...draft };
  updateSelectionSummary();
  elements.comment.focus();
}

function selectionFrom(container) {
  const selection = getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (
    !container.contains(range.startContainer) ||
    !container.contains(range.endContainer)
  ) {
    return null;
  }
  const rawQuote = range.toString();
  const quote = rawQuote.trim();
  if (!quote) return null;
  const prefixRange = range.cloneRange();
  prefixRange.selectNodeContents(container);
  prefixRange.setEnd(range.startContainer, range.startOffset);
  const leadingWhitespace = rawQuote.length - rawQuote.trimStart().length;
  const trailingWhitespace = rawQuote.length - rawQuote.trimEnd().length;
  const start = prefixRange.toString().length + leadingWhitespace;
  return {
    quote,
    start,
    end: start + rawQuote.length - leadingWhitespace - trailingWhitespace,
  };
}

function captureFileTextSelection() {
  if (!activeFile || activeTarget.type !== "file") return;
  const selection = getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (
    !elements.fileCode.contains(range.startContainer) ||
    !elements.fileCode.contains(range.endContainer)
  ) {
    return;
  }
  const startRow = lineRowFor(range.startContainer);
  const endRow = lineRowFor(range.endContainer);
  if (!startRow || !endRow) return;
  const quote = range.toString().trim();
  if (!quote) return;
  const first = Number(startRow.dataset.line);
  const last = Number(endRow.dataset.line);
  setFileSelection(Math.min(first, last), Math.max(first, last), quote);
  elements.comment.focus();
}

function handleResponseClick(event) {
  const fileReference = event.target.closest("[data-review-file-id]");
  if (fileReference) {
    const descriptor = activeResponse.files.find(
      (file) => file.id === fileReference.dataset.reviewFileId,
    );
    if (!descriptor?.reviewable) {
      if (!activeResponse.projectDir || descriptor?.reviewability === "workspace-unresolved") {
        showWorkspaceForm();
        showToast("请先设置此任务的项目目录");
      } else {
        showToast("该文件不在当前任务的项目目录内，不能读取");
      }
      return;
    }
    activateTarget("file", descriptor.id).catch(showError);
    return;
  }

  const mark = event.target.closest("[data-annotation-ids]");
  const annotationId = mark?.dataset.annotationIds?.split(",")[0];
  if (annotationId) focusAnnotation(annotationId, { source: "content" }).catch(showError);
}

function handleTabClick(event) {
  const button = event.target.closest("[data-target-type]");
  if (!button || button.disabled) return;
  activateTarget(button.dataset.targetType, button.dataset.fileId || null).catch(showError);
}

function handleFileClick(event) {
  const annotationButton = event.target.closest("[data-focus-annotation]");
  if (annotationButton) {
    focusAnnotation(annotationButton.dataset.focusAnnotation, { source: "content" }).catch(showError);
    return;
  }
  const lineButton = event.target.closest("[data-select-line]");
  if (!lineButton || !activeFile) return;
  const line = Number(lineButton.dataset.selectLine);
  if (event.shiftKey && fileSelectionAnchor) {
    const start = Math.min(fileSelectionAnchor, line);
    const end = Math.max(fileSelectionAnchor, line);
    setFileSelection(start, end);
  } else {
    fileSelectionAnchor = line;
    setFileSelection(line, line);
  }
  clearNativeSelection();
}

function setFileSelection(lineStart, lineEnd, selectedQuote = null) {
  if (!activeFile) return;
  const lines = activeFile.content.split("\n");
  const quote = (selectedQuote || lines.slice(lineStart - 1, lineEnd).join("\n"))
    .replace(/^\n+|\n+$/g, "");
  selectionDraft = {
    targetType: "file",
    fileId: activeFile.id,
    lineStart,
    lineEnd,
    quote,
  };
  for (const row of elements.fileCode.querySelectorAll("[data-line]")) {
    const line = Number(row.dataset.line);
    row.classList.toggle("is-selected", line >= lineStart && line <= lineEnd);
  }
  updateSelectionSummary();
}

async function saveAnnotation(event) {
  event.preventDefault();
  if (!activeResponse) return;
  const comment = elements.comment.value.trim();
  if (!comment) {
    elements.comment.focus();
    return;
  }

  const kind = elements.form.querySelector(
    'input[name="annotationKind"]:checked',
  )?.value || "comment";
  const baseTarget = activeTarget.type === "file"
    ? { targetType: "file", fileId: activeTarget.fileId }
    : { targetType: "response" };
  const target = { ...activeTarget };
  elements.status.textContent = "正在保存…";
  await api(`/api/responses/${encodeURIComponent(responseId)}/annotations`, {
    method: "POST",
    body: { ...baseTarget, ...(selectionDraft || {}), kind, comment },
  });
  elements.comment.value = "";
  await selectResponse(responseId, { target });
  showToast(kind === "suggestion" ? "替换建议已保存" : "评论已保存");
}

async function handleAnnotationListClick(event) {
  const deleteButton = event.target.closest("[data-delete-annotation]");
  if (deleteButton) {
    await deleteAnnotation(deleteButton.dataset.deleteAnnotation);
    return;
  }
  const focusButton = event.target.closest("[data-focus-annotation]");
  if (focusButton) {
    await focusAnnotation(focusButton.dataset.focusAnnotation, { source: "list" });
  }
}

async function deleteAnnotation(annotationId) {
  if (!activeResponse) return;
  const target = { ...activeTarget };
  await api(
    `/api/responses/${encodeURIComponent(responseId)}/annotations/${encodeURIComponent(annotationId)}`,
    { method: "DELETE" },
  );
  if (activeAnnotationId === annotationId) activeAnnotationId = null;
  await selectResponse(responseId, { target });
  showToast("批注已删除");
}

async function focusAnnotation(annotationId, { source } = {}) {
  const annotation = openAnnotations().find((candidate) => candidate.id === annotationId);
  if (!annotation) return;
  activeAnnotationId = annotationId;
  if (annotation.targetType === "file") {
    await activateTarget("file", annotation.fileId);
    const row = elements.fileCode.querySelector(
      `[data-line="${annotation.lineStart || 1}"]`,
    );
    pulse(row);
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
  } else {
    await activateTarget("response");
    const mark = [...elements.response.querySelectorAll("[data-annotation-ids]")]
      .find((candidate) => candidate.dataset.annotationIds.split(",").includes(annotationId));
    pulse(mark);
    mark?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  updateActiveAnnotationStyles();
  if (source === "content") {
    const item = elements.list.querySelector(`[data-annotation-id="${annotationId}"]`);
    item?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function updateActiveAnnotationStyles() {
  for (const item of elements.list.querySelectorAll("[data-annotation-id]")) {
    item.classList.toggle(
      "is-active",
      item.dataset.annotationId === activeAnnotationId,
    );
  }
  for (const mark of elements.response.querySelectorAll("[data-annotation-ids]")) {
    mark.classList.toggle(
      "is-active",
      mark.dataset.annotationIds.split(",").includes(activeAnnotationId),
    );
  }
}

function handleFormChange(event) {
  if (event.target.name === "annotationKind") updateAnnotationMode();
}

function updateAnnotationMode() {
  const suggestion = elements.form.querySelector(
    'input[name="annotationKind"]:checked',
  )?.value === "suggestion";
  elements.commentLabel.textContent = suggestion ? "建议替换为" : "审阅意见";
  elements.comment.placeholder = suggestion
    ? "填写希望替换成的内容或明确的改写要求…"
    : "写下希望修改、补充或核对的地方…";
  elements.add.textContent = suggestion ? "添加替换建议" : "添加评论";
}

function updateSelectionSummary() {
  if (!activeResponse) return;
  if (selectionDraft?.targetType === "file") {
    const file = activeResponse.files.find(
      (candidate) => candidate.id === selectionDraft.fileId,
    );
    elements.target.textContent = `${file?.relativePath || "文件"} · L${selectionDraft.lineStart}${selectionDraft.lineEnd !== selectionDraft.lineStart ? `–L${selectionDraft.lineEnd}` : ""}`;
    elements.quote.textContent = selectionDraft.quote
      ? `“${shorten(selectionDraft.quote, 240)}”`
      : "已选择文件行";
    return;
  }
  if (selectionDraft?.targetType === "response") {
    elements.target.textContent = "回复选段";
    elements.quote.textContent = `“${shorten(selectionDraft.quote, 240)}”`;
    return;
  }
  if (activeTarget.type === "file") {
    const file = activeResponse.files.find((candidate) => candidate.id === activeTarget.fileId);
    elements.target.textContent = file?.relativePath || "文件整体";
    elements.quote.textContent = "未选择行，将添加文件整体意见";
  } else {
    elements.target.textContent = "回复整体";
    elements.quote.textContent = "未选择原文，将添加整体意见";
  }
}

function annotationsFor(target) {
  return openAnnotations().filter((annotation) => {
    if (target.type === "response") return annotation.targetType !== "file";
    return annotation.targetType === "file" && annotation.fileId === target.fileId;
  });
}

function openAnnotations() {
  return (activeResponse?.annotations || []).filter(
    (annotation) => annotation.status !== "resolved",
  );
}

function annotationIndex(annotationId) {
  return openAnnotations().findIndex((annotation) => annotation.id === annotationId);
}

function annotationTargetLabel(annotation) {
  if (annotation.targetType !== "file") return "回复";
  const range = annotation.lineStart
    ? ` · L${annotation.lineStart}${annotation.lineEnd && annotation.lineEnd !== annotation.lineStart ? `–L${annotation.lineEnd}` : ""}`
    : "";
  return `${annotation.filePath || "文件"}${range}`;
}

function annotationMatchesTarget(annotation, target) {
  if (target.type === "response") return annotation.targetType !== "file";
  return annotation.targetType === "file" && annotation.fileId === target.fileId;
}

async function copyPrompt() {
  try {
    const prompt = await compiledPrompt();
    await copyText(prompt);
    showToast("审阅指令已复制");
  } catch (error) {
    showToast(`复制失败：${shorten(error.message || String(error), 100)}`);
  }
}

async function insertIntoCodex() {
  if (!activeResponse) return;
  const idleLabel = elements.insert.textContent;
  elements.insert.disabled = true;
  elements.insert.textContent = "正在打开…";

  try {
    if (!activeResponse.threadKey) {
      showToast("无法定位对应的 Codex 任务，请使用“复制指令”");
      return;
    }

    await api(`/api/responses/${encodeURIComponent(responseId)}/composer`, {
      method: "POST",
      body: {},
    });
    showToast("已请求打开对应任务并预填；请检查输入框，未出现时使用“复制指令”。不会自动发送。");
  } catch (error) {
    const detail = shorten(error.message || String(error), 100);
    showToast(`未能放入输入框，请使用“复制指令”：${detail}`);
  } finally {
    elements.insert.disabled = false;
    elements.insert.textContent = idleLabel;
  }
}

async function compiledPrompt() {
  const result = await api(`/api/responses/${encodeURIComponent(responseId)}/prompt`);
  return result.prompt;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; }
    catch { /* Sandboxed frames may require the selection-based fallback. */ }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  try {
    if (!document.execCommand("copy")) throw new Error("请检查剪贴板权限，或在独立窗口中打开审阅工作台后重试。");
  } finally { textarea.remove(); }
}

async function api(path, options = {}) {
  const headers = {
    "x-response-reviewer-token": token,
    ...(options.headers || {}),
  };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `请求失败：HTTP ${response.status}`);
    error.notFound = response.status === 404;
    throw error;
  }
  return payload;
}

function clearSelectedFileLines() {
  for (const row of elements.fileCode.querySelectorAll(".is-selected")) {
    row.classList.remove("is-selected");
  }
}

function clearNativeSelection() {
  getSelection()?.removeAllRanges();
}

function lineRowFor(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return element?.closest("[data-line]") || null;
}

function pulse(element) {
  if (!element) return;
  element.classList.remove("is-pulsing");
  requestAnimationFrame(() => element.classList.add("is-pulsing"));
  setTimeout(() => element.classList.remove("is-pulsing"), 1100);
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function shorten(value, limit) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 2800);
}

function showError(error) {
  elements.status.textContent = "发生错误";
  showToast(error.message || String(error));
}
