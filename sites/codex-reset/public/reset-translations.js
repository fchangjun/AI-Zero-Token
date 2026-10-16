import { isResetDataset, mergeResetHistory } from './reset-cache.js';

export const CENTRAL_RESET_SNAPSHOT = 'https://fchangjun.github.io/AI-Zero-Token/snapshot.json';
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

/** Translate a whole exact post, never a matching excerpt or a different source. */
export function sameResetPost(left, right) {
  return Boolean(left && right && nonempty(left.text) && left.text === right.text &&
    left.source && right.source && left.source.type === right.source.type &&
    left.source.author === right.source.author && left.source.url === right.source.url &&
    (left.id == null || right.id == null || left.id === right.id));
}

/** Invalid machine provenance must not turn into an apparently human translation. */
export function getRecordTranslation(record) {
  if (!nonempty(record?.translationZh)) return null;
  if (record.translationMeta === undefined) return { text: record.translationZh, meta: null, automatic: false };
  const meta = record.translationMeta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta) || meta.provider !== 'opus-mt-en-zh' ||
      !nonempty(meta.modelRevision) || typeof meta.translatedAt !== 'string' || !Number.isFinite(Date.parse(meta.translatedAt)) ||
      !nonempty(record.text) || meta.sourceText !== record.text) return null;
  return { text: record.translationZh, meta, automatic: true };
}

const datasetRecords = data => [...data.records, data.status.latest_reset, data.status.scheduled_reset, data.status.active_watch].filter(Boolean);

/** Donors only add copy: they never change public status, dates, or history completeness. */
export function enrichResetTranslations(data, donors = [], { preferDonors = false } = {}) {
  if (!isResetDataset(data)) return data;
  const validDonors = donors.filter(isResetDataset);
  const known = (preferDonors ? [...validDonors, data] : [data, ...validDonors]).flatMap(datasetRecords);
  const enrich = record => {
    if (!record) return record;
    const matches = known.filter(candidate => sameResetPost(record, candidate));
    const translations = matches.map(getRecordTranslation).filter(Boolean);
    const translation = translations.find(item => !item.automatic) || translations.sort((left, right) => Date.parse(right.meta.translatedAt) - Date.parse(left.meta.translatedAt))[0];
    const summary = nonempty(record.summaryZh) ? record.summaryZh : matches.find(candidate =>
      candidate.status === record.status && candidate.reset_type === record.reset_type && nonempty(candidate.summaryZh))?.summaryZh;
    const result = { ...record, ...(summary ? { summaryZh: summary } : {}) };
    if (translation) {
      result.translationZh = translation.text;
      if (translation.automatic) result.translationMeta = { ...translation.meta };
      else delete result.translationMeta;
    }
    return result;
  };
  return { ...data, records: data.records.map(enrich), status: { ...data.status,
    latest_reset: enrich(data.status.latest_reset), scheduled_reset: enrich(data.status.scheduled_reset), active_watch: enrich(data.status.active_watch),
  } };
}

/** Keep the newest status even when a newly published translation uses an older API capture. */
export function mergePublishedResetData(current, snapshots = []) {
  const valid = snapshots.filter(isResetDataset).sort((left, right) => Date.parse(left.generatedAt) - Date.parse(right.generatedAt));
  let data = isResetDataset(current) ? current : null;
  for (const snapshot of valid) {
    if (!data) data = snapshot;
    else if (Date.parse(snapshot.generatedAt) > Date.parse(data.generatedAt)) data = mergeResetHistory(data, snapshot);
    else data = mergeResetHistory(snapshot, data);
  }
  return data ? enrichResetTranslations(data, [...valid, current]) : null;
}

/** One static bundle can follow the maintained snapshot from any hosting platform. */
export function publishedSnapshotUrls({ assetBase = import.meta.url, centralUrl = CENTRAL_RESET_SNAPSHOT, now = Date.now() } = {}) {
  const targets = new Set([new URL('./snapshot.json', assetBase).href, new URL(centralUrl).href]);
  return [...targets].map(target => {
    const url = new URL(target);
    // Pages/CDN caches can outlive a deployment; each foreground check gets a new cache bucket.
    url.searchParams.set('_snapshot', String(Math.floor(now / (5 * 60000))));
    return url.href;
  });
}

export async function loadPublishedResetSnapshots({ request, assetBase, centralUrl, now } = {}) {
  const signal = AbortSignal.timeout(6000);
  const read = request || (async (url, options) => {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error('发布快照暂不可用');
    return response.json();
  });
  const results = await Promise.allSettled(publishedSnapshotUrls({ assetBase, centralUrl, now }).map(url =>
    Promise.resolve().then(() => read(url, { cache: 'no-store', signal }))));
  return results.filter(result => result.status === 'fulfilled' && isResetDataset(result.value)).map(result => result.value);
}
