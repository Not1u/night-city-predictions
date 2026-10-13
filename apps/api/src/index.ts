import { ApiError, type CharacterOdds, type Round, type RoundCharacter } from '@night-city/contracts';
import { requireAdmin, requireUser } from './auth/session';
import { emailUser, registerEmailUser, type EmailAuthEnv } from './auth/email';
import { accountInfo, checkIn } from './account';
import { play, predict, refundTest } from './play';
import { comments, postComment, removeComment, reportComment, updateProfile } from './community';
export interface Env extends EmailAuthEnv { ALLOWED_ORIGIN: string }
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const meta = { server_time: new Date().toISOString(), request_id: crypto.randomUUID(), api_version: 'v1' };
    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin' });
    const origin = request.headers.get('Origin');
    if (origin === env.ALLOWED_ORIGIN) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Credentials', 'true');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key, X-Admin-Step-Up');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    }
    const ok = (data: unknown) => Response.json({ data, meta }, { headers });
    const authenticate = () => env.APPWRITE_PROJECT_ID ? emailUser(request, env) : requireUser(request, env.DB);
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (request.method !== 'GET' && origin !== env.ALLOWED_ORIGIN) throw new ApiError('FORBIDDEN', '请求来源不被允许', 403);
      if (url.pathname === '/api/v1/health' && request.method === 'GET') return ok({ status: 'ok', phase: 'play-beta', accounts_enabled: !!env.APPWRITE_PROJECT_ID, predictions_enabled: true, comments_enabled: true, games_enabled: true });
      if (url.pathname === '/api/v1/auth/register' && request.method === 'POST') return ok(await registerEmailUser(request,env));
      if (url.pathname.startsWith('/api/v1/admin/')) {
        requireAdmin(await authenticate());
        if (request.method !== 'GET') throw new ApiError('STEP_UP_REQUIRED', '管理员二次验证尚未接入', 403);
        throw new ApiError('FEATURE_NOT_READY', '管理功能将在后续阶段接入', 503);
      }
      if (url.pathname === '/api/v1/auth/session' && request.method === 'GET') return ok(await authenticate());
      if (url.pathname === '/api/v1/me' && request.method === 'GET') return ok(await accountInfo(env.DB,await authenticate()));
      if (url.pathname === '/api/v1/me/profile' && request.method === 'PATCH') return ok(await updateProfile(request,env.DB,await authenticate()));
      const gameMatch=url.pathname.match(/^\/api\/v1\/games\/(roulette|slots)\/play$/);
      if(gameMatch&&request.method==='POST')return ok(await play(request,env.DB,await authenticate(),gameMatch[1]));
      if(url.pathname==='/api/v1/me/games'&&request.method==='GET') {
        const user=await authenticate();const rows=await env.DB.prepare('SELECT id,game,stake,payout,result_json,created_at FROM game_plays WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 20').bind(user.id).all();
        return ok({items:rows.results,next_cursor:null});
      }
      const predictionMatch=url.pathname.match(/^\/api\/v1\/rounds\/([^/]+)\/predictions$/);
      if(predictionMatch&&request.method==='POST')return ok(await predict(request,env.DB,await authenticate(),predictionMatch[1]));
      const refundMatch=url.pathname.match(/^\/api\/v1\/predictions\/([^/]+)\/refund$/);
      if(refundMatch&&request.method==='POST')return ok(await refundTest(request,env.DB,await authenticate(),refundMatch[1]));
      if (url.pathname === '/api/v1/check-ins' && request.method === 'POST') return ok(await checkIn(request,env.DB,await authenticate()));
      if (url.pathname === '/api/v1/me/ledger' && request.method === 'GET') {
        const user = await authenticate();
        const rows = await env.DB.prepare('SELECT id,kind,delta,balance_after,round_id,prediction_id,created_at FROM ledger WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 100').bind(user.id).all();
        return ok({items:rows.results,next_cursor:null});
      }
      if (url.pathname === '/api/v1/me/predictions' && request.method === 'GET') {
        const user = await authenticate();
        const rows = await env.DB.prepare('SELECT p.*,sp.amount AS payout FROM predictions p LEFT JOIN payouts sp ON sp.prediction_id=p.id WHERE p.user_id=? AND p.round_id=? ORDER BY p.created_at DESC LIMIT 100').bind(user.id,url.searchParams.get('round_id') || '').all();
        return ok({items:rows.results,next_cursor:null});
      }
      const commentMatch=url.pathname.match(/^\/api\/v1\/characters\/([^/]+)\/comments$/);
      if(commentMatch&&request.method==='GET')return ok(await comments(env.DB,commentMatch[1]));
      if(commentMatch&&request.method==='POST')return ok(await postComment(request,env.DB,await authenticate(),commentMatch[1]));
      const removeMatch=url.pathname.match(/^\/api\/v1\/comments\/([^/]+)$/);
      if(removeMatch&&request.method==='DELETE')return ok(await removeComment(env.DB,await authenticate(),removeMatch[1]));
      const reportMatch=url.pathname.match(/^\/api\/v1\/comments\/([^/]+)\/reports$/);
      if(reportMatch&&request.method==='POST')return ok(await reportComment(request,env.DB,await authenticate(),reportMatch[1]));
      if (url.pathname === '/api/v1/rounds' && request.method === 'GET') {
        const rows = await env.DB.prepare(`SELECT r.*, COALESCE(SUM(p.amount),0) AS pool_total, COUNT(DISTINCT p.user_id) AS participant_count FROM rounds r LEFT JOIN predictions p ON p.round_id=r.id AND p.cancelled_at IS NULL GROUP BY r.id ORDER BY r.is_test DESC,episode`).all<Round>();
        return ok({ items: rows.results, next_cursor: null });
      }
      const match = url.pathname.match(/^\/api\/v1\/rounds\/([^/]+)\/(characters|odds)$/);
      if (match && request.method === 'GET') {
        const round = await env.DB.prepare('SELECT id FROM rounds WHERE id=?').bind(match[1]).first();
        if (!round) throw new ApiError('NOT_FOUND', '轮次不存在', 404);
        const rows = await env.DB.prepare(`SELECT c.*, rc.opening_numerator, rc.opening_denominator, COALESCE(SUM(p.amount),0) AS stake_total, COUNT(DISTINCT p.user_id) AS participant_count, EXISTS(SELECT 1 FROM death_results dr WHERE dr.round_id=rc.round_id AND dr.character_id=c.id) AS death_confirmed FROM round_characters rc JOIN characters c ON c.id=rc.character_id LEFT JOIN predictions p ON p.round_id=rc.round_id AND p.character_id=rc.character_id AND p.cancelled_at IS NULL WHERE rc.round_id=? GROUP BY c.id ORDER BY c.id`).bind(match[1]).all<Record<string, unknown>>();
        const pool = rows.results.reduce((sum, r) => sum + Number(r.stake_total), 0);
        const items = rows.results.map(r => {
          const odds: CharacterOdds = { character_id: String(r.id), stake_total: Number(r.stake_total), participant_count: Number(r.participant_count), opening_reference: { numerator: Number(r.opening_numerator), denominator: Number(r.opening_denominator) }, live_reference: Number(r.stake_total) > 0 ? { numerator: pool, denominator: Number(r.stake_total) } : null };
          const item: RoundCharacter = { id: String(r.id), name: String(r.name), codename: String(r.codename), group: r.category as RoundCharacter['group'], bio: String(r.bio), image_url: r.image_url as string | null, death_image_url: r.death_image_url as string | null, source_url: r.source_url as string | null, death_confirmed: Boolean(r.death_confirmed), odds };
          return match[2] === 'odds' ? odds : item;
        });
        return ok({ items, next_cursor: null });
      }
      if (url.pathname.startsWith('/api/v1/me') || request.method !== 'GET') await authenticate();
      throw new ApiError('FEATURE_NOT_READY', '该功能尚未开放', 503);
    } catch (error) {
      const e = error instanceof ApiError ? error : new ApiError('INTERNAL_ERROR', '服务暂时不可用，请稍后重试', 500);
      return Response.json({ error: { code: e.code, message: e.message }, meta }, { status: e.status, headers });
    }
  }
};
