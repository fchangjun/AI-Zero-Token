import { getRecordTranslation } from './reset-translations.js';

const clean = value => typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
const displayText = value => clean(clean(value).replace(/https?:\/\/t\.co\/[a-z0-9]+(?:[?#][^\s]*)?/giu, ''));

/** Local copy only: retain the original English and distinguish translations from summaries. */
export function getResetCopy(record, { mode = '' } = {}) {
  const english = displayText(record?.text);
  const translated = getRecordTranslation(record);
  const translatedChinese = translated ? displayText(translated.text) : '';
  if (translated && translatedChinese) return { english, chinese: translatedChinese, label: translated.automatic ? '自动中文译文' : '中文译文', type: 'translation' };
  const summary = clean(record?.summaryZh);
  if (summary) return { english, chinese: summary, label: '中文速读', type: 'summary' };

  // Translate this entire known sentence, never a matching fragment inside a longer post.
  const landing = /^Landing within the next (\d+(?:\.\d+)?) (hours?|minutes?)\.?$/iu.exec(english);
  if (landing && Number(landing[1]) > 0 && Number.isFinite(Number(landing[1]))) {
    return {
      english, chinese: `预计在接下来的 ${landing[1]} ${/^hours?$/iu.test(landing[2]) ? '小时' : '分钟'}内到账。`,
      label: '中文释义', type: 'translation',
    };
  }

  if (/^@maria_rcks Can[’']t argue with that, Let[’']s break the cycle\.?$/iu.test(english)) {
    return { english, chinese: '@maria_rcks 无法反驳，那就让我们打破这个循环吧。', label: '中文释义', type: 'translation' };
  }
  if (/^Done and dusted[.!]?$/iu.test(english)) {
    return { english, chinese: '已经全部完成。', label: '中文释义', type: 'translation' };
  }

  let chinese = '已收录公开重置消息，详情请查看英文原文。';
  if (!record || !english) chinese = '暂无可核验的通告内容，待公开消息更新。';
  else if (mode === 'watch') chinese = '出现新的重置相关信号，尚无正式预告，请查看原文。';
  else if (mode === 'forecast') chinese = '已发布新的重置预告，具体安排请查看英文原文。';
  else if (mode === 'confirmed') chinese = '已收录公开重置通告，详情请查看英文原文并核对账户额度。';
  else if (mode === 'observed') chinese = '已收录一条重置观测记录，尚需公开通告确认。';
  return { english, chinese, label: '中文速读', type: 'summary' };
}
