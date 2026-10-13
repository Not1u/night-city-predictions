import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function migrate(sqlite:DatabaseSync, directory=resolve('db/migrations')) {
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)');
  for(const name of readdirSync(directory).filter(n=>n.endsWith('.sql')).sort()) {
    if(sqlite.prepare('SELECT name FROM local_migrations WHERE name=?').get(name))continue;
    sqlite.exec('BEGIN');
    try{sqlite.exec(readFileSync(resolve(directory,name),'utf8'));sqlite.prepare('INSERT INTO local_migrations VALUES(?)').run(name);sqlite.exec('COMMIT');}
    catch(e){sqlite.exec('ROLLBACK');throw e;}
  }
}
/** The existing API uses only prepare/first/all/batch. Transactions stay on one connection. */
export function d1Adapter(sqlite:DatabaseSync):D1Database {
  return {
    prepare(sql:string){let values:unknown[]=[];return {
      bind(...args:unknown[]){values=args;return this;},
      async first(column?:string){const row=sqlite.prepare(sql).get(...values as []);return column?row?.[column]??null:row??null;},
      async all(){return {results:sqlite.prepare(sql).all(...values as [])};},
      execute(){return sqlite.prepare(sql).run(...values as []);}
    };},
    async batch(statements:{execute:()=>unknown}[]){sqlite.exec('BEGIN');try{const rows=statements.map(s=>s.execute());sqlite.exec('COMMIT');return rows;}catch(e){sqlite.exec('ROLLBACK');throw e;}}
  } as unknown as D1Database;
}
