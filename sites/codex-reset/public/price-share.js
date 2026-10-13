import { getPriceShareData, renderPriceShareCard, priceShareCaption } from './price-share-card.js';
import { exportShareBlob } from './share-card.js';

let setup = null;
let controller = null;
const sharePageUrl = () => new URL('./prices/',import.meta.url).href;
function projectUrl() {
  try {
    const url=new URL(document.querySelector('[data-azt-action="repo"]')?.href||'https://github.com/fchangjun/AI-Zero-Token');
    if(url.protocol==='https:'&&url.hostname==='github.com'&&url.pathname.toLowerCase()==='/fchangjun/ai-zero-token')return url.href;
  }catch{}
  return 'https://github.com/fchangjun/AI-Zero-Token';
}
function createController() {
  const dialog=document.createElement('dialog');dialog.id='price-share-dialog';dialog.setAttribute('aria-labelledby','price-share-title');
  dialog.innerHTML=`<div class="dialog-header"><div><span class="eyebrow muted">GOOD PRICES, SHARED.</span><h2 id="price-share-title">把订阅好价，分享出去。</h2></div><button type="button" class="icon-button" data-price-close aria-label="关闭价格分享">×</button></div>
  <div class="price-share-body"><div class="price-share-controls"><label>分享内容<select data-price-selection><option value="overview">Plus + Pro · 价格速览</option><option value="plus">Plus</option><option value="pro100">Pro · $100 档</option><option value="pro200">Pro · $200 档</option><option value="pro500">Pro · $500 档</option></select></label>
  <fieldset><legend>分享图片配色</legend><div class="theme-options"><label><input type="radio" name="price-theme" value="forest" checked><span class="theme-swatch forest"></span>森林绿</label><label><input type="radio" name="price-theme" value="light"><span class="theme-swatch light"></span>奶油白</label><label><input type="radio" name="price-theme" value="ink"><span class="theme-swatch ink"></span>深空黑</label></div></fieldset>
  <div class="price-share-note"><strong>一张图看懂，订阅价格差多少。</strong><p>美区美元常规价、最低地区人民币价、地区渠道与省下的金额，连同数据时间一起分享。</p><small>图片和文案使用同一份报价。金额为参考估算，最终以官方结账页为准。</small></div>
  <label class="price-caption-field" hidden>分享文案<textarea data-price-caption readonly rows="8"></textarea><small>复制不可用时，可以长按或选中文字手动复制。</small></label></div>
  <div class="preview-area price-share-preview"><div class="preview-label"><span>高清 PNG 预览</span><span data-price-size>准备中</span></div><canvas data-price-canvas role="img" aria-label="订阅价格对比分享图片"></canvas></div></div>
  <div class="dialog-actions"><span data-price-state role="status" aria-live="polite">正在准备价格分享图片</span><div><button type="button" class="button secondary" data-price-copy>复制文案</button><button type="button" class="button secondary" data-price-download>↓ 保存图片</button><button type="button" class="button dark" data-price-native>分享图片 ↗</button></div></div>`;
  document.body.append(dialog);
  const node=key=>dialog.querySelector(`[data-price-${key}]`);
  const urls=new Map();
  let snapshots=new Map(),selection='overview',blob=null,renderId=0,info=null;
  const setState=message=>{node('state').textContent=message;};
  const caption=()=>priceShareCaption(info,{pageUrl:sharePageUrl(),aztUrl:projectUrl()});
  const releaseUrls=()=>{for(const[url,timer]of urls){clearTimeout(timer);URL.revokeObjectURL(url);}urls.clear();};
  const download=()=>{
    if(!blob){setState('图片尚未准备好，可先复制文案。');return false;}
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`Codex-订阅比价-${selection}-${new Date().toISOString().slice(0,10)}.png`;a.click();
    urls.set(url,setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},60000));setState('PNG 已开始下载，保存后可发送到微信或其他社群。');return true;
  };
  async function render(){
    const id=++renderId;blob=null;info=snapshots.get(selection)||null;
    node('download').disabled=true;node('native').disabled=true;node('copy').disabled=!info;node('canvas').hidden=true;node('size').textContent='准备中';
    node('caption').value=caption();
    if(!info){node('canvas').hidden=true;node('size').textContent='暂无数据';setState('这一档位暂无可用的价格对比，请切换档位或稍后刷新页面。');return;}
    setState('正在准备价格分享图片…');
    try {
      const canvas=document.createElement('canvas');renderPriceShareCard(canvas,info,{theme:dialog.querySelector('input[name="price-theme"]:checked').value});
      const nextBlob=await exportShareBlob(canvas);if(id!==renderId||!dialog.open)return;
      const target=node('canvas');target.width=canvas.width;target.height=canvas.height;target.getContext('2d').drawImage(canvas,0,0);target.hidden=false;blob=nextBlob;
      node('size').textContent=`${canvas.width} × ${canvas.height}`;node('download').disabled=false;node('native').disabled=false;
      setState('图片已就绪 · 包含地区、渠道、价格依据及行情时间');
    }catch(error){if(id===renderId){node('canvas').hidden=true;setState(error.message||'图片生成失败，可以先复制文案。');}}
  }
  node('close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{renderId++;blob=null;info=null;snapshots.clear();node('canvas').getContext('2d')?.clearRect(0,0,node('canvas').width,node('canvas').height);});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();}});
  dialog.addEventListener('change',event=>{if(event.target===node('selection'))selection=event.target.value;void render();});
  node('download').addEventListener('click',download);
  node('copy').addEventListener('click',async()=>{
    if(!info)return;
    try {await navigator.clipboard.writeText(caption());setState('价格对比与完整来源已复制。');}
    catch{dialog.querySelector('.price-caption-field').hidden=false;node('caption').focus();node('caption').select();setState('浏览器暂不支持自动复制，请在文案框内手动复制。');}
  });
  node('native').addEventListener('click',async()=>{
    if(!blob)return;
    try {
      const file=new File([blob],`Codex-订阅比价-${selection}.png`,{type:'image/png'});
      if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Codex 情报站 · 订阅价格对比',text:'已收录地区的订阅比价，数据日期及来源见图片。'});setState('图片已交给系统分享。');}
      else if(download())setState('此浏览器不支持直接分享图片，已开始下载 PNG，可保存后转发。');
    }catch(error){if(error.name!=='AbortError')setState('系统分享未完成，请使用「保存图片」后转发。');}
  });
  window.addEventListener('pagehide',releaseUrls);
  return {open(requested){
    let data;try{data=setup.getData();}catch{}
    let pro;try{pro=setup.getProPlanId?.()||'pro200';}catch{pro='pro200';}
    snapshots=new Map(['overview','plus','pro100','pro200','pro500'].map(value=>{let payload=null;try{payload=getPriceShareData(data,pro,value);}catch{}return[value,payload];}));
    selection=snapshots.has(requested)?requested:'overview';node('selection').value=selection;
    dialog.querySelector('.price-caption-field').hidden=true;
    if(!dialog.open)dialog.showModal();void render();
  }};
}
/** Install once per document; use delegation so generated ranking buttons work after any refresh. */
export function setupPriceShare(options) {
  if(typeof options?.getData!=='function')throw new TypeError('价格分享需要 getData。');
  const first=!setup;setup=options;
  if(first)document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-share-price]');if(!button||button.disabled)return;
    event.preventDefault();controller||=createController();controller.open(button.dataset.sharePrice);
  });
}
