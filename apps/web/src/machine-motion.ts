import { reelFaces, symbolNames, wheelOrder } from './symbols';
export function wheelTarget(number:number,previous=0):number {
  const index=wheelOrder.indexOf(number);if(index<0)throw new Error('无效轮盘结果');
  return Math.ceil(previous/360)*360+360*4-index*360/37;
}
export function reelTarget(symbol:string,previous=0):number {
  const index=reelFaces.indexOf(symbol);if(index<0)throw new Error('无效转轴结果');
  return Math.floor(previous/360)*360-360*4-index*45;
}
export function machineMotion(machine:HTMLElement){
  let wheelAngle=0,reelAngles=[0,-45,-90],cancelled=false;
  const animations:Animation[]=[];
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.motion==='off';
  const rotate=async(el:HTMLElement|SVGElement,from:number,to:number,axis:'X'|'Z',duration:number)=>{
    const target=`rotate${axis}(${to}deg)`;
    if(reduced()){el.style.transform=target;return;}
    const animation=el.animate([{transform:`rotate${axis}(${from}deg)`},{transform:target}],{duration,easing:'cubic-bezier(.12,.65,.16,1)',fill:'forwards'});animations.push(animation);
    try{await animation.finished;if(!cancelled)el.style.transform=target;}catch{}finally{animation.cancel();const i=animations.indexOf(animation);if(i>=0)animations.splice(i,1);}
  };
  return {
    async reveal(result:{number?:number;symbols?:string[]}){
      machine.classList.add('is-turning');
      if(result.symbols){const next=result.symbols.map((s,i)=>reelTarget(s,reelAngles[i]));await Promise.all(Array.from(machine.querySelectorAll<HTMLElement>('.reel-drum')).map((drum,i)=>rotate(drum,reelAngles[i],next[i],'X',2300+i*400)));reelAngles=next;}
      else if(result.number!==undefined){const target=wheelTarget(result.number,wheelAngle);await Promise.all([rotate(machine.querySelector<SVGElement>('.roulette-rotor')!,wheelAngle,target,'Z',3200),rotate(machine.querySelector<HTMLElement>('.ball-orbit')!,0,-1080,'Z',3200)]);wheelAngle=target;}
      machine.classList.remove('is-turning');
      if(!cancelled)machine.querySelector('.machine-outcome')!.textContent=result.symbols?result.symbols.map(s=>symbolNames[s]||'离线信号').join(' / '):`落点 ${result.number}`;
    },
    dispose(){cancelled=true;for(const animation of [...animations])animation.cancel();},
  };
}
