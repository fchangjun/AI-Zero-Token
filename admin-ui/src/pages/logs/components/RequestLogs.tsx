import { useEffect, useMemo, useState } from "react";
import { Copy, Filter, Loader2, Search, Trash2 } from "lucide-react";
import { fetchJson } from "@/shared/api";
import type { RequestDiagnosticClearResult, RequestDiagnosticRecord, RequestDiagnosticSummary, RequestLog } from "@/shared/types";
import { copyText, errorMessage } from "@/shared/lib/app-utils";
import { formatDuration, formatFileSize, formatTime } from "@/shared/lib/format";
import { formatJson } from "@/shared/lib/format";
import { useLocaleValue, useT } from "@/i18n";

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

function diagnosticTabPayload(record: RequestDiagnosticRecord, tab: DiagnosticDetailTab, t: (key: string, values?: Record<string, string | number>) => string): unknown {
  if (tab === "request") {
    return record.content;
  }
  if (tab === "response") {
    const response = asRecord(record.response);
    return response?.compact ?? record.response ?? record.error ?? { message: t("logs.responseEmpty") };
  }
  if (tab === "protocol") {
    const response = asRecord(record.response);
    const protocol = asRecord(response?.protocol);
    return protocol ?? {
      message: t("logs.protocolEmpty"),
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
  const t = useT();
  const locale = useLocaleValue();
  const intlLocale = locale === "en" ? "en-US" : "zh-CN";

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

  const sourceFallback = t("logs.sourceFallback");
  const sources = useMemo(() => Array.from(new Set(props.logs.map((item) => item.source || sourceFallback))), [props.logs, sourceFallback]);
  const methods = useMemo(() => Array.from(new Set(props.logs.map((item) => item.method))), [props.logs]);

  const filteredLogs = useMemo(() => {
    const search = query.trim().toLowerCase();
    return props.logs.filter((item) => {
      const haystack = [item.time, item.method, item.endpoint, item.account, item.model, item.statusCode, item.durationMs, item.source].join(" ").toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (methodFilter !== "all" && item.method !== methodFilter) return false;
      if (sourceFilter !== "all" && (item.source || sourceFallback) !== sourceFilter) return false;
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
      setDiagnosticStatus(t("logs.diagnosticsReadError", { error: errorMessage(error) }));
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
        setDiagnosticStatus(t("logs.diagnosticsReadFailed", { error: errorMessage(error) }));
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
    copyText(formatJson(diagnosticTabPayload(diagnosticRecord, diagnosticTab, t))).catch(() => undefined);
  }

  async function clearDiagnostics() {
    if (!window.confirm(t("logs.confirmClearDiagnostics"))) {
      return;
    }

    setDiagnosticClearing(true);
    try {
      const result = await fetchJson<RequestDiagnosticClearResult>("/_gateway/admin/diagnostics/codex-requests", { method: "DELETE" });
      setDiagnosticSummary(result);
      setDiagnosticRecord(null);
      setDiagnosticStatus(t("logs.diagnosticsCleared", { count: result.deletedFiles, size: formatFileSize(result.deletedBytes) }));
    } catch (error) {
      setDiagnosticStatus(t("logs.diagnosticsClearFailed", { error: errorMessage(error) }));
    } finally {
      setDiagnosticClearing(false);
    }
  }

  return (
    <section className="log-table-wrap" id="logs">
      <div className="section-head compact">
        <div>
          <h2>{t("logs.title")}</h2>
          <p>{t("logs.description")}</p>
        </div>
        <div className="log-diagnostics-actions">
          <span>{diagnosticSummary ? t("logs.diagnosticsSummary", { count: diagnosticSummary.fileCount, size: formatFileSize(diagnosticSummary.totalBytes) }) : t("logs.diagnosticsEmpty")}</span>
          <button className="btn-secondary" type="button" onClick={() => void refreshDiagnosticSummary()} disabled={diagnosticClearing}>
            {t("logs.refresh")}
          </button>
          <button className="btn-danger" type="button" onClick={() => void clearDiagnostics()} disabled={diagnosticClearing || !diagnosticSummary?.fileCount}>
            {diagnosticClearing ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
            {t("logs.clearDiagnostics")}
          </button>
        </div>
      </div>
      {diagnosticStatus && <p className="hint log-diagnostics-status">{diagnosticStatus}</p>}
      <div className="log-toolbar">
        <label className="search-box log-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("logs.searchPlaceholder")} />
        </label>
        <label className="filter-chip">
          <Filter size={14} />
          <select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}>
            <option value="all">{t("logs.methodAll")}</option>
            {methods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-chip">
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
            <option value="all">{t("logs.sourceAll")}</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-chip">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">{t("logs.statusAll")}</option>
            <option value="ok">{t("logs.statusOk")}</option>
            <option value="error">{t("logs.statusError")}</option>
          </select>
        </label>
      </div>
      <div className="table-scroller">
        <table>
          <thead>
            <tr>
              <th>{t("logs.columnTime")}</th>
              <th>{t("logs.columnMethod")}</th>
              <th>{t("logs.columnEndpoint")}</th>
              <th>{t("logs.columnAccount")}</th>
              <th>{t("logs.columnModel")}</th>
              <th>{t("logs.columnStatus")}</th>
              <th>{t("logs.columnDuration")}</th>
              <th>{t("logs.columnSource")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={8}>{t("logs.tableEmpty")}</td>
              </tr>
            ) : (
              filteredLogs.map((item) => (
                <tr key={item.id} className={item.id === selectedLog?.id ? "is-selected" : ""} onClick={() => setSelectedId(item.id)}>
                  <td>{formatTime(item.time, intlLocale)}</td>
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
                  <td>{item.source || sourceFallback}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="table-footer">{t("logs.footerCount", { filtered: filteredLogs.length, total: props.logs.length })}</div>
      {selectedLog && (
        <div className="log-detail-panel">
          <div className="log-detail-head">
            <div>
              <h3>{t("logs.detailTitle")}</h3>
              <p>{formatTime(selectedLog.time, intlLocale)} · {selectedLog.method} {selectedLog.endpoint}</p>
            </div>
            <button className="btn-secondary" type="button" onClick={copySelectedLog}>
              <Copy size={16} />
              {t("logs.copyDetail")}
            </button>
          </div>
          <div className="log-detail-grid">
            <div className="log-detail-meta">
              <div><span>{t("logs.detailMetaAccount")}</span><strong>{selectedLog.account}</strong></div>
              <div><span>{t("logs.detailMetaModel")}</span><strong>{selectedLog.model}</strong></div>
              <div><span>{t("logs.detailMetaStatus")}</span><strong>{selectedLog.statusCode}</strong></div>
              <div><span>{t("logs.detailMetaDuration")}</span><strong>{formatDuration(selectedLog.durationMs)}</strong></div>
              <div><span>{t("logs.detailMetaSource")}</span><strong>{selectedLog.source || sourceFallback}</strong></div>
            </div>
            <div className="log-detail-json-stack">
              {selectedDiagnosticCapture && (
                <div className="log-content-capture">
                  <div className="log-content-capture-head">
                    <strong>{t("logs.captureTitle")}</strong>
                    <span>
                      {diagnosticLoading
                        ? t("logs.diagnosticsReading")
                        : diagnosticRecord
                          ? t("logs.captureBytes", { size: formatFileSize(Number(selectedDiagnosticCapture.bytes ?? 0)), path: String(selectedDiagnosticCapture.relativePath ?? selectedDiagnosticCapture.id ?? "") })
                          : t("logs.diagnosticsUnavailable")}
                    </span>
                  </div>
                  {diagnosticLoading ? (
                    <pre className="pre log-detail-pre log-content-pre">{t("logs.captureReading")}</pre>
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
                            {tab === "overview" ? t("logs.tabOverview") : tab === "request" ? t("logs.tabRequest") : tab === "response" ? t("logs.tabResponse") : t("logs.tabProtocol")}
                          </button>
                        ))}
                        <button className="copy-tab" type="button" onClick={copyDiagnosticPayload}>
                          <Copy size={14} />
                          {t("logs.copyCurrent")}
                        </button>
                      </div>
                      <pre className="pre log-detail-pre log-content-pre">{formatJson(diagnosticTabPayload(diagnosticRecord, diagnosticTab, t))}</pre>
                    </div>
                  ) : (
                    <pre className="pre log-detail-pre log-content-pre">{diagnosticStatus || t("logs.diagnosticsMissing")}</pre>
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
