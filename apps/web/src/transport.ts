import { ApiError } from '@night-city/contracts';

export const apiBase = (import.meta.env?.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

/** One deadline covers both headers and body, including older mobile browsers. Never replay writes. */
export async function requestJson<T>(url: string, init: RequestInit = {}, timeoutMs = 30000): Promise<{response:Response;json:T}> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(url, {...init, signal:controller.signal});
    const body = await response.text();
    try { return {response, json:JSON.parse(body) as T}; }
    catch { throw new ApiError('NETWORK_ERROR', `账户接口返回了无法识别的内容（HTTP ${response.status}），请稍后重试。`, response.status); }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('NETWORK_ERROR', timedOut
      ? '连接账户服务超时。网页与账户服务使用不同连接，网页能打开不代表账户接口可达。'
      : '无法连接账户服务。可能是网络、域名解析或浏览器拦截，请使用下方“检测连接”确认。');
  } finally { clearTimeout(timer); }
}

export async function checkConnection():Promise<string> {
  const started = Date.now();
  const {response,json} = await requestJson<{data?:{status?:string}}>(`${apiBase}/api/v1/health`, {credentials:'omit',cache:'no-store'}, 12000);
  if (!response.ok || json.data?.status !== 'ok') throw new ApiError('NETWORK_ERROR','账户服务暂时不可用，请稍后再试。');
  return `账户服务可达（${((Date.now()-started)/1000).toFixed(1)} 秒）。如果刚才注册超时，请先用原用户名和密码登录，避免重复注册。`;
}
