import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isResetDataset, pickResetDataset, mergeResetHistory, latestPublicRecordId, requestedShareRecordId } from '../public/reset-cache.js';

const snapshot=JSON.parse(await readFile(new URL('../public/snapshot.json',import.meta.url),'utf8'));
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
