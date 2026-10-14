import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import api from '../apps/api/src/index';
import {migrate,d1Adapter} from '../apps/server/database';
import {digest,passwordMatches} from '../apps/server/passwords';
const pass='night-city-test-password-3077',origin='https://site.test';
function fixture(){
 const db=new DatabaseSync(':memory:');migrate(db);const env={DB:d1Adapter(db),ALLOWED_ORIGIN:origin,WORKER_PASSWORD_AUTH:true};
 const call=async(path:string,body?:unknown,token?:string,key?:string,source=origin)=>{const response=await api.fetch(new Request('https://api.test/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{Origin:source,'CF-Connecting-IP':'fixture','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(key?{'Idempotency-Key':key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);return {status:response.status,...await response.json() as any};};
 const register=(username:string)=>call('/auth/register',{username,password:pass,consent:true,role:'admin'});return {db,call,register};
}
test('five independent password accounts share live pools but never private balances, orders or credentials',async()=>{
 const f=fixture();try{
  const accounts=await Promise.all(['one','two','three','four','five'].map(n=>f.register('居民'+n)));
  assert.ok(accounts.every(r=>r.status===200),JSON.stringify(accounts.map(r=>r.error)));
  const tokens=accounts.map(r=>r.data.session_token),ids:string[]=[];
  for(let i=0;i<5;i++){const me=await f.call('/me',undefined,tokens[i]);ids.push(me.data.user.id);assert.equal(me.data.user.role,'user');assert.equal(me.data.wallet.balance,0);assert.equal((await f.call('/check-ins',{},tokens[i],'check-in-'+i)).status,200);}
  assert.equal(new Set(ids).size,5);const saved=f.db.prepare('SELECT password_hash FROM password_credentials').get()!;assert.equal(await passwordMatches(pass,String(saved.password_hash)),true);
  assert.equal((await f.call('/rounds/beta-sandbox/predictions',{character_id:'weak',amount:10},tokens[0],'predict-one')).status,200);
  assert.equal((await f.call('/rounds/beta-sandbox/predictions',{character_id:'d',amount:20},tokens[1],'predict-two')).status,200);
  const publicOdds=await f.call('/rounds/beta-sandbox/odds');assert.deepEqual(publicOdds.data.items.find((v:any)=>v.character_id==='weak').live_reference,{numerator:30,denominator:10});assert.deepEqual(publicOdds.data.items.find((v:any)=>v.character_id==='d').live_reference,{numerator:30,denominator:20});
  assert.equal((await f.call('/me',undefined,tokens[0])).data.wallet.balance,40);assert.equal((await f.call('/me',undefined,tokens[1])).data.wallet.balance,30);
  assert.equal((await f.call('/me/predictions?round_id=beta-sandbox&user_id='+ids[0],undefined,tokens[2])).data.items.length,0);
  assert.equal((await f.call('/admin/users',undefined,tokens[0])).status,403);assert.equal((await f.call('/me',undefined,'a'.repeat(43))).status,401);
  const login=await f.call('/auth/login',{username:'居民one',password:pass});assert.equal(login.status,200);assert.equal((await f.call('/me',undefined,login.data.session_token)).data.wallet.balance,40);
  assert.equal((await f.call('/auth/logout',{},tokens[0])).status,200);assert.equal((await f.call('/me',undefined,tokens[0])).status,401);
  assert.equal(JSON.stringify(publicOdds).includes('password_hash'),false);assert.equal(f.db.prepare('SELECT token_hash FROM sessions WHERE token_hash=?').get(digest(tokens[1]))!==undefined,true);
 }finally{f.db.close();}
});
test('password recovery rotates codes, concurrent reuse fails, and disabled or duplicate users are denied',async()=>{
 const f=fixture();try{
  const a=await f.register('独立居民'),token=a.data.session_token,code=a.data.recovery_code;
  assert.equal((await f.register('独立居民')).status,409);
  assert.equal((await f.call('/auth/login',{username:'独立居民',password:'wrong-password-123'})).status,401);
  const outcomes=await Promise.all([1,2].map(()=>f.call('/auth/recover',{username:'独立居民',password:'new-night-password-2077',recovery_code:code})));
  assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,401]);assert.equal((await f.call('/me',undefined,token)).status,401);
  const next=outcomes.find(r=>r.status===200)!.data.session_token;
  assert.equal((await f.call('/auth/password',{password:pass,current_password:'new-night-password-2077'},next)).status,200);assert.equal((await f.call('/me',undefined,next)).status,401);
  f.db.prepare('UPDATE users SET disabled=1').run();assert.equal((await f.call('/auth/login',{username:'独立居民',password:pass})).status,401);
  assert.equal((await f.call('/auth/register',{username:'外站请求',password:pass,consent:true},undefined,undefined,'https://evil.test')).status,403);
 }finally{f.db.close();}
});
