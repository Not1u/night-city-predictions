import { createServer, type IncomingMessage } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import api from '../api/src/index';
import { d1Adapter } from './database';
import { passwordRoute, limit, type AuthOptions } from './auth';
import { ApiError } from '@night-city/contracts';

const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.woff2':'font/woff2','.mp4':'video/mp4','.ico':'image/x-icon'};
export type ServerOptions=AuthOptions & {webRoot:string;trustProxy?:boolean};
const failure=(status:number,message:string)=>Response.json({error:{code:status===429?'RATE_LIMITED':'INVALID_INPUT',message},meta:{server_time:new Date().toISOString(),request_id:crypto.randomUUID(),api_version:'v1'}},{status});
export function createApp(db:DatabaseSync,options:ServerOptions) {
  const adapter=d1Adapter(db), root=resolve(options.webRoot);
  const security=(response:Response)=>{
    response.headers.set('X-Content-Type-Options','nosniff');
    response.headers.set('X-Frame-Options','DENY');
    response.headers.set('Referrer-Policy','strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    response.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self' https://cdn-l-cyberpunk.cdprojektred.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if(options.secure)response.headers.set('Strict-Transport-Security','max-age=31536000');
    return response;
  };
  return async(request:Request,ip='local'):Promise<Response>=>{
    try {
      const path=new URL(request.url).pathname;
      if(path.startsWith('/api/')) {
        limit(db,`api:${ip}`,300,60000);
        const auth=await passwordRoute(request,db,options,ip);
        const result=auth??await api.fetch(request,{DB:adapter,ALLOWED_ORIGIN:options.origin,PASSWORD_AUTH:true,SESSION_COOKIE:options.cookieName});
        result.headers.set('Cache-Control','no-store');return security(result);
      }
      if(request.method!=='GET'&&request.method!=='HEAD')return security(failure(405,'请求方法不支持'));
      let decoded:string;try{decoded=decodeURIComponent(path);}catch{return security(failure(400,'地址无效'));}
      if(decoded.includes('\\')||decoded.split('/').some(p=>p.startsWith('.'))||decoded.includes('\0'))return security(failure(404,'页面不存在'));
      const file=resolve(root,'.'+(decoded==='/'?'/index.html':decoded));
      if(!file.startsWith(root+sep))return security(failure(404,'页面不存在'));
      const type=types[extname(file).toLowerCase()];
      if(!type)return security(failure(404,'页面不存在'));
      try {
        if(!(await stat(file)).isFile())return security(failure(404,'页面不存在'));
        const bytes=await readFile(file);
        return security(new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':type,'Cache-Control':extname(file)==='.html'?'no-cache':'public, max-age=3600'}}));
      }catch{return security(failure(404,'页面不存在'));}
    }catch(e){return security(failure(e instanceof ApiError?e.status:500,e instanceof ApiError?e.message:'服务暂时不可用'));}
  };
}
async function body(request:IncomingMessage) {
  const chunks:Buffer[]=[];let size=0;
  if(Number(request.headers['content-length']??0)>8192)throw new ApiError('INVALID_INPUT','请求过大',413);
  for await(const part of request){size+=part.length;if(size>8192)throw new ApiError('INVALID_INPUT','请求过大',413);chunks.push(part);}
  return Buffer.concat(chunks);
}
export function httpServer(db:DatabaseSync,options:ServerOptions) {
  const app=createApp(db,options);
  const server=createServer(async(req,res)=>{
    try {
      // Host and scheme are configured, never taken from arbitrary request headers.
      if(!req.url?.startsWith('/')||req.url.startsWith('//')){res.writeHead(400);res.end();return;}
      const bytes=await body(req), headers=new Headers();
      for(const [key,value] of Object.entries(req.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);
      const request=new Request(new URL(req.url,options.origin),{method:req.method,headers,...(req.method!=='GET'&&req.method!=='HEAD'?{body:bytes}: {})});
      // Only enable behind the supplied loopback Caddy proxy, which OVERWRITES this header.
      const forwarded=req.headers['x-real-ip'];
      const ip=options.trustProxy&&typeof forwarded==='string'?forwarded:req.socket.remoteAddress??'unknown';
      const response=await app(request,ip);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    }catch(e){res.writeHead(e instanceof ApiError?e.status:500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:{code:'INVALID_INPUT',message:e instanceof ApiError?e.message:'服务暂时不可用'},meta:{server_time:new Date().toISOString()}}));}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxHeadersCount=50;
  return server;
}
