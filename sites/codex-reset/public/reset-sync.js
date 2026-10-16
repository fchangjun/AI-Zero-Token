import { isResetDataset, mergeResetHistory } from './reset-cache.js';

const API = 'https://codex-resets.com/api/v1';
const COMPLETED = new Set(['completed', 'complete', 'confirmed', 'propagated']);
const completion = record => record && (record.status == null || COMPLETED.has(record.status));
const uniqueRecords = records => {
  const unique = new Map();
  for (const record of records) {
    const known = unique.get(record.id);
    if (!known) unique.set(record.id, record);
    else if (known.text === record.text && known.reset_type === record.reset_type && known.source.type === record.source.type && known.source.url === record.source.url) {
      unique.set(record.id, { ...known,
        ...(!known.summaryZh && known.status === record.status && typeof record.summaryZh === 'string' ? { summaryZh: record.summaryZh } : {}),
        ...(!known.translationZh && typeof record.translationZh === 'string' ? { translationZh: record.translationZh,
          ...(record.translationMeta !== undefined ? { translationMeta: record.translationMeta } : {}) } : {}),
      });
    }
  }
  return [...unique.values()].sort((a, b) => Date.parse(b.announced_at) - Date.parse(a.announced_at));
};

/** Status remains authoritative even when the separate history request cannot finish. */
export async function fetchResetUpdate(request, { previous = null, fullHistory = false, historyLimit = fullHistory ? 100 : 12 } = {}) {
  const signal = AbortSignal.timeout(6000);
  const limit = fullHistory ? Math.max(100, historyLimit) : historyLimit;
  const history = async () => {
    let page = await request(`${API}/resets?limit=${limit}&order=desc`, { signal });
    let records = [];
    const cursors = new Set();
    while (true) {
      if (!Array.isArray(page?.data) || (fullHistory && typeof page.pagination?.has_more !== 'boolean')) throw new Error('历史记录格式无法识别');
      records.push(...page.data);
      if (records.length > 5000) throw new Error('历史记录尚未完整获取');
      if (!fullHistory || !page.pagination.has_more) return records;
      const cursor = page.pagination.next_cursor;
      if (typeof cursor !== 'string' || !cursor || cursors.has(cursor) || records.length >= 5000) throw new Error('历史记录尚未完整获取');
      cursors.add(cursor);
      signal.throwIfAborted();
      page = await request(`${API}/resets?limit=${limit}&order=desc&cursor=${encodeURIComponent(cursor)}`, { signal });
    }
  };
  const [statusResult, historyResult] = await Promise.allSettled([
    Promise.resolve().then(() => request(`${API}/status`, { signal })),
    history(),
  ]);
  if (statusResult.status === 'rejected') throw statusResult.reason;
  const response = statusResult.value;
  const base = { version: 1, generatedAt: response?.meta?.generated_at, status: response?.data, records: [] };
  if (!isResetDataset(base)) throw new Error('公开通告状态校验未通过');
  const known = isResetDataset(previous) ? previous : null;
  if (known && Date.parse(base.generatedAt) < Date.parse(known.generatedAt)) throw new Error('数据源返回较旧通告，已保留较新数据');

  const historyValid = historyResult.status === 'fulfilled' && isResetDataset({ ...base, records: historyResult.value });
  const historyError = historyValid ? '' : '通告已更新，历史暂不可用';
  const latest = completion(base.status.latest_reset) ? base.status.latest_reset : null;
  const fetched = historyValid ? historyResult.value : [];
  const latestIncluded = !latest || fetched.some(record => record.id === latest.id);
  const records = uniqueRecords([...(latest ? [latest] : []), ...fetched]).slice(0, 5000);
  const incoming = {
    ...base,
    status: latest ? { ...base.status, latest_reset: records.find(record => record.id === latest.id) } : base.status,
    records,
    // A status newer than the complete feed can reveal a gap between the endpoints.
    historyComplete: Boolean(fullHistory && historyValid && latestIncluded),
  };
  return { data: mergeResetHistory(known, incoming), historyError };
}

/** Coalesce foreground/network recovery events without bypassing the caller's retry gate. */
export function createResetResumeSync({ refresh, getState, isVisible, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, minAgeMs = 60000 }) {
  let timer = null;
  let requested = false;
  let disposed = false;
  const cancelTimer = () => { if (timer !== null) clearTimer(timer); timer = null; };
  function attempt() {
    cancelTimer();
    if (disposed || !requested) return;
    if (!isVisible()) { requested = false; return; }
    const state = getState();
    if (state.busy) return; // The caller invokes settled() after any in-flight attempt.
    const age = Number.isFinite(state.lastAttemptAt) ? now() - state.lastAttemptAt : Infinity;
    if (!state.failed && age < minAgeMs) { requested = false; return; }
    const delay = Math.max(0, (state.retryAt || 0) - now());
    if (delay > 0) { timer = setTimer(attempt, delay); return; }
    requested = false;
    try { void Promise.resolve(refresh()).catch(() => { /* The caller owns its error UI. */ }); }
    catch { /* Synchronous failures are also reported by the caller. */ }
  }
  return {
    resume() { requested = true; attempt(); },
    settled: attempt,
    dispose() { disposed = true; requested = false; cancelTimer(); },
  };
}
