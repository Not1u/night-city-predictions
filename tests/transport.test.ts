import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestJson} from '../apps/web/src/transport';

test('mobile requests work without AbortSignal.timeout and retain API errors',async()=>{
  const original=globalThis.fetch,timeout=AbortSignal.timeout;
  try{
    (AbortSignal as any).timeout=undefined;
    globalThis.fetch=async()=>Response.json({error:{message:'用户名已占用'}},{status:409});
    const {response,json}=await requestJson<any>('https://example.test');
    assert.equal(response.status,409);assert.equal(json.error.message,'用户名已占用');
  }finally{globalThis.fetch=original;AbortSignal.timeout=timeout;}
});
test('deadline also cancels a stalled body; writes are never automatically retried',async()=>{
  const original=globalThis.fetch;let calls=0;
  try{
    globalThis.fetch=async(_url,init)=>{calls++;return {text:()=>new Promise((_,reject)=>init!.signal!.addEventListener('abort',()=>reject(new Error('aborted'))))} as Response;};
    await assert.rejects(requestJson('https://example.test',{method:'POST'},10),/超时/);
    assert.equal(calls,1);
    globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
    await assert.rejects(requestJson('https://example.test'),/无法连接账户服务/);
    globalThis.fetch=async()=>new Response('<html>gateway</html>',{status:502});
    await assert.rejects(requestJson('https://example.test'),/HTTP 502/);
  }finally{globalThis.fetch=original;}
});
