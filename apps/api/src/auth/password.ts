import { ApiError } from '@night-city/contracts';
import { jsonBody, username } from '../input';
import { requireUser } from './session';
import { digest, passwordHash, passwordMatches, secret, secretMatches, validatePassword } from '../../../server/passwords';

type Env={DB:D1Database;ALLOWED_ORIGIN:string};
type Credential={id:string;disabled:number;password_hash:string;recovery_hash:string};
const DUMMY=`scrypt-v1$${'0'.repeat(32)}$${'0'.repeat(64)}`;
async function limit(db:D1Database,key:string,max:number,window=15*60000){
 const now=Date.now();const row=await db.prepare('INSERT INTO auth_limits(bucket,count,expires) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING count').bind(digest(key),now+window,now,now).first<{count:number}>();
 if(!row||row.count>max)throw new ApiError('RATE_LIMITED','操作过于频繁，请稍后重试',429);
}
const find=(db:D1Database,name:string)=>db.prepare('SELECT u.id,u.disabled,c.password_hash,c.recovery_hash FROM users u JOIN password_credentials c ON u.id=c.user_id WHERE u.username_key=?').bind(name.toLowerCase()).first<Credential>();
function session(db:D1Database,id:string,token:string,hash:string,now:string){return db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) SELECT ?,u.id,?,? FROM users u JOIN password_credentials c ON u.id=c.user_id WHERE u.id=? AND u.disabled=0 AND c.password_hash=?').bind(digest(token),new Date(Date.now()+12*3600000).toISOString(),now,id,hash);}
/** Username accounts on D1. Opaque, revocable 12-hour bearer sessions avoid third-party cookies. */
export async function workerPassword(request:Request,env:Env):Promise<unknown>{
 const db=env.DB,path=new URL(request.url).pathname,now=new Date().toISOString();
 if(request.method!=='POST')throw new ApiError('INVALID_INPUT','请使用 POST',405);
 if(request.headers.get('Origin')!==env.ALLOWED_ORIGIN)throw new ApiError('FORBIDDEN','请求来源不被允许',403);
 const ip=request.headers.get('CF-Connecting-IP')??'local';await limit(db,'password-ip:'+ip,40);
 if(path.endsWith('/logout')){const token=request.headers.get('Authorization')?.slice(7)??'';await db.batch([db.prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=?').bind(now,digest(token))]);return {ok:true};}
 // Origin is checked above even for simple CORS requests; no third-party cookies are accepted.
 const body=await jsonBody(request,true),pass=validatePassword(body.password);
 let id:string,hash:string,recovery:string|undefined;const token=secret();
 if(path.endsWith('/password')){
  const user=await requireUser(request,db,new Date(),undefined,true,true);await limit(db,'password-change:'+ip+':'+user.id,6);
  const stored=await db.prepare('SELECT password_hash,recovery_hash FROM password_credentials WHERE user_id=?').bind(user.id).first<Credential>();
  if(!stored||!await passwordMatches(validatePassword(body.current_password),stored.password_hash))throw new ApiError('UNAUTHENTICATED','当前密码不正确',401);
  id=user.id;hash=await passwordHash(pass);recovery=secret();
  await db.batch([
   db.prepare('UPDATE password_credentials SET password_hash=?,recovery_hash=?,updated_at=? WHERE user_id=? AND password_hash=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND disabled=0)').bind(hash,digest(recovery),now,id,stored.password_hash,id),
   db.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND EXISTS(SELECT 1 FROM password_credentials WHERE user_id=? AND password_hash=?)').bind(now,id,id,hash),session(db,id,token,hash,now)
  ]);
 }else{
  const name=username(body.username);await limit(db,'password-account:'+ip+':'+name.toLowerCase(),10);
  if(path.endsWith('/register')){
   if(body.consent!==true)throw new ApiError('INVALID_INPUT','请确认年龄及虚拟积分说明');
   await limit(db,'password-register:'+ip,12,86400000);
   if(await db.prepare('SELECT id FROM users WHERE username_key=?').bind(name.toLowerCase()).first())throw new ApiError('INVALID_INPUT','用户名已占用，请换一个；旧邮箱账户保留，不能直接覆盖',409);
   id=crypto.randomUUID();hash=await passwordHash(pass);recovery=secret();
   try{await db.batch([
    db.prepare("INSERT INTO users(id,display_name,username_key,provider_subject,role,created_at) VALUES(?,?,?,?,'user',?)").bind(id,name,name.toLowerCase(),'password:'+id,now),
    db.prepare('INSERT INTO wallets VALUES(?,0,0)').bind(id),
    db.prepare("INSERT INTO user_consents VALUES(?,'2026-10-14',?)").bind(id,now),
    db.prepare('INSERT INTO password_credentials VALUES(?,?,?,?)').bind(id,hash,digest(recovery),now),session(db,id,token,hash,now)
   ]);}catch(e){if(String(e).includes('UNIQUE'))throw new ApiError('INVALID_INPUT','用户名已占用，请换一个',409);throw e;}
  }else if(path.endsWith('/recover')){
   const stored=await find(db,name),code=body.recovery_code;
   if(!stored||stored.disabled||typeof code!=='string'||code.length!==43||!secretMatches(code,stored.recovery_hash))throw new ApiError('UNAUTHENTICATED','用户名或恢复码不正确',401);
   id=stored.id;hash=await passwordHash(pass);recovery=secret();
   await db.batch([
    db.prepare('UPDATE password_credentials SET password_hash=?,recovery_hash=?,updated_at=? WHERE user_id=? AND recovery_hash=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND disabled=0)').bind(hash,digest(recovery),now,id,stored.recovery_hash,id),
    db.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND EXISTS(SELECT 1 FROM password_credentials WHERE user_id=? AND password_hash=?)').bind(now,id,id,hash),session(db,id,token,hash,now)
   ]);
  }else if(path.endsWith('/login')){
   const stored=await find(db,name),valid=await passwordMatches(pass,stored?.password_hash??DUMMY);
   if(!stored||stored.disabled||!valid)throw new ApiError('UNAUTHENTICATED','用户名或密码不正确',401);
   id=stored.id;hash=stored.password_hash;await db.batch([session(db,id,token,hash,now)]);
  }else throw new ApiError('FEATURE_NOT_READY','旧邮箱账户请联系站长核实归属后迁移；可先换个用户名参加联机测试',503);
 }
 if(!await db.prepare('SELECT token_hash FROM sessions WHERE token_hash=? AND revoked_at IS NULL').bind(digest(token)).first())throw new ApiError('UNAUTHENTICATED','凭据已变化，请重新登录',401);
 await db.batch([db.prepare('DELETE FROM auth_limits WHERE expires<?').bind(Date.now()-86400000),db.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND token_hash NOT IN(SELECT token_hash FROM sessions WHERE user_id=? AND revoked_at IS NULL ORDER BY (token_hash=?) DESC,created_at DESC,token_hash DESC LIMIT 5)').bind(now,id,id,digest(token))]);
 return {ok:true,session_token:token,...(recovery?{recovery_code:recovery}:{})};
}
