import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker, { type Env } from '../apps/api/src/index';
export function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync('db/migrations').filter(n=>n.endsWith('.sql')).sort()) sqlite.exec(readFileSync(`db/migrations/${name}`,'utf8'));
  const db = {
    prepare(sql:string) {
      let values: unknown[]=[];
      return {
        bind(...args:unknown[]){values=args;return this;},
        async first(){return sqlite.prepare(sql).get(...values as [])??null;},
        async all(){return {results:sqlite.prepare(sql).all(...values as [])};},
        execute(){return sqlite.prepare(sql).run(...values as []);}
      };
    },
    async batch(statements: {execute:()=>unknown}[]) {
      sqlite.exec('BEGIN');
      try { const results=statements.map(s=>s.execute());sqlite.exec('COMMIT');return results; }
      catch(error){sqlite.exec('ROLLBACK');throw error;}
    }
  };
  const env:Env={DB:db as unknown as D1Database,ALLOWED_ORIGIN:'https://site.test',APPWRITE_ENDPOINT:'https://issuer.test/v1',APPWRITE_PROJECT_ID:'test-project'};
  const call=(path:string,method='GET',token='valid',body?:unknown,key?:string)=>worker.fetch(new Request(`https://api.test/api/v1${path}`,{
    method,headers:{Origin:env.ALLOWED_ORIGIN,Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined
  }),env);
  return {sqlite,call};
}

