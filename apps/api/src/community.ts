import { ApiError, type User } from '@night-city/contracts';
import { jsonBody, username, databaseError } from './input';
import { idempotency } from './play';
export async function updateProfile(request:Request,db:D1Database,user:User){
  const name=username((await jsonBody(request)).display_name);
  try {await db.batch([db.prepare('UPDATE users SET display_name=?,username_key=? WHERE id=?').bind(name,name.toLowerCase(),user.id)]);}
  catch(e){if(String(e).includes('UNIQUE'))throw new ApiError('INVALID_INPUT','这个用户名已经有人使用，换一个试试',409);throw e;}
  return {...user,display_name:name};
}
export async function comments(db:D1Database,character:string){
  if(!await db.prepare('SELECT id FROM characters WHERE id=?').bind(character).first())throw new ApiError('NOT_FOUND','频道不存在',404);
  const rows=await db.prepare("SELECT c.id,c.character_id,c.body,c.created_at,c.status,u.id AS author_id,u.display_name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.character_id=? AND c.status='visible' ORDER BY c.created_at DESC,c.id DESC LIMIT 100").bind(character).all<{id:string;character_id:string;body:string;created_at:string;status:string;author_id:string;display_name:string}>();
  return {items:rows.results.map(({author_id,display_name,...c})=>({...c,author:{id:author_id,display_name}})),next_cursor:null};
}
export async function postComment(request:Request,db:D1Database,user:User,character:string){
  const value=(await jsonBody(request)).body;
  if(typeof value!=='string'||!value.trim()||value.trim().length>500)throw new ApiError('INVALID_INPUT','留言应为 1–500 个字符');
  if(!await db.prepare('SELECT 1 FROM characters WHERE id=?').bind(character).first())throw new ApiError('NOT_FOUND','频道不存在',404);
  const body=value.trim(),idem=await idempotency(request,db,user,{character,body});const old=await idem.replay();if(old)return old;
  const id=crypto.randomUUID();
  try {await db.batch([
    db.prepare("INSERT INTO comments(id,character_id,user_id,body,created_at) VALUES(?,?,?,?,?)").bind(id,character,user.id,body,new Date().toISOString()),
    idem.save("json_object('id',?)",[id])
  ]);}catch(e){const replay=await idem.replay();if(replay)return replay;databaseError(e);}
  return {id};
}
export async function removeComment(db:D1Database,user:User,id:string){
  const row=await db.prepare('SELECT user_id FROM comments WHERE id=?').bind(id).first<{user_id:string}>();
  if(!row)throw new ApiError('NOT_FOUND','留言不存在',404);
  if(row.user_id!==user.id)throw new ApiError('FORBIDDEN','只能撤下自己的留言',403);
  await db.batch([db.prepare("UPDATE comments SET status='hidden' WHERE id=? AND user_id=?").bind(id,user.id)]);
  return {hidden:true};
}
export async function reportComment(request:Request,db:D1Database,user:User,id:string){
  const body=await jsonBody(request),reason=String(body.reason??'other');
  if(!['spoiler','abuse','spam','other'].includes(reason))throw new ApiError('INVALID_INPUT','举报原因无效');
  const comment=await db.prepare("SELECT user_id FROM comments WHERE id=? AND status='visible'").bind(id).first<{user_id:string}>();
  if(!comment)throw new ApiError('NOT_FOUND','留言已被撤下或不存在',404);
  if(comment.user_id===user.id)throw new ApiError('INVALID_INPUT','可以直接撤下自己的留言');
  await db.batch([db.prepare('INSERT INTO comment_reports(id,comment_id,reporter_id,reason,created_at) VALUES(?,?,?,?,?) ON CONFLICT(comment_id,reporter_id) DO NOTHING').bind(crypto.randomUUID(),id,user.id,reason,new Date().toISOString())]);
  return {reported:true};
}
