import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, FileText, MessageSquareText, Power, RefreshCw, Settings2, X } from "lucide-react";
import { useLocaleValue } from "@/i18n";
import { fetchJson } from "@/shared/api";
import { copyText, errorMessage } from "@/shared/lib/app-utils";
import "./tools.css";

type Settings = { enabled: boolean; codexButtonEnabled: boolean; cdpPort: number };
type Status = {
  settings: Settings; running: boolean; url: string | null; dataDir: string; pluginPath: string;
  legacyStorePath: string; error: string | null;
  connector: { connected: boolean; targets: number; buttons: number; error: string | null };
};
type Review = { id: string; title: string; updatedAt: string; annotationCount: number; projectDir: string | null };
const endpoint = "/_gateway/tools/reviewer";
const json = (body: unknown) => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export function ToolsPage() {
  const zh = useLocaleValue() === "zh-CN";
  const text = (cn: string, en: string) => zh ? cn : en;
  const [status, setStatus] = useState<Status | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [history, setHistory] = useState<Review[]>([]);
  const [source, setSource] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const initialized = useRef(false);
  const workbenchRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (opened) workbenchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [opened, selectedId, status?.url]);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const next = await fetchJson<Status>(endpoint, { signal });
    if (signal?.aborted) return;
    setStatus(next);
    if (!initialized.current) {
      initialized.current = true;
      setDraft(next.settings); setSource(next.legacyStorePath);
    }
    const result = await fetchJson<{ responses: Review[] }>(`${endpoint}/history`, { signal });
    if (!signal?.aborted) setHistory(result.responses);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const run = () => refresh(controller.signal).catch((err) => { if (!controller.signal.aborted) setError(errorMessage(err)); });
    void run();
    const timer = window.setInterval(() => { if (!document.hidden) void run(); }, 8000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [refresh]);
  async function act(operation: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await operation(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  async function save() {
    if (!draft) return;
    await act(async () => {
      const next = await fetchJson<Status>(`${endpoint}/settings`, { method: "PUT", ...json(draft) });
      setStatus(next); setDraft(next.settings);
      setNotice(text("设置已保存。关闭服务不会删除审阅数据。", "Settings saved. Stopping the service does not delete reviews."));
      await refresh();
    });
  }
  async function startCodexWithReviewer() {
    if (!draft) return;
    await act(async () => {
      const saved = await fetchJson<Status>(`${endpoint}/settings`, { method: "PUT", ...json(draft) });
      setStatus(saved); setDraft(saved.settings);
      const result = await fetchJson<{ ok: boolean; started: boolean; cancelled?: boolean }>(`${endpoint}/start-codex`, { method: "POST", ...json({}) });
      await refresh();
      setNotice(result.cancelled
        ? text("已取消启动。当前 Codex 未被修改。", "Start cancelled. The current Codex was not changed.")
        : text("已启动带本机 CDP 接入的 Codex，正在等待连接。", "Codex started with local CDP access; waiting for the connection."));
    });
  }
  async function importHistory() {
    await act(async () => {
      const result = await fetchJson<{ imported: number; skipped: number }>(`${endpoint}/import`, { method: "POST", ...json({ sourcePath: source }) });
      await refresh();
      setNotice(text(`已导入 ${result.imported} 条，跳过 ${result.skipped} 条已有记录。旧文件未修改；读取关联文件前需重新确认项目目录。`,
        `Imported ${result.imported}; skipped ${result.skipped} existing records. The source is unchanged. Reconfirm the workspace before reading linked files.`));
    });
  }
  const workbenchUrl = status?.running && status.url ? (() => {
    const url = new URL(status.url);
    if (selectedId) url.searchParams.set("response", selectedId);
    return url.toString();
  })() : null;
  const visibleHistory = history.filter((item) => `${item.title} ${item.projectDir || ""}`.toLowerCase().includes(filter.toLowerCase()));
  return <div className="azt-tools">
    <section className="azt-tool-card">
      <div className="azt-tool-heading">
        <span className="azt-tool-icon"><MessageSquareText size={25} /></span>
        <div><div className="azt-tool-kicker">LOCAL TOOL · 01</div><h2>Response Reviewer</h2>
          <p>{text("选中具体回复，批注后汇总修改意见。不会自动发送，也不会改动项目文件。", "Review a specific reply, annotate it and compile a revision request. Never auto-sends or edits project files.")}</p></div>
        <span className={`azt-tool-status ${status?.running ? "is-running" : ""}`}>{status?.running ? text("运行中", "Running") : text("未运行", "Stopped")}</span>
      </div>
      <div className="azt-tool-actions">
        <button type="button" className="btn-primary" disabled={!status?.running} onClick={() => { setSelectedId(null); setOpened(true); }}>{text("打开审阅工作台", "Open workbench")}</button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void act(() => refresh())}><RefreshCw size={15} />{text("刷新", "Refresh")}</button>
        <span className="azt-tool-muted">{text("本机存储 · 与 Codex 侧共用记录", "Local storage · Shared with Codex")}</span>
      </div>
    </section>
    {error && <div className="azt-tool-alert" role="alert">{error}</div>}
    {notice && <div className="azt-tool-notice" role="status"><CheckCircle2 size={16} />{notice}</div>}
    {status?.error && <div className="azt-tool-alert" role="alert">{status.error}</div>}
    <div className="azt-tool-columns">
      <section className="azt-tool-card">
        <h3><Settings2 size={18} />{text("服务与接入", "Service & connection")}</h3>
        {draft ? <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <label className="azt-tool-toggle"><input type="checkbox" checked={draft.enabled} disabled={busy} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked, codexButtonEnabled: e.target.checked && draft.codexButtonEnabled })} />
            <span>{text("启用 Reviewer", "Enable Reviewer")}<small>{text("随 AZT 启动，只监听 127.0.0.1，不经模型网关公开。", "Starts with AZT; listens on 127.0.0.1, never the model gateway.")}</small></span></label>
          <label className="azt-tool-toggle"><input type="checkbox" checked={draft.codexButtonEnabled} disabled={busy || !draft.enabled} onChange={(e) => setDraft({ ...draft, codexButtonEnabled: e.target.checked })} />
            <span>{text("Codex 回复旁显示 Review 按钮（实验性）", "Review buttons in Codex (experimental)")}<small>{text("保存选定回复后，在 Codex 右侧浮层打开同一工作台。", "Saves the selected reply and opens this workbench in a right-side overlay.")}</small></span></label>
          <label className="azt-tool-field">{text("本机 CDP 调试端口", "Local CDP debugging port")}
            <input type="number" min={1024} max={65535} step={1} value={draft.cdpPort} disabled={busy || !draft.enabled} onChange={(e) => setDraft({ ...draft, cdpPort: Number(e.target.value) })} /></label>
          <p className="azt-tool-muted">{status?.connector.connected ? text(`已连接 ${status.connector.targets} 个窗口 · ${status.connector.buttons} 个按钮`, `Connected: ${status.connector.targets} windows · ${status.connector.buttons} buttons`) : text("Codex 未连接；不影响 AZT 工作台与 MCP 使用。", "Codex not connected; the AZT workbench and MCP remain available.")}</p>
          {status?.connector.error && <p className="azt-tool-warning">{status.connector.error}</p>}
          <div className="azt-tool-button-row">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? text("处理中…", "Working…") : text("保存设置", "Save settings")}</button>
            <button className="btn-secondary" type="button" disabled={busy || !draft.enabled || !draft.codexButtonEnabled || status?.connector.connected} onClick={() => void startCodexWithReviewer()}>
              <Power size={15} />{status?.connector.connected ? text("Codex 已接入", "Codex connected") : text("保存并启动 Codex 接入", "Save & start Codex connection")}
            </button>
          </div>
          <p className="azt-tool-warning">{text("如果 Codex 已打开，点击后会先弹窗确认退出并重新启动；AZT 不会强制终止 Codex。请先保存未完成内容。", "If Codex is open, AZT will ask before requesting a quit and restart. AZT will not force-terminate Codex; save unfinished work first.")}</p>
        </form> : <p>{text("正在加载设置…", "Loading settings…")}</p>}
        <details className="azt-tool-details"><summary>{text("Codex 按钮的接入说明与风险", "Codex button setup & security")}</summary>
          <p>{text("启用上面的开关后，优先点击“保存并启动 Codex 接入”。如果 Codex 正在运行，AZT 会先弹窗确认，再请求正常退出并带本机调试端口启动。若正常退出失败，请手动完全退出后再次点击。", "After enabling the switches above, use “Save & start Codex connection”. If Codex is running, AZT asks for confirmation, requests a graceful quit, and starts it with a loopback-only debugging port. If it does not quit normally, quit it manually and try again.")}</p>
          <p>{text("手动命令仅用于排障或备用方式：", "Manual command for troubleshooting or fallback only:")}</p>
          <code>open -b com.openai.codex --args --remote-debugging-address=127.0.0.1 --remote-debugging-port={draft?.cdpPort || 9222}</code>
          <p>{text("调试端口可控制页面，请勿开放到局域网或转发给他人。此方式依赖 Codex 页面结构，不是官方原生面板；若页面更新或 iframe 被拦截，请回到本页打开相同记录。请先关闭旧 Companion 的按钮注入，避免冲突。", "The debugging port can control pages; never expose or forward it. This relies on Codex DOM structure, not a native panel API. If the layout changes or frames are blocked, open the same review here. Disable the old Companion injector first.")}</p>
        </details>
      </section>
      <section className="azt-tool-card">
        <h3><FileText size={18} />{text("数据与迁移", "Data & migration")}</h3>
        <p className="azt-tool-muted">{text("数据目录", "Data directory")}</p><code className="azt-tool-path">{status?.dataDir || "—"}</code>
        <form onSubmit={(event) => { event.preventDefault(); void importHistory(); }}>
          <label className="azt-tool-field">{text("旧 Reviewer 的 store.json 绝对路径", "Absolute path to the old Reviewer store.json")}
            <input value={source} onChange={(e) => setSource(e.target.value)} required disabled={busy} spellCheck={false} /></label>
          <p className="azt-tool-muted">{text("仅合并缺失记录，不覆盖同 ID 的批注，不删除或改写源文件。旧队列和项目访问授权不迁移。", "Only missing records are merged. Existing IDs and the source file remain untouched. Old queues and workspace permissions are not migrated.")}</p>
          <button className="btn-secondary" type="submit" disabled={busy || !source.trim()}>{text("只读导入旧数据", "Import without changing source")}</button>
        </form>
        <details className="azt-tool-details"><summary>{text("可选 MCP / Skill 入口", "Optional MCP / Skill entry")}</summary>
          <p>{text("插件目录（本期不会自动安装或更改现有插件）：", "Plugin directory (not installed automatically):")}</p><code className="azt-tool-path">{status?.pluginPath || "—"}</code>
          <p>{text("先启用本服务，再安装该本地插件。桌面包中使用 app.asar.unpacked 下的同名目录。自定义 AI_ZERO_TOKEN_HOME 时，MCP 需使用同一环境变量。", "Enable this service before installing the local plugin. Desktop builds use the matching directory under app.asar.unpacked. With a custom AI_ZERO_TOKEN_HOME, pass the same environment variable to MCP.")}</p>
        </details>
      </section>
    </div>
    <section className="azt-tool-card">
      <div className="azt-tool-history-heading"><h3>{text("审阅历史", "Review history")} <span className="azt-tool-muted">{history.length}</span></h3>
        <input aria-label={text("筛选审阅历史", "Filter reviews")} placeholder={text("搜索标题或项目…", "Search title or project…")} value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
      {visibleHistory.length ? <ul className="azt-tool-history">{visibleHistory.map((item) => <li key={item.id}>
        <button type="button" disabled={!status?.running} onClick={() => { setSelectedId(item.id); setOpened(true); }}>
          <div><strong>{item.title}</strong><small>{item.projectDir || text("项目目录待确认", "Workspace not confirmed")}</small></div>
          <span>{item.annotationCount} {text("条批注", "annotations")}<small>{new Date(item.updatedAt).toLocaleString()}</small></span>
        </button></li>)}</ul> : <p className="azt-tool-empty">{text("还没有匹配的审阅记录。可导入旧数据，或从 Codex 回复旁的 Review 按钮开始。", "No matching reviews. Import old data or start from a Review button beside a Codex reply.")}</p>}
      {!status?.running && history.length > 0 && <p className="azt-tool-muted">{text("启用服务后可打开历史记录。", "Enable the service to open a review.")}</p>}
    </section>
    {opened && workbenchUrl && <section ref={workbenchRef} className="azt-tool-workbench" aria-label={text("审阅工作台", "Review workbench")}>
      <header><strong>Response Reviewer</strong><span>{text("意见仅复制或预填，不自动发送", "Copy or prefill only; never auto-send")}</span>
        <button type="button" title={text("链接含本机访问令牌，请勿分享", "Contains a local access token; do not share")} onClick={() => void act(async () => {
          if (!await copyText(workbenchUrl)) throw new Error(text("复制失败，请检查剪贴板权限。", "Copy failed; check clipboard permissions."));
          setNotice(text("已复制本机审阅链接，请勿分享访问令牌。", "Local review link copied. Do not share its access token."));
        })}><Copy size={16} />{text("复制链接", "Copy link")}</button>
        <button type="button" aria-label={text("关闭工作台", "Close workbench")} onClick={() => setOpened(false)}><X size={18} /></button></header>
      <iframe title="Response Reviewer" src={workbenchUrl} sandbox="allow-scripts allow-same-origin allow-forms" allow="clipboard-write" referrerPolicy="no-referrer" />
    </section>}
  </div>;
}
