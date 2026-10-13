import { getFeaturedDeals } from './deals.js';
import { CHANNELS } from './market-utils.js';

const FONT = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
const THEMES = {
  forest: { background:'#123F30', foreground:'#F5F3E9', muted:'#B9CABE', line:'#476B57', accent:'#D6F48B', panel:'#1D4A3A' },
  light: { background:'#F5F3E9', foreground:'#173F30', muted:'#647369', line:'#CFD4C6', accent:'#476F29', panel:'#E9EEDD' },
  ink: { background:'#191D1A', foreground:'#F5F3E9', muted:'#BBC4B9', line:'#454F43', accent:'#D6F48B', panel:'#272E25' },
};
export const priceAmount = value => Number.isFinite(value) ? value.toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
export const priceDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.replaceAll('-', '/') : Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)) : '时间未提供';
const clean = value => String(value ?? '').replace(/\s+/gu,' ').trim();
const safeLink = value => { try { const url=new URL(value); return url.protocol==='https:' ? url.href : ''; } catch { return ''; } };
const domain = value => { try { return new URL(safeLink(value)).hostname.replace(/^www\./,''); } catch { return '来源未提供'; } };

/** Freeze the actual quote/rate values used for a share, so later FX updates cannot change its caption. */
export function getPriceShareData(data, proPlanId = 'pro200', selection = 'overview') {
  if (!data?.plans || !data?.fx) return null;
  const proId = /^pro(?:100|200|500)$/.test(selection) ? selection : proPlanId;
  const deals = getFeaturedDeals(data, proId).filter(item => selection==='overview' || item.planId===selection).filter(item => item.quote && Number.isFinite(item.quote.rmb) && Number.isFinite(item.baselineRmb)).map(item => ({...item, quote:{...item.quote}, sourceUrl:data.plans.find(plan=>plan.id===item.planId)?.url || ''}));
  if (!deals.length) return null;
  return { deals, usdSource:safeLink(data.usdSource), usdVerifiedAt:data.usdVerifiedAt, fxSource:safeLink(data.fx.sourceUrl) || 'https://exchangerate.dev/docs/api-reference', fxUpdatedAt:data.fx.updatedAt, generatedAt:new Date().toISOString() };
}

function savingText(deal) {
  if (deal.savingRmb > 0 && deal.savingsPct > 0) return `省 ${deal.savingsPct.toFixed(1)}% · 每月少 ¥${priceAmount(deal.savingRmb)} · ${deal.discountLabel}`;
  if (deal.savingRmb < 0) return `较美区基准高 ¥${priceAmount(Math.abs(deal.savingRmb))} / 月`;
  return '与美区基准相同';
}
export function priceShareCaption(info, {announcement = false, pageUrl = '', aztUrl = ''} = {}) {
  if (!info?.deals?.length) return '';
  const rows = info.deals.map(deal => {
    const q=deal.quote;
    return `${deal.name}\n美区常规价 $${deal.usd} USD / 月 ≈ ¥${priceAmount(deal.baselineRmb)}\n收录最低：${q.region} · ${CHANNELS[q.channel] || q.channel}，约 ¥${priceAmount(q.rmb)} / 月（${q.label} ${q.currency}）\n${savingText(deal)}\n报价核对：${priceDate(deal.updatedAt)}；汇率行情：${priceDate(q.fxUpdatedAt || info.fxUpdatedAt)}（北京时间）${q.fxStale?' · 缓存/参考汇率':''}\n报价收录：${safeLink(deal.sourceUrl)}\n官方价格依据：${safeLink(q.source)}`;
  }).join('\n\n');
  return `${announcement?'【附：本站独立整理的订阅比价，非 Tibo 原帖内容】':'Codex 情报站 · 订阅价格对比'}\n\n${rows}\n\n美区美元基准：${info.usdSource}（核对 ${priceDate(info.usdVerifiedAt)}）\n汇率来源：${info.fxSource}\n最低仅限本站已收录且有可用汇率的地区与渠道。人民币为估算，折扣为相对美区基准的价差，非官方促销；订阅资格、税费及实际金额以官方结账页为准。${safeLink(pageUrl)?`\n查看地区比价：${safeLink(pageUrl)}`:''}${safeLink(aztUrl)?`\n了解 AI Zero Token：${safeLink(aztUrl)}`:''}`;
}

function font(ctx,size,weight=400) { ctx.font=`${weight} ${size}px ${FONT}`; }
function lines(ctx,value,width,size,weight=400) {
  font(ctx,size,weight);
  const result=[];let line='';
  for (const char of Array.from(clean(value))) {
    if (line && ctx.measureText(line+char).width>width) { result.push(line);line=char; } else line+=char;
  }
  if(line)result.push(line);
  return {lines:result,size,weight,height:result.length*size*1.45};
}
function paint(ctx,layout,x,y,color) {font(ctx,layout.size,layout.weight);ctx.fillStyle=color;layout.lines.forEach((line,i)=>ctx.fillText(line,x,y+i*layout.size*1.45));}
function round(ctx,x,y,width,height,r=22) {
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+width,y,x+width,y+height,r);ctx.arcTo(x+width,y+height,x,y+height,r);ctx.arcTo(x,y+height,x,y,r);ctx.arcTo(x,y,x+width,y,r);ctx.closePath();
}
function rowLayout(ctx,deal,info,width) {
  const q=deal.quote;
  const blocks=[
    ['plan', `${deal.name}  /  MONTHLY`,32,650],
    ['baseline', `美区常规 $${deal.usd} USD / 月 ≈ ¥${priceAmount(deal.baselineRmb)}`,24,400],
    ['region', `收录最低 · ${q.region} · ${CHANNELS[q.channel] || q.channel}`,24,550],
    ['price', `¥${priceAmount(q.rmb)} / 月`,64,700],
    ['saving',savingText(deal),27,650],
    ['local', `当地 ${q.label} ${q.currency} / 月`,20,400],
    ['dates', `报价 ${priceDate(deal.updatedAt)} · 汇率 ${priceDate(q.fxUpdatedAt||info.fxUpdatedAt)}${q.fxStale?' · 缓存/参考':''}`,18,400],
    ['source', `报价收录 PriceAI · 官方依据 ${domain(q.source)}`,18,400],
  ].map(([key,value,size,weight])=>({key,...lines(ctx,value,width-56,size,weight)}));
  return {blocks,height:blocks.reduce((n,b)=>n+b.height,0)+blocks.length*10+40};
}
/** A separate price appendix that grows with every line, without covering an announcement. */
export function measurePriceAppendix(ctx,info,width=948) {
  if (!info?.deals?.length) return null;
  const title=lines(ctx,'订阅价格参考 · 本站独立整理',width,28,650);
  const note=lines(ctx,'以下比价不属于 Tibo 的 X 原帖内容',width,20,400);
  const rows=info.deals.map(deal=>rowLayout(ctx,deal,info,width));
  const source=lines(ctx,`美元基准 ${domain(info.usdSource)} · 核对 ${priceDate(info.usdVerifiedAt)}；汇率 ${domain(info.fxSource)} · 时间均为北京时间`,width,18);
  const caveat=lines(ctx,'最低仅限已收录且可换算的地区与渠道。人民币为估算；折扣是相对美区的价差，非官方促销。资格、税费与金额以官方结账页为准。',width,19);
  return {title,note,rows,source,caveat,height:title.height+note.height+24+rows.reduce((n,row)=>n+row.height+16,0)+source.height+12+caveat.height+24};
}
export function drawPriceAppendix(ctx,info,{x=66,y=0,width=948,palette=THEMES.forest,layout=measurePriceAppendix(ctx,info,width),standalone=false}={}) {
  if(!layout)return 0;
  ctx.save();ctx.textAlign='left';ctx.textBaseline='top';
  let top=y;
  if(!standalone){paint(ctx,layout.title,x,top,palette.accent);top+=layout.title.height;paint(ctx,layout.note,x,top,palette.muted);top+=layout.note.height+24;}
  for(const row of layout.rows){
    round(ctx,x,top,width,row.height);ctx.fillStyle=palette.panel;ctx.fill();ctx.strokeStyle=palette.line;ctx.lineWidth=1;ctx.stroke();
    let at=top+24;
    for(const block of row.blocks){paint(ctx,block,x+28,at,['price','saving'].includes(block.key)?palette.accent:['baseline','local','dates','source'].includes(block.key)?palette.muted:palette.foreground);at+=block.height+10;}
    top+=row.height+16;
  }
  paint(ctx,layout.source,x,top,palette.muted);top+=layout.source.height+12;
  paint(ctx,layout.caveat,x,top,palette.muted);top+=layout.caveat.height+24;
  ctx.restore();return top-y;
}
export function renderPriceShareCard(canvas,info,{theme='forest'}={}) {
  if(!info?.deals?.length)throw new Error('暂无可分享的地区价格，请稍后重试。');
  const ctx=canvas?.getContext?.('2d');if(!ctx)throw new Error('当前浏览器无法绘制图片，可以复制比价文案。');
  const palette=THEMES[theme]||THEMES.forest;
  const width=1080,margin=66,content=width-2*margin;
  const layout=measurePriceAppendix(ctx,info,content);
  const headline=lines(ctx,info.deals.length>1?'同一份订阅，看看价格差多少。':`${info.deals[0].name}，看看价格差多少。`,content,66,700);
  const top=200+headline.height;
  const height=Math.ceil(top+layout.height-layout.title.height-layout.note.height-24+92);
  if(height>4096)throw new Error('比价内容过长，请选择一个档位再分享。');
  canvas.width=width;canvas.height=height;ctx.textBaseline='top';ctx.textAlign='left';ctx.fillStyle=palette.background;ctx.fillRect(0,0,width,height);
  font(ctx,25,650);ctx.fillStyle=palette.foreground;ctx.fillText('✳  CODEX 情报站',margin,50);
  font(ctx,16,500);ctx.fillStyle=palette.muted;ctx.textAlign='right';ctx.fillText('THE SUBSCRIPTION REPORT',width-margin,56);ctx.textAlign='left';
  ctx.strokeStyle=palette.line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(margin,97);ctx.lineTo(width-margin,97);ctx.stroke();
  paint(ctx,headline,margin,126,palette.foreground);
  const end=top+drawPriceAppendix(ctx,info,{x:margin,y:top,width:content,palette,layout,standalone:true});
  font(ctx,20,500);ctx.fillStyle=palette.foreground;ctx.fillText('Codex 情报站 · 让每一份订阅，更值得。',margin,end+12);
  font(ctx,17,400);ctx.fillStyle=palette.muted;ctx.fillText('了解 AI Zero Token · github.com/fchangjun/AI-Zero-Token',margin,end+48);
  return canvas;
}
