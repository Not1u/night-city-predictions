import { ApiError, type User, assertPoints } from '@night-city/contracts';
import { jsonBody, databaseError } from './input';

export const redNumbers=[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
/** Rejection sampling avoids modulo bias. Only the server calls this to choose outcomes. */
export function randomInt(max:number):number {const limit=Math.floor(4294967296/max)*max;let n:number;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=limit);return n%max;}
export function slotSymbol(stop:number):string{return ['skull','coin','chip','eye'][Math.floor(stop/10)]??'blank';}
export function slotMultiplier(symbols:string[]):number {
  const counts=new Map<string,number>();for(const s of symbols)counts.set(s,(counts.get(s)||0)+1);
  if(counts.get(symbols[0])===3)return ({skull:51,coin:21,chip:11,eye:6} as Record<string,number>)[symbols[0]]??0;
  return [...counts].some(([s,n])=>s!=='blank'&&n===2)?2:0;
}
export function rouletteMultiplier(n:number,choice:string,number?:number):number {
  if(choice==='number')return n===number?36:0;
  if(n===0)return 0;
  if(choice==='red')return redNumbers.includes(n)?2:0;
  if(choice==='black')return redNumbers.includes(n)?0:2;
  if(choice==='odd')return n%2===1?2:0;
  if(choice==='even')return n%2===0?2:0;
  if(choice==='low')return n<=18?2:0;
  if(choice==='high')return n>=19?2:0;
  return 0;
}
export async function idempotency(request:Request,db:D1Database,user:User,payload:unknown) {
  const key=request.headers.get('Idempotency-Key'),path=new URL(request.url).pathname,fingerprint=JSON.stringify(payload);
  if(!key||!/^[A-Za-z0-9_-]{8,128}$/.test(key))throw new ApiError('IDEMPOTENCY_REQUIRED','缺少有效的请求标识');
  const replay=async()=>{
    const row=await db.prepare('SELECT method,path,request_hash,response_json FROM idempotency_keys WHERE user_id=? AND key=?').bind(user.id,key).first<{method:string;path:string;request_hash:string;response_json:string}>();
    if(!row)return null;
    if(row.method!==request.method||row.path!==path||row.request_hash!==fingerprint)throw new ApiError('IDEMPOTENCY_CONFLICT','重试内容与原请求不一致，请重新打开操作',409);
    return JSON.parse(row.response_json);
  };
  const save=(jsonSql:string,bindings:unknown[])=>db.prepare(`INSERT INTO idempotency_keys(user_id,key,method,path,request_hash,response_json,status_code,created_at) SELECT ?,?,?,?,?,${jsonSql},200,? FROM wallets WHERE user_id=?`).bind(user.id,key,request.method,path,fingerprint,...bindings,new Date().toISOString(),user.id);
  return {replay,save};
}
export async function predict(request:Request,db:D1Database,user:User,round:string){
  const body=await jsonBody(request);assertPoints(body.amount);
  if(body.amount>10000||typeof body.character_id!=='string')throw new ApiError('INVALID_INPUT','每笔测试预测为 1–10000 整数积分');
  const payload={round,character_id:body.character_id,amount:body.amount};const idem=await idempotency(request,db,user,payload);
  const old=await idem.replay();if(old)return old;
  if(!await db.prepare('SELECT 1 FROM round_characters WHERE round_id=? AND character_id=?').bind(round,body.character_id).first())throw new ApiError('CHARACTER_INELIGIBLE','角色不在本轮名单');
  const id=crypto.randomUUID(),now=new Date().toISOString();
  try{await db.batch([
    db.prepare('INSERT INTO predictions(id,round_id,character_id,user_id,amount,created_at) VALUES(?,?,?,?,?,?)').bind(id,round,body.character_id,user.id,body.amount,now),
    idem.save("json_object('id',?,'balance',balance)",[id])
  ]);}catch(e){const replay=await idem.replay();if(replay)return replay;databaseError(e);}
  return idem.replay();
}
export async function refundTest(request:Request,db:D1Database,user:User,id:string){
  const row=await db.prepare('SELECT p.id,r.is_test FROM predictions p JOIN rounds r ON r.id=p.round_id WHERE p.id=? AND p.user_id=?').bind(id,user.id).first<{is_test:number}>();
  if(!row)throw new ApiError('NOT_FOUND','订单不存在',404);
  if(!row.is_test)throw new ApiError('FORBIDDEN','仅测试场订单可退回',403);
  await db.batch([db.prepare('UPDATE predictions SET cancelled_at=? WHERE id=? AND user_id=? AND cancelled_at IS NULL').bind(new Date().toISOString(),id,user.id)]);
  return {refunded:true};
}
export async function play(request:Request,db:D1Database,user:User,game:string){
  const body=await jsonBody(request);assertPoints(body.stake);
  if(body.stake>50)throw new ApiError('INVALID_INPUT','小游戏每局投入 1–50 整数积分');
  if(game!=='roulette'&&game!=='slots')throw new ApiError('NOT_FOUND','游戏不存在',404);
  const choice=String(body.choice??'red'),number=body.number;
  if(game==='roulette'&&(!['red','black','odd','even','low','high','number'].includes(choice)||(choice==='number'&&(!Number.isInteger(number)||Number(number)<0||Number(number)>36))))throw new ApiError('INVALID_INPUT','请选择有效的轮盘区域或 0–36 单号');
  const payload={game,stake:body.stake,...(game==='roulette'?{choice,number:choice==='number'?number:null}:{})};
  const idem=await idempotency(request,db,user,payload);const old=await idem.replay();if(old)return old;
  const result=game==='roulette'?{number:randomInt(37),choice,selected_number:choice==='number'?number:null}:{symbols:Array.from({length:3},()=>slotSymbol(randomInt(61)))};
  const multiplier=game==='roulette'?rouletteMultiplier(result.number!,choice,Number(number)):slotMultiplier(result.symbols!);
  const id=crypto.randomUUID(),now=new Date().toISOString(),payout=body.stake*multiplier;
  const receipt={id,game,stake:body.stake,payout,multiplier,result,created_at:now};
  try{await db.batch([
    db.prepare('INSERT INTO game_plays(id,user_id,game,stake,payout,result_json,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,user.id,game,body.stake,payout,JSON.stringify(result),now),
    idem.save("json_set(json(?),'$.balance',balance)",[JSON.stringify(receipt)])
  ]);}catch(e){const replay=await idem.replay();if(replay)return replay;databaseError(e);}
  return idem.replay();
}
