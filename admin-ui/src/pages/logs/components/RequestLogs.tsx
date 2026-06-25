import { useEffect, useMemo, useState } from "react";
import { Copy, Filter, Loader2, Search, Trash2 } from "lucide-react";
import { fetchJson } from "@/shared/api";
import type { RequestDiagnosticClearResult, RequestDiagnosticRecord, RequestDiagnosticSummary, RequestLog } from "@/shared/types";
import { copyText, errorMessage } from "@/shared/lib/app-utils";
import { formatDuration, formatFileSize, formatTime } from "@/shared/lib/format";
import { formatJson } from "@/shared/lib/format";

type DiagnosticDetailTab = "overview" | "request" | "response" | "protocol";

function getRequestDiagnosticCapture(log: RequestLog | null): Record<string, unknown> | null {
  const request = log?.details?.request;
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return null;
  }

  const diagnosticCapture = (request as Record<string, unknown>).diagnosticCapture;
  return diagnosticCapture && typeof diagnosticCapture === "object" && !Array.isArray(diagnosticCapture)
    ? diagnosticCapture as Record<string, unknown>
    : null;
}

function getRequestDiagnosticId(log: RequestLog | null): string | null {
  const capture = getRequestDiagnosticCapture(log);
  return typeof capture?.id === "string" ? capture.id : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function diagnosticTabPayload(record: RequestDiagnosticRecord, tab: DiagnosticDetailTab): unknown {
  if (tab === "request") {
    return record.content;
  }
  if (tab === "response") {
    const response = asRecord(record.response);
    return response?.compact ?? record.response ?? record.error ?? { message: "还没有捕获到返回内容。" };
  }
  if (tab === "protocol") {
    const response = asRecord(record.response);
    const protocol = asRecord(response?.protocol);
    return protocol ?? {
      message: "未保存完整返回协议。需要在设置里开启“同时保存完整返回 SSE 协议”，之后的新请求才会包含 events/rawSse。",
      responseMeta: response
        ? {
            capturedAt: response.capturedAt,
            statusCode: response.statusCode,
            upstreamRequestId: response.upstreamRequestId,
            upstreamEndpoint: response.upstreamEndpoint,
            partial: response.partial,
          }
        : undefined,
    };
  }

  const requestBody = asRecord(record.content?.body);
  const response = asRecord(record.response);
  const responseStream = asRecord(response?.stream);
  const responseCompact = asRecord(response?.compact);
  const responseProtocol = asRecord(response?.protocol);
  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    request: {
      endpoint: record.endpoint,
      model: record.model,
      inputKind: Array.isArray(requestBody?.input) ? "array" : typeof requestBody?.input,
      inputItems: Array.isArray(requestBody?.input) ? requestBody.input.length : undefined,
      toolCount: Array.isArray(requestBody?.tools) ? requestBody.tools.length : undefined,
      hasInstructions: typeof requestBody?.instructions === "string" && requestBody.instructions.length > 0,
      hasReasoning: Boolean(requestBody?.reasoning),
    },
    response: response
      ? {
          statusCode: response.statusCode,
          upstreamRequestId: response.upstreamRequestId,
          completed: responseStream?.completed,
          terminalEvent: responseStream?.terminalEvent,
          bytes: responseStream?.bytes,
          eventCount: responseCompact?.eventCount,
          eventCounts: responseCompact?.eventCounts,
          finalTextLength: responseCompact?.finalTextOriginalLength,
          finalTextTruncated: responseCompact?.finalTextTruncated,
          tokenUsageStatus: responseStream?.tokenUsageStatus,
          protocolCaptured: Boolean(responseProtocol),
        }
      : undefined,
    error: record.error,
  };
}

export function RequestLogs(props: { logs: RequestLog[] }) {
  const [query, setQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [diagnosticSummary, setDiagnosticSummary] = useState<RequestDiagnosticSummary | null>(null);
  const [diagnosticRecord, setDiagnosticRecord] = useState<RequestDiagnosticRecord | null>(null);
  const [diagnosticStatus, setDiagnosticStatus] = useState("");
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticClearing, setDiagnosticClearing] = useState(false);
  const [diagnosticTab, setDiagnosticTab] = useState<DiagnosticDetailTab>("overview");

  useEffect(() => {
    if (props.logs.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !props.logs.some((item) => item.id === selectedId)) {
      setSelectedId(props.logs[0].id);
    }
  }, [props.logs, selectedId]);

  const sources = useMemo(() => Array.from(new Set(props.logs.map((item) => item.source || "管理页"))), [props.logs]);
  const methods = useMemo(() => Array.from(new Set(props.logs.map((item) => item.method))), [props.logs]);

  const filteredLogs = useMemo(() => {
    const search = query.trim().toLowerCase();
    return props.logs.filter((item) => {
      const haystack = [item.time, item.method, item.endpoint, item.account, item.model, item.statusCode, item.durationMs, item.source].join(" ").toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (methodFilter !== "all" && item.method !== methodFilter) return false;
      if (sourceFilter !== "all" && (item.source || "管理页") !== sourceFilter) return false;
      if (statusFilter === "ok" && item.statusCode >= 400) return false;
      if (statusFilter === "error" && item.statusCode < 400) return false;
      return true;
    });
  }, [methodFilter, props.logs, query, sourceFilter, statusFilter]);

  const selectedLog = filteredLogs.find((item) => item.id === selectedId) || filteredLogs[0] || null;
  const selectedDiagnosticCapture = getRequestDiagnosticCapture(selectedLog);
  const selectedDiagnosticId = getRequestDiagnosticId(selectedLog);

  async function refreshDiagnosticSummary() {
    try {
      setDiagnosticSummary(await fetchJson<RequestDiagnosticSummary>("/_gateway/admin/diagnostics/codex-requests"));
    } catch (error) {
      setDiagnosticStatus(`诊断目录读取失败: ${errorMessage(error)}`);
    }
  }

  useEffect(() => {
    void refreshDiagnosticSummary();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!selectedDiagnosticId) {
      setDiagnosticRecord(null);
      setDiagnosticStatus("");
      setDiagnosticTab("overview");
      return;
    }

    setDiagnosticLoading(true);
    setDiagnosticStatus("");
    setDiagnosticTab("overview");
    fetchJson<{ data: RequestDiagnosticRecord }>(`/_gateway/admin/diagnostics/codex-requests/${encodeURIComponent(selectedDiagnosticId)}`)
      .then((result) => {
        if (cancelled) return;
        setDiagnosticRecord(result.data);
      })
      .catch((error) => {
        if (cancelled) return;
        setDiagnosticRecord(null);
        setDiagnosticStatus(`诊断内容不可用: ${errorMessage(error)}`);
      })
      .finally(() => {
        if (!cancelled) {
          setDiagnosticLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDiagnosticId]);

  function copySelectedLog() {
    if (!selectedLog) return;
    copyText(formatJson(selectedLog))
      .then((ok) => {
        if (!ok) return;
      })
      .catch(() => undefined);
  }

  function copyDiagnosticPayload() {
    if (!diagnosticRecord) return;
    copyText(formatJson(diagnosticTabPayload(diagnosticRecord, diagnosticTab))).catch(() => undefined);
  }

  async function clearDiagnostics() {
    if (!window.confirm("将清空单独保存的 Codex 请求诊断内容文件。普通请求日志和用量统计不会被删除。确认继续？")) {
      return;
    }

    setDiagnosticClearing(true);
    try {
      const result = await fetchJson<RequestDiagnosticClearResult>("/_gateway/admin/diagnostics/codex-requests", { method: "DELETE" });
      setDiagnosticSummary(result);
      setDiagnosticRecord(null);
      setDiagnosticStatus(`已清理 ${result.deletedFiles} 个诊断文件，释放 ${formatFileSize(result.deletedBytes)}。`);
    } catch (error) {
      setDiagnosticStatus(`诊断文件清理失败: ${errorMessage(error)}`);
    } finally {
      setDiagnosticClearing(false);
    }
  }

  return (
    <section className="log-table-wrap" id="logs">
      <div className="section-head compact">
        <div>
          <h2>请求日志</h2>
          <p>记录网关最近收到的 API 请求。默认显示安全摘要；开启诊断捕获后，新请求会把截断后的请求内容写入单独诊断文件。</p>
        </div>
        <div className="log-diagnostics-actions">
          <span>{diagnosticSummary ? `诊断文件 ${diagnosticSummary.fileCount} 个 · ${formatFileSize(diagnosticSummary.totalBytes)}` : "诊断目录 -"}</span>
          <button className="btn-secondary" type="button" onClick={() => void refreshDiagnosticSummary()} disabled={diagnosticClearing}>
            刷新
          </button>
          <button className="btn-danger" type="button" onClick={() => void clearDiagnostics()} disabled={diagnosticClearing || !diagnosticSummary?.fileCount}>
            {diagnosticClearing ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
            清理诊断
          </button>
        </div>
      </div>
      {diagnosticStatus && <p className="hint log-diagnostics-status">{diagnosticStatus}</p>}
      <div className="log-toolbar">
        <label className="search-box log-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索时间、接口、账号、模型或状态" />
        </label>
        <label className="filter-chip">
          <Filter size={14} />
          <select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}>
            <option value="all">全部方法</option>
            {methods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-chip">
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
            <option value="all">全部来源</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-chip">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">全部状态</option>
            <option value="ok">成功</option>
            <option value="error">失败</option>
          </select>
        </label>
      </div>
      <div className="table-scroller">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>方法</th>
              <th>接口</th>
              <th>账号</th>
              <th>模型</th>
              <th>状态</th>
              <th>耗时</th>
              <th>来源</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={8}>最近 API 请求会在这里显示。</td>
              </tr>
            ) : (
              filteredLogs.map((item) => (
                <tr key={item.id} className={item.id === selectedLog?.id ? "is-selected" : ""} onClick={() => setSelectedId(item.id)}>
                  <td>{formatTime(item.time)}</td>
                  <td>
                    <span className={`method-pill method-${item.method.toLowerCase()}`}>{item.method}</span>
                  </td>
                  <td>
                    <code>{item.endpoint}</code>
                  </td>
                  <td>{item.account}</td>
                  <td>{item.model}</td>
                  <td>
                    <span className={`status-pill ${item.statusCode >= 400 ? "is-error" : "is-ok"}`}>{item.statusCode}</span>
                  </td>
                  <td>{formatDuration(item.durationMs)}</td>
                  <td>{item.source || "管理页"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="table-footer">当前展示 {filteredLogs.length} 条请求记录，最近总计 {props.logs.length} 条。</div>
      {selectedLog && (
        <div className="log-detail-panel">
          <div className="log-detail-head">
            <div>
              <h3>日志详情</h3>
              <p>{formatTime(selectedLog.time)} · {selectedLog.method} {selectedLog.endpoint}</p>
            </div>
            <button className="btn-secondary" type="button" onClick={copySelectedLog}>
              <Copy size={16} />
              复制详情
            </button>
          </div>
          <div className="log-detail-grid">
            <div className="log-detail-meta">
              <div><span>账号</span><strong>{selectedLog.account}</strong></div>
              <div><span>模型</span><strong>{selectedLog.model}</strong></div>
              <div><span>状态</span><strong>{selectedLog.statusCode}</strong></div>
              <div><span>耗时</span><strong>{formatDuration(selectedLog.durationMs)}</strong></div>
              <div><span>来源</span><strong>{selectedLog.source || "管理页"}</strong></div>
            </div>
            <div className="log-detail-json-stack">
              {selectedDiagnosticCapture && (
                <div className="log-content-capture">
                  <div className="log-content-capture-head">
                    <strong>诊断内容</strong>
                    <span>
                      {diagnosticLoading
                        ? "读取诊断文件中"
                        : diagnosticRecord
                          ? `${formatFileSize(selectedDiagnosticCapture.bytes as number)} · ${selectedDiagnosticCapture.relativePath || selectedDiagnosticCapture.id}`
                          : "诊断文件不可用"}
                    </span>
                  </div>
                  {diagnosticLoading ? (
                    <pre className="pre log-detail-pre log-content-pre">读取中...</pre>
                  ) : diagnosticRecord ? (
                    <div className="log-diagnostic-view">
                      <div className="log-diagnostic-tabs">
                        {(["overview", "request", "response", "protocol"] as DiagnosticDetailTab[]).map((tab) => (
                          <button
                            key={tab}
                            className={tab === diagnosticTab ? "is-active" : ""}
                            type="button"
                            onClick={() => setDiagnosticTab(tab)}
                          >
                            {tab === "overview" ? "概览" : tab === "request" ? "请求" : tab === "response" ? "返回" : "协议"}
                          </button>
                        ))}
                        <button className="copy-tab" type="button" onClick={copyDiagnosticPayload}>
                          <Copy size={14} />
                          复制当前
                        </button>
                      </div>
                      <pre className="pre log-detail-pre log-content-pre">{formatJson(diagnosticTabPayload(diagnosticRecord, diagnosticTab))}</pre>
                    </div>
                  ) : (
                    <pre className="pre log-detail-pre log-content-pre">{diagnosticStatus || "诊断内容不存在或已清理。"}</pre>
                  )}
                </div>
              )}
              <pre className="pre log-detail-pre">{formatJson(selectedLog)}</pre>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
