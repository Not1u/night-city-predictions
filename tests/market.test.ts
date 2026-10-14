import {test} from 'node:test';
import assert from 'node:assert/strict';
import { approximateCountdown, marketLoader } from '../apps/web/src/market';
import type {Round,RoundCharacter} from '@night-city/contracts';
test('approximate countdown changes units at day/hour/minute boundaries',()=>{
  for(const [ms,text] of [[3*86400000,'约 3 天'],[86400000,'约 1 天'],[86399999,'约 23 小时'],[3600000,'约 1 小时'],[3599999,'约 59 分钟'],[60000,'约 1 分钟'],[59999,'不足 1 分钟'],[0,'已封盘'],[-1,'已封盘']] as const)assert.equal(approximateCountdown(ms),text);
  assert.equal(approximateCountdown(NaN),'时间待确认');
});
test('market reads public changes repeatedly and discards stale round responses',async()=>{
  let resolveOld!:(value:RoundCharacter[])=>void;
  let total=10;
  const source={rounds:async()=>[{id:'a',pool_total:total},{id:'b',pool_total:total}] as Round[],characters:async(id:string)=>id==='a'?new Promise<RoundCharacter[]>(r=>{resolveOld=r;}):[]};
  const read=marketLoader(source),old=read('a');await Promise.resolve();
  const fresh=await read('b');assert.equal(fresh?.selected,'b');
  resolveOld([]);assert.equal(await old,null);
  total=45;assert.equal((await read('b'))?.rounds[1].pool_total,45);
});
