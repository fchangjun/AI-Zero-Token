import test from 'node:test';
import assert from 'node:assert/strict';
import { isResetDataset, pickResetDataset, mergeResetHistory, latestPublicRecordId, requestedShareRecordId } from '../public/reset-cache.js';

// Fixed complete history: production snapshot dates and forecasts change independently of cache semantics.
const historicalRecords = Array.from({ length: 15 }, (_, index) => {
  const id = String(2109000000000000000n - BigInt(index));
  return { id, announced_at: new Date(Date.UTC(2026, 9, 13 - index, 1)).toISOString(), reset_type: 'regular',
    text: `Completed reset ${index + 1}.`, source: { type: 'x_post', author: 'thsottiaux', url: `https://x.com/thsottiaux/status/${id}` } };
});
const snapshot = { version: 1, generatedAt: '2026-10-13T02:10:00.000Z', historyComplete: true, records: historicalRecords,
  status: { latest_reset: historicalRecords[0], scheduled_reset: null, active_watch: null,
    stats: { total: historicalRecords.length, last_reset_at: historicalRecords[0].announced_at, days_since_last: 0, avg_interval_days: 1 } } };
assert.ok(isResetDataset(snapshot), 'the fixed historical snapshot must satisfy production validation');
test('an explicit shared post stays selected across newer announcements; absent IDs never substitute another post',()=>{
  const data=pickResetDataset(snapshot,[homeCache()]).data;
  const previousId=snapshot.status.latest_reset.id;
  assert.equal(requestedShareRecordId(data,previousId),previousId);
  assert.equal(requestedShareRecordId(data,'latest'),homeCache().status.latest_reset.id);
  assert.equal(requestedShareRecordId(data,'missing'),null);
  assert.equal(requestedShareRecordId(null,'latest'),null);
});
function homeCache(){
  const next={id:'2109999999999999999',announced_at:'2026-10-14T02:00:00.000Z',reset_type:'regular',text:'A new reset has arrived.',source:{type:'x_post',author:'thsottiaux',url:'https://x.com/thsottiaux/status/2109999999999999999'}};
  return {version:1,generatedAt:'2026-10-14T02:05:00.000Z',historyComplete:false,records:[next,...snapshot.records.slice(0,11)],status:{...snapshot.status,latest_reset:next,scheduled_reset:null,stats:{...snapshot.status.stats,total:snapshot.status.stats.total+1}}};
}

test('homepage cache supplies the newest share immediately while retaining older complete history',()=>{
  const home=homeCache();const result=pickResetDataset(snapshot,[structuredClone(snapshot),home]);
  assert.ok(isResetDataset(result.data));assert.equal(result.mode,'cache');
  assert.equal(latestPublicRecordId(result.data),home.status.latest_reset.id);
  assert.equal(result.data.status.latest_reset.text,home.status.latest_reset.text);
  assert.ok(result.data.records.some(record=>record.id===snapshot.records.at(-1).id));
  assert.equal(result.data.records.length,snapshot.records.length+1);
  assert.equal(result.data.historyComplete,false,'merging a short homepage feed must not claim complete history');
  assert.equal(result.data.historyBaseGeneratedAt,snapshot.generatedAt);
  assert.equal(result.data.generatedAt,home.generatedAt);
});

test('invalid and older cache entries cannot replace a newer valid announcement',()=>{
  const home=homeCache();const invalid=structuredClone(home);invalid.generatedAt='2030-01-01T00:00:00Z';invalid.status.latest_reset.source.url='https://malicious.example/post';
  assert.equal(isResetDataset(invalid),false);
  const result=pickResetDataset(snapshot,[home,invalid,{generatedAt:'invalid'},null,structuredClone(snapshot)]);
  assert.equal(latestPublicRecordId(result.data),home.status.latest_reset.id);
  assert.equal(result.data.generatedAt,home.generatedAt);
});

test('only an authoritative complete history restores completeness and removes stale records',()=>{
  const partial=pickResetDataset(snapshot,[homeCache()]).data;
  const complete={...homeCache(),generatedAt:'2026-10-14T03:00:00.000Z',historyComplete:true};
  const result=mergeResetHistory(partial,complete);
  assert.equal(result.historyComplete,true);assert.deepEqual(result.records,complete.records);
  assert.equal(result.historyBaseGeneratedAt,undefined);
  const sameDate=pickResetDataset(snapshot,[complete,{...homeCache(),generatedAt:complete.generatedAt}]);
  assert.equal(sameDate.data.historyComplete,true,'full history wins when both endpoint snapshots have the same time');
});

test('initial share follows the homepage Tibo post and does not substitute a newer observed record',()=>{
  const home=homeCache();home.records.unshift({id:'observed-new',announced_at:'2026-10-14T02:04:00.000Z',reset_type:'regular',source:{type:'observed',url:'https://codex-resets.com/zh-CN'}});
  assert.ok(isResetDataset(home));assert.equal(latestPublicRecordId(pickResetDataset(snapshot,[home]).data),home.status.latest_reset.id);
  const cold=pickResetDataset(null,[home]);assert.equal(cold.data.historyComplete,false);assert.equal(latestPublicRecordId(cold.data),home.status.latest_reset.id);
});

const watchNow=Date.parse('2026-10-16T06:00:00.000Z');
function watchCache(){
  const latest={id:'2110618732666257557',reset_type:'regular',announced_at:'2026-10-15T06:28:13.000Z',text:'Done and dusted https://t.co/0fehr43VS4',source:{type:'x_post',author:'thsottiaux',url:'https://x.com/thsottiaux/status/2110618732666257557'}};
  return {version:1,generatedAt:'2026-10-16T05:54:42.880Z',historyComplete:false,records:[latest,...snapshot.records.slice(0,11)],status:{
    latest_reset:latest,scheduled_reset:null,
    active_watch:{level:'elevated',reset_chance_percent:40,forecast_window:'within 24h',observed_at:'2026-10-16T04:30:52.000Z',expires_at:'2026-10-17T05:00:00.000Z',text:'@maria_rcks Can’t argue with that, Let’s break the cycle.',source:{type:'x_post',author:'thsottiaux',url:'https://x.com/thsottiaux/status/2110951585983631505'}},
    stats:{total:62,last_reset_at:latest.announced_at,days_since_last:1,avg_interval_days:6.4},
  }};
}

test('a valid cached watch is the shared public post while confirmed history stays intact',()=>{
  const incoming=watchCache();
  assert.ok(isResetDataset(incoming));
  const selected=pickResetDataset(snapshot,[incoming]).data;
  assert.deepEqual(selected.status.active_watch,incoming.status.active_watch);
  assert.ok(selected.records.some(record=>record.id===snapshot.records.at(-1).id));
  assert.equal(latestPublicRecordId(selected,watchNow),'2110951585983631505');
  assert.equal(requestedShareRecordId(selected,'latest',watchNow),'2110951585983631505');
  assert.equal(requestedShareRecordId(selected,'2110951585983631505',watchNow),'2110951585983631505');
  assert.equal(requestedShareRecordId(selected,incoming.status.latest_reset.id,watchNow),incoming.status.latest_reset.id);
});

test('expired, invalid and superseded watches are not selected by latest or explicit share links',()=>{
  const data=watchCache(),id='2110951585983631505';
  const expired=Date.parse(data.status.active_watch.expires_at);
  assert.equal(latestPublicRecordId(data,expired),data.status.latest_reset.id);
  assert.equal(requestedShareRecordId(data,'latest',expired),data.status.latest_reset.id);
  assert.equal(requestedShareRecordId(data,id,expired),null);
  for(const change of [
    {observed_at:'2026-10-16T06:05:01Z'},
    {expires_at:'2026-10-16T04:00:00Z'},
    {source:{type:'x_post',author:'another-user',url:'https://x.com/thsottiaux/status/2110951585983631505'}},
  ]){
    const invalid=watchCache();Object.assign(invalid.status.active_watch,change);
    assert.equal(latestPublicRecordId(invalid,watchNow),invalid.status.latest_reset.id);
    assert.equal(requestedShareRecordId(invalid,id,watchNow),null);
  }
  const complete=watchCache();
  complete.status.latest_reset={...complete.status.latest_reset,id:'2110959999999999999',announced_at:'2026-10-16T05:30:00Z',source:{type:'x_post',author:'thsottiaux',url:'https://x.com/thsottiaux/status/2110959999999999999'}};
  assert.equal(latestPublicRecordId(complete,watchNow),complete.status.latest_reset.id);
  assert.equal(requestedShareRecordId(complete,id,watchNow),null);
  assert.equal(requestedShareRecordId({},'latest',watchNow),null);
});

test('a formal forecast takes precedence in latest sharing and an old watch ID does not silently redirect',()=>{
  const data=watchCache();
  data.status.scheduled_reset={id:'2110951111111111111',status:'scheduled',reset_type:'regular',announced_at:'2026-10-16T03:30:00Z',scheduled_for:'2026-10-16T08:30:00Z',text:'A reset is coming.',source:{type:'x_post',author:'thsottiaux',url:'https://x.com/thsottiaux/status/2110951111111111111'}};
  assert.equal(latestPublicRecordId(data,watchNow),data.status.scheduled_reset.id);
  assert.equal(requestedShareRecordId(data,'latest',watchNow),data.status.scheduled_reset.id);
  assert.equal(requestedShareRecordId(data,'2110951585983631505',watchNow),null);
});
