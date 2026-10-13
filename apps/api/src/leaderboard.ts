import { ApiError } from '@night-city/contracts';
export async function leaderboard(db:D1Database,kind:string){
  if(!['lottery','arcade'].includes(kind))throw new ApiError('INVALID_INPUT','榜单类型无效');
  const sql=kind==='arcade'
    ? `SELECT u.display_name,SUM(g.payout-g.stake) AS net_points,SUM(CASE WHEN g.payout>g.stake THEN 1 ELSE 0 END) AS wins
       FROM game_plays g JOIN users u ON u.id=g.user_id
       WHERE g.created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')
       GROUP BY g.user_id HAVING SUM(g.payout-g.stake)>0 ORDER BY net_points DESC,wins DESC,g.user_id LIMIT 10`
    : `SELECT u.display_name,SUM(COALESCE(pa.amount,0)-p.amount) AS net_points,SUM(CASE WHEN COALESCE(pa.amount,0)>p.amount THEN 1 ELSE 0 END) AS wins
       FROM predictions p JOIN users u ON u.id=p.user_id JOIN rounds r ON r.id=p.round_id
       JOIN settlements s ON s.round_id=r.id AND s.status='settled' LEFT JOIN payouts pa ON pa.prediction_id=p.id
       WHERE r.is_test=0 AND p.cancelled_at IS NULL
       GROUP BY p.user_id HAVING SUM(COALESCE(pa.amount,0)-p.amount)>0 ORDER BY net_points DESC,wins DESC,p.user_id LIMIT 10`;
  const rows=await db.prepare(sql).all<{display_name:string;net_points:number;wins:number}>();
  return {kind,period:kind==='arcade'?'30d':'settled',items:rows.results.map((row,i)=>({...row,rank:i+1})),updated_at:new Date().toISOString()};
}
