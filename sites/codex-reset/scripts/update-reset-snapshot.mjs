import { readFile, writeFile, rename, unlink, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { isResetDataset } from '../public/reset-cache.js';
import { getResetCopy } from '../public/reset-copy.js';
import { fetchResetUpdate } from '../public/reset-sync.js';
import { sameResetPost, getRecordTranslation, enrichResetTranslations } from '../public/reset-translations.js';

const DEFAULT_SNAPSHOT = fileURLToPath(new URL('../public/snapshot.json', import.meta.url));
const SOURCE = Object.freeze({
  name: 'Codex Resets', url: 'https://codex-resets.com', docsUrl: 'https://codex-resets.com/api/docs',
  statusUrl: 'https://codex-resets.com/api/v1/status',
  historyUrl: 'https://codex-resets.com/api/v1/resets?limit=100&order=desc',
});
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const timestamp = now => new Date(typeof now === 'function' ? now() : now).toISOString();
const allRecords = data => [data.status.active_watch, data.status.scheduled_reset, data.status.latest_reset, ...data.records].filter(Boolean);
const inputText = record => typeof record?.text === 'string' && /[a-z]/iu.test(record.text) ? record.text : '';

/** Validate MT output before it can be represented as a Chinese translation. */
export function isUsableChineseTranslation(output, original) {
  if (typeof output !== 'string' || !output.trim() || !/\p{Script=Han}/u.test(output)) return false;
  if (output.trim().toLocaleLowerCase() === original.trim().toLocaleLowerCase()) return false;
  return !/^(?:error\b|translation (?:error|failed)\b|翻译(?:失败|错误)|(?:请求|服务|接口|模型)(?:失败|错误|不可用))/iu.test(output.trim());
}

async function defaultTranslator() {
  const { createResetTranslator } = await import('./translate-reset.mjs');
  return createResetTranslator();
}

/**
 * Collect authoritative status and full history, then enrich only matching original posts.
 * The injected request/translator/clock make failures testable without writing the real snapshot.
 */
export async function updateResetSnapshot({
  previous, request, translate, translationSources = [], now = Date.now,
  maxTranslations = 20, maxTranslationChars = 24000, warn = () => {},
} = {}) {
  if (!isResetDataset(previous)) throw new Error('备用通告快照校验未通过');
  if (typeof request !== 'function') throw new TypeError('必须提供公开接口请求函数');
  if (!Number.isInteger(maxTranslations) || maxTranslations < 0 || !Number.isInteger(maxTranslationChars) || maxTranslationChars < 0) throw new TypeError('翻译预算必须是非负整数');

  let historyGeneratedAt;
  const trackedRequest = async (url, options) => {
    const response = await request(url, options);
    if (url.includes('/resets?') && historyGeneratedAt === undefined && validDate(response?.meta?.generated_at)) historyGeneratedAt = response.meta.generated_at;
    return response;
  };
  // A status failure/invalid/rollback throws here, before any translator or file write is used.
  const update = await fetchResetUpdate(trackedRequest, { previous, fullHistory: true });
  const capturedAt = timestamp(now);
  let data = enrichResetTranslations(structuredClone(update.data), [...translationSources, previous], { preferDonors: true });
  data = { ...data, version: 1, capturedAt, source: { ...SOURCE } };
  if (!update.historyError && historyGeneratedAt) data.historyGeneratedAt = historyGeneratedAt;
  else if (validDate(previous.historyGeneratedAt)) data.historyGeneratedAt = previous.historyGeneratedAt;
  else delete data.historyGeneratedAt;
  if (data.historyComplete) data.historyCursor = null;

  const records = allRecords(data);
  let localTranslations = 0;
  // These complete-sentence rules are reviewed Chinese copy, not inferred machine summaries.
  for (const record of records) {
    if (getRecordTranslation(record) || !inputText(record)) continue;
    const copy = getResetCopy({ text: record.text });
    if (copy.type !== 'translation' || !isUsableChineseTranslation(copy.chinese, record.text)) continue;
    for (const matching of records.filter(candidate => sameResetPost(candidate, record))) {
      if (getRecordTranslation(matching)) continue;
      matching.translationZh = copy.chinese;
      delete matching.translationMeta;
    }
    localTranslations++;
  }
  const pending = [];
  for (const record of records) {
    if (!getRecordTranslation(record) && inputText(record) && !pending.some(known => sameResetPost(known, record))) pending.push(record);
  }

  let attempted = 0, translated = 0, translationFailures = 0, inputChars = 0, translator;
  let ownedTranslator = false;
  const warnings = [];
  const warning = message => { warnings.push(message); warn(message); };
  try {
    for (const record of pending) {
      if (attempted >= maxTranslations) break;
      const original = record.text;
      // Never truncate a long post to fit a budget; the translator owns lossless segmentation.
      if (inputChars + original.length > maxTranslationChars) continue;
      if (!translator) {
        try {
          translator = translate ?? await defaultTranslator();
          ownedTranslator = translate === undefined;
          const operation = typeof translator === 'function' ? translator : translator?.translate;
          const info = translator?.info ?? operation?.info;
          if (typeof operation !== 'function' || info?.provider !== 'opus-mt-en-zh' || typeof info?.modelRevision !== 'string' || !info.modelRevision.trim()) throw new Error('翻译模型来源信息不完整');
        } catch {
          translationFailures++;
          warning('自动中文翻译暂不可用，已保留原文与既有译文；后续更新会重试。');
          break;
        }
      }
      attempted++;
      inputChars += original.length;
      try {
        const operation = typeof translator === 'function' ? translator : translator.translate;
        const info = translator.info ?? operation.info;
        const output = await operation(original);
        if (!isUsableChineseTranslation(output, original)) throw new Error('中文翻译结果校验未通过');
        const translationMeta = { provider: 'opus-mt-en-zh', modelRevision: info.modelRevision, translatedAt: timestamp(now), sourceText: original };
        for (const matching of records.filter(candidate => sameResetPost(candidate, record))) {
          if (getRecordTranslation(matching)) continue;
          matching.translationZh = output.trim();
          matching.translationMeta = { ...translationMeta };
        }
        translated++;
      } catch {
        translationFailures++;
        warning('一条通告的自动中文翻译未通过，已保留原文与既有译文；后续更新会重试。');
      }
    }
  } finally {
    if (ownedTranslator && typeof translator?.dispose === 'function') {
      try { await translator.dispose(); }
      catch { warning('翻译运行时清理未完成，通告及有效译文仍将保留。'); }
    }
  }
  if (!isResetDataset(data)) throw new Error('新通告快照完整校验未通过');
  if (update.historyError) warning('已保存新通告状态；历史接口暂不可用，保留既有历史并标记为不完整。');
  return { data, historyError: update.historyError, translated, localTranslations, attempted,
    translationFailures, pendingTranslations: pending.length - translated, inputChars, warnings };
}

/** Replace only a completely validated payload, using an atomic rename in the same directory. */
export async function writeResetSnapshot(path, data) {
  if (!isResetDataset(data) || !validDate(data.capturedAt)) throw new Error('拒绝写入无效通告快照');
  const destination = resolve(path);
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, destination);
  } finally { await unlink(temporary).catch(() => {}); }
}

export async function requestResetJson(url, { signal } = {}) {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json', 'User-Agent': 'Codex-Intel-Station-Snapshot/1.0', 'Cache-Control': 'no-cache' } });
  if (!response.ok) throw new Error(`公开通告接口请求失败 (${response.status})`);
  return response.json();
}

export async function updateResetSnapshotFile({ snapshot = DEFAULT_SNAPSHOT, translations = [], request = requestResetJson, ...options } = {}) {
  const previous = JSON.parse(await readFile(snapshot, 'utf8'));
  const translationSources = await Promise.all(translations.map(async path => JSON.parse(await readFile(path, 'utf8'))));
  for (const data of translationSources) if (!isResetDataset(data)) throw new Error('备用人工译文来源校验未通过');
  const result = await updateResetSnapshot({ ...options, previous, request, translationSources });
  await writeResetSnapshot(snapshot, result.data);
  return result;
}

async function main(args) {
  let snapshot = DEFAULT_SNAPSHOT;
  const translations = [];
  let maxTranslations = 20, maxTranslationChars = 24000;
  for (const argument of args) {
    if (argument.startsWith('--snapshot=')) snapshot = resolve(argument.slice('--snapshot='.length));
    else if (argument.startsWith('--translations=')) translations.push(resolve(argument.slice('--translations='.length)));
    else if (argument.startsWith('--max-translations=')) maxTranslations = Number(argument.slice('--max-translations='.length));
    else if (argument.startsWith('--max-translation-chars=')) maxTranslationChars = Number(argument.slice('--max-translation-chars='.length));
    else throw new Error(`未知更新参数：${argument}`);
  }
  const result = await updateResetSnapshotFile({ snapshot, translations, maxTranslations, maxTranslationChars, warn: message => console.warn(message) });
  console.log(`备用通告已更新：${result.data.records.length} 条历史；来源时间 ${result.data.generatedAt}；采集时间 ${result.data.capturedAt}。`);
  console.log(`中文译文：自动新增 ${result.translated} 条，整句规则 ${result.localTranslations} 条，待补 ${result.pendingTranslations} 条。`);
  if (result.translationFailures) console.warn('::warning title=自动译文待补::部分通告暂未得到有效中文，已保留原文，下一轮将重试。');
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `### Codex intelligence snapshot\n\n- Source time: ${result.data.generatedAt}\n- Captured: ${result.data.capturedAt}\n- History: ${result.data.records.length} records (${result.data.historyComplete ? 'complete' : 'partial'})\n- New machine translations: ${result.translated}\n- Pending translations: ${result.pendingTranslations}\n- Translation failures: ${result.translationFailures}\n\n`).catch(() => console.warn('执行摘要写入失败，通告快照已保存。'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => {
    console.error('备用通告更新失败：未替换既有有效快照。请检查公开接口与执行日志。');
    process.exitCode = 1;
  });
}
