import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker, { type Env } from '../apps/api/src/index';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync('db/migrations').filter(n=>n.endsWith('.sql')).sort()) sqlite.exec(readFileSync(`db/migrations/${name}`,'utf8'));
  const db = {
    prepare(sql:string) {
      let values: unknown[]=[];
      return {
        bind(...args:unknown[]){values=args;return this;},
        async first(){return sqlite.prepare(sql).get(...values as [])??null;},
        async all(){return {results:sqlite.prepare(sql).all(...values as [])};},
        execute(){return sqlite.prepare(sql).run(...values as []);}
      };
    },
    async batch(statements: {execute:()=>unknown}[]) {
      sqlite.exec('BEGIN');
      try { const results=statements.map(s=>s.execute());sqlite.exec('COMMIT');return results; }
      catch(error){sqlite.exec('ROLLBACK');throw error;}
    }
  };
  const env:Env={DB:db as unknown as D1Database,ALLOWED_ORIGIN:'https://site.test',APPWRITE_ENDPOINT:'https://issuer.test/v1',APPWRITE_PROJECT_ID:'test-project'};
  const call=(path:string,method='GET',token='valid',body?:unknown,key?:string)=>worker.fetch(new Request(`https://api.test/api/v1${path}`,{
    method,headers:{Origin:env.ALLOWED_ORIGIN,Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined
  }),env);
  return {sqlite,call};
}

test('verified email registration requires consent, is repeatable and never accepts a client role',async t=>{
  const {sqlite,call}=fixture();t.after(()=>sqlite.close());
  t.mock.method(globalThis,'fetch',async (_:unknown,init:RequestInit)=>{
    assert.equal((init.headers as Record<string,string>)['X-Appwrite-Project'],'test-project');
    return Response.json({$id:'alice',status:true,emailVerification:true,role:'admin'});
  });
  assert.equal((await call('/auth/register','POST','valid',{consent:false})).status,400);
  for(let i=0;i<2;i++) {
    const response=await call('/auth/register','POST','valid',{consent:true,role:'admin'});
    assert.equal(response.status,200);assert.equal((await response.json() as any).data.role,'user');
  }
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM users').get()!.n,1);
  assert.equal(sqlite.prepare('SELECT balance FROM wallets').get()!.balance,0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM user_consents').get()!.n,1);
  assert.equal((await call('/admin/rounds')).status,403);
});

test('issuer rejects forged/revoked tokens and unverified or disabled email accounts',async t=>{
  const {sqlite,call}=fixture();t.after(()=>sqlite.close());
  let status=true,verified=false,revoked=false;
  t.mock.method(globalThis,'fetch',async()=>revoked?Response.json({}, {status:401}):Response.json({$id:'a',status,emailVerification:verified}));
  assert.equal((await call('/auth/register','POST','valid',{consent:true})).status,401);
  verified=true;status=false;
  assert.equal((await call('/auth/register','POST','valid',{consent:true})).status,401);
  status=true;assert.equal((await call('/auth/register','POST','valid',{consent:true})).status,200);
  revoked=true;assert.equal((await call('/me')).status,401);
  assert.equal((await call('/check-ins','POST','forged',undefined,'attempt-1')).status,401);
  assert.equal(sqlite.prepare('SELECT balance FROM wallets').get()!.balance,0);
});

test('concurrent daily check-ins credit exactly once; replay and account isolation hold',async t=>{
  const {sqlite,call}=fixture();t.after(()=>sqlite.close());
  t.mock.method(globalThis,'fetch',async (_:unknown,init:RequestInit)=>Response.json({$id:(init.headers as Record<string,string>)['X-Appwrite-JWT'],status:true,emailVerification:true}));
  await call('/auth/register','POST','alice',{consent:true});
  await call('/auth/register','POST','bob',{consent:true});
  const attempts=await Promise.all([call('/check-ins','POST','alice',undefined,'key-alice1'),call('/check-ins','POST','alice',undefined,'key-alice2')]);
  assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
  const winning=attempts[0].status===200?'key-alice1':'key-alice2';
  const replay=await call('/check-ins','POST','alice',undefined,winning);
  assert.equal(replay.status,200);assert.equal((await replay.json() as any).data.balance,50);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ledger').get()!.n,1);
  const alice=await (await call('/me','GET','alice')).json() as any;
  const bob=await (await call('/me','GET','bob')).json() as any;
  assert.equal(alice.data.wallet.balance,50);assert.equal(alice.data.wallet.checked_in_today,true);
  assert.equal(bob.data.wallet.balance,0);
  assert.equal((await (await call('/me/ledger','GET','bob')).json() as any).data.items.length,0);
  assert.equal((await call('/me/predictions?round_id=episode-01','GET','bob')).status,200);
});

test('a failed credit rolls back the ledger and idempotency record',async t=>{
  const {sqlite,call}=fixture();t.after(()=>sqlite.close());
  t.mock.method(globalThis,'fetch',async()=>Response.json({$id:'alice',status:true,emailVerification:true}));
  await call('/auth/register','POST','valid',{consent:true});
  sqlite.exec('UPDATE wallets SET balance=1000000000');
  assert.equal((await call('/check-ins','POST','valid',undefined,'overflow-key')).status,500);
  for(const table of ['ledger','check_ins','idempotency_keys']) assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n,0);
  assert.equal(sqlite.prepare('SELECT balance FROM wallets').get()!.balance,1000000000);
});
