import { ApiError } from '@night-city/contracts';
export async function jsonBody(request: Request): Promise<Record<string,unknown>> {
  if(!request.headers.get('Content-Type')?.startsWith('application/json')) throw new ApiError('INVALID_INPUT','请求格式不正确');
  const text=await request.text();
  try { if(text.length>4096) throw new Error(); const value=JSON.parse(text); if(!value||Array.isArray(value)||typeof value!=='object')throw new Error();return value; }
  catch {throw new ApiError('INVALID_INPUT','请求内容不正确或过长');}
}
export function username(value:unknown):string {
  if(typeof value!=='string')throw new ApiError('INVALID_INPUT','请先设置用户名');
  const name=value.normalize('NFKC').trim();
  if(!/^[\p{L}\p{N}_ -]{2,20}$/u.test(name) || /管理员|官方|系统|admin|moderator|system/i.test(name))throw new ApiError('INVALID_INPUT','用户名需为 2–20 位文字、数字、空格、下划线或短横线，不可冒充官方');
  return name;
}
export function databaseError(error:unknown):never {
  const message=String(error);
  if(message.includes('INSUFFICIENT_BALANCE'))throw new ApiError('INSUFFICIENT_BALANCE','积分不足，先签到再来',409);
  if(message.includes('ROUND_CLOSED'))throw new ApiError('ROUND_CLOSED','本轮尚未开放或已经封盘',409);
  if(message.includes('CHARACTER_INELIGIBLE'))throw new ApiError('CHARACTER_INELIGIBLE','该角色不能参与本轮预测',409);
  if(message.includes('RATE_LIMITED'))throw new ApiError('RATE_LIMITED','操作太快：留言间隔 10 秒，游戏间隔 3 秒',429);
  throw error;
}
