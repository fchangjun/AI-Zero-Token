import { measurePriceAppendix, drawPriceAppendix } from './price-share-card.js';

/** Local announcement artwork. The only image is a same-origin author portrait. */
const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif';
const THEMES = {
  forest: { background: '#123F30', foreground: '#F5F3E9', muted: '#B9CABE', line: '#476B57', accent: '#D6F48B', pill: '#D6F48B', pillText: '#163D2E', panel: '#1D4A3A', englishPanel: '#153B2E' },
  light: { background: '#F5F3E9', foreground: '#173F30', muted: '#647369', line: '#CFD4C6', accent: '#476F29', pill: '#193F30', pillText: '#E4F4B7', panel: '#E9EEDD', englishPanel: '#EFEEE5' },
  ink: { background: '#191D1A', foreground: '#F5F3E9', muted: '#BBC4B9', line: '#454F43', accent: '#D6F48B', pill: '#D6F48B', pillText: '#202A1B', panel: '#272E25', englishPanel: '#202620' },
};
const STATUSES = { confirmed: '已确认重置', observed: '观测记录 · 未独立确认', scheduled: '计划 / 待确认', custom: '自定义通告' };
const avatarCache = new Map();

function text(value, fallback = '') {
  return String(value ?? fallback).replace(/\s+/gu, ' ').trim();
}

function glyphs(value) {
  return typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(value), item => item.segment)
    : Array.from(value);
}

function font(context, size, weight = 400) {
  context.font = `${weight} ${size}px ${FONT}`;
}

// Keep English words together; fall back to graphemes for Chinese and long URLs.
function wrap(context, value, width) {
  const lines = [];
  let line = '';
  for (const token of value.match(/\S+|\s+/gu) || []) {
    const pieces = context.measureText(token).width > width ? glyphs(token) : [token];
    for (const piece of pieces) {
      if (line && context.measureText(line + piece).width > width) {
        lines.push(line.trimEnd());
        line = piece.trimStart();
      } else {
        line += line ? piece : piece.trimStart();
      }
    }
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}

function layoutText(context, value, width, size, weight = 400, leading = 1.45) {
  font(context, size, weight);
  const lines = wrap(context, value, width);
  return { lines, size, lineHeight: size * leading, height: lines.length * size * leading, weight };
}

function fit(context, value, width, maxHeight, maximum, minimum, weight, leading) {
  for (let size = maximum; size >= minimum; size -= 1) {
    const layout = layoutText(context, value, width, size, weight, leading);
    if (layout.height <= maxHeight) return layout;
  }
  throw new Error('通告信息过长，无法清晰放入图片。请缩短标题或来源信息。');
}

function drawText(context, layout, x, y, color) {
  font(context, layout.size, layout.weight);
  context.fillStyle = color;
  layout.lines.forEach((line, index) => context.fillText(line, x, y + index * layout.lineHeight));
}

function rounded(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function star(context, x, y, radius, color) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 2.5;
  context.lineCap = 'round';
  for (let index = 0; index < 4; index += 1) {
    const angle = index * Math.PI / 4;
    context.beginPath();
    context.moveTo(x - Math.cos(angle) * radius, y - Math.sin(angle) * radius);
    context.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    context.stroke();
  }
  context.restore();
}

function drawX(context, x, y, size, color) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = size * 0.085;
  context.lineJoin = 'miter';
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x + size * 0.24, y);
  context.lineTo(x + size, y + size);
  context.lineTo(x + size * 0.76, y + size);
  context.closePath();
  context.stroke();
  context.beginPath();
  context.moveTo(x + size, y);
  context.lineTo(x + size * 0.57, y + size * 0.47);
  context.moveTo(x + size * 0.43, y + size * 0.53);
  context.lineTo(x, y + size);
  context.stroke();
  context.restore();
}

async function loadLocalAvatar(value) {
  if (typeof Image === 'undefined' || typeof location === 'undefined' || !value) return null;
  let url;
  try {
    url = new URL(value, location.href);
    if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) return null;
  } catch {
    return null;
  }
  if (!avatarCache.has(url.href)) {
    const promise = new Promise(resolve => {
      const image = new Image();
      let timer;
      const done = result => {
        clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        resolve(result);
      };
      image.onload = () => done(image.naturalWidth > 0 ? image : null);
      image.onerror = () => done(null);
      timer = setTimeout(() => done(null), 5000);
      image.src = url.href;
    });
    avatarCache.set(url.href, promise);
  }
  const image = await avatarCache.get(url.href);
  if (!image) avatarCache.delete(url.href);
  return image;
}

function drawAvatar(context, image, x, y, size, palette, name) {
  context.save();
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = palette.pill;
  context.fillRect(x, y, size, size);
  if (image) {
    const crop = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth - crop) / 2, (image.naturalHeight - crop) / 2, crop, crop, x, y, size, size);
  } else {
    font(context, size * 0.46, 650);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = palette.pillText;
    context.fillText(glyphs(name)[0] || 'T', x + size / 2, y + size / 2 + 1);
  }
  context.restore();
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size / 2 + 4, 0, Math.PI * 2);
  context.strokeStyle = palette.line;
  context.lineWidth = 2;
  context.stroke();
}

function drawPanel(context, palette, x, y, width, height, label, content, english = false) {
  rounded(context, x, y, width, height, 18);
  context.fillStyle = english ? palette.englishPanel : palette.panel;
  context.fill();
  if (english) {
    context.strokeStyle = palette.line;
    context.lineWidth = 1;
    context.stroke();
  }
  const padding = 30 + Math.max(0, height - content.height - 92) / 2;
  context.fillStyle = palette.accent;
  context.fillRect(x + 30, y + padding + 3, 3, 18);
  font(context, 18, 600);
  context.fillText(label, x + 46, y + padding);
  drawText(context, content, x + 30, y + padding + 36, english ? palette.muted : palette.foreground);
}

/**
 * Render a public announcement. Long bilingual posts grow vertically, without truncation.
 * @param {HTMLCanvasElement} canvas
 * @param {{title?: string, body?: string, englishText?: string, authorName?: string, authorHandle?: string, avatarUrl?: string, chineseLabel?: '中文译文'|'中文摘要', status?: 'confirmed'|'observed'|'scheduled'|'custom', dateLabel?: string, sourceLabel?: string, sourceUrl?: string, brand?: string, theme?: 'forest'|'light'|'ink', format?: 'portrait'|'square'}} options
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderShareCard(canvas, options = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new Error('无法创建通告画布。');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器不支持通告图片绘制。');

  const palette = THEMES[options.theme] || THEMES.forest;
  const portrait = options.format !== 'square';
  const width = 1080;
  const minimumHeight = portrait ? 1350 : 1080;
  const margin = 66;
  const contentWidth = width - margin * 2;
  const title = text(options.title, 'Codex 额度重置公告');
  const body = text(options.body, '请查看原始公告，并在自己的账户中确认实际可用额度。');
  const english = text(options.englishText);
  const brand = text(options.brand, 'RESET RADAR');
  const date = text(options.dateLabel, '以原始公告时间为准');
  const sourceUrl = text(options.sourceUrl);
  const sourceLabel = text(options.sourceLabel, '公开来源');
  const authorName = text(options.authorName, 'Tibo');
  const authorHandle = text(options.authorHandle, '@thsottiaux');
  const chineseLabel = options.chineseLabel === '中文译文' ? '中文译文' : '中文摘要';
  if (glyphs(title).length > 40 || glyphs(body).length > 220 || glyphs(english).length > 1200) {
    throw new Error('标题最多 40 字，中文最多 220 字，英文原文最多 1200 字；请选用篇幅较短的公告。');
  }
  const avatar = await loadLocalAvatar(options.avatarUrl ?? './tibo-avatar.jpg');

  // Measure all content before allocating the final image dimensions.
  const titleLayout = fit(context, title, contentWidth, portrait ? 282 : 222, portrait ? 84 : 72, 52, 700, 1.19);
  const chinese = layoutText(context, body, contentWidth - 60, portrait ? (glyphs(body).length < 100 ? 41 : 35) : 31, 500, 1.48);
  const original = layoutText(context, english || '此条记录未提供英文原文，请查看来源链接。', contentWidth - 60, portrait ? 31 : 27, 400, 1.45);
  const dateLayout = fit(context, `发布时间  ${date}`, contentWidth, 74, 23, 19, 500, 1.35);
  const sourceLayout = fit(context, sourceUrl || sourceLabel, contentWidth, 96, 21, 17, 400, 1.4);
  const brandLayout = fit(context, brand, 750, 38, 25, 18, 650, 1.2);
  const referralLayout = fit(context, '了解 AI Zero Token · github.com/fchangjun/AI-Zero-Token', contentWidth, 52, 19, 16, 400, 1.4);
  const nameLayout = fit(context, authorName, 640, 48, 35, 23, 650, 1.2);
  const handleLayout = fit(context, authorHandle, 700, 42, 23, 18, 400, 1.3);

  const titleTop = portrait ? 290 : 277;
  const titleGap = portrait ? 28 : 22;
  let chineseHeight = chinese.height + 92;
  let englishHeight = original.height + 92;
  let sectionGap = 22;
  const priceLayout = measurePriceAppendix(context, options.prices, contentWidth);
  const priceHeight = priceLayout ? priceLayout.height + 30 : 0;
  const footerHeight = priceHeight + 30 + dateLayout.height + 14 + sourceLayout.height + 36 + 26 + 10 + referralLayout.height + 48;
  const naturalHeight = titleTop + titleLayout.height + titleGap + chineseHeight + sectionGap + englishHeight + footerHeight;
  const height = Math.ceil(Math.max(minimumHeight, naturalHeight));
  if (height > 4096) throw new Error(options.prices ? '通告与价格合图过长，请关闭附带价格后分享，或选择较短通告。' : '公告篇幅过长，图片高度超过可分享范围。请选用篇幅较短的公告。');
  const remaining = height - naturalHeight;
  chineseHeight += remaining * 0.45;
  englishHeight += remaining * 0.45;
  sectionGap += remaining * 0.1;
  const chineseTop = titleTop + titleLayout.height + titleGap;
  const englishTop = chineseTop + chineseHeight + sectionGap;
  const footerTop = englishTop + englishHeight + 30;

  canvas.width = width;
  canvas.height = height;
  context.textBaseline = 'top';
  context.textAlign = 'left';
  context.fillStyle = palette.background;
  context.fillRect(0, 0, width, height);

  star(context, margin + 12, 64, 12, palette.accent);
  drawText(context, brandLayout, margin + 39, 48, palette.foreground);
  font(context, 15, 500);
  context.fillStyle = palette.muted;
  context.textAlign = 'right';
  context.fillText('PUBLIC UPDATE', width - margin, 54);
  context.textAlign = 'left';
  context.strokeStyle = palette.line;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(margin, 94);
  context.lineTo(width - margin, 94);
  context.stroke();

  drawAvatar(context, avatar, margin, 122, 82, palette, authorName);
  drawText(context, nameLayout, margin + 106, 125, palette.foreground);
  drawText(context, handleLayout, margin + 106, 173, palette.muted);
  drawX(context, width - margin - 35, 147, 29, palette.foreground);

  const status = STATUSES[options.status] || STATUSES.custom;
  font(context, 20, 600);
  const pillWidth = context.measureText(status).width + 66;
  rounded(context, margin, 226, pillWidth, 39, 19.5);
  context.fillStyle = palette.pill;
  context.fill();
  context.fillStyle = palette.pillText;
  context.beginPath();
  context.arc(margin + 22, 245.5, 3.5, 0, Math.PI * 2);
  context.fill();
  context.fillText(status, margin + 36, 234);

  drawText(context, titleLayout, margin, titleTop, palette.foreground);
  drawPanel(context, palette, margin, chineseTop, contentWidth, chineseHeight, chineseLabel, chinese);
  drawPanel(context, palette, margin, englishTop, contentWidth, englishHeight, english ? '英文原文 / ORIGINAL POST' : '原始记录 / SOURCE NOTE', original, true);
  drawText(context, dateLayout, margin, footerTop, palette.foreground);
  drawText(context, sourceLayout, margin, footerTop + dateLayout.height + 14, palette.muted);

  const disclaimerTop = footerTop + dateLayout.height + 14 + sourceLayout.height + 36;
  font(context, 18, 400);
  context.fillStyle = palette.muted;
  context.fillText('第三方公开信息整理，不代表个人账户实际额度。', margin, disclaimerTop);
  if (priceLayout) drawPriceAppendix(context, options.prices, {x:margin,y:disclaimerTop+66,width:contentWidth,palette,layout:priceLayout});
  drawText(context, referralLayout, margin, disclaimerTop + 36 + priceHeight, palette.muted);
  context.fillStyle = palette.accent;
  context.fillRect(width - margin - 40, height - 27, 40, 3);
  return canvas;
}

/** Encode asynchronously without creating a large base64 string. */
export async function exportShareBlob(canvas) {
  if (!canvas || typeof canvas.toBlob !== 'function') throw new Error('当前浏览器不支持 PNG 图片导出。');
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => {
        if (blob && blob.size > 0) resolve(blob);
        else reject(new Error('PNG 图片生成失败，请重试。'));
      }, 'image/png');
    } catch (error) {
      reject(new Error(`无法导出通告图片：${error instanceof Error ? error.message : '未知错误'}`));
    }
  });
}
