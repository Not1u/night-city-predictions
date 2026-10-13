import { ApiError, type Me, type User } from '@night-city/contracts';

export async function accountInfo(db: D1Database, user: User): Promise<Me> {
  const wallet = await db.prepare('SELECT balance FROM wallets WHERE user_id=?').bind(user.id).first<{balance:number}>();
  if (!wallet) throw new ApiError('INTERNAL_ERROR', '账户尚未初始化', 500);
  const checked = await db.prepare('SELECT 1 FROM check_ins WHERE user_id=? AND utc_date=?').bind(user.id,new Date().toISOString().slice(0,10)).first();
  return { user, wallet: { balance: wallet.balance, currency: 'EUR_NC', checked_in_today: !!checked } };
}

/** A D1 batch is one transaction: the daily uniqueness constraint also protects concurrent requests. */
export async function checkIn(request: Request, db: D1Database, user: User): Promise<unknown> {
  const key = request.headers.get('Idempotency-Key');
  if (!key || !/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw new ApiError('IDEMPOTENCY_REQUIRED', '缺少有效的请求标识');
  const replay = async () => {
    const entry = await db.prepare('SELECT method,path,request_hash,response_json FROM idempotency_keys WHERE user_id=? AND key=?').bind(user.id,key).first<{method:string;path:string;request_hash:string;response_json:string}>();
    if (!entry) return null;
    if (entry.method !== 'POST' || entry.path !== '/api/v1/check-ins' || entry.request_hash !== 'check-in:v1') throw new ApiError('IDEMPOTENCY_CONFLICT','请求标识已用于其他操作',409);
    return JSON.parse(entry.response_json);
  };
  const old = await replay(); if (old) return old;
  const now = new Date().toISOString(), date = now.slice(0,10), id = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare("INSERT INTO ledger(id,user_id,kind,delta,balance_after,reference_id,created_at) SELECT ?,?,'check_in',50,balance+50,?,? FROM wallets WHERE user_id=?").bind(id,user.id,date,now,user.id),
      db.prepare('UPDATE wallets SET balance=balance+50,version=version+1 WHERE user_id=?').bind(user.id),
      db.prepare('INSERT INTO check_ins(user_id,utc_date,ledger_id) VALUES(?,?,?)').bind(user.id,date,id),
      db.prepare(`INSERT INTO idempotency_keys(user_id,key,method,path,request_hash,response_json,status_code,created_at)
        SELECT ?,?,'POST','/api/v1/check-ins','check-in:v1',json_object('reward',50,'date',?,
          'wallet',json_object('balance',balance,'currency','EUR_NC','checked_in_today',json('true')),
          'ledger',json_object('id',?,'kind','check_in','delta',50,'balance_after',balance,'round_id',NULL,'prediction_id',NULL,'created_at',?)),200,?
        FROM wallets WHERE user_id=?`).bind(user.id,key,date,id,now,now,user.id)
    ]);
  } catch (error) {
    const repeated = await replay(); if (repeated) return repeated;
    if (await db.prepare('SELECT 1 FROM check_ins WHERE user_id=? AND utc_date=?').bind(user.id,date).first()) throw new ApiError('ALREADY_CHECKED_IN','今天已签到，UTC 零点后再来',409);
    throw error;
  }
  return await replay();
}
