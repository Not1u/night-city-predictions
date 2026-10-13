import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers';
import { slotSymbol, slotMultiplier, rouletteMultiplier, randomInt } from '../apps/api/src/play';
async function setup(t:TestContext){
  const f=fixture();t.after(()=>f.sqlite.close());
  t.mock.method(globalThis,'fetch',async(_:unknown,init:RequestInit)=>Response.json({$id:(init.headers as Record<string,string>)['X-Appwrite-JWT'],status:true,emailVerification:true}));
  for(const who of ['alice','bob','carol','dan'])assert.equal((await f.call('/auth/register','POST',who,{consent:true,display_name:'居民'+who})).status,200);
  await f.call('/check-ins','POST','alice',undefined,'initial-credit');return f;
}
test('usernames normalize, are unique, cannot impersonate staff, and registration does not rename existing users',async t=>{
  const {call}=await setup(t);
  for(const name of ['a','<b>','管理员','ADMIN','x'.repeat(21)])assert.equal((await call('/me/profile','PATCH','alice',{display_name:name})).status,400);
  assert.equal((await call('/me/profile','PATCH','alice',{display_name:' Ｖ幽灵 ',role:'admin',user_id:'bob'})).status,200);
  assert.equal((await call('/me/profile','PATCH','bob',{display_name:'v幽灵'})).status,409);
  const user=(await (await call('/auth/register','POST','alice',{consent:true,display_name:'新名字'})).json() as any).data;
  assert.equal(user.display_name,'V幽灵');assert.equal(user.role,'user');
});
test('prediction debit is atomic, concurrent overspending fails, exact retry replays and test refund only credits once',async t=>{
  const {call,sqlite}=await setup(t),path='/rounds/beta-sandbox/predictions',body={character_id:'weak',amount:40};
  const results=await Promise.all([call(path,'POST','alice',body,'prediction-a'),call(path,'POST','alice',body,'prediction-b')]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const key=results[0].status===200?'prediction-a':'prediction-b';
  const original=await results.find(r=>r.status===200)!.json() as any;
  assert.equal((await (await call(path,'POST','alice',body,key)).json() as any).data.id,original.data.id);
  assert.equal((await call(path,'POST','alice',{...body,amount:1},key)).status,409);
  assert.equal((await call(`/predictions/${original.data.id}/refund`,'POST','bob')).status,404);
  const refunds=await Promise.all([call(`/predictions/${original.data.id}/refund`,'POST','alice'),call(`/predictions/${original.data.id}/refund`,'POST','alice')]);
  assert.ok(refunds.every(r=>r.status===200));
  assert.equal(sqlite.prepare("SELECT balance FROM wallets w JOIN users u ON u.id=w.user_id WHERE provider_subject='appwrite:alice'").get()!.balance,50);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind='refund'").get()!.n,1);
  const rounds=(await (await call('/rounds')).json() as any).data.items;assert.equal(rounds.find((r:any)=>r.id==='beta-sandbox').pool_total,0);
  const cards=(await (await call('/rounds/beta-sandbox/characters')).json() as any).data.items;assert.equal(cards.find((c:any)=>c.id==='weak').odds.stake_total,0);
});
test('prediction server enforces eligibility, balance, integer amounts and actual round close time',async t=>{
  const {call,sqlite}=await setup(t),path='/rounds/beta-sandbox/predictions';
  for(const amount of [-1,0,1.1,'5',10001])assert.equal((await call(path,'POST','alice',{character_id:'weak',amount},'invalid-amount')).status,400);
  assert.equal((await call(path,'POST','alice',{character_id:'city-board',amount:1},'bad-character')).status,400);
  assert.equal((await call('/rounds/episode-01/predictions','POST','alice',{character_id:'weak',amount:1},'draft-round')).status,409);
  sqlite.exec("UPDATE rounds SET opens_at='2000-01-01T00:00:00.000Z',closes_at='2000-02-01T00:00:00.000Z' WHERE id='beta-sandbox'");
  assert.equal((await call(path,'POST','alice',{character_id:'weak',amount:1,now:0},'closed-round')).status,409);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM predictions').get()!.n,0);
});
test('slot payouts exhaustively match the published 93.14 percent return and roulette is 36/37',()=>{
  let total=0;for(let a=0;a<61;a++)for(let b=0;b<61;b++)for(let c=0;c<61;c++)total+=slotMultiplier([slotSymbol(a),slotSymbol(b),slotSymbol(c)]);
  assert.equal(total,211400);assert.equal(61**3,226981);
  for(const choice of ['red','black','odd','even','low','high','number'])assert.equal(Array.from({length:37},(_,n)=>rouletteMultiplier(n,choice,0)).reduce((a,b)=>a+b),36);
  assert.equal(rouletteMultiplier(0,'even'),0);assert.equal(slotMultiplier(['blank','blank','skull']),0);assert.equal(slotMultiplier(['skull','skull','skull']),51);
});
test('unbiased RNG rejects samples above the even range',t=>{
  let calls=0;t.mock.method(crypto,'getRandomValues',(arr:Uint32Array)=>{arr[0]=calls++===0?0xffffffff:37;return arr;});
  assert.equal(randomInt(37),0);assert.equal(calls,2);
});
test('game results are server chosen and persisted; retry, conflicting payload, history isolation and cooldown hold',async t=>{
  const {call,sqlite}=await setup(t);t.mock.method(crypto,'getRandomValues',(arr:Uint32Array)=>{arr[0]=0;return arr;});
  const body={stake:5,result:'client-jackpot'},path='/games/slots/play';
  const result=await call(path,'POST','alice',body,'slot-request');assert.equal(result.status,200);
  const receipt=(await result.json() as any).data;assert.equal(receipt.payout,255);assert.equal(receipt.balance,300);assert.deepEqual(receipt.result.symbols,['skull','skull','skull']);
  assert.deepEqual((await (await call(path,'POST','alice',body,'slot-request')).json() as any).data,receipt);
  assert.equal((await call(path,'POST','alice',{stake:6},'slot-request')).status,409);
  assert.equal((await call(path,'POST','alice',{stake:5},'second-slot')).status,429);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM game_plays').get()!.n,1);
  assert.equal((await (await call('/me/games','GET','bob')).json() as any).data.items.length,0);
  assert.equal((await call(path,'POST','bob',{stake:5},'empty-wallet')).status,409);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind='activity_reward'").get()!.n,2);
});
test('simultaneous game retries share one result; losing spins debit once; invalid inputs never create orders',async t=>{
  const {call,sqlite}=await setup(t);t.mock.method(crypto,'getRandomValues',(arr:Uint32Array)=>{arr[0]=60;return arr;});
  const results=await Promise.all([call('/games/slots/play','POST','alice',{stake:7},'same-spin'),call('/games/slots/play','POST','alice',{stake:7},'same-spin')]);
  assert.ok(results.every(r=>r.status===200));const a=(await results[0].json() as any).data,b=(await results[1].json() as any).data;assert.deepEqual(a,b);assert.equal(a.balance,43);assert.equal(a.payout,0);
  for(const body of [{stake:1,choice:'number',number:37},{stake:0,choice:'red'},{stake:51},{stake:1,choice:'hack'}])assert.equal((await call('/games/roulette/play','POST','alice',body,'bad-wheel')).status,400);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM game_plays').get()!.n,1);
});
test('game ledger overflow rolls back the spin and all debits',async t=>{
  const {call,sqlite}=await setup(t);sqlite.exec('UPDATE wallets SET balance=1000000000');t.mock.method(crypto,'getRandomValues',(arr:Uint32Array)=>{arr[0]=0;return arr;});
  assert.equal((await call('/games/slots/play','POST','alice',{stake:5},'overflow-spin')).status,500);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM game_plays').get()!.n,0);assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind='activity_reward'").get()!.n,0);
});
