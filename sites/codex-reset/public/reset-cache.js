const validDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const safeUrl=value=>{try{const url=new URL(value);return url.protocol==='https:'&&['x.com','twitter.com','codex-resets.com'].includes(url.hostname)?url.href:'';}catch{return '';}};
const validSource=source=>source&&((source.type==='observed'&&Boolean(safeUrl(source.url)))||(source.type==='x_post'&&source.author==='thsottiaux'&&/^https:\/\/(?:x|twitter)\.com\/thsottiaux\/status\/\d+(?:[/?#]|$)/.test(safeUrl(source.url))));
const validRecord=record=>record&&typeof record.id==='string'&&record.id.length>0&&validDate(record.announced_at)&&['regular','banked'].includes(record.reset_type)&&validSource(record.source);
const validStat=value=>value===null||(Number.isFinite(value)&&value>=0);
const validStatus=status=>status&&status.stats&&Number.isInteger(status.stats.total)&&status.stats.total>=0&&validStat(status.stats.avg_interval_days)&&validStat(status.stats.days_since_last)&&(status.latest_reset===null||(validRecord(status.latest_reset)&&status.latest_reset.status!=='scheduled'))&&(status.scheduled_reset===null||(validRecord(status.scheduled_reset)&&status.scheduled_reset.status==='scheduled'&&(status.scheduled_reset.scheduled_for===null||validDate(status.scheduled_reset.scheduled_for))))&&(status.active_watch===null||(status.active_watch&&validDate(status.active_watch.observed_at)&&validDate(status.active_watch.expires_at)&&validSource(status.active_watch.source)));
export const isResetDataset=data=>Boolean(data&&validDate(data.generatedAt)&&Array.isArray(data.records)&&data.records.length<5001&&data.records.every(validRecord)&&validStatus(data.status));

function withTranslation(record,known){
  if(!known||known.text!==record.text||known.status!==record.status||known.reset_type!==record.reset_type||known.source.type!==record.source.type||known.source.url!==record.source.url)return record;
  return {...record,...(!record.summaryZh&&known.summaryZh?{summaryZh:known.summaryZh}:{}),...(!record.translationZh&&known.translationZh?{translationZh:known.translationZh}:{})};
}
/** Incoming data owns status; a partial history may add to known records but never proves completeness. */
export function mergeResetHistory(previous,incoming){
  if(!previous||incoming.historyComplete===true)return incoming;
  const known=new Map(previous.records.map(record=>[record.id,record]));
  for(const record of incoming.records)known.set(record.id,withTranslation(record,known.get(record.id)));
  return {...incoming,records:[...known.values()].sort((a,b)=>Date.parse(b.announced_at)-Date.parse(a.announced_at)).slice(0,5000),historyComplete:false,historyBaseGeneratedAt:previous.historyComplete===true?previous.generatedAt:previous.historyBaseGeneratedAt||null};
}
/** Read both page caches before a ?share=latest dialog can consume an older embedded snapshot. */
export function pickResetDataset(snapshot,caches=[]){
  const candidates=[{data:snapshot,mode:'snapshot'},...caches.map(data=>({data,mode:'cache'}))].filter(item=>isResetDataset(item.data)).sort((a,b)=>Date.parse(a.data.generatedAt)-Date.parse(b.data.generatedAt)||Number(a.data.historyComplete===true)-Number(b.data.historyComplete===true));
  let data=null,mode='snapshot';
  for(const candidate of candidates){data=mergeResetHistory(data,candidate.data);mode=candidate.mode;}
  return {data,mode};
}
/** Resolve the latest public post for the generic sharing entry point. */
export function latestPublicRecordId(data){
  if(!data)return null;
  const latest=data.status.latest_reset;
  const scheduled=data.status.scheduled_reset&&(!latest||Date.parse(data.status.scheduled_reset.announced_at)>Date.parse(latest.announced_at))?data.status.scheduled_reset:null;
  return [scheduled,latest,...data.records].filter(record=>record?.source?.type==='x_post').sort((a,b)=>Date.parse(b.announced_at)-Date.parse(a.announced_at))[0]?.id||null;
}

/** Explicit homepage links must share that exact post, even after newer data arrives. */
export function requestedShareRecordId(data, request){
  if(!data || !request)return null;
  const id=request==='latest'?latestPublicRecordId(data):request;
  return [data.status?.scheduled_reset,data.status?.latest_reset,...(data.records||[])].some(record=>record?.id===id)?id:null;
}
