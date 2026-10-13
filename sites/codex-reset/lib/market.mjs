export const PLANS = [
  { id: 'go', name: 'Go', usd: 8, slug: 'go-monthly', note: '轻量入门' },
  { id: 'plus', name: 'Plus', usd: 20, slug: 'plus-monthly', note: '日常创作' },
  { id: 'pro100', name: 'Pro 100', usd: 100, slug: 'pro-5x', note: '进阶工作' },
  { id: 'pro200', name: 'Pro 200', usd: 200, slug: 'pro-20x', note: '高频使用' },
  { id: 'pro500', name: 'Pro 500', usd: 500, slug: 'pro-500', note: '深度工作' },
].map(p => ({ ...p, url: `https://priceai.cc/official-prices/chatgpt__${p.slug}` }));

const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
function plain(value) {
  return value.replace(/<[^>]*>/g, '').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (_, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return n <= 0x10ffff ? String.fromCodePoint(n) : ''; }
    return entities[e] ?? '';
  }).replace(/\s+/gu, ' ').trim();
}

// Website quotes use en-US numbers; Apple storefronts use the region's locale.
export function parseAmount(label, channel) {
  const multiplier = /juta/i.test(label) ? 1e6 : /ribu/i.test(label) ? 1e3 : 1;
  let n = label.replace(/[^\d.,]/g, '');
  if (!n || n.length > 24) return null;
  if (multiplier > 1) n = n.replace(/\./g, '').replace(',', '.');
  else if (channel === 'web_direct') n = n.replace(/,/g, '');
  else {
    const comma = n.lastIndexOf(','), dot = n.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) {
      const decimal = comma > dot ? ',' : '.';
      n = n.replace(decimal === ',' ? /\./g : /,/g, '').replace(',', '.');
    } else {
      const sep = comma >= 0 ? ',' : dot >= 0 ? '.' : null;
      if (sep) {
        const parts = n.split(sep);
        n = parts.length === 2 && parts[1].length <= 2 ? parts.join('.') : parts.join('');
      }
    }
  }
  const amount = Number(n) * multiplier;
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function parsePricePage(html, plan, fetchedAt = new Date().toISOString()) {
  if (html.length > 4_000_000) throw new Error('报价页过大');
  const modified = html.match(/"dateModified"\s*:\s*"([^"]+)"/)?.[1];
  if (!modified || !Number.isFinite(Date.parse(modified))) throw new Error('缺少报价更新时间');
  const quotes = [], seen = new Set();
  let skipped = 0;
  for (const row of html.matchAll(/<tr\b[^>]*data-row-channel="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const channel = row[1];
    if (!['web_direct', 'app_store'].includes(channel)) continue;
    const cells = [...row[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(x => x[1]);
    if (cells.length !== 7) { skipped++; continue; }
    const spans = c => [...c.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/g)].map(x => plain(x[1]));
    const [region, country] = spans(cells[0]), [label, currency] = spans(cells[2]);
    const amount = parseAmount(label || '', channel);
    const source = cells[6].match(/href="([^"]+)"/)?.[1];
    const key = `${country}:${channel}`;
    const official = source && (channel === 'web_direct' ? /^https:\/\/chatgpt\.com\/backend-api\/checkout_pricing_config\/configs\/[A-Z]{2}$/.test(source) : /^https:\/\/apps\.apple\.com\/[a-z]{2}\/app\//.test(source));
    if (!region || !/^[A-Z]{2}$/.test(country || '') || !/^[A-Z]{3}$/.test(currency || '') || !amount || !official || seen.has(key)) { skipped++; continue; }
    seen.add(key);
    quotes.push({ country, region, channel, currency, amount, label, source, reportedAge: plain(cells[5]) });
  }
  if (quotes.length < 20 || skipped > 5) throw new Error('报价页面结构变更');
  return { ...plan, quotes, skipped, updatedAt: modified, fetchedAt };
}

export { parseFx } from '../public/market-data.js';
