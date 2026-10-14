import type {DatabaseSync} from 'node:sqlite';
import {ApiError} from '@night-city/contracts';
import {digest} from './passwords';
import { allocate, coldWeights, referenceOdds, type PayoutRule } from '../../packages/contracts/src/odds';

type Order={id:string;user_id:string;character_id:string;amount:number};
type Entry={id:string;opening_numerator:number;opening_denominator:number;stake_total:number};
type Snapshot={orders:Order[];characters:Entry[];payout_rule?:PayoutRule};
export type StoredRound={id:string;episode:number;title:string;status:string;opens_at:string|null;closes_at:string|null;previous_round_id:string|null;is_test:number;payout_rule:PayoutRule};
export function round(db:DatabaseSync,id:string):StoredRound {
  const r=db.prepare('SELECT * FROM rounds WHERE id=?').get(id) as StoredRound|undefined;
  if(!r)throw new ApiError('NOT_FOUND','轮次不存在',404);return r;
}
/** Call within an IMMEDIATE transaction. No awaits between freeze, results and payments. */
export function freeze(db:DatabaseSync,id:string,now=new Date().toISOString()) {
  const r=round(db,id);
  if(r.is_test)throw new ApiError('INVALID_INPUT','可退款测试场不能生成正式结算');
  if(db.prepare('SELECT round_id FROM round_snapshots WHERE round_id=?').get(id))return;
  if(r.status!=='open')throw new ApiError('ROUND_NOT_OPEN','只能封闭已开盘轮次',409);
  db.prepare("UPDATE rounds SET status='closed' WHERE id=?").run(id);
  const orders=db.prepare('SELECT id,user_id,character_id,amount FROM predictions WHERE round_id=? AND cancelled_at IS NULL ORDER BY id').all(id) as Order[];
  const characters=db.prepare('SELECT rc.character_id AS id,rc.opening_numerator,rc.opening_denominator,COALESCE(SUM(p.amount),0) AS stake_total FROM round_characters rc LEFT JOIN predictions p ON p.round_id=rc.round_id AND p.character_id=rc.character_id AND p.cancelled_at IS NULL WHERE rc.round_id=? GROUP BY rc.character_id ORDER BY rc.character_id').all(id) as Entry[];
  const pool=orders.reduce((sum,p)=>sum+p.amount,0);
  if(!Number.isSafeInteger(pool))throw new ApiError('INVALID_INPUT','总池超出安全范围');
  db.prepare('INSERT INTO round_snapshots VALUES(?,?,?,?)').run(id,pool,JSON.stringify({orders,characters,payout_rule:r.payout_rule}),now);
}
export function payoutPlan(orders:Order[],dead:string[],rule:PayoutRule='cold-v2') {
  const sorted=[...orders].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),ids=new Set(dead);
  const pool=sorted.reduce((v,p)=>v+BigInt(p.amount),0n),winning=sorted.filter(p=>ids.has(p.character_id));
  const stake=winning.reduce((v,p)=>v+BigInt(p.amount),0n);
  if(pool>BigInt(Number.MAX_SAFE_INTEGER))throw new ApiError('INVALID_INPUT','总池超出安全范围');
  if(rule==='cold-v2'&&stake>0n){
    const totals=new Map<string,number>();
    for(const p of winning)totals.set(p.character_id,(totals.get(p.character_id)??0)+p.amount);
    const weights=coldWeights([...totals].map(([id,stake_total])=>({id,stake_total})));
    const characterPots=allocate(pool,[...weights].map(([id,weight])=>({id,weight})));
    const payouts=new Map<string,bigint>();
    for(const [character,pot] of characterPots){
      const group=winning.filter(p=>p.character_id===character),users=new Map<string,bigint>();
      for(const p of group)users.set(p.user_id,(users.get(p.user_id)??0n)+BigInt(p.amount));
      // Aggregate per account before rounding so splitting orders cannot increase its share.
      const shares=allocate(pot,[...users].map(([id,weight])=>({id,weight})));
      for(const [user,share] of shares)for(const [id,value] of allocate(share,group.filter(p=>p.user_id===user).map(p=>({id:p.id,weight:BigInt(p.amount)}))))payouts.set(id,value);
    }
    const rows=sorted.map(p=>({...p,payout:Number(payouts.get(p.id)??0n)}));
    if(rows.reduce((s,p)=>s+BigInt(p.payout),0n)!==pool)throw new Error('Payout conservation failed');
    return {pool_total:Number(pool),winning_stake:Number(stake),status:'settled',rows};
  }
  const rows=sorted.map(p=>({...p,payout:stake===0n?p.amount:ids.has(p.character_id)?Number(BigInt(p.amount)*pool/stake):0}));
  let remainder=pool-rows.reduce((v,p)=>v+BigInt(p.payout),0n);
  for(const p of rows){if(remainder>0n&&ids.has(p.character_id)){p.payout++;remainder--;}}
  if(remainder!==0n)throw new Error('Payout conservation failed');
  return {pool_total:Number(pool),winning_stake:Number(stake),status:stake===0n?'refunded':'settled',rows};
}
export function settlementPreview(db:DatabaseSync,id:string) {
  const r=round(db,id);
  const snapshot=db.prepare('SELECT snapshot_json FROM round_snapshots WHERE round_id=?').get(id) as {snapshot_json:string}|undefined;
  const confirmation=db.prepare('SELECT revision,source_note FROM result_confirmations WHERE round_id=?').get(id) as {revision:number;source_note:string}|undefined;
  if(!snapshot)throw new ApiError('ROUND_NOT_OPEN','请先封盘并冻结订单',409);
  if(!confirmation)throw new ApiError('RESULT_REQUIRED','先确认死亡名单；无人死亡也需明确确认',409);
  const deaths=(db.prepare('SELECT character_id FROM death_results WHERE round_id=? ORDER BY character_id').all(id) as {character_id:string}[]).map(c=>c.character_id);
  const frozen=JSON.parse(snapshot.snapshot_json) as Snapshot;
  const plan=payoutPlan(frozen.orders,deaths,frozen.payout_rule??'stake-v1');
  const hash=digest(JSON.stringify({snapshot:snapshot.snapshot_json,revision:confirmation.revision,deaths}));
  return {round_id:r.id,revision:confirmation.revision,source_note:confirmation.source_note,preview_hash:hash,dead_character_ids:deaths,...plan};
}
export function settle(db:DatabaseSync,id:string,actor:string,body:Record<string,unknown>) {
  const existing=db.prepare('SELECT * FROM settlements WHERE round_id=?').get(id);if(existing)return {settlement:existing,replayed:true};
  const r=round(db,id);if(r.status!=='result_pending')throw new ApiError('RESULT_REQUIRED','轮次尚未完成结果复核',409);
  const plan=settlementPreview(db,id);
  if(body.expected_revision!==plan.revision||body.preview_hash!==plan.preview_hash)throw new ApiError('INVALID_INPUT','结算预览已变化，请重新复核',409);
  const now=new Date().toISOString();
  db.prepare('INSERT INTO settlements VALUES(?,?,?,?,?,?,?)').run(id,plan.status,plan.pool_total,plan.winning_stake,plan.pool_total,actor,now);
  for(const p of plan.rows) {
    db.prepare('INSERT INTO payouts VALUES(?,?,?)').run(p.id,id,p.payout);
    if(p.payout===0)continue;
    const balance=(db.prepare('SELECT balance FROM wallets WHERE user_id=?').get(p.user_id) as {balance:number}).balance+p.payout;
    if(balance>1e9)throw new ApiError('INVALID_INPUT','有账户余额超出上限，结算未执行',409);
    db.prepare('INSERT INTO ledger(id,user_id,kind,delta,balance_after,round_id,prediction_id,reference_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),p.user_id,plan.status==='refunded'?'refund':'settlement',p.payout,balance,id,p.id,`round:${id}:${p.id}`,now);
    db.prepare('UPDATE wallets SET balance=?,version=version+1 WHERE user_id=?').run(balance,p.user_id);
  }
  db.prepare('UPDATE rounds SET status=? WHERE id=?').run(plan.status,id);
  return {settlement:db.prepare('SELECT * FROM settlements WHERE round_id=?').get(id),replayed:false};
}
export function nextCandidates(db:DatabaseSync,id:string) {
  const r=round(db,id);if(!['settled','refunded'].includes(r.status))throw new ApiError('INVALID_INPUT','上一轮结算后才能继承角色与参考赔率',409);
  const s=db.prepare('SELECT pool_total,snapshot_json FROM round_snapshots WHERE round_id=?').get(id) as {pool_total:number;snapshot_json:string};
  const dead=new Set((db.prepare('SELECT character_id FROM death_results').all() as {character_id:string}[]).map(p=>p.character_id));
  const frozen=JSON.parse(s.snapshot_json) as Snapshot;
  return frozen.characters.filter(c=>!dead.has(c.id)).map(c=>{
    // Opening references retain the single-winner ceiling; v2 has no live quote before the first stake.
    const odds=referenceOdds(frozen.characters,c.id,'stake-v1');
    return {character_id:c.id,opening_numerator:odds?.numerator??c.opening_numerator,opening_denominator:odds?.denominator??c.opening_denominator};
  });
}
