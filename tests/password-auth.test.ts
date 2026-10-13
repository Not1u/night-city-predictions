import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { migrate } from '../apps/server/database';
import { createApp } from '../apps/server/app';
import { digest, passwordMatches, secret } from '../apps/server/passwords';

const password='a-long-test-password-3077', origin='https://example.test';
function fixture() {
  const db=new DatabaseSync(':memory:');migrate(db);
  const app=createApp(db,{origin,secure:true,cookieName:'__Host-nc_session',webRoot:resolve('apps/web/dist')});
  const call=async(path:string,body?:unknown,cookie?:string,source=origin,method=body===undefined?'GET':'POST',ip='127.0.0.1')=>{
    const response=await app(new Request(origin+path,{method,headers:{Origin:source,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}),ip);
    const data=await response.json() as any;return {response,data,cookie:response.headers.get('Set-Cookie')?.split(';')[0]};
  };
  const register=(name='测试居民')=>call('/api/v1/auth/register',{username:name,password,consent:true});
  return {db,app,call,register};
}
test('password registration stores hashes; cookie is secure and self data only',async()=>{
  const f=fixture();try {
    const r=await f.register();assert.equal(r.response.status,200);assert.equal(r.data.data.recovery_code.length,43);
    const c=f.db.prepare('SELECT * FROM password_credentials').get()!;
    assert.notEqual(c.password_hash,password);assert.equal(await passwordMatches(password,String(c.password_hash)),true);
    assert.equal(c.recovery_hash,digest(r.data.data.recovery_code));
    assert.match(r.response.headers.get('Set-Cookie')!,/HttpOnly; SameSite=Lax/);assert.match(r.response.headers.get('Set-Cookie')!,/Secure/);
    assert.equal((await f.call('/api/v1/me')).response.status,401);
    const me=await f.call('/api/v1/me',undefined,r.cookie);assert.equal(me.data.data.user.display_name,'测试居民');assert.equal(me.data.data.wallet.balance,0);
    assert.equal((await f.call('/api/v1/admin/users',undefined,r.cookie)).response.status,403);
    const other=await f.register('第二居民');const a=await f.call('/api/v1/me',undefined,r.cookie),b=await f.call('/api/v1/me',undefined,other.cookie);
    assert.notEqual(a.data.data.user.id,b.data.data.user.id);
    f.db.prepare("INSERT INTO ledger(id,user_id,kind,delta,balance_after,reference_id,created_at) VALUES('private-entry',?,'check_in',50,50,'fixture',?)").run(a.data.data.user.id,new Date().toISOString());
    const history=await f.call('/api/v1/me/ledger?user_id='+a.data.data.user.id,undefined,other.cookie);assert.deepEqual(history.data.data.items,[]);
    assert.equal(JSON.stringify(me.data).includes('password_hash'),false);
  }finally{f.db.close();}
});
test('wrong passwords are rejected and per-source brute force is limited',async()=>{
  const f=fixture();try {
    await f.register();
    const wrong=await f.call('/api/v1/auth/login',{username:'测试居民',password:'wrong-long-password'});
    const missing=await f.call('/api/v1/auth/login',{username:'不存在居民',password:'wrong-long-password'});
    assert.equal(wrong.response.status,401);assert.deepEqual(wrong.data.error,missing.data.error);
    for(let i=0;i<7;i++)await f.call('/api/v1/auth/login',{username:'测试居民',password:'wrong-long-password'});
    assert.equal((await f.call('/api/v1/auth/login',{username:'测试居民',password})).response.status,429);
    assert.equal((await f.call('/api/v1/auth/login',{username:'测试居民',password},undefined,origin,'POST','other-source')).response.status,200);
  }finally{f.db.close();}
});
test('recovery rotates recovery code and revokes prior sessions; reused code fails',async()=>{
  const f=fixture();try {
    const r=await f.register(),oldCode=r.data.data.recovery_code;
    const recover=await f.call('/api/v1/auth/recover',{username:'测试居民',password:'another-long-password',recovery_code:oldCode});
    assert.equal(recover.response.status,200);assert.notEqual(recover.data.data.recovery_code,oldCode);
    assert.equal((await f.call('/api/v1/me',undefined,r.cookie)).response.status,401);
    assert.equal((await f.call('/api/v1/auth/recover',{username:'测试居民',password,recovery_code:oldCode})).response.status,401);
    assert.equal((await f.call('/api/v1/me',undefined,recover.cookie)).response.status,200);
  }finally{f.db.close();}
});
test('password change requires current password and logout invalidates server session',async()=>{
  const f=fixture();try {
    const r=await f.register();
    assert.equal((await f.call('/api/v1/auth/password',{current_password:'wrong-long-password',password:'a-new-long-password'},r.cookie)).response.status,401);
    const changed=await f.call('/api/v1/auth/password',{current_password:password,password:'a-new-long-password'},r.cookie);
    assert.equal(changed.response.status,200);assert.equal((await f.call('/api/v1/me',undefined,r.cookie)).response.status,401);
    assert.equal((await f.call('/api/v1/auth/logout',{},changed.cookie)).response.status,200);
    assert.equal((await f.call('/api/v1/me',undefined,changed.cookie)).response.status,401);
  }finally{f.db.close();}
});
test('CSRF, weak inputs, username collisions and disabled users are blocked',async()=>{
  const f=fixture();try {
    assert.equal((await f.call('/api/v1/auth/register',{username:'居民',password,consent:true},undefined,'https://evil.example')).response.status,403);
    assert.equal((await f.call('/api/v1/auth/register',{username:'居民',password:'123',consent:true})).response.status,400);
    assert.equal((await f.call('/api/v1/auth/register',{username:'居民',password,consent:false})).response.status,400);
    const r=await f.register('NightCity');assert.equal((await f.register('ＮＩＧＨＴＣＩＴＹ')).response.status,409);
    f.db.prepare('UPDATE users SET disabled=1').run();
    assert.equal((await f.call('/api/v1/me',undefined,r.cookie)).response.status,401);
    assert.equal((await f.call('/api/v1/auth/login',{username:'NightCity',password})).response.status,401);
  }finally{f.db.close();}
});
test('static serving cannot expose secrets, source, database or directory listings',async()=>{
  const f=fixture();try {
    for(const path of ['/.env','/.git/config','/package.json','/apps/server/passwords.ts','/.data/night-city.sqlite','/assets/','/%2e%2e%5cpackage.json','/backups/data.sql']){
      assert.equal((await f.app(new Request(origin+path))).status,404,path);
    }
  }finally{f.db.close();}
});
test('legacy name cannot be taken over; one-use operator claim preserves identity and balance',async()=>{
  const f=fixture();try {
    const now=new Date().toISOString();
    f.db.prepare("INSERT INTO users(id,display_name,provider_subject,role,created_at,username_key) VALUES('old-user','老居民','appwrite:old-subject','user',?,'老居民')").run(now);
    f.db.prepare("INSERT INTO wallets(user_id,balance,version) VALUES('old-user',30,1)").run();
    assert.equal((await f.register('老居民')).response.status,409);
    assert.equal((await f.call('/api/v1/auth/claim',{username:'老居民',password,claim_code:secret()})).response.status,401);
    const code=secret();f.db.prepare("INSERT INTO account_claims VALUES('old-user',?,?)").run(digest(code),new Date(Date.now()+60000).toISOString());
    const r=await f.call('/api/v1/auth/claim',{username:'老居民',password,claim_code:code});assert.equal(r.response.status,200);
    const me=await f.call('/api/v1/me',undefined,r.cookie);assert.equal(me.data.data.user.id,'old-user');assert.equal(me.data.data.wallet.balance,30);
    assert.equal((await f.call('/api/v1/auth/claim',{username:'老居民',password,claim_code:code})).response.status,401);
  }finally{f.db.close();}
});
