/** Original vector emblems, not official faction, character or radio trademarks. */
const drawings:Record<string,string>={
  skull:'<path d="M18 49 14 33l9-4 4 13 1-25 8-2 1 27 5-29 8 2-2 28 7-21 8 4-6 28-14 17H27Z"/><path d="m23 49 30 5M28 59l22 5M34 41l8 7M39 3l-6 8m27 32 10-4"/>',
  coin:'<path d="M13 66V30l13-7V12l12-6 12 6v11l13 7v36ZM26 66V25m24 41V25M33 17h10M33 28h10M33 39h10M33 50h10M7 67h62"/><path d="M17 36h5m-5 10h5m32-10h5m-5 10h5"/>',
  chip:'<path d="M38 6 63 17v24c0 15-25 29-25 29S13 56 13 41V17Z"/><path d="m38 19 5 11 12 2-9 9 2 13-10-6-10 6 2-13-9-9 12-2Z"/><path d="M20 13h36M29 61h18"/>',
  eye:'<rect x="19" y="19" width="38" height="38" rx="3"/><path d="M29 29h18v18H29ZM26 7v12m12-12v12M50 7v12M26 57v12m12-12v12m12-12v12M7 26h12M7 38h12M7 50h12m38-24h12M57 38h12M57 50h12"/>',
  blank:'<path d="m17 23 12 30 9-21 9 21 12-30M13 64h50M13 12h50"/>'
};
export const symbolNames:Record<string,string>={skull:'银臂摇滚',coin:'企业高塔',chip:'巡逻盾徽',eye:'神经芯片',blank:'离线信号'};
export function symbolArt(id:string){return `<svg class="reel-emblem emblem-${id}" viewBox="0 0 76 76" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="bevel">${drawings[id]||drawings.blank}</svg>`;}
export const radioMark=`<span class="station-mark" title="本站原创广播标 · 非官方电台"><svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3"><path d="M8 24v29h48V24H8Zm5-8L47 5M15 31h18v13H15Zm0 16h18M42 34h8m-8 8h8M6 59h52"/><circle cx="46" cy="49" r="3"/><path d="M34 13h23M46 13v8"/></svg></span>`;
export const wheelOrder=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const reds=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
export function wheelArt(){
  const step=360/37,point=(r:number,a:number)=>`${(200+r*Math.cos(a*Math.PI/180)).toFixed(3)} ${(200+r*Math.sin(a*Math.PI/180)).toFixed(3)}`;
  return `<svg viewBox="0 0 400 400" class="roulette-rotor" aria-hidden="true"><circle cx="200" cy="200" r="194" fill="#30262a" stroke="#a18a62" stroke-width="10"/>${wheelOrder.map((n,i)=>{const a=i*step-90-step/2,b=a+step;return `<path d="M${point(185,a)} A185 185 0 0 1 ${point(185,b)} L${point(124,b)} A124 124 0 0 0 ${point(124,a)} Z" fill="${n===0?'#167261':reds.has(n)?'#a12e45':'#151d29'}" stroke="#bb9a69" stroke-width=".7"/><text x="200" y="36" text-anchor="middle" dominant-baseline="middle" transform="rotate(${i*step} 200 200)" fill="#f9e5bd" font-size="12" font-family="monospace">${n}</text>`;}).join('')}<circle cx="200" cy="200" r="117" fill="#191923" stroke="#82694a" stroke-width="6"/><circle cx="200" cy="200" r="91" fill="#302830" stroke="#60503a" stroke-width="2"/><path d="M200 113v174M113 200h174" stroke="#bca172" stroke-width="8"/><circle cx="200" cy="200" r="24" fill="#d3bb89" stroke="#ffe5a6" stroke-width="3"/></svg>`;
}
export const reelFaces=['skull','coin','chip','eye','blank','coin','chip','blank'];
export function reelMarkup(){return `<div class="reel-window" aria-hidden="true">${[0,1,2].map((n)=>`<div class="reel-column"><div class="reel-drum" style="transform:rotateX(${-n*45}deg)">${reelFaces.map((s,i)=>`<div class="reel-face" style="--face:${i}">${symbolArt(s)}<small>${symbolNames[s]}</small></div>`).join('')}</div></div>`).join('')}</div>`;}
export function wheelMachine(){return `<div class="wheel-scene" aria-hidden="true"><div class="wheel-table">${wheelArt()}<div class="ball-orbit"><i class="roulette-ball"></i></div><div class="wheel-spindle"></div></div><span class="wheel-pointer"></span></div>`;}
