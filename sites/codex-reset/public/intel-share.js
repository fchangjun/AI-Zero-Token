import { getIntelCardData, intelCardCaption, renderIntelCard } from './intel-card.js';
import { isResetDataset, pickResetDataset } from './reset-cache.js';
import { assertMarket, mergeFx, readCachedFx } from './market-data.js';

let options = {};
let controller;
let installed = false;
const assets = path => new URL(path, import.meta.url).href;
const pending = new Map();
const fetched = new Map();
const stored = key => {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
};
const embedded = id => {
  try { return JSON.parse(document.getElementById(id)?.textContent || 'null'); } catch { return null; }
};
const callback = name => {
  try { return options[name]?.() ?? null; } catch { return null; }
};
function validMarket(value) {
  try { return assertMarket(value); } catch { return null; }
}
function selectReset() {
  return pickResetDataset(embedded('reset-snapshot'), [
    stored('azt-reset-radar-v1'), stored('codex-intel-home-resets-v1'),
    fetched.get('reset'), callback('getResetData'),
  ]).data;
}
function selectMarket() {
  const data = validMarket(callback('getMarketData')) || validMarket(embedded('market-snapshot')) || validMarket(fetched.get('market'));
  if (!data) return null;
  let fx = data.fx;
  try {
    const saved = readCachedFx(localStorage);
    if (saved) fx = mergeFx(fx, { ...saved, mode: 'cache' });
  } catch { /* Local storage is optional. */ }
  return { ...data, fx };
}
async function loadMissing(kind) {
  if (pending.has(kind)) return pending.get(kind);
  const request = (async () => {
    const response = await fetch(assets(kind === 'reset' ? './snapshot.json' : './data/prices.json'), {
      cache: 'no-cache', signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error('站内情报暂不可用');
    const data = await response.json();
    if (kind === 'reset' ? !isResetDataset(data) : !validMarket(data)) throw new Error('站内情报校验未通过');
    fetched.set(kind, data);
  })().catch(() => { /* Existing information remains usable when a request fails. */ }).finally(() => pending.delete(kind));
  pending.set(kind, request);
  return request;
}
function projectUrl() {
  const fallback = 'https://github.com/fchangjun/AI-Zero-Token';
  try {
    const url = new URL(document.querySelector('[data-azt-action="repo"]')?.href || fallback);
    if (url.protocol === 'https:' && url.hostname === 'github.com' && url.pathname.toLowerCase().replace(/\/$/, '') === '/fchangjun/ai-zero-token') return url.href;
  } catch { /* Keep the known project link. */ }
  return fallback;
}
const canvasBlob = canvas => new Promise((resolve, reject) => {
  try { canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片导出暂不可用，请复制摘要。')), 'image/png'); }
  catch { reject(new Error('图片导出暂不可用，请复制摘要。')); }
});

function createController() {
  const dialog = document.createElement('dialog');
  dialog.id = 'intel-share-dialog';
  dialog.setAttribute('aria-labelledby', 'intel-share-title');
  dialog.setAttribute('aria-describedby', 'intel-share-description');
  dialog.innerHTML = `
    <header class="intel-share-header">
      <div><h2 id="intel-share-title">分享今日情报</h2><p id="intel-share-description">重置信号 · Plus / Pro 最低价</p></div>
      <button class="intel-share-close" type="button" data-intel-close aria-label="关闭今日情报分享">×</button>
    </header>
    <div class="intel-share-body" aria-busy="true">
      <div class="intel-share-preview">
        <span class="intel-share-loading" data-intel-loading>正在整理今日情报…</span>
        <canvas id="intel-share-canvas" role="img" aria-label="今日情报分享图：重置信号与 Plus、Pro 最低地区价格" hidden></canvas>
      </div>
      <label class="intel-share-manual" hidden>情报摘要<textarea data-intel-caption rows="6" readonly></textarea><small>选中文字后手动复制</small></label>
    </div>
    <footer class="intel-share-footer">
      <p id="intel-share-status" role="status" aria-live="polite">正在准备分享图片</p>
      <div class="intel-share-actions">
        <button type="button" data-intel-copy disabled>复制摘要</button>
        <button type="button" data-intel-save disabled>保存 PNG</button>
        <button type="button" data-intel-native class="intel-share-primary" disabled>分享图片 ↗</button>
      </div>
    </footer>`;
  document.body.append(dialog);
  const node = name => dialog.querySelector(`[data-intel-${name}]`);
  const preview = dialog.querySelector('#intel-share-canvas');
  const body = dialog.querySelector('.intel-share-body');
  const manual = dialog.querySelector('.intel-share-manual');
  const status = message => { dialog.querySelector('#intel-share-status').textContent = message; };
  const urls = new Map();
  let renderId = 0;
  let info = null;
  let blob = null;
  let caption = '';
  let opener = null;
  let filename = 'Codex-今日情报.png';
  const hasNativeShare = typeof navigator.share === 'function';
  node('native').hidden = !hasNativeShare;
  if (!hasNativeShare) node('save').classList.add('intel-share-primary');
  function save() {
    if (!blob) { status('图片尚未就绪，可先复制摘要。'); return false; }
    try {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      urls.set(url, setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); }, 60000));
      status('PNG 已开始下载，保存后即可转发。');
      return true;
    } catch { status('暂时无法下载，请先复制摘要。'); return false; }
  }
  function releaseUrls() {
    for (const [url, timer] of urls) { clearTimeout(timer); URL.revokeObjectURL(url); }
    urls.clear();
  }
  node('close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (dialog.open) return; // Ignore an older close event if the dialog was already reopened.
    renderId++;
    info = null;
    blob = null;
    caption = '';
    preview.hidden = true;
    preview.getContext('2d')?.clearRect(0, 0, preview.width, preview.height);
    node('caption').value = '';
    if (opener?.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    opener = null;
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  node('copy').addEventListener('click', async () => {
    if (!info || !caption) return;
    const id = renderId;
    try {
      await navigator.clipboard.writeText(caption);
      if (id === renderId && dialog.open) status('情报摘要已复制。');
    } catch {
      if (id !== renderId || !dialog.open) return;
      manual.hidden = false;
      node('caption').value = caption;
      node('caption').focus();
      node('caption').select();
      status('请在摘要框中手动复制。');
    }
  });
  node('save').addEventListener('click', save);
  node('native').addEventListener('click', async () => {
    if (!blob) return;
    const id = renderId;
    try {
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Codex 情报站 · 今日情报', text: '最新重置信号与 Plus / Pro 最低地区价格，时间及来源见图片。' });
        if (id === renderId && dialog.open) status('图片已交给系统分享。');
      } else if (save()) status('此浏览器已改为保存 PNG，保存后即可转发。');
    } catch (error) {
      if (id === renderId && dialog.open && error.name !== 'AbortError') status('系统分享未完成，请保存 PNG 后转发。');
    }
  });
  window.addEventListener('pagehide', releaseUrls);
  return {
    async open() {
      // An open preview is deliberately immutable, even when page data refreshes.
      if (dialog.open) return;
      opener = document.activeElement;
      const id = ++renderId;
      const now = Date.now();
      const proPlanId = callback('getProPlanId') || 'pro200';
      info = null; blob = null; caption = '';
      manual.hidden = true;
      preview.hidden = true;
      node('loading').hidden = false;
      node('loading').textContent = '正在整理今日情报…';
      body.setAttribute('aria-busy', 'true');
      for (const name of ['copy', 'save', 'native']) node(name).disabled = true;
      status('正在准备分享图片');
      dialog.showModal();
      try {
        let reset = selectReset();
        let market = selectMarket();
        if (!reset || !market) {
          await Promise.all([!reset && loadMissing('reset'), !market && loadMissing('market')]);
          if (id !== renderId || !dialog.open) return;
          reset = reset || selectReset();
          market = market || selectMarket();
        }
        info = getIntelCardData(reset, market, { proPlanId, now });
        if (!info) throw new Error('暂无可分享的情报，请刷新后重试。');
        caption = intelCardCaption(info, { pageUrl: assets('./index.html'), aztUrl: projectUrl() });
        node('caption').value = caption;
        node('copy').disabled = !caption;
        filename = `Codex-今日情报-${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)}.png`;
        const canvas = document.createElement('canvas');
        await renderIntelCard(canvas, info, { avatarUrl: assets('./tibo-avatar.jpg') });
        const nextBlob = await canvasBlob(canvas);
        if (id !== renderId || !dialog.open) return;
        preview.width = canvas.width;
        preview.height = canvas.height;
        preview.getContext('2d').drawImage(canvas, 0, 0);
        preview.hidden = false;
        blob = nextBlob;
        node('loading').hidden = true;
        node('save').disabled = false;
        node('native').disabled = false;
        status('');
      } catch (error) {
        if (id !== renderId || !dialog.open) return;
        node('loading').textContent = '暂时无法生成预览';
        status(error.message || '图片生成失败，请刷新后重试。');
      } finally {
        if (id === renderId && dialog.open) body.setAttribute('aria-busy', 'false');
      }
    },
  };
}

/** One compact share experience per document. Data is frozen when open() is called. */
export function setupIntelShare(nextOptions = {}) {
  options = nextOptions;
  if (!installed) {
    installed = true;
    document.addEventListener('click', event => {
      const trigger = event.target.closest?.('[data-share-intel]');
      if (!trigger || trigger.disabled || trigger.getAttribute('aria-disabled') === 'true') return;
      event.preventDefault();
      controller ||= createController();
      void controller.open();
    });
  }
  return { open() { controller ||= createController(); return controller.open(); } };
}
