import { useEffect, useMemo, useState } from "react";
import { Copy, Filter, Search } from "lucide-react";
import type { RequestLog } from "@/shared/types";
import { copyText } from "@/shared/lib/app-utils";
import { formatDuration, formatTime } from "@/shared/lib/format";
import { formatJson } from "@/shared/lib/format";

export function RequestLogs(props: { logs: RequestLog[] }) {
  const [query, setQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  function copySelectedLog() {
    if (!selectedLog) return;
    copyText(formatJson(selectedLog))
      .then((ok) => {
        if (!ok) return;
      })
      .catch(() => undefined);
  }

  return (
    <section className="log-table-wrap" id="logs">
      <div className="section-head compact">
        <div>
          <h2>请求日志</h2>
          <p>记录网关最近收到的 API 请求，详情为安全摘要。</p>
        </div>
      </div>
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
            <pre className="pre log-detail-pre">{formatJson(selectedLog)}</pre>
          </div>
        </div>
      )}
    </section>
  );
}
