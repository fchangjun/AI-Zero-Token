import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Check, CircleDollarSign, Globe2, Info, RefreshCw, Search, TrendingDown } from "lucide-react";
import { convertQuote, rankedRegions } from "../../../../../sites/codex-reset/public/market-utils.js";
import type { IntelligencePrices } from "./price-data";
import type { PriceChannelFilter, PricePlan, PricePlanId, PriceQuote, RankedPriceQuote } from "./price-types";
import "./prices-panel.css";

type Locale = string;
const copy = {
  zh: {
    title: "订阅比价", summaryTitle: "相同订阅，看看哪里更划算", summaryHint: "美区常规价与已收录地区最低月价", lowest: "已收录最低价", us: "美区常规", month: "/ 月", from: "起", save: "省", above: "高", compare: "查看地区比价", all: "全部渠道", web: "官网直购", ios: "iOS Store", fx: "参考汇率", liveFx: "日内汇率", savedFx: "已保存汇率", closedFx: "休市行情", rateDate: "行情时间", quoteDate: "报价核对", timeZone: "北京时间", refresh: "检查更新", refreshing: "检查中", rankings: "各档位低价地区 Top 3", rankHint: "按人民币估算，每个地区取所选渠道的最低报价", regions: "地区明细", search: "搜索地区、国家代码或币种", channel: "渠道", sort: "排序", asc: "价格从低到高", desc: "价格从高到低", alphabetic: "按地区名称", region: "地区 / 渠道", local: "当地月价", rmb: "人民币估算", difference: "较美区常规价", source: "价格依据", official: "官方来源", none: "暂无符合条件的报价", noRate: "暂无汇率", more: "显示更多", clear: "清除筛选", shown: "已显示", quotes: "条报价", countries: "个地区", standard: "标准美元价", note: "人民币金额按参考汇率估算，最低价仅限已收录地区与渠道。地区资格、税费及最终价格以官方结账页为准。", savedNote: "汇率暂时无法更新，继续使用已保存行情。", priceNote: "报价更新暂不可用，已保留当前价格。", oldNote: "部分报价超过 30 天未核对，请以官方结账页为准。", snapshotNote: "当前使用历史参考汇率。", dataSource: "标准美元价来源", discount: "折", unavailable: "所选渠道暂无可比较的地区报价。", details: "查看明细", quoteCount: "报价", plans: "订阅档位", checked: "已检查", country: "地区", top: "最低", chooseRegion: "查看此地区报价",
  },
  en: {
    title: "Subscription prices", summaryTitle: "The same subscription, a better price", summaryHint: "Standard US prices vs. the lowest recorded regional monthly prices", lowest: "Lowest recorded", us: "Standard US", month: "/ month", from: "from", save: "Save", above: "Higher", compare: "Compare regions", all: "All channels", web: "Official website", ios: "iOS Store", fx: "Reference FX", liveFx: "Intraday FX", savedFx: "Saved FX", closedFx: "Market closed", rateDate: "FX as of", quoteDate: "Prices checked", timeZone: "Beijing time", refresh: "Check updates", refreshing: "Checking", rankings: "Top 3 regions for each plan", rankHint: "Estimated in CNY; the lowest eligible channel quote is used per region", regions: "Regional prices", search: "Search region, country code or currency", channel: "Channel", sort: "Sort", asc: "Lowest price first", desc: "Highest price first", alphabetic: "Region name", region: "Region / channel", local: "Local monthly price", rmb: "Estimated CNY", difference: "vs. standard US price", source: "Price reference", official: "Official source", none: "No matching prices", noRate: "FX unavailable", more: "Show more", clear: "Clear filters", shown: "Showing", quotes: "quotes", countries: "regions", standard: "Standard USD price", note: "CNY amounts are FX estimates. The lowest price covers recorded regions and channels only. Eligibility, taxes and final prices are determined at official checkout.", savedNote: "FX could not be refreshed. Saved rates are shown.", priceNote: "Prices could not be refreshed. Existing quotes are retained.", oldNote: "Some quotes have not been checked for over 30 days. Confirm the final price at official checkout.", snapshotNote: "Historical reference rates are shown.", dataSource: "Standard USD price source", discount: "of standard", unavailable: "No comparable regional prices for this channel.", details: "View details", quoteCount: "quotes", plans: "Subscription plans", checked: "Checked", country: "Region", top: "Lowest", chooseRegion: "View this regional price",
  },
};
const englishNotes: Record<PricePlanId, string> = { go: "Light use", plus: "Everyday work", pro100: "Advanced work", pro200: "Frequent use", pro500: "Intensive work" };
const words = (locale: Locale) => copy[locale.startsWith("zh") ? "zh" : "en"];
const formatAmount = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const flag = (country: string) => /^[A-Z]{2}$/.test(country) ? [...country].map((letter) => String.fromCodePoint(letter.charCodeAt(0) + 127397)).join("") : "◉";
function date(value: string | number | null | undefined, locale: Locale) {
  if (value == null || !Number.isFinite(new Date(value).valueOf())) return "—";
  return new Intl.DateTimeFormat(locale.startsWith("zh") ? "zh-CN" : "en-GB", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}
function regionName(quote: PriceQuote, locale: Locale) {
  if (locale.startsWith("zh")) return quote.region;
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(quote.country) || quote.country; } catch { return quote.country; }
}
function channelName(channel: string, locale: Locale) {
  const text = words(locale);
  return channel === "web_direct" ? text.web : channel === "app_store" ? text.ios : text.all;
}
function savingText(savings: number | null, locale: Locale) {
  if (savings === null) return words(locale).noRate;
  return `${savings >= 0 ? words(locale).save : words(locale).above} ${(Math.abs(savings) * 100).toFixed(1)}%`;
}
function isHistorical(market: IntelligencePrices) {
  const { fx } = market.data;
  return market.fxError || fx.mode === "snapshot" || fx.mode === "stale" || Boolean(fx.stale?.CNY) || Date.now() - Date.parse(fx.updatedAt) > 36 * 60 * 60_000;
}

function PriceMeta({ market, locale, controls = false }: { market: IntelligencePrices; locale: Locale; controls?: boolean }) {
  const text = words(locale);
  const { fx, plans } = market.data;
  const state = isHistorical(market) || fx.mode === "cache" ? text.savedFx : ["weekend", "interbank_closed"].includes(fx.marketSession || "") ? text.closedFx : fx.sources?.CNY === "live" ? text.liveFx : text.fx;
  const oldestPrice = [...plans].sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))[0]?.updatedAt;
  return <div className="intel-price-meta">
    <span><Globe2 size={13} />{state} · 1 USD ≈ ¥{fx.rates.CNY.toFixed(4)}</span>
    <span>{text.rateDate} {date(fx.updatedAt, locale)}</span>
    {controls && <><span>{text.quoteDate} {date(oldestPrice, locale)} · {text.timeZone}</span><button className="btn-secondary" type="button" disabled={market.busy} onClick={() => void market.refresh()}><RefreshCw size={14} className={market.busy ? "spin" : ""} />{market.busy ? text.refreshing : text.refresh}</button></>}
  </div>;
}

export function PriceSummary({ locale, market, onExplore, showMeta = true }: { locale: Locale; market: IntelligencePrices; onExplore?: (plan: PricePlanId) => void; showMeta?: boolean }) {
  const text = words(locale);
  const featured = market.data.plans.filter((plan) => plan.id === "plus" || plan.id === "pro200");
  return <section className="intel-price-summary" aria-label={text.title}>
    <div className="intel-price-section-heading"><div><h2><TrendingDown size={19} />{text.summaryTitle}</h2><p>{text.summaryHint}</p></div>{onExplore && <button className="rc-text-link" type="button" onClick={() => onExplore("plus")}>{text.compare}<ArrowUpRight size={15} /></button>}</div>
    <div className="intel-price-featured-grid">{featured.map((plan) => {
      const best = rankedRegions(plan, market.data.fx)[0];
      const standard = plan.usd * market.data.fx.rates.CNY;
      return <article className="intel-price-featured" key={plan.id}>
        <header><span className="intel-price-plan-icon"><CircleDollarSign size={20} /></span><h3>{plan.name}</h3><span className="intel-price-lowest-label">{text.lowest}</span></header>
        <div className="intel-price-comparison"><div className="intel-price-standard"><span>{text.us}</span><strong>${plan.usd}<small> USD {text.month}</small></strong><span>≈ ¥{formatAmount(standard)}</span></div><ArrowDown size={17} className="intel-price-change-arrow" /><div className="intel-price-best"><span>{best ? <>{flag(best.country)} {regionName(best, locale)} · {channelName(best.channel, locale)}</> : text.unavailable}</span><strong>{best ? `≈ ¥${formatAmount(best.rmb)}` : "—"}<small>{text.month}</small></strong>{best && <span className={`intel-price-saving ${best.savings < 0 ? "is-higher" : ""}`}>{savingText(best.savings, locale)}{locale.startsWith("zh") && best.savings > 0 ? ` · ${((1 - best.savings) * 10).toFixed(1)} ${text.discount}` : ""}</span>}</div></div>
        {onExplore && <button className="intel-price-card-link" type="button" onClick={() => onExplore(plan.id)}>{text.details}<ArrowUpRight size={14} /></button>}
      </article>;
    })}</div>
    {showMeta && <PriceMeta market={market} locale={locale} />}
  </section>;
}

function RankCard({ quote, index, locale, onChoose }: { quote: RankedPriceQuote; index: number; locale: Locale; onChoose: () => void }) {
  const text = words(locale);
  return <button className={`intel-price-rank ${index === 0 ? "is-best" : ""}`} type="button" onClick={onChoose} aria-label={`${text.chooseRegion}: ${regionName(quote, locale)}, ${channelName(quote.channel, locale)}, ${formatAmount(quote.rmb)} CNY`}>
    <span className="intel-price-rank-region"><span className="intel-price-rank-number">{index + 1}</span><span aria-hidden="true">{flag(quote.country)}</span><strong>{regionName(quote, locale)}</strong></span>
    <strong className="intel-price-rank-amount">≈ ¥{formatAmount(quote.rmb)}<small>{text.month}</small></strong>
    <span className="intel-price-rank-channel">{channelName(quote.channel, locale)} · {quote.label}</span>
    <span className={`intel-price-saving ${quote.savings < 0 ? "is-higher" : ""}`}>{savingText(quote.savings, locale)}</span>
  </button>;
}

export function PricesPanel({ locale, market, initialPlan = "plus" }: { locale: Locale; market: IntelligencePrices; initialPlan?: string }) {
  const text = words(locale);
  const [planId, setPlanId] = useState(() => market.data.plans.some((item) => item.id === initialPlan) ? initialPlan : "plus");
  const [channel, setChannel] = useState<PriceChannelFilter>("all");
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [sort, setSort] = useState("asc");
  const [limit, setLimit] = useState(18);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const plan = market.data.plans.find((item) => item.id === planId) || market.data.plans[0];
  const quotes = useMemo(() => {
    const search = query.toLowerCase().trim();
    const filtered = plan.quotes.filter((quote) => (channel === "all" || channel === quote.channel) && (country ? quote.country === country : `${quote.region} ${regionName(quote, locale)} ${quote.country} ${quote.currency}`.toLowerCase().includes(search))).map((quote) => convertQuote(quote, market.data.fx, plan.usd));
    return filtered.sort((a, b) => sort === "region" ? regionName(a, locale).localeCompare(regionName(b, locale), locale) : a.rmb === null ? (b.rmb === null ? a.country.localeCompare(b.country) : 1) : b.rmb === null ? -1 : (a.rmb - b.rmb) * (sort === "desc" ? -1 : 1) || a.country.localeCompare(b.country));
  }, [plan, market.data.fx, channel, query, country, sort, locale]);
  const oldQuotes = market.data.plans.some((item) => Date.now() - Date.parse(item.updatedAt) > 30 * 24 * 60 * 60_000);
  const warnings = [market.priceError ? text.priceNote : "", market.fxError ? text.savedNote : isHistorical(market) ? text.snapshotNote : "", oldQuotes ? text.oldNote : ""].filter(Boolean);

  function chooseRegion(selected: PricePlan, quote: PriceQuote) {
    setPlanId(selected.id); setCountry(quote.country); setQuery(regionName(quote, locale)); setLimit(18);
    requestAnimationFrame(() => { detailHeading.current?.focus({ preventScroll: true }); detailHeading.current?.scrollIntoView({ block: "start", behavior: "smooth" }); });
  }

  function choosePlan(selected: PricePlanId) {
    setPlanId(selected); setCountry(""); setQuery(""); setLimit(18);
    requestAnimationFrame(() => { detailHeading.current?.focus({ preventScroll: true }); detailHeading.current?.scrollIntoView({ block: "start", behavior: "smooth" }); });
  }

  return <section className="intel-prices" aria-label={text.title}>
    <PriceSummary locale={locale} market={market} onExplore={choosePlan} showMeta={false} />
    <PriceMeta market={market} locale={locale} controls />
    {warnings.length > 0 && <div className="intel-price-warning" role="status"><Info size={16} /><span>{warnings.join(" ")}</span></div>}
    <div className="intel-price-section-heading"><div><h2>{text.rankings}</h2><p>{text.rankHint}</p></div><label className="intel-price-channel-label"><span>{text.channel}</span><select value={channel} onChange={(event) => { setChannel(event.target.value as PriceChannelFilter); setLimit(18); }}><option value="all">{text.all}</option><option value="web_direct">{text.web}</option><option value="app_store">{text.ios}</option></select></label></div>
    <div className="intel-price-rankings">{market.data.plans.map((item) => {
      const top = rankedRegions(item, market.data.fx, channel).slice(0, 3);
      return <article className="intel-price-plan-row" key={item.id}><div className="intel-price-plan-cell"><h3>{item.name}</h3><p>{locale.startsWith("zh") ? item.note : englishNotes[item.id]}</p><strong>${item.usd}<small> USD {text.month}</small></strong><span>≈ ¥{formatAmount(item.usd * market.data.fx.rates.CNY)}</span></div>{top.length ? top.map((quote, index) => <RankCard key={quote.country} quote={quote} index={index} locale={locale} onChoose={() => chooseRegion(item, quote)} />) : <p className="intel-price-rank-empty">{text.unavailable}</p>}</article>;
    })}</div>
    <section className="intel-price-details" aria-label={text.regions}>
      <div className="intel-price-detail-heading"><h2 ref={detailHeading} tabIndex={-1}>{text.regions}</h2><span>{new Set(quotes.map((quote) => quote.country)).size} {text.countries} · {quotes.length} {text.quotes}</span></div>
      <div className="intel-price-plan-tabs" role="group" aria-label={text.plans}>{market.data.plans.map((item) => <button className={item.id === plan.id ? "is-active" : ""} type="button" key={item.id} aria-pressed={item.id === plan.id} onClick={() => { setPlanId(item.id); setLimit(18); }}>{item.id === plan.id && <Check size={13} />}{item.name}</button>)}</div>
      <div className="intel-price-filters"><label className="intel-price-search"><Search size={15} /><input type="search" aria-label={text.search} placeholder={text.search} value={query} onChange={(event) => { setQuery(event.target.value); setCountry(""); setLimit(18); }} /></label><label><span className="intel-price-sr-only">{text.sort}</span><select value={sort} onChange={(event) => { setSort(event.target.value); setLimit(18); }}><option value="asc">{text.asc}</option><option value="desc">{text.desc}</option><option value="region">{text.alphabetic}</option></select></label>{query && <button className="btn-secondary" type="button" onClick={() => { setQuery(""); setCountry(""); setLimit(18); }}>{text.clear}</button>}</div>
      <p className="intel-price-detail-baseline">{text.standard} <strong>${plan.usd} USD {text.month}</strong><span>≈ ¥{formatAmount(plan.usd * market.data.fx.rates.CNY)} {text.month}</span></p>
      <div className="intel-price-table-scroll"><table className="intel-price-table"><thead><tr><th scope="col">{text.region}</th><th scope="col">{text.local}</th><th scope="col">{text.rmb}</th><th scope="col">{text.difference}</th><th scope="col">{text.source}</th></tr></thead><tbody>{quotes.slice(0, limit).map((quote) => <tr key={`${quote.country}:${quote.channel}`}><td><div className="intel-price-table-region"><span aria-hidden="true">{flag(quote.country)}</span><span><strong>{regionName(quote, locale)}</strong><small>{quote.country} · {channelName(quote.channel, locale)}</small></span></div></td><td><strong>{quote.label}</strong><small>{quote.currency} {text.month}</small></td><td><strong className="intel-price-table-cny" title={`${text.rateDate} ${date(quote.fxUpdatedAt, locale)} · ${text.timeZone}`}>{quote.rmb === null ? text.noRate : `≈ ¥${formatAmount(quote.rmb)}`}</strong></td><td><span className={`intel-price-saving ${quote.savings !== null && quote.savings < 0 ? "is-higher" : ""}`}>{savingText(quote.savings, locale)}</span></td><td><a href={quote.source} target="_blank" rel="noopener noreferrer" aria-label={`${regionName(quote, locale)} ${channelName(quote.channel, locale)} ${text.official}`}>{text.official}<ArrowUpRight size={13} /></a></td></tr>)}</tbody></table></div>
      {quotes.length === 0 && <div className="intel-price-table-empty"><Search size={24} /><p>{text.none}</p></div>}
      <footer className="intel-price-table-footer"><span>{text.shown} {Math.min(limit, quotes.length)} / {quotes.length} {text.quotes}</span>{limit < quotes.length && <button className="btn-secondary" type="button" onClick={() => setLimit((value) => value + 30)}>{text.more}</button>}</footer>
    </section>
    <footer className="intel-price-footnote"><p>{text.note}</p><a href={market.data.usdSource} target="_blank" rel="noopener noreferrer">{text.dataSource}<ArrowUpRight size={13} /></a>{market.checkedAt && <span>{text.checked} {date(market.checkedAt, locale)} · {text.timeZone}</span>}</footer>
  </section>;
}
