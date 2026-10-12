(() => {
  const MODULE_ID = "response-reviewer";
  const MARKER = "codex-response-reviewer";
  const namespace = (window.__aztReviewerModules ||= {});
  const nativeTabs = namespace[MODULE_ID]?.nativeTabs || new Map();
  namespace[MODULE_ID]?.destroy?.();

  const state = {
    active: true,
    // Keep the bridge protocol stable for an AZT process still running the
    // previous connector; revision controls feature upgrades after restart.
    version: 2,
    revision: 3,
    nativeTabs,
    config: window.__aztReviewerPendingConfig || {},
    observer: null,
    scanScheduled: false,
  };
  delete window.__aztReviewerPendingConfig;

  const exactCopyLabels = new Set(["复制", "Copy"]);
  const branchPattern = /分支|branch/i;
  const feedbackPattern = /回复优秀|回复不佳|good response|bad response|thumb/i;
  const semanticTags = new Set([
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
  const discardedTags = new Set([
    "BUTTON",
    "SCRIPT",
    "STYLE",
    "SVG",
    "PATH",
    "INPUT",
    "TEXTAREA",
    "SELECT",
    "OPTION",
    "IMG",
    "VIDEO",
    "AUDIO",
    "CANVAS",
    "NOSCRIPT",
  ]);

  function accessibleName(element) {
    return (
      element.getAttribute("aria-label") ||
      element.getAttribute("data-tooltip-content") ||
      element.getAttribute("title") ||
      element.textContent?.trim() ||
      ""
    );
  }

  function findActionGroup(copyButton) {
    let candidate = copyButton.parentElement;
    for (let depth = 0; candidate && depth < 5; depth += 1) {
      const buttons = [...candidate.querySelectorAll("button")];
      const labels = buttons.map(accessibleName);
      const looksLikeAssistantActions =
        buttons.includes(copyButton) &&
        buttons.length >= 3 &&
        (labels.some((label) => branchPattern.test(label)) ||
          labels.some((label) => feedbackPattern.test(label)));
      if (looksLikeAssistantActions) return candidate;
      candidate = candidate.parentElement;
    }
    return null;
  }

  function responseRootFor(actionGroup) {
    const actionBar = actionGroup.parentElement;
    const messageRoot = actionBar?.parentElement;
    if (!messageRoot) return null;
    const markdownRoots = [...messageRoot.querySelectorAll(
      '[data-markdown-text-style="assistant-message"]',
    )].filter((root) => !root.parentElement?.closest('[data-markdown-text-style="assistant-message"]'));
    if (markdownRoots.length === 1) return markdownRoots[0];
    if (markdownRoots.length > 1) {
      const combined = document.createElement("div");
      for (const root of markdownRoots) combined.append(root.cloneNode(true));
      return combined;
    }

    const clone = messageRoot.cloneNode(true);
    clone
      .querySelectorAll(
        `button, [data-${MARKER}], .${MARKER}-fallback, script, style`,
      )
      .forEach((element) => element.remove());
    return clone;
  }

  function responseSnapshotFor(actionGroup) {
    const responseRoot = responseRootFor(actionGroup);
    if (!responseRoot) return null;
    const files = reviewFilesFor(responseRoot);
    const fileIdsByPath = new Map(files.map((file) => [file.path, file.id]));
    const container = document.createElement("div");
    for (const child of responseRoot.childNodes) {
      container.append(semanticClone(child, fileIdsByPath));
    }
    const content = responseRoot.innerText
      .replace(/^ChatGPT\s*说[：:]\s*/i, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return {
      content,
      contentHtml: container.innerHTML.trim(),
      files,
    };
  }

  function reviewFilesFor(responseRoot) {
    const seen = new Set();
    const files = [];
    const candidates = responseRoot.querySelectorAll(
      "[data-prompt-link-href], [data-file-reference], a[href]",
    );
    for (const element of candidates) {
      const filePath = localFilePathFor(element);
      if (!filePath || seen.has(filePath)) continue;
      seen.add(filePath);
      const fallbackName = filePath.split(/[\\/]/).filter(Boolean).at(-1) || filePath;
      files.push({
        id: `codex-file-${files.length + 1}`,
        path: filePath,
        name:
          element.getAttribute("data-prompt-link-label") ||
          element.textContent?.trim() ||
          fallbackName,
      });
    }
    return files;
  }

  function localFilePathFor(element) {
    const promptHref = element.getAttribute("data-prompt-link-href");
    if (promptHref) return promptHref.trim();
    const href = element.getAttribute("href")?.trim();
    if (!href) return null;
    return /^(?:file:\/\/|\.{0,2}\/|\/|[a-z]:[\\/])/i.test(href)
      ? href
      : null;
  }

  function semanticClone(node, fileIdsByPath) {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.data);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return document.createDocumentFragment();
    }

    const element = node;
    const copyMode = element.getAttribute("data-markdown-copy");
    if (copyMode === "exclude") return document.createDocumentFragment();

    const filePath = localFilePathFor(element);
    const fileId = filePath ? fileIdsByPath.get(filePath) : null;
    if (fileId) {
      const reference = document.createElement("span");
      reference.className = "review-file-reference";
      reference.dataset.reviewFileId = fileId;
      reference.textContent =
        element.getAttribute("data-prompt-link-label") ||
        element.textContent?.trim() ||
        filePath.split(/[\\/]/).filter(Boolean).at(-1) ||
        filePath;
      return reference;
    }

    if (discardedTags.has(element.tagName)) {
      if (element.tagName === "IMG" && element.getAttribute("alt")) {
        return document.createTextNode(`[图片：${element.getAttribute("alt")}]`);
      }
      return document.createDocumentFragment();
    }
    // Codex now renders code with divs plus copy-text, not always PRE/CODE.
    if (copyMode === "code-block") {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = markdownCopyText(element);
      pre.append(code);
      return pre;
    }
    if (copyMode === "rich-block") {
      const content = element.querySelector("[data-markdown-copy-content]");
      return content ? semanticClone(content, fileIdsByPath) : document.createDocumentFragment();
    }

    let output;
    if (
      element.tagName === "SPAN" &&
      (element.getAttribute("data-markdown-copy") === "inline-code" ||
        String(element.className).includes("InlineMarkdown"))
    ) {
      output = document.createElement("code");
    } else if (element.tagName === "A") {
      const href = element.getAttribute("href")?.trim() || "";
      output = /^(?:https?:|mailto:)/i.test(href)
        ? document.createElement("a")
        : document.createDocumentFragment();
      if (output.nodeType === Node.ELEMENT_NODE) {
        output.setAttribute("href", href);
        output.setAttribute("target", "_blank");
        output.setAttribute("rel", "noreferrer");
      }
    } else {
      output = semanticTags.has(element.tagName)
        ? document.createElement(element.tagName.toLowerCase())
        : document.createDocumentFragment();
    }

    if (output.nodeType === Node.ELEMENT_NODE) {
      for (const attribute of ["start", "colspan", "rowspan"]) {
        const value = element.getAttribute(attribute);
        if (value) output.setAttribute(attribute, value);
      }
    }
    for (const child of element.childNodes) {
      output.append(semanticClone(child, fileIdsByPath));
    }
    return output;
  }

  function markdownCopyText(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE || node.getAttribute("data-markdown-copy") === "exclude") return "";
    const source = node.getAttribute("data-markdown-copy-text");
    if (source !== null) return source;
    if (node.tagName === "BR") return "\n";
    return [...node.childNodes].map(markdownCopyText).join("");
  }

  async function prefill({ threadKey, prompt } = {}) {
    const failure = (error) => ({ prefilled: false, error });
    const matchingTask = () => state.active && threadKey && activeThreadRow()?.getClientRects().length > 0 && currentTaskContext().threadKey === threadKey;
    if (!matchingTask()) return failure("当前任务已切换，未写入其他任务；请切回原任务重试。");
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 256 * 1024) return failure("审阅指令无效。");
    const editors = [...document.querySelectorAll('.ProseMirror[contenteditable="true"], [role="textbox"][contenteditable="true"], [role="textbox"][contenteditable="plaintext-only"]')]
      .filter((element) => element.getClientRects().length && element.getBoundingClientRect().width > 0 &&
        getComputedStyle(element).visibility !== "hidden" && !element.closest('[inert], [aria-hidden="true"]'));
    if (editors.length !== 1) return failure("无法唯一识别 Codex 输入框，请使用“复制指令”。");
    const editor = editors[0];
    // Chromium can represent spaces as NBSP and paragraph boundaries with an
    // extra blank line. Compare logical text, never just the success boolean.
    const normalize = (value) => value.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").replace(/\u200b/g, "").replace(/\n{2,}/g, "\n\n").trim();
    const text = () => normalize(editor.innerText);
    if (text() || editor.querySelector('img, [contenteditable="false"], [data-file-reference]')) {
      return failure("对应任务已有草稿，未覆盖或追加。请先处理草稿，再重试；也可复制指令自行合并。");
    }
    editor.focus();
    if (!matchingTask() || !editor.isConnected || text()) return failure("任务或草稿已变化，未写入，请重试。");
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    // Follow the editor's input/undo path. Never assign innerHTML, overwrite a
    // draft, synthesize Enter, click Send or replay a queued edit.
    const inserted = document.execCommand("insertText", false, prompt);
    await new Promise((resolve) => setTimeout(resolve, 80));
    if (!inserted || !matchingTask() || !editor.isConnected || text() !== normalize(prompt)) {
      return failure("未能确认完整写入，请检查 Codex 输入框；不会自动重试或发送。");
    }
    return { prefilled: true, threadKey };
  }

  function activeThreadRow() {
    const rows = [...document.querySelectorAll(
      "[data-app-action-sidebar-thread-row]",
    )].filter(
      (row) =>
        row.getAttribute("data-app-action-sidebar-thread-selected") === "true" ||
        row.getAttribute("aria-current") === "page",
    );
    return rows.find((row) => row.getClientRects().length > 0) || rows.at(-1) || null;
  }

  function localAbsolutePath(value) {
    const candidate = String(value || "").trim();
    return /^(?:\/|[a-z]:[\\/])/i.test(candidate) ? candidate : null;
  }

  function reactPropsFor(element) {
    const key = element && Object.keys(element).find(
      (candidate) => candidate.startsWith("__reactProps$"),
    );
    return key ? element[key] : null;
  }

  function conversationIdFor(threadRow) {
    const fiberKey = threadRow && Object.keys(threadRow).find(
      (candidate) => candidate.startsWith("__reactFiber$"),
    );
    let fiber = fiberKey ? threadRow[fiberKey] : null;
    for (let depth = 0; fiber && depth < 14; depth += 1, fiber = fiber.return) {
      for (const props of [fiber.pendingProps, fiber.memoizedProps]) {
        const candidate =
          props?.conversationId ||
          props?.entry?.conversationId ||
          props?.thread?.conversationId;
        if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(candidate || "")) {
          return candidate;
        }
      }
    }

    const rowKey = threadRow?.getAttribute("data-app-action-sidebar-thread-id") || "";
    const localMatch = rowKey.match(/^local:([0-9a-f-]{36})$/i);
    return localMatch?.[1] || rowKey || null;
  }

  function threadWorkspacePathFor(threadRow) {
    const fiberKey = threadRow && Object.keys(threadRow).find(
      (candidate) => candidate.startsWith("__reactFiber$"),
    );
    let fiber = fiberKey ? threadRow[fiberKey] : null;
    const fallbacks = [];
    for (let depth = 0; fiber && depth < 14; depth += 1, fiber = fiber.return) {
      for (const props of [fiber.pendingProps, fiber.memoizedProps]) {
        const specific =
          localAbsolutePath(props?.entry?.cwd) ||
          localAbsolutePath(props?.thread?.cwd) ||
          localAbsolutePath(props?.cwd);
        if (specific) return specific;
        const display =
          localAbsolutePath(props?.displayCwd) ||
          localAbsolutePath(props?.envTooltip);
        if (display) fallbacks.push(display);
      }
    }
    return fallbacks[0] || null;
  }

  function projectPathFor(threadRow) {
    const threadId = threadRow?.getAttribute("data-app-action-sidebar-thread-id");
    const project = threadRow?.closest('[data-sidebar-project-kind="local"]') ||
      [...document.querySelectorAll("[data-app-action-sidebar-thread-row]")]
        .find(
          (candidate) =>
            candidate !== threadRow &&
            candidate.getAttribute("data-app-action-sidebar-thread-id") === threadId &&
            candidate.closest('[data-sidebar-project-kind="local"]'),
        )
        ?.closest('[data-sidebar-project-kind="local"]');
    const root = reactPropsFor(project);
    if (!root) return null;

    const stack = [{ value: root, depth: 0 }];
    const seen = new WeakSet();
    const candidates = [];
    let visited = 0;
    while (stack.length > 0 && visited < 500) {
      const { value, depth } = stack.pop();
      if (!value || depth > 12 ||
          (typeof value !== "object" && typeof value !== "function")) {
        continue;
      }
      if (seen.has(value)) continue;
      seen.add(value);
      visited += 1;

      const directPath = localAbsolutePath(value.path);
      if (directPath && Array.isArray(value.rootPaths)) return directPath;
      if (directPath) candidates.push(directPath);

      let keys = [];
      try {
        keys = Object.keys(value).slice(0, 200);
      } catch {
        continue;
      }
      for (const key of keys) {
        let child;
        try {
          child = value[key];
        } catch {
          continue;
        }
        const pathValue = localAbsolutePath(child);
        if (pathValue) candidates.push(pathValue);
        else if (child && (typeof child === "object" || typeof child === "function")) {
          stack.push({ value: child, depth: depth + 1 });
        }
      }
    }

    const label = project?.getAttribute("aria-label") || "";
    return candidates.find(
      (candidate) => candidate.split(/[\\/]/).filter(Boolean).at(-1) === label,
    ) || candidates[0] || null;
  }

  function currentTaskContext() {
    const row = activeThreadRow();
    const threadKey = conversationIdFor(row);
    const codexProjectDir = threadWorkspacePathFor(row) || projectPathFor(row);
    const fallbackProjectDir = localAbsolutePath(state.config.fallbackProjectDir);
    return {
      threadKey,
      projectDir: codexProjectDir || fallbackProjectDir,
      workspaceSource: codexProjectDir
        ? "codex-project-metadata"
        : fallbackProjectDir
          ? "launcher-override"
          : null,
    };
  }

  function turnKeyFor(actionGroup) {
    const searchable = actionGroup.closest("[data-content-search-unit-key]");
    return (
      searchable?.getAttribute("data-content-search-unit-key") ||
      actionGroup.closest("[id]")?.id ||
      null
    );
  }

  function serviceRequest(operation) {
    const bridge = window.__aztReviewerBridge;
    if (!bridge?.request) {
      return Promise.reject(new Error("AZT Reviewer bridge is not ready."));
    }
    return bridge.request(MODULE_ID, operation);
  }

  function reviewUrlFor(responseId) {
    if (!state.config.url) return null;
    const reviewUrl = new URL(state.config.url);
    reviewUrl.searchParams.set("response", responseId);
    return reviewUrl.toString();
  }

  async function saveReviewSnapshot(link, actionGroup, id, snapshot, task) {
    try {
      const saved = await serviceRequest({
        method: "POST",
        path: "/api/responses",
        body: {
          id,
          projectDir: task.projectDir,
          workspaceSource: task.workspaceSource,
          threadKey: task.threadKey,
          turnKey: turnKeyFor(actionGroup),
          title: "Codex response",
          content: snapshot.content,
          contentHtml: snapshot.contentHtml,
          files: snapshot.files,
          sourceUrl: location.href,
        },
      });
      link.title = "Review this reply";
      return saved;
    } catch (error) {
      link.title = `Response Reviewer: ${error.message}`;
      throw error;
    }
  }

  function taskScope(task) {
    return task.threadKey || location.href;
  }

  function validatedReviewUrl(value, responseId) {
    const expected = new URL(reviewUrlFor(responseId));
    const actual = new URL(value);
    if (actual.protocol !== "http:" || actual.hostname !== "127.0.0.1" ||
        actual.origin !== expected.origin || actual.pathname !== expected.pathname ||
        actual.username || actual.password ||
        actual.searchParams.get("token") !== expected.searchParams.get("token") ||
        actual.searchParams.get("response") !== responseId) {
      throw new Error("审阅地址无效，请在 AZT 中重新打开记录。");
    }
    return actual.toString();
  }

  async function openNativeReview(url, task, scope) {
    if (!state.active || taskScope(currentTaskContext()) !== scope) {
      throw new Error("回复已保存，但当前对话已切换；请回到原对话再点击 Review。");
    }
    if (!task.threadKey) {
      throw new Error("无法确认当前 Codex 对话，未打开侧边标签；请使用备用入口。");
    }
    if (typeof window.electronBridge?.sendMessageFromView !== "function") {
      throw new Error("此窗口未提供 Codex 内置浏览器接入。");
    }
    let browserTabId = nativeTabs.get(scope);
    if (!browserTabId) {
      browserTabId = `manual:${crypto.randomUUID()}`;
      nativeTabs.set(scope, browserTabId);
    }
    // Version-dependent host UI event, not a public extension API. This goes
    // straight to the browser panel handler (which checks browser capability),
    // never to the generic link router that can fall back to an external browser.
    window.dispatchEvent(new MessageEvent("message", { data: {
      type: "toggle-browser-panel", open: true, url, browserTabId,
      conversationId: task.threadKey,
      source: "manual", initiator: "open_in_browser_bridge", presentationIntent: "split",
    } }));
    const deadline = Date.now() + 2500;
    do {
      if (!state.active || taskScope(currentTaskContext()) !== scope) {
        throw new Error("当前对话已切换；请回到原对话查看已保存的审阅。");
      }
      const panel = document.querySelector(`[data-browser-sidebar-browser-tab-id="${browserTabId}"]`);
      if (panel && panel.getBoundingClientRect().width > 0 && panel.getBoundingClientRect().height > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    throw new Error("未检测到 Codex 内置浏览器面板；请检查浏览器是否启用，或使用下方备用入口。");
  }

  function showOpenFailure(wrapper, message, url) {
    wrapper.querySelector(`.${MARKER}-fallback`)?.remove();
    const notice = document.createElement("span");
    notice.className = `${MARKER}-fallback`;
    notice.setAttribute("role", "alert");
    notice.style.cssText = "display:block;max-width:520px;padding:8px;font:12px system-ui;white-space:normal";
    const detail = document.createElement("span");
    detail.textContent = message;
    notice.append(detail);
    if (url) {
      const fallback = document.createElement("button");
      fallback.type = "button";
      fallback.textContent = "在临时浮层打开";
      fallback.onclick = () => openReviewPanel(url);
      notice.append(document.createTextNode(" "), fallback);
    }
    wrapper.append(notice);
  }

  // Explicit fallback only; successful Review clicks use Codex's browser panel.
  function openReviewPanel(url, message = "") {
    let panel = document.getElementById("azt-reviewer-panel");
    if (!panel) {
      panel = document.createElement("aside");
      panel.id = "azt-reviewer-panel";
      panel.setAttribute(`data-${MARKER}`, "panel");
      panel.style.cssText = "position:fixed;right:12px;top:64px;bottom:12px;width:min(640px,calc(100vw - 32px));z-index:2147483000;background:#171717;color:#eee;border:1px solid #555;border-radius:12px;box-shadow:0 12px 48px #0008;overflow:hidden;display:flex;flex-direction:column";
      const root = panel.attachShadow({ mode: "open" });
      const header = document.createElement("header");
      header.style.cssText = "display:flex;gap:12px;align-items:center;padding:10px;font:13px system-ui";
      const title = document.createElement("span");
      title.textContent = "AZT · Reviewer";
      const close = document.createElement("button");
      close.textContent = "关闭";
      close.setAttribute("aria-label", "关闭审阅面板");
      close.style.marginLeft = "auto";
      close.onclick = () => panel.remove();
      header.append(title, close);
      const note = document.createElement("div");
      note.id = "note";
      note.style.cssText = "padding:8px 12px;font:12px system-ui;overflow-wrap:anywhere";
      const frame = document.createElement("iframe");
      frame.title = "AZT Response Reviewer";
      frame.style.cssText = "width:100%;flex:1;border:0;background:#171717";
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
      frame.setAttribute("allow", "clipboard-write");
      frame.referrerPolicy = "no-referrer";
      root.append(header, note, frame);
      document.body.append(panel);
    }
    const root = panel.shadowRoot;
    root.getElementById("note").textContent = message || "若 Codex 阻止嵌入，请到 AZT → 工具 → Reviewer 打开同一条记录。";
    const frame = root.querySelector("iframe");
    frame.hidden = !url;
    if (url && frame.src !== url) frame.src = url;
  }

  function refreshReviewLinks() {
    for (const link of document.querySelectorAll(
      `[data-${MARKER}-response-id]`,
    )) {
      const href = reviewUrlFor(
        link.getAttribute(`data-${MARKER}-response-id`),
      );
      if (href) link.href = href;
      else link.removeAttribute("href");
    }
  }

  function reviewIcon() {
    return `
      <svg width="21" height="21" viewBox="0 0 21 21" fill="none"
        xmlns="http://www.w3.org/2000/svg" class="icon-xs" aria-hidden="true">
        <path d="M5.03 3.29h7.07c1.53 0 2.77 1.24 2.77 2.77v2.06a.67.67 0 0 1-1.34 0V6.06c0-.79-.64-1.43-1.43-1.43H5.03c-.79 0-1.43.64-1.43 1.43v6.16c0 .79.64 1.43 1.43 1.43h2.05a.67.67 0 1 1 0 1.34H5.03a2.77 2.77 0 0 1-2.77-2.77V6.06a2.77 2.77 0 0 1 2.77-2.77Z" fill="currentColor"/>
        <path d="m16.31 9.54 1.15 1.15a1.31 1.31 0 0 1 0 1.85l-4.68 4.68c-.1.1-.23.18-.37.22l-2.39.68a.68.68 0 0 1-.84-.84l.68-2.39c.04-.14.12-.27.22-.37l4.68-4.68a1.31 1.31 0 0 1 1.85 0Zm-.62 1.1-4.58 4.58-.34 1.19 1.19-.34 4.58-4.58-.85-.85Z" fill="currentColor"/>
      </svg>`;
  }

  function injectButton(copyButton, actionGroup) {
    if (actionGroup.querySelector(`[data-${MARKER}="button"]`)) return false;
    const sourceWrapper =
      copyButton.parentElement?.tagName === "SPAN"
        ? copyButton.parentElement
        : null;
    const wrapper = sourceWrapper
      ? sourceWrapper.cloneNode(false)
      : document.createElement("span");
    wrapper.className ||= "contents";
    wrapper.removeAttribute("id");
    wrapper.removeAttribute("aria-describedby");
    wrapper.setAttribute(`data-${MARKER}`, "button");

    const responseId = crypto.randomUUID();
    const link = document.createElement("a");
    link.className = copyButton.className;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.setAttribute("aria-label", "Review");
    link.setAttribute("title", "Review this reply");
    link.setAttribute(`data-${MARKER}-response-id`, responseId);
    link.innerHTML = reviewIcon();
    const href = reviewUrlFor(responseId);
    if (href) link.href = href;
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (link.getAttribute("aria-busy") === "true") return;
      wrapper.querySelector(`.${MARKER}-fallback`)?.remove();
      const snapshot = responseSnapshotFor(actionGroup);
      if (
        !state.config.serviceReady ||
        !link.hasAttribute("href") ||
        !snapshot?.content
      ) {
        event.preventDefault();
        link.title = !state.config.serviceReady
          ? "Response Reviewer Server 未就绪"
          : "未能读取这条回复";
        showOpenFailure(wrapper, link.title, null);
        return;
      }
      const task = currentTaskContext();
      const scope = taskScope(task);
      let reviewUrl = null;
      link.setAttribute("aria-busy", "true");
      try {
        const saved = await saveReviewSnapshot(link, actionGroup, responseId, snapshot, task);
        if (!state.active) return;
        reviewUrl = validatedReviewUrl(saved.reviewUrl, responseId);
        await openNativeReview(reviewUrl, task, scope);
      } catch (error) {
        if (state.active) showOpenFailure(wrapper, `${reviewUrl ? "回复已保存，打开失败" : "保存失败"}：${error.message}`, reviewUrl);
      } finally {
        link.removeAttribute("aria-busy");
      }
    });
    // Middle-click must not open an unsaved response in the system browser.
    link.addEventListener("auxclick", (event) => { event.preventDefault(); event.stopPropagation(); });

    wrapper.append(link);
    (sourceWrapper || copyButton).insertAdjacentElement("afterend", wrapper);
    return true;
  }

  function scan() {
    state.scanScheduled = false;
    if (!state.active) return 0;
    let injected = 0;
    for (const button of document.querySelectorAll("button")) {
      if (!exactCopyLabels.has(accessibleName(button))) continue;
      const actionGroup = findActionGroup(button);
      if (actionGroup && injectButton(button, actionGroup)) injected += 1;
    }
    return injected;
  }

  function scheduleScan() {
    if (state.scanScheduled) return;
    state.scanScheduled = true;
    requestAnimationFrame(scan);
  }

  state.observer = new MutationObserver(scheduleScan);
  state.observer.observe(document.body, { childList: true, subtree: true });
  // No legacy outbox polling: feedback always requires a user action.
  const initialCount = scan();

  state.updateConfig = (nextConfig) => {
    state.config = { ...state.config, ...nextConfig };
    refreshReviewLinks();
    const frame = document.getElementById("azt-reviewer-panel")?.shadowRoot?.querySelector("iframe");
    if (frame?.getAttribute("src")) {
      const responseId = new URL(frame.src).searchParams.get("response");
      if (responseId) frame.src = reviewUrlFor(responseId);
    }
  };
  state.prefill = prefill;
  state.status = () => {
    const taskContext = currentTaskContext();
    return {
      active: state.active,
      buttons: document.querySelectorAll(`[data-${MARKER}="button"]`).length,
      serverReady: Boolean(
        state.config.serviceReady &&
          state.config.url &&
          window.__aztReviewerBridge?.request,
      ),
      taskContext,
    };
  };
  state.destroy = () => {
    state.active = false;
    state.observer?.disconnect();
    document
      .querySelectorAll(`[data-${MARKER}]`)
      .forEach((element) => element.remove());
    delete namespace[MODULE_ID];
  };

  namespace[MODULE_ID] = state;
  return { installed: true, initialCount, ...state.status() };
})();
