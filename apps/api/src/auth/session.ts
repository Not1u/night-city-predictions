import { ApiError, type User } from '@night-city/contracts';
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
/** No development backdoor, no trusting client-supplied role or user headers. */
export async function requireUser(request: Request, db: D1Database, now = new Date(), cookieName = '__Host-nc_session', passwordAccounts = false): Promise<User> {
  const cookie = request.headers.get('Cookie') ?? '';
  const token = cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.split('=')[1];
  if (!token || !/^[A-Za-z0-9_-]{43,128}$/.test(token)) throw new ApiError('UNAUTHENTICATED', '请先登录', 401);
  const user = await db.prepare(`SELECT u.id, u.display_name, u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL`).bind(await hashToken(token), now.toISOString()).first<User>();
  if (!user) throw new ApiError('UNAUTHENTICATED', '登录已失效，请重新登录', 401);
  if (passwordAccounts && !await db.prepare('SELECT id FROM users WHERE id=? AND disabled=0').bind(user.id).first()) throw new ApiError('UNAUTHENTICATED', '账户暂不可用', 401);
  return user;
}
export function requireAdmin(user: User): void {
  if (user.role !== 'admin') throw new ApiError('FORBIDDEN', '需要管理员权限', 403);
}
