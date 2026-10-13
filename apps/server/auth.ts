import type { DatabaseSync } from 'node:sqlite';
import { ApiError } from '@night-city/contracts';
import { jsonBody, username } from '../api/src/input';
import { requireUser } from '../api/src/auth/session';
import { d1Adapter } from './database';
import { digest, passwordHash, passwordMatches, secret, secretMatches, validatePassword } from './passwords';

const DUMMY = `scrypt-v1$${'0'.repeat(32)}$${'0'.repeat(64)}`;
const DAY = 86400000;
type Credential = { id:string; password_hash:string; recovery_hash:string; disabled:number };
export type AuthOptions = { origin:string; cookieName:string; secure:boolean };
export function transaction<T>(db:DatabaseSync, work:()=>T):T {
  db.exec('BEGIN IMMEDIATE');
  try { const value=work(); db.exec('COMMIT'); return value; }
  catch(error){db.exec('ROLLBACK');throw error;}
}
/** Buckets persist across restarts, contain hashed identifiers and expire automatically. */
export function limit(db:DatabaseSync, key:string, max:number, windowMs=15*60000) {
  const now=Date.now(), bucket=digest(key);
  db.prepare('DELETE FROM auth_limits WHERE expires<?').run(now);
  const row=db.prepare(`INSERT INTO auth_limits(bucket,count,expires) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count`).get(bucket,now+windowMs) as {count:number};
  if(row.count>max)throw new ApiError('RATE_LIMITED','操作太频繁，请稍后重试',429);
}
export function cookie(token:string, options:AuthOptions, clear=false) {
  return `${options.cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear?0:7*86400}${options.secure?'; Secure':''}`;
}
function issueSession(db:DatabaseSync,userId:string) {
  const token=secret(), now=Date.now();
  db.prepare('DELETE FROM sessions WHERE expires_at<? OR revoked_at IS NOT NULL').run(new Date(now).toISOString());
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(digest(token),userId,new Date(now+7*DAY).toISOString(),new Date(now).toISOString());
  // A bounded number of simultaneous sessions per account.
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY (token_hash=?) DESC,created_at DESC,token_hash DESC LIMIT 5)').run(userId,userId,digest(token));
  return token;
}
function find(db:DatabaseSync,name:string) {
  return db.prepare('SELECT u.id,u.disabled,c.password_hash,c.recovery_hash FROM users u JOIN password_credentials c ON c.user_id=u.id WHERE u.username_key=?').get(name.toLowerCase()) as Credential|undefined;
}
export async function passwordRoute(request:Request,db:DatabaseSync,options:AuthOptions,ip:string):Promise<Response|null> {
  const path=new URL(request.url).pathname;
  if(!['/api/v1/auth/register','/api/v1/auth/login','/api/v1/auth/logout','/api/v1/auth/recover','/api/v1/auth/password','/api/v1/auth/claim'].includes(path))return null;
  const headers=new Headers({'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'});
  const meta={server_time:new Date().toISOString(),request_id:crypto.randomUUID(),api_version:'v1'};
  try {
    if(request.method!=='POST')throw new ApiError('INVALID_INPUT','请使用 POST 请求',405);
    if(request.headers.get('Origin')!==options.origin)throw new ApiError('FORBIDDEN','请求来源不被允许',403);
    limit(db,`auth-ip:${ip}`,40);
    if(path.endsWith('/logout')) {
      const token=request.headers.get('Cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${options.cookieName}=`))?.split('=')[1];
      if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));
      headers.set('Set-Cookie',cookie('',options,true));
      return Response.json({data:{ok:true},meta},{headers});
    }
    const body=await jsonBody(request);
    if(path.endsWith('/password')) {
      const user=await requireUser(request,d1Adapter(db),new Date(),options.cookieName,true);
      limit(db,`change:${user.id}`,6);
      const old=validatePassword(body.current_password), next=validatePassword(body.password);
      const stored=db.prepare('SELECT password_hash FROM password_credentials WHERE user_id=?').get(user.id) as {password_hash:string}|undefined;
      if(!stored||!await passwordMatches(old,stored.password_hash))throw new ApiError('UNAUTHENTICATED','当前密码不正确',401);
      const hash=await passwordHash(next), recovery=secret();
      transaction(db,()=>{
        const updated=db.prepare('UPDATE password_credentials SET password_hash=?,recovery_hash=?,updated_at=? WHERE user_id=? AND password_hash=?').run(hash,digest(recovery),new Date().toISOString(),user.id,stored.password_hash);
        if(!updated.changes)throw new ApiError('UNAUTHENTICATED','凭据已变更，请重新登录',401);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
        headers.set('Set-Cookie',cookie(issueSession(db,user.id),options));
      });
      return Response.json({data:{recovery_code:recovery},meta},{headers});
    }
    const name=username(body.username), pass=validatePassword(body.password);
    // Per account + source prevents one source brute forcing while avoiding a global account lockout.
    limit(db,`account:${ip}:${name.toLowerCase()}`,8);
    let userId:string, recovery:string|undefined;
    if(path.endsWith('/register')) {
      if(body.consent!==true)throw new ApiError('INVALID_INPUT','请确认年龄及虚拟积分说明');
      limit(db,`register:${ip}`,5,DAY);
      const hash=await passwordHash(pass); recovery=secret(); userId=crypto.randomUUID();
      transaction(db,()=>{
        if(db.prepare('SELECT id FROM users WHERE username_key=?').get(name.toLowerCase()))throw new ApiError('INVALID_INPUT','用户名已被使用；老账户请先迁移，不要重新注册',409);
        const now=new Date().toISOString();
        db.prepare("INSERT INTO users(id,display_name,username_key,provider_subject,role,created_at) VALUES(?,?,?,?,'user',?)").run(userId,name,name.toLowerCase(),`password:${userId}`,now);
        db.prepare('INSERT INTO wallets(user_id,balance,version) VALUES(?,0,0)').run(userId);
        db.prepare("INSERT INTO user_consents(user_id,version,accepted_at) VALUES(?,'2026-10-14',?)").run(userId,now);
        db.prepare('INSERT INTO password_credentials VALUES(?,?,?,?)').run(userId,hash,digest(recovery!),now);
        headers.set('Set-Cookie',cookie(issueSession(db,userId),options));
      });
    } else if(path.endsWith('/claim')) {
      const code=typeof body.claim_code==='string'?body.claim_code:'';
      const stored=db.prepare('SELECT u.id FROM account_claims a JOIN users u ON u.id=a.user_id WHERE u.username_key=? AND u.disabled=0 AND a.token_hash=? AND a.expires_at>? AND NOT EXISTS(SELECT 1 FROM password_credentials WHERE user_id=u.id)').get(name.toLowerCase(),digest(code),new Date().toISOString()) as {id:string}|undefined;
      if(code.length!==43||!stored)throw new ApiError('UNAUTHENTICATED','用户名或迁移码不正确，或迁移码已失效',401);
      const hash=await passwordHash(pass);recovery=secret();userId=stored.id;
      transaction(db,()=>{
        const consumed=db.prepare('DELETE FROM account_claims WHERE user_id=? AND token_hash=? AND expires_at>?').run(userId,digest(code),new Date().toISOString());
        if(!consumed.changes)throw new ApiError('UNAUTHENTICATED','迁移码已失效',401);
        db.prepare('INSERT INTO password_credentials VALUES(?,?,?,?)').run(userId,hash,digest(recovery!),new Date().toISOString());
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
        headers.set('Set-Cookie',cookie(issueSession(db,userId),options));
      });
    } else if(path.endsWith('/recover')) {
      const stored=find(db,name);
      const code=typeof body.recovery_code==='string'?body.recovery_code:'';
      if(!stored||stored.disabled||code.length!==43||!secretMatches(code,stored.recovery_hash))throw new ApiError('UNAUTHENTICATED','用户名或恢复码不正确',401);
      const hash=await passwordHash(pass);recovery=secret();userId=stored.id;
      transaction(db,()=>{
        const updated=db.prepare('UPDATE password_credentials SET password_hash=?,recovery_hash=?,updated_at=? WHERE user_id=? AND recovery_hash=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND disabled=0)').run(hash,digest(recovery!),new Date().toISOString(),userId,stored.recovery_hash,userId);
        if(!updated.changes)throw new ApiError('UNAUTHENTICATED','恢复码已失效',401);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
        headers.set('Set-Cookie',cookie(issueSession(db,userId),options));
      });
    } else {
      const stored=find(db,name);
      const valid=await passwordMatches(pass,stored?.password_hash??DUMMY);
      if(!stored||stored.disabled||!valid)throw new ApiError('UNAUTHENTICATED','用户名或密码不正确',401);
      userId=stored.id;
      transaction(db,()=>{
        if(!db.prepare('SELECT u.id FROM users u JOIN password_credentials c ON c.user_id=u.id WHERE u.id=? AND u.disabled=0 AND c.password_hash=?').get(userId,stored.password_hash))throw new ApiError('UNAUTHENTICATED','凭据已变更，请重新登录',401);
        headers.set('Set-Cookie',cookie(issueSession(db,userId),options));
      });
    }
    return Response.json({data:{ok:true,...(recovery?{recovery_code:recovery}:{})},meta},{headers});
  } catch(error) {
    const e=error instanceof ApiError?error:new ApiError('INTERNAL_ERROR','服务暂时不可用，请稍后重试',500);
    return Response.json({error:{code:e.code,message:e.message},meta},{status:e.status,headers});
  }
}
