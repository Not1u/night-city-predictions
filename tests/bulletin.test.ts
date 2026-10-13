import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers';
import { wheelTarget, reelTarget } from '../apps/web/src/machine-motion';
import { wheelOrder, reelFaces } from '../apps/web/src/symbols';
import news from '../apps/web/src/content/announcements.json';

test('all legacy comment URLs are closed, including reads, posts and reports',async t=>{
  const {call,sqlite}=fixture();t.after(()=>sqlite.close());
  for(const path of ['/characters/city-board/comments','/characters/weak/comments','/comments/old','/comments/old/reports'])
    for(const method of ['GET','POST','DELETE'])assert.equal((await call(path,method,'invalid',method==='GET'?undefined:{body:'不应保存'})).status,410);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get()!.n,0);
});
test('arcade ranking subtracts all losses, excludes old plays and reveals no account identifiers',async t=>{
  const {call,sqlite}=fixture();t.after(()=>sqlite.close());
  sqlite.exec("INSERT INTO users(id,display_name,created_at) VALUES('u','榜单居民','now'),('v','另一居民','now'); INSERT INTO wallets(user_id,balance) VALUES('u',500),('v',500);");
  const insert=sqlite.prepare('INSERT INTO game_plays VALUES(?,?,?,?,?,?,?)');
  const past=new Date(Date.now()-100000).toISOString();
  insert.run('p1','u','slots',10,50,'{}',past);insert.run('p2','u','slots',20,0,'{}',past);
  insert.run('p3','v','slots',10,0,'{}',past);insert.run('p4','v','slots',10,500,'{}','2000-01-01T00:00:00.000Z');
  const data=(await (await call('/leaderboard?kind=arcade')).json() as any).data;
  assert.equal(data.items.length,1);assert.deepEqual(data.items[0],{rank:1,display_name:'榜单居民',net_points:20,wins:1});
  assert.equal((await call('/leaderboard?kind=invalid')).status,400);
});
test('lottery board stays empty for sandbox and incomplete rounds; only settled net winners appear',async t=>{
  const {call,sqlite}=fixture();t.after(()=>sqlite.close());
  sqlite.exec("INSERT INTO users(id,display_name,created_at) VALUES('u','正式赢家','now');INSERT INTO wallets(user_id,balance) VALUES('u',500);UPDATE rounds SET status='open',opens_at='2000-01-01T00:00:00.000Z',closes_at='2099-01-01T00:00:00.000Z' WHERE id='episode-01';");
  const insert=sqlite.prepare('INSERT INTO predictions(id,round_id,character_id,user_id,amount,created_at) VALUES(?,?,?,?,?,?)');
  insert.run('p','episode-01','weak','u',10,'now');insert.run('loss','episode-01','d','u',5,'now');insert.run('test','beta-sandbox','weak','u',1,'now');
  assert.equal((await (await call('/leaderboard')).json() as any).data.items.length,0);
  sqlite.exec("INSERT INTO round_snapshots VALUES('episode-01',30,'{}','now');INSERT INTO settlements VALUES('episode-01','settled',30,10,30,'u','now');INSERT INTO payouts VALUES('p','episode-01',30);UPDATE rounds SET status='settled' WHERE id='episode-01';");
  const data=(await (await call('/leaderboard')).json() as any).data;assert.equal(data.items[0].net_points,15);assert.equal(data.items[0].wins,1);
});
test('3D wheel pockets and reels land on every server outcome, including repeats',()=>{
  assert.equal(new Set(wheelOrder).size,37);let angle=0;
  for(const n of wheelOrder){const next=wheelTarget(n,angle);assert.ok(next>angle+720);assert.ok(Math.abs((next+wheelOrder.indexOf(n)*360/37)%360)<1e-8);angle=next;}
  for(const symbol of ['skull','coin','chip','eye','blank']){const next=reelTarget(symbol,-1485);assert.ok(next<-1485-720);assert.ok(Math.abs((next+reelFaces.indexOf(symbol)*45)%360)<1e-8);}
});
test('announcements use official HTTPS sources and explicit dates without assumed airtime',()=>{
  for(const url of [...news.items.map(i=>i.url),news.schedule.sourceUrl]){const parsed=new URL(url);assert.equal(parsed.protocol,'https:');assert.ok(['www.cdprojekt.com','www.cyberpunk.net'].includes(parsed.hostname));}
  assert.match(news.lastReviewed,/^\d{4}-\d{2}-\d{2}$/);assert.match(news.schedule.date,/^\d{4}-\d{2}-\d{2}$/);
});
