import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {payoutPlan,freeze,settlementPreview,settle} from '../apps/server/settlement';
import {migrate} from '../apps/server/database';
import {transaction} from '../apps/server/auth';
import {referenceOdds} from '../packages/contracts/src/odds';

const order=(id:string,character_id:string,amount:number,user_id=id)=>({id,user_id,character_id,amount});
test('cold winners get larger shares without minting points; single winner and no winner remain bounded',()=>{
  const orders=[order('a','hot',90),order('b','cold',10),order('c','loser',100)];
  const plan=payoutPlan(orders,['hot','cold']);
  assert.deepEqual(plan.rows.map(p=>p.payout),[20,180,0]);
  assert.equal(plan.rows.reduce((s,p)=>s+p.payout,0),200);
  assert.deepEqual(payoutPlan(orders,['cold']).rows.map(p=>p.payout),[0,200,0]);
  assert.deepEqual(payoutPlan(orders,[]).rows.map(p=>p.payout),[90,10,100]);
  assert.equal(payoutPlan([],[]).status,'refunded');
  assert.deepEqual(payoutPlan(orders,['hot','cold'],'stake-v1').rows.map(p=>p.payout),[180,20,0]);
});
test('splitting an account stake into many orders does not improve its return',()=>{
  const base=[order('a','cold',7,'u'),order('b','cold',4,'v'),order('c','hot',89,'w')];
  const split=[...Array.from({length:7},(_,i)=>order(`a${i}`,'cold',1,'u')),...base.slice(1)];
  const total=(orders:typeof base)=>payoutPlan(orders,['cold','hot']).rows.filter(p=>p.user_id==='u').reduce((s,p)=>s+p.payout,0);
  assert.equal(total(base),total(split));
  assert.deepEqual(payoutPlan(split,['hot','cold']),payoutPlan([...split].reverse(),['cold','hot','cold']));
});
test('reference matches the all-backed-winners scenario and reacts to the entered stake',()=>{
  const entries=[{id:'hot',stake_total:90},{id:'cold',stake_total:10},{id:'empty',stake_total:0}];
  const ratio=(id:string)=>{const r=referenceOdds(entries,id,'cold-v2')!;return r.numerator/r.denominator;};
  assert.equal(ratio('cold'),9);assert.ok(Math.abs(ratio('hot')-1/9)<0.000001);
  assert.equal(referenceOdds(entries,'empty','cold-v2'),null);
  entries[1].stake_total+=10;assert.ok(ratio('cold')<9);
});
test('many uneven pools conserve points and never pay a losing order',()=>{
  for(let n=1;n<=100;n++){
    const orders=Array.from({length:10},(_,i)=>order(`p${i}`,`c${i%4}`,1+(i*37+n*13)%101,`u${i%3}`));
    const plan=payoutPlan(orders,['c0','c2']);
    assert.equal(plan.rows.reduce((s,p)=>s+p.payout,0),plan.pool_total);
    assert.ok(plan.rows.every(p=>Number.isSafeInteger(p.payout)&&p.payout>=0));
    assert.ok(plan.rows.filter(p=>['c1','c3'].includes(p.character_id)).every(p=>p.payout===0));
  }
});
test('migration preserves existing formal open rounds and switches only drafts and refundable sandbox',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    for(const name of readdirSync('db/migrations').filter(n=>n.endsWith('.sql')&&n<'0007').sort())db.exec(readFileSync(`db/migrations/${name}`,'utf8'));
    db.exec("UPDATE rounds SET status='open',opens_at='2026-01-01',closes_at='2099-01-01' WHERE id='episode-01'");
    db.exec(readFileSync('db/migrations/0007_cold_odds.sql','utf8'));
    assert.equal(db.prepare("SELECT payout_rule FROM rounds WHERE id='episode-01'").get()!.payout_rule,'stake-v1');
    assert.equal(db.prepare("SELECT payout_rule FROM rounds WHERE id='beta-sandbox'").get()!.payout_rule,'cold-v2');
    db.exec("INSERT INTO round_snapshots VALUES('episode-01',0,'{}','now')");
    assert.throws(()=>db.exec("UPDATE rounds SET payout_rule='cold-v2' WHERE id='episode-01'"));
  }finally{db.close();}
});
test('v2 freeze, preview and settlement agree; replay cannot credit wallets twice',()=>{
  const db=new DatabaseSync(':memory:');migrate(db);
  try{
    for(const id of ['u','v','w']){
      db.prepare("INSERT INTO users(id,display_name,role,created_at) VALUES(?,?,'user','now')").run(id,id);
      db.prepare('INSERT INTO wallets VALUES(?,100,0)').run(id);
    }
    db.exec("UPDATE rounds SET status='open',opens_at='2020-01-01',closes_at='2099-01-01' WHERE id='episode-01'");
    for(const [id,character,user,amount] of [['a','weak','u',90],['b','d','v',10],['c','roman','w',100]]){
      db.prepare("INSERT INTO predictions(id,round_id,character_id,user_id,amount,created_at) VALUES(?,'episode-01',?,?,?,'now')").run(id,character,user,amount);
    }
    transaction(db,()=>freeze(db,'episode-01'));
    const snapshot=JSON.parse(String(db.prepare("SELECT snapshot_json FROM round_snapshots WHERE round_id='episode-01'").get()!.snapshot_json));
    assert.equal(snapshot.payout_rule,'cold-v2');
    for(const id of ['weak','d'])db.prepare("INSERT INTO death_results VALUES('episode-01',?,'u','now','test',1)").run(id);
    db.exec("INSERT INTO result_confirmations VALUES('episode-01',1,'u','now','test');UPDATE rounds SET status='result_pending' WHERE id='episode-01'");
    const plan=settlementPreview(db,'episode-01');assert.deepEqual(plan.rows.map(p=>p.payout),[20,180,0]);
    const confirm={expected_revision:plan.revision,preview_hash:plan.preview_hash};
    transaction(db,()=>settle(db,'episode-01','u',confirm));
    assert.equal(transaction(db,()=>settle(db,'episode-01','u',confirm)).replayed,true);
    assert.deepEqual(db.prepare('SELECT balance FROM wallets ORDER BY user_id').all().map(p=>p.balance),[30,270,0]);
    assert.equal(db.prepare("SELECT SUM(delta) AS n FROM ledger WHERE kind='settlement'").get()!.n,200);
  }finally{db.close();}
});
