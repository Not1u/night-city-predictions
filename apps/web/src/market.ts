import type { Round, RoundCharacter } from '@night-city/contracts';
export function approximateCountdown(milliseconds:number):string {
  if(!Number.isFinite(milliseconds))return '时间待确认';
  if(milliseconds<=0)return '已封盘';
  if(milliseconds>=86400000)return `约 ${Math.floor(milliseconds/86400000)} 天`;
  if(milliseconds>=3600000)return `约 ${Math.floor(milliseconds/3600000)} 小时`;
  if(milliseconds>=60000)return `约 ${Math.floor(milliseconds/60000)} 分钟`;
  return '不足 1 分钟';
}
/** A late response for a previously selected round must never replace the latest selection. */
export function marketLoader(source:{rounds():Promise<Round[]>;characters(id:string):Promise<RoundCharacter[]>}) {
  let revision=0;
  return async(selected:string)=>{
    const request=++revision, rounds=await source.rounds();
    const id=rounds.some(r=>r.id===selected)?selected:rounds[0]?.id??'';
    const cards=id?await source.characters(id):[];
    return request===revision?{rounds,cards,selected:id}:null;
  };
}
