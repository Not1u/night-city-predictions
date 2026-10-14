import { Account, Client, ID, AppwriteException } from 'appwrite';
import { ApiError } from '@night-city/contracts';

const endpoint = import.meta.env?.VITE_APPWRITE_ENDPOINT;
const project = import.meta.env?.VITE_APPWRITE_PROJECT_ID;
export const passwordAuth = import.meta.env?.VITE_AUTH_MODE === 'password';
export const authPaused = import.meta.env?.VITE_AUTH_MODE === 'paused';
export const localDemo = typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1';
export const emailAuthReady = !passwordAuth && !authPaused && !localDemo && !!endpoint && !!project;
const account = emailAuthReady ? new Account(new Client().setEndpoint(endpoint).setProject(project)) : null;
let jwt: { token: string; expires: number } | null = null;

function configured() {
  if (!account) throw new ApiError('FEATURE_NOT_READY','邮箱登录正在接线，请稍后再来');
  return account;
}
function translate(error: unknown): never {
  if (error instanceof AppwriteException) {
    if (error.code === 429) throw new ApiError('RATE_LIMITED','验证码发送过于频繁，请稍后重试');
    if (error.type === 'user_invalid_token') throw new ApiError('INVALID_INPUT','验证码不正确或已过期，请重试或重新发送');
    if (error.code === 401) throw new ApiError('UNAUTHENTICATED','登录已失效，请重新验证邮箱',401);
    if (error.code === 0 || error.code >= 500) throw new ApiError('NETWORK_ERROR','邮箱服务暂时连接不上，请稍后重试');
  }
  throw error instanceof ApiError ? error : new ApiError('INVALID_INPUT','验证未完成，请检查邮箱和验证码后重试');
}
export async function sendEmailCode(email: string) {
  try {
    const result = await configured().createEmailToken({userId:ID.unique(),email,phrase:true});
    return {userId:result.userId,phrase:result.phrase};
  } catch(error) { return translate(error); }
}
export async function verifyEmailCode(userId: string, secret: string) {
  try { await configured().createSession({userId,secret}); jwt=null; }
  catch(error) { translate(error); }
}
export async function authToken(): Promise<string|null> {
  if (!account) return null;
  if (jwt && jwt.expires > Date.now()) return jwt.token;
  try {
    const result = await account.createJWT({duration:900});
    jwt={token:result.jwt,expires:Date.now()+10*60*1000};
    return jwt.token;
  } catch(error) {
    if (error instanceof AppwriteException && error.code===401) {jwt=null;return null;}
    return translate(error);
  }
}
export async function signOut() {
  try { await configured().deleteSession({sessionId:'current'}); }
  catch(error) { if (!(error instanceof AppwriteException && error.code===401)) translate(error); }
  finally { jwt=null; }
}
