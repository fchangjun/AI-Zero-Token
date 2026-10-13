import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getPriceShareData, priceShareCaption, priceDate, renderPriceShareCard } from '../public/price-share-card.js';
import { renderShareCard } from '../public/share-card.js';

const market=JSON.parse(await readFile(new URL('../public/data/prices.json',import.meta.url),'utf8'));

// Approximate individual glyph widths while recording every text boundary, without a browser dependency.
function recordingCanvas(){
  const texts=[];
  const context={font:'20px system-ui',textAlign:'left',textBaseline:'top',
    measureText(value){const size=Number(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1]||20);return {width:Array.from(value).reduce((sum,c)=>sum+(c.charCodeAt(0)>255?1:.57)*size,0)};},
    fillText(value,x,y){const width=this.measureText(value).width;const size=Number(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1]||20);texts.push({value,x:this.textAlign==='right'?x-width:this.textAlign==='center'?x-width/2:x,y:this.textBaseline==='middle'?y-size/2:y,width,height:size});},
  };
  for(const name of ['beginPath','moveTo','arcTo','arc','lineTo','closePath','fill','stroke','fillRect','clip','drawImage'])context[name]=()=>{};
  const stack=[];context.save=()=>stack.push({font:context.font,textAlign:context.textAlign,textBaseline:context.textBaseline});context.restore=()=>Object.assign(context,stack.pop()||{});
  return {width:300,height:150,texts,getContext:()=>context};
}
function assertVisible(canvas){
  for(const item of canvas.texts){assert.ok(item.x>=0,`left edge ${item.value}`);assert.ok(item.x+item.width<=canvas.width+.1,`right edge ${item.value}`);assert.ok(item.y>=0&&item.y+item.height<=canvas.height,`vertical edge ${item.value}`);}
}

test('price share locks amount and source dates when the live dataset changes',()=>{
  const data=structuredClone(market),info=getPriceShareData(data,'pro200');
  const before=priceShareCaption(info);
  data.fx.rates.CNY*=2;data.plans.find(plan=>plan.id==='plus').updatedAt='2030-01-01T00:00:00Z';data.plans.forEach(plan=>plan.quotes.forEach(quote=>quote.amount*=3));
  assert.equal(priceShareCaption(info),before);
  assert.match(before,/最低仅限本站已收录/);assert.match(before,/非官方促销/);assert.match(before,/官方价格依据/);assert.match(before,/汇率来源/);
  assert.notEqual(priceShareCaption(getPriceShareData(data,'pro200')),before);
});

test('plan-specific cards cannot accidentally include a different Pro tier',()=>{
  for(const planId of ['plus','pro100','pro200','pro500'])assert.deepEqual(getPriceShareData(market,'pro200',planId).deals.map(deal=>deal.planId),[planId]);
  assert.equal(getPriceShareData(null),null);
  assert.equal(getPriceShareData({...market,fx:{rates:{USD:1},effectiveAt:{}}}),null);
  assert.equal(priceDate('2026-10-12'),'2026/10/12');
});

test('higher and equal prices never claim savings or official discounts',()=>{
  const info=getPriceShareData(market,'pro200','plus');
  const deal=info.deals[0];
  deal.savingRmb=-12;deal.savingsPct=-5;deal.discountLabel='无价格优势';
  assert.match(priceShareCaption(info),/较美区基准高 ¥12.00/);assert.doesNotMatch(priceShareCaption(info),/省 -/);
  deal.savingRmb=0;deal.savingsPct=0;assert.match(priceShareCaption(info),/与美区基准相同/);
});

test('price artwork fits all themes and each supported plan selection without clipping',()=>{
  for(const theme of ['forest','light','ink'])for(const selection of ['overview','plus','pro100','pro200','pro500']){
    const canvas=recordingCanvas();renderPriceShareCard(canvas,getPriceShareData(market,'pro200',selection),{theme});assertVisible(canvas);
    assert.ok(canvas.height<4096);assert.ok(canvas.texts.some(item=>item.value.includes('美区常规')));assert.ok(canvas.texts.some(item=>item.value.includes('PriceAI')));
  }
});

test('announcement pricing is an independent appendix and increases height without dropping original content',async()=>{
  const options={title:'Codex 额度重置了。',body:'公开重置消息，实际额度请以账户显示为准。',englishText:'Global reset landing. Enjoy.',dateLabel:'2026/10/13 10:00',sourceUrl:'https://x.com/thsottiaux/status/12345',status:'confirmed'};
  for(const theme of ['forest','light','ink'])for(const format of ['portrait','square']){
    const plain=recordingCanvas(),withPrices=recordingCanvas();
    await renderShareCard(plain,{...options,theme,format});await renderShareCard(withPrices,{...options,theme,format,prices:getPriceShareData(market)});
    assertVisible(withPrices);assert.ok(withPrices.height>plain.height);
    assert.ok(withPrices.texts.some(item=>item.value==='Global reset landing. Enjoy.'));
    assert.ok(withPrices.texts.some(item=>item.value.includes('不属于 Tibo')));
    assert.ok(withPrices.texts.some(item=>item.value.includes('AI Zero Token')));
    assert.match(priceShareCaption(getPriceShareData(market),{announcement:true}),/非 Tibo 原帖内容/);
  }
});
