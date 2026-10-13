import { ApiError, type User } from '@night-city/contracts';
import { username } from '../input';

export interface EmailAuthEnv {
  DB: D1Database;
  APPWRITE_ENDPOINT?: string;
  APPWRITE_PROJECT_ID?: string;
}

/** Verify each bearer token with the issuer, including session revocation and email ownership. */
export async function verifiedEmailSubject(request: Request, env: EmailAuthEnv): Promise<string> {
  const bearer = request.headers.get('Authorization');
  if (!bearer?.startsWith('Bearer ') || bearer.length > 8192) throw new ApiError('UNAUTHENTICATED', '请先用邮箱登录', 401);
  if (!env.APPWRITE_ENDPOINT || !env.APPWRITE_PROJECT_ID) throw new ApiError('FEATURE_NOT_READY', '邮箱登录尚未配置', 503);
  let response: Response;
  try {
    response = await fetch(`${env.APPWRITE_ENDPOINT}/account`, {
      headers: { 'X-Appwrite-Project': env.APPWRITE_PROJECT_ID, 'X-Appwrite-JWT': bearer.slice(7) },
      signal: AbortSignal.timeout(10000)
    });
  } catch { throw new ApiError('NETWORK_ERROR', '登录服务暂时无法连接，请稍后重试', 503); }
  if (response.status === 401 || response.status === 403) throw new ApiError('UNAUTHENTICATED', '登录已失效，请重新登录', 401);
  if (!response.ok) throw new ApiError('NETWORK_ERROR', '登录服务繁忙，请稍后重试', 503);
  const account = await response.json() as { $id?: string; status?: boolean; emailVerification?: boolean };
  if (!account.$id || !account.status || !account.emailVerification) throw new ApiError('UNAUTHENTICATED', '请完成邮箱验证码验证', 401);
  return `appwrite:${account.$id}`;
}

export async function emailUser(request: Request, env: EmailAuthEnv): Promise<User> {
  const subject = await verifiedEmailSubject(request, env);
  const user = await env.DB.prepare('SELECT id, display_name, role FROM users WHERE provider_subject=?').bind(subject).first<User>();
  if (!user) throw new ApiError('UNAUTHENTICATED', '请先完成本站注册确认', 401);
  return user;
}

export async function registerEmailUser(request: Request, env: EmailAuthEnv): Promise<User> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new ApiError('INVALID_INPUT', '请求格式不正确');
  if (Number(request.headers.get('Content-Length') || 0) > 2048) throw new ApiError('INVALID_INPUT', '请求过大');
  let body: { consent?: boolean; display_name?: string };
  try { const text = await request.text(); if (text.length > 2048) throw new Error(); body = JSON.parse(text); }
  catch { throw new ApiError('INVALID_INPUT', '请求格式不正确'); }
  if (body?.consent !== true) throw new ApiError('INVALID_INPUT', '请确认年满 18 岁及虚拟积分说明');
  const subject = await verifiedEmailSubject(request, env);
  const existing=await env.DB.prepare('SELECT id,display_name,role FROM users WHERE provider_subject=?').bind(subject).first<User>();
  if(existing)return existing;
  const name=username(body.display_name);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try { await env.DB.batch([
    env.DB.prepare("INSERT INTO users(id,display_name,provider_subject,role,created_at,username_key) VALUES(?,?,?,'user',?,?) ON CONFLICT(provider_subject) DO NOTHING").bind(id, name, subject, now,name.toLowerCase()),
    env.DB.prepare('INSERT INTO wallets(user_id,balance,version) SELECT id,0,0 FROM users WHERE provider_subject=? ON CONFLICT(user_id) DO NOTHING').bind(subject),
    env.DB.prepare("INSERT INTO user_consents(user_id,version,accepted_at) SELECT id,'2026-10-14',? FROM users WHERE provider_subject=? ON CONFLICT(user_id) DO NOTHING").bind(now, subject)
  ]); } catch(e){if(String(e).includes('UNIQUE'))throw new ApiError('INVALID_INPUT','用户名已被使用，请换一个',409);throw e;}
  return (await env.DB.prepare('SELECT id,display_name,role FROM users WHERE provider_subject=?').bind(subject).first<User>())!;
}
