import type { GameRequest, Me } from '@night-city/contracts';
import { client } from './api';
const glyphs:Record<string,string>={skull:'☠',coin:'€$',chip:'▣',eye:'◉',blank:'—'};
export const arcadeMarkup=`<section id="arcade" class="arcade"><div class="section-heading"><div><div class="eyebrow">AFTER HOURS / 夜城游艺厅</div><h2>运气不好，<span>也是常态。</span></h2><p>两台机器，一份虚拟钱包。公司不承诺您会变富。</p></div><span class="tag">TEST BUILD / 01</span></div><div class="arcade-grid"><article class="arcade-card roulette-card"><div class="arcade-art wheel-art" aria-hidden="true"><span>0</span><b>37</b></div><div><small>01 / ROULETTE</small><h3>夜城轮盘</h3><p>红或黑，奇或偶。绿色的零，负责提醒您城市有自己的想法。</p><button class="button primary" data-game="roulette">进入轮盘 ↗</button></div></article><article class="arcade-card slots-card"><div class="arcade-art slot-art" aria-hidden="true"><span>☠</span><span>▣</span><span>◉</span></div><div><small>02 / SLOT MACHINE</small><h3>义体老虎机</h3><p>骷髅、金币、芯片、义眼。三个一样，也许够您庆祝到下一局。</p><button class="button primary" data-game="slots">接入转轴 ↗</button></div></article></div><p class="arcade-note">每局 1–50 €$ · 仅限站内虚拟积分 · 概率与返还规则在游戏内公开 · 签到是稳定收入，小游戏可能损失积分。</p></section>`;
type Pending={key:string;game:'roulette'|'slots';body:GameRequest};
export function mountGame(container:HTMLElement,game:'roulette'|'slots',me:Me,onBalance:()=>Promise<void>):void {
  const storageKey=`nc-pending-game:${me.user.id}`;
  let pending:Pending|null=null;
  try{const stored=JSON.parse(localStorage.getItem(storageKey)||'null');if(stored?.key&&stored?.body&&['roulette','slots'].includes(stored.game))pending=stored;}catch{}
  if(pending)game=pending.game;
  container.innerHTML=`<h2 id="dialog-title">${game==='roulette'?'夜城轮盘':'义体老虎机'} <span class="tag">测试版</span></h2><p>可用 <b id="game-balance">${me.wallet.balance}</b> €$ · 积分没有现实价值</p><div class="game-machine ${game}" aria-live="polite">${game==='roulette'?'<div class="roulette-display"><span>RESULT</span><b id="wheel-result">?</b></div>':'<div class="slot-reels"><span>☠</span><span>€$</span><span>◉</span></div>'}</div><form id="game-form"><div class="game-inputs"><label class="field">每局投入<input name="stake" type="number" min="1" max="50" step="1" value="5" required></label>${game==='roulette'?'<label class="field">预测区域<select name="choice"><option value="red">红色 · 总返还 2 倍</option><option value="black">黑色 · 总返还 2 倍</option><option value="odd">单数 · 总返还 2 倍</option><option value="even">双数 · 总返还 2 倍</option><option value="low">1–18 · 总返还 2 倍</option><option value="high">19–36 · 总返还 2 倍</option><option value="number">单号 · 总返还 36 倍</option></select></label><label class="field" id="single-number" hidden>单号（含 0）<input name="number" type="number" min="0" max="36" step="1" value="0"></label>':''}</div><p class="game-message" role="status">${pending?'上次请求结果待确认，请恢复该局。':'投入会先扣除，中奖总返还包含本金。'}</p><button class="button primary" type="submit">${pending?'恢复上次结果':'确认投入并开始'} ↗</button></form><details class="game-rules"><summary>查看概率、奖表与测试规则</summary>${game==='roulette'?'<p>欧式单零轮盘，0–36 各为 1/37。红黑、单双、大小命中概率 18/37，总返还投入 ×2；单号命中概率 1/37，总返还 ×36。0 仅在选中单号 0 时获奖，其他选项均输。理论返还率 36/37 ≈ 97.30%。分注、街注等将在后续版本加入。</p>':'<p>每个转轴独立抽取：骷髅、金币、芯片、义眼各 10/61；空白为 21/61。三个相同优先：☠ ×51、€$ ×21、▣ ×11、◉ ×6；恰好两个相同的非空白符号 ×2；其余 ×0，空白不算中奖。倍数均为含本金的总返还。理论返还率 211400/226981 ≈ 93.14%，并非每位玩家的保证回报。</p>'}<p>每局投入 1–50 整数积分，每次操作间隔至少 3 秒。没有自动连玩。刷新后可恢复未确认结果，最近 20 局也保存在账户游戏记录中。</p></details><button type="button" class="text-button" id="game-history">最近游戏记录 ↗</button><div id="game-history-list"></div>`;
  const form=container.querySelector<HTMLFormElement>('form')!,button=form.querySelector<HTMLButtonElement>('[type=submit]')!,message=form.querySelector<HTMLElement>('.game-message')!,machine=container.querySelector<HTMLElement>('.game-machine')!;
  let busy=false;
  const stake=form.elements.namedItem('stake') as HTMLInputElement,choice=form.elements.namedItem('choice') as HTMLSelectElement|null;
  const lockFields=(value:boolean)=>form.querySelectorAll<HTMLInputElement>('input,select').forEach(e=>e.disabled=value);
  if(pending){stake.value=String(pending.body.stake);if(choice)choice.value=pending.body.choice||'red';const num=form.elements.namedItem('number') as HTMLInputElement|null;if(num)num.value=String(pending.body.number??0);lockFields(true);}
  const syncNumber=()=>{const field=form.querySelector<HTMLElement>('#single-number');if(field)field.hidden=choice?.value!=='number';};syncNumber();if(choice)choice.onchange=syncNumber;
  form.onsubmit=async e=>{
    e.preventDefault();if(busy)return;busy=true;button.disabled=true;lockFields(true);machine.classList.add('is-spinning');message.textContent=pending?'正在恢复该局…':'信号已发送，等待结果…';
    if(!pending)pending={key:crypto.randomUUID(),game,body:{stake:Number(stake.value),...(choice?{choice:choice.value,...(choice.value==='number'?{number:Number((form.elements.namedItem('number') as HTMLInputElement).value)}:{})}:{})}};
    try{localStorage.setItem(storageKey,JSON.stringify(pending));}catch{}
    try {
      const result=await client.play(pending.game,pending.body,pending.key);
      pending=null;try{localStorage.removeItem(storageKey);}catch{}
      if(!container.contains(form))return;
      if(result.result.symbols)container.querySelectorAll('.slot-reels span').forEach((e,i)=>e.textContent=glyphs[result.result.symbols![i]]);
      else container.querySelector('#wheel-result')!.textContent=String(result.result.number);
      container.querySelector('#game-balance')!.textContent=String(result.balance);
      const net=result.payout-result.stake;
      message.textContent=`本局投入 ${result.stake}，总返还 ${result.payout}，净${net>=0?'增加':'减少'} ${Math.abs(net)} €$。`;
      machine.classList.toggle('is-win',result.payout>0);button.textContent='3 秒后可开始下一局';
      setTimeout(()=>{button.disabled=false;button.textContent='确认投入并开始 ↗';lockFields(false);},3000);
      try{await onBalance();}catch{message.textContent+=' 账户显示同步稍有延迟，请刷新。';}
    }catch(error){
      if(!container.contains(form))return;
      const code=(error as {code?:string}).code;
      if(code&&code!=='NETWORK_ERROR'&&code!=='INTERNAL_ERROR') {pending=null;try{localStorage.removeItem(storageKey);}catch{}lockFields(false);}
      message.textContent=error instanceof Error?error.message:'暂时无法连接，请恢复本局';button.textContent=pending?'恢复上次结果 ↗':'确认投入并开始 ↗';button.disabled=false;
    }finally{busy=false;machine.classList.remove('is-spinning');}
  };
  container.querySelector<HTMLButtonElement>('#game-history')!.onclick=async()=>{
    const list=container.querySelector('#game-history-list')!;list.textContent='正在读取…';
    try{const rows=await client.games();list.replaceChildren();for(const row of rows){const item=document.createElement('p');item.textContent=`${row.game==='roulette'?'轮盘':'老虎机'} · 投入 ${row.stake} / 返还 ${row.payout} · ${new Date(row.created_at).toLocaleString()}`;list.appendChild(item);}if(!rows.length)list.textContent='还没有游戏记录。';}
    catch(e){list.textContent=e instanceof Error?e.message:'读取失败';}
  };
}
