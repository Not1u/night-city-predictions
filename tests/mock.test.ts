import test from 'node:test';
import assert from 'node:assert/strict';
import { MockClient } from '../apps/web/src/api';
test('demo starts from zero and check-in only grants 50 once per UTC day',async()=>{const c=new MockClient();await c.login();assert.equal((await c.me())!.wallet.balance,0);await c.checkIn('check-in-1');await c.checkIn('check-in-1');assert.equal((await c.me())!.wallet.balance,50);await assert.rejects(c.checkIn('check-in-2'));assert.equal((await c.ledger()).length,1);});
test('demo retry does not duplicate order; changed payload conflicts',async()=>{const c=new MockClient();await c.login();await c.checkIn('check');await c.predict('demo-01',{character_id:'weak',amount:10},'order-1');await c.predict('demo-01',{character_id:'weak',amount:10},'order-1');await assert.rejects(c.predict('demo-01',{character_id:'weak',amount:11},'order-1'));assert.equal((await c.me())!.wallet.balance,40);assert.equal((await c.predictions('demo-01')).length,1);});
test('demo rejects overdrafts, fractional amounts and unopened rounds',async()=>{const c=new MockClient();await c.login();await c.checkIn('check');for(const amount of [0,-1,1.5,51]) await assert.rejects(c.predict('demo-01',{character_id:'weak',amount},'o'+amount));await assert.rejects(c.predict('demo-02',{character_id:'weak',amount:10},'other'));assert.equal((await c.me())!.wallet.balance,50);});
test('live ratios depend on this round only and unbacked characters keep opening reference',async()=>{const c=new MockClient();await c.login();await c.checkIn('check');await c.predict('demo-01',{character_id:'weak',amount:10},'weak');await c.predict('demo-01',{character_id:'d',amount:20},'d');const first=await c.characters('demo-01');assert.deepEqual(first.find(c=>c.id==='weak')!.odds.live_reference,{numerator:30,denominator:10});assert.equal(first.find(c=>c.id==='roman')!.odds.live_reference,null);assert.equal((await c.rounds())[1].pool_total,0);assert.ok((await c.characters('demo-02')).every(c=>c.odds.live_reference===null));});

test('local arcade applies the shared paytable, records once on retry, and never populates public rankings',async t=>{
 const c=new MockClient();await c.login();await c.checkIn('check');
 t.mock.method(crypto,'getRandomValues',((a:Uint32Array)=>{a[0]=0;return a;}) as typeof crypto.getRandomValues);
 const spin=await c.play('slots',{stake:5},'local-spin');assert.deepEqual(spin.result.symbols,['skull','skull','skull']);assert.equal(spin.payout,255);assert.equal(spin.balance,300);
 assert.deepEqual(await c.play('slots',{stake:5},'local-spin'),spin);assert.equal((await c.games()).length,1);
 await assert.rejects(c.play('slots',{stake:6},'local-spin'));await assert.rejects(c.play('slots',{stake:5},'next-spin'));
 assert.deepEqual((await c.leaderboard('arcade')).items,[]);assert.equal((await c.ledger()).reduce((s,v)=>s+v.delta,0),300);
});

test('local roulette validates input and mirrors zero-pocket payout',async t=>{
 const c=new MockClient();await c.login();await c.checkIn('check');
 for(const body of [{stake:51,choice:'red'},{stake:1,choice:'anything'},{stake:1,choice:'number',number:37},{stake:1.5,choice:'red'}])await assert.rejects(c.play('roulette',body,'bad'));
 t.mock.method(crypto,'getRandomValues',((a:Uint32Array)=>{a[0]=0;return a;}) as typeof crypto.getRandomValues);
 const result=await c.play('roulette',{stake:1,choice:'number',number:0},'zero');assert.equal(result.payout,36);assert.equal(result.balance,85);
});
