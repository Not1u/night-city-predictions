import type { Ratio } from './index';
export type PayoutRule = 'stake-v1' | 'cold-v2';
export type PoolEntry = {id:string;stake_total:number};

/** Exact inverse-stake weights: dividing by the common product cancels in the allocation. */
export function coldWeights(entries:PoolEntry[]):Map<string,bigint> {
  const backed=entries.filter(e=>e.stake_total>0);
  const product=backed.reduce((p,e)=>p*BigInt(e.stake_total),1n);
  return new Map(backed.map(e=>[e.id,product/BigInt(e.stake_total)]));
}

/** Conservative scenario: all currently backed characters win. Only one winner gets the entire pool. */
export function referenceOdds(entries:PoolEntry[], id:string, rule:PayoutRule):Ratio|null {
  const stake=entries.find(e=>e.id===id)?.stake_total??0;
  if(!stake)return null;
  const pool=entries.reduce((sum,e)=>sum+e.stake_total,0);
  if(rule==='stake-v1')return {numerator:pool,denominator:stake};
  const weights=coldWeights(entries),total=[...weights.values()].reduce((sum,w)=>sum+w,0n);
  const numerator=BigInt(pool)*weights.get(id)!,denominator=total*BigInt(stake);
  // Fixed precision only for display; settlement always uses exact integer arithmetic.
  return {numerator:Number(numerator*1000000n/denominator),denominator:1000000};
}

/** Largest remainder, stable ID tie-break. Every point is allocated exactly once. */
export function allocate(total:bigint, entries:{id:string;weight:bigint}[]):Map<string,bigint> {
  const sum=entries.reduce((s,e)=>s+e.weight,0n);
  if(sum<=0n)throw new Error('Cannot allocate an empty pool');
  const rows=entries.map(e=>({...e,amount:total*e.weight/sum,remainder:total*e.weight%sum}));
  let remaining=total-rows.reduce((s,e)=>s+e.amount,0n);
  rows.sort((a,b)=>a.remainder===b.remainder?(a.id<b.id?-1:a.id>b.id?1:0):a.remainder>b.remainder?-1:1);
  for(const row of rows){if(remaining===0n)break;row.amount++;remaining--;}
  return new Map(rows.map(e=>[e.id,e.amount]));
}
