import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { migrate } from './database';
import { httpServer } from './app';

const origin=process.env.PUBLIC_ORIGIN;
if(!origin)throw new Error('PUBLIC_ORIGIN is required');
const url=new URL(origin);
const local=['localhost','127.0.0.1'].includes(url.hostname);
if(url.origin!==origin||(!local&&url.protocol!=='https:'))throw new Error('PUBLIC_ORIGIN must be an HTTPS origin (HTTP is allowed only for local preview)');
const secure=url.protocol==='https:';
const dbPath=resolve(process.env.DATABASE_PATH??'.data/night-city.sqlite');
mkdirSync(dirname(dbPath),{recursive:true,mode:0o700});
const db=new DatabaseSync(dbPath);migrate(db);
const server=httpServer(db,{origin,secure,cookieName:secure?'__Host-nc_session':'nc_session',webRoot:resolve('apps/web/dist'),trustProxy:process.env.TRUST_PROXY==='1'});
const port=Number(process.env.PORT??8788);
server.listen(port,'127.0.0.1',()=>console.log(`Night City server listening on 127.0.0.1:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
