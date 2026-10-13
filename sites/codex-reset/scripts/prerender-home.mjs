import { replaceElement } from './prerender.mjs';
import { escapeHome, renderHomeDeals, renderHomeResets, homeMarketMeta, homeTime } from '../public/home-render.js';
import { getResetFocus } from '../public/reset-focus.js';
import { getHomeLayout } from '../public/home-layout.js';

export function renderHome(html, market, reset, now = Date.now()) {
  const focus = getResetFocus(reset, now);
  const layout = getHomeLayout(focus);
  html = replaceElement(html, 'home-reset-note', escapeHome(focus.note));
  const regions = new Set(market.plans.flatMap(plan => plan.quotes.map(quote => quote.country))).size;
  html = replaceElement(html, 'featured-deals', renderHomeDeals(market));
  html = replaceElement(html, 'home-reset-grid', renderHomeResets(reset, now));
  html = replaceElement(html, 'home-region-count', `${regions}<small>已收录地区</small>`);
  html = replaceElement(html, 'home-market-time', escapeHome(homeMarketMeta(market)));
  html = replaceElement(html, 'home-reset-time', escapeHome(`本地通告快照 · ${homeTime(reset.generatedAt || reset.capturedAt)}`));
  html = replaceElement(html, 'home-title', layout.titleHtml);
  for (const [id, text] of Object.entries(layout.texts)) html = replaceElement(html, id, escapeHome(text));
  html = html.replace('<body class="home-page">', `<body class="home-page${layout.priority ? ' reset-priority' : ''}">`);
  const sections = layout.sectionIds.map(id => {
    const name = id.replace('-section', '');
    const section = new RegExp(`<!-- ${name}:start -->[\\s\\S]*?<!-- ${name}:end -->`).exec(html);
    if (!section) throw new Error(`首页模板缺少 ${name} 分区标记`);
    return section[0];
  });
  html = replaceElement(html, 'home-feed', '\n' + sections.join('\n') + '\n');
  return html;
}
