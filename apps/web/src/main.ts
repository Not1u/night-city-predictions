import './style.css';
import './edgerunners.css';
import { formatRatio, roundLabels, type Round, type RoundCharacter, type Me } from '@night-city/contracts';
import { memories } from '../../../packages/contracts/src/fixtures';
import { client } from './api';
import { mountEmailLogin } from './email-login';
import { arcadeMarkup, mountGame } from './games';
import { bulletinMarkup, rankingMarkup, loadRanking } from './bulletin';
import { radioMark } from './symbols';
import './play.css';
import './machines.css';
import { characterImage, OFFICIAL_PAGE, officialAssets } from './official-assets';
import { setupMotion, revealElements } from './motion';
const root = document.querySelector<HTMLDivElement>('#app')!;
const esc = (value: string) => value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const number = (n: number) => n.toLocaleString('zh-CN');
let rounds: Round[] = [], cards: RoundCharacter[] = [], selected = '', me: Me | null = null;
let filter = 'all', query = '', busy = false;
root.innerHTML = `
  <div class="disclaimer"><span>18+</span> 非官方粉丝企划 <i>／</i> 仅限虚拟积分 · 无现实价值 · 不可充值、提现、兑换或转让</div>
  <header class="header"><a class="brand" href="#">${radioMark}<span>死人大乐透<small>DEAD MAN’S LOTTO / 2077</small></span></a><nav aria-label="主导航"><a href="#predictions" class="active">命运预测</a><a href="#arcade">游艺厅</a><a href="#bulletin">公告栏</a><a href="#memories">回忆档案</a><button data-action="rules">参与规则 ↗</button></nav><div id="account"></div></header>
  <main>
    <section class="hero" id="top">
      <div class="hero-media" aria-hidden="true">
        <img class="hero-poster" src="${officialAssets.poster}" alt="" fetchpriority="high">
        <video id="hero-video" muted loop playsinline preload="none" poster="${officialAssets.poster}" data-source="${officialAssets.video}"></video>
      </div>
      <div class="hero-shade" aria-hidden="true"></div><div class="hero-grid" aria-hidden="true"></div>
      <div class="hero-copy">
        <div class="eyebrow"><span></span> CYBERPUNK: EDGERUNNERS 2 <span></span></div>
        <p class="hero-kicker">夜城早间生存简报 / FM 20.77</p>
        <h1 aria-label="死人大乐透，祝您今天不在名单上。"><b class="glitch-title" data-text="死人大乐透">死人大乐透</b><span>祝您今天不在名单上。</span></h1>
        <p class="hero-description">早上好，夜城。今天的好消息：你还在收听。<br>坏消息：房租不会因此减免。广告之后，看看谁先领到单程票。</p>
        <div class="hero-actions"><a class="button primary" href="#predictions">收听今日坏消息 <span>↗</span></a><button class="button outline" data-action="rules">参与规则 <span>↗</span></button></div>
        <div class="hero-foot"><span>每集独立彩池</span><i>×</i><span>纯虚拟积分</span><i>×</i><span>本台不包售后</span></div>
      </div>
      <div class="hero-bottom"><a href="#predictions" class="scroll-cue">向下接入 <span>↓</span></a><button id="motion-toggle" aria-pressed="false">播放动效 ▷</button><span>NC_2077 / SIGNAL ONLINE</span></div>
    </section>
    <div class="signal-ticker" aria-hidden="true"><div>${Array.from({length:4},()=>'<span>FM 20.77 · 早间生存简报</span><b>＋</b><span>创伤小组温馨提示：请先确认余额，再确认呼吸</span><b>＋</b>').join('')}</div></div>
    <div class="page-content">
    <div class="demo-banner"><span class="tag">${client.mode==='mock'?'LOCAL DEMO':'PUBLIC BETA'}</span><span>${client.mode==='mock'?'本地演示：账户、积分与订单仅保存在此浏览器。倒计时为演示时间。':'公开测试：轮盘、老虎机与角色预测测试已开放。测试预测可随时退回积分，不对应动画播出或死亡结论。'}</span></div>
    <section class="round-panel" aria-label="当前轮次"><div class="round-select"><label for="round">预测轮次 / EPISODE</label><select id="round" aria-label="选择预测轮次"></select></div><div class="round-stat"><small>本集总池</small><strong id="pool">—</strong><span>€$ 夜城欧元</span></div><div class="round-stat"><small>参与人数</small><strong id="participants">—</strong><span>本集独立统计</span></div><div class="countdown"><div><span id="round-state" class="status">连接中</span><small>距离封盘</small></div><strong id="timer">-- : -- : --</strong><span id="closes">时间加载中</span></div></section>
    <section id="predictions" class="predictions"><div class="section-heading reveal"><div><div class="eyebrow">TONIGHT’S ROLL CALL / 今晚点名</div><h2>夜城人物<span>档案</span><small>CHARACTER FILES_</small></h2><p>夜城不缺人才。缺的是能把下一集拍完的人才。</p></div><button class="text-button" data-action="ledger">我的预测与流水 ↗</button></div><div class="toolbar"><div class="filters" role="group" aria-label="角色分类"><button class="selected" data-filter="all">全部角色 <span id="character-count">10</span></button><button data-filter="crew">新团队</button><button data-filter="associated">关联角色</button></div><label class="search"><span>⌕</span><input id="search" type="search" placeholder="搜索角色 / 代号" aria-label="搜索角色"></label></div><div class="content-layout"><div><div id="cards" class="cards"><div class="empty">正在接入夜城信号…</div></div><div class="odds-note">ⓘ 参考赔率随本集彩池变化，预测时不锁定最终返还。尚无押注时展示开盘参考值。</div></div><aside><section class="side-panel reveal"><div class="panel-top"><h3>本集赔率观察</h3><span class="dot"></span></div><p class="muted">参考值 · 非保证返还</p><div id="odds"></div><div class="panel-foot">每次操作后更新 <span>↻</span></div></section><section class="checkin-panel reveal"><span class="eyebrow">YOUR DAILY SIGNAL</span><h3>活着签到，到账五十。</h3><p>每日签到领取 <b>50 €$</b><br>买不了保险，够你发表意见。</p><button id="checkin" class="button primary" data-action="checkin">签到领取 +50 €$ <span>↗</span></button><small>签到日按 UTC 划分</small></section>${rankingMarkup}</aside></div></section>
    ${arcadeMarkup}
    ${bulletinMarkup}
    <section id="memories" class="memories"><div><div class="eyebrow">ARCHIVE / EDGERUNNERS</div><h2>往期录音，谢绝快进。</h2><p>第一季回忆档案 · 不参与本轮预测，不代表角色死亡状态。</p></div><div class="memory-list">${memories.map((n,i)=>`<div><small>FILE / 00${i+1}</small><strong>${n}</strong><span>↗</span></div>`).join('')}</div></section>
    <footer><div class="brand">${radioMark}<span>死人大乐透</span></div><p>非官方、非盈利粉丝企划，与 CD PROJEKT RED、TRIGGER 及 Netflix 无关联。18+。<br>角色及动画素材来源于作品官网，权利归相应权利人所有。夜城欧元无现实价值。</p><a href="${OFFICIAL_PAGE}" target="_blank" rel="noreferrer">素材与作品官方资料 ↗</a></footer>
    </div>
  </main><dialog id="dialog" aria-labelledby="dialog-title"><div class="dialog-head"><span class="eyebrow">NIGHT CITY / TERMINAL</span><button id="close-dialog" aria-label="关闭弹窗">×</button></div><div id="dialog-body"></div></dialog><div id="toast" role="status" aria-live="polite"></div>`;
setupMotion();
void loadRanking();
const dialog = document.querySelector<HTMLDialogElement>('#dialog')!;
let disposeGame: (()=>void)|undefined;
const body = document.querySelector<HTMLDivElement>('#dialog-body')!;
document.addEventListener('click',event=>{
  const trigger=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-profile]');
  if(!trigger)return;
  const character=cards.find(c=>c.id===trigger.dataset.profile);
  if(!character)return;
  const image=characterImage(character.id,character.image_url);
  open(`<div class="profile-detail"><div class="profile-visual">${image?`<img src="${esc(image)}" alt="${esc(character.name)}官方角色立绘" width="400" height="560">`:''}<span>${esc(character.codename)}</span></div><div class="profile-copy"><p class="eyebrow">CHARACTER FILE / ${character.group==='crew'?'新团队':'关联角色'}</p><h2 id="dialog-title">${esc(character.name)}</h2><strong class="profile-codename">${esc(character.codename)}</strong><p>${esc(character.bio)}</p><div class="profile-odds"><small>${character.odds.live_reference?'本集实时参考':'开盘参考赔率'}</small><b>${formatRatio(character.odds.live_reference??character.odds.opening_reference)}</b></div><p class="form-note">参考值不锁定最终返还。${client.mode==='mock'?'当前为本地演示。':'当前开放测试场，订单可随时退回。'}</p><button class="button primary" data-predict="${esc(character.id)}" ${!isOpen()||character.death_confirmed?'disabled':''}>${isOpen()&&!character.death_confirmed?'预测这位角色 ↗':'本轮不可预测'}</button><a class="source-link" href="${OFFICIAL_PAGE}#characters" target="_blank" rel="noreferrer">查看官方角色资料 ↗</a></div></div>`);
});
let toastTimer: ReturnType<typeof setTimeout>;
function toast(message:string) {const el=document.querySelector('#toast')!; el.textContent=message; el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4200);}
function open(html:string) {disposeGame?.();disposeGame=undefined;body.innerHTML=html;if(!dialog.open)dialog.showModal();}
document.querySelector('#close-dialog')!.addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
function current(){return rounds.find(r=>r.id===selected);}
function isOpen(){const r=current();return r?.status==='open' && !!r.opens_at && Date.now()+client.serverOffset>=Date.parse(r.opens_at) && !!r.closes_at && Date.now()+client.serverOffset<Date.parse(r.closes_at);}
function renderAccount(){document.querySelector('#account')!.innerHTML=me?`<button class="wallet" data-action="ledger">€$ <b>${number(me.wallet.balance)}</b></button><button class="avatar" data-action="account" aria-label="账户详情" title="${esc(me.user.display_name)}">${esc(me.user.display_name.slice(0,2))}</button>`:`<button class="button outline" data-action="login">${client.mode==='mock'?'进入演示账户':'注册 / 登录'} ↗</button>`;const btn=document.querySelector<HTMLButtonElement>('#checkin')!;btn.disabled=!!me?.wallet.checked_in_today;btn.innerHTML=me?.wallet.checked_in_today?'今日已领取 ✓':'签到领取 +50 €$ <span>↗</span>';}
function renderCards(){
  const shown=cards.filter(c=>(filter==='all'||c.group===filter) && `${c.name} ${c.codename}`.toLowerCase().includes(query));
  document.querySelector('#character-count')!.textContent=String(cards.length);
  document.querySelector('#cards')!.innerHTML=shown.length?shown.map((c,i)=>{
    const image=characterImage(c.id,c.image_url);
    return `<article class="character reveal ${c.death_confirmed?'dead':''}" style="--reveal-delay:${(i%3)*65}ms">
      <button class="portrait portrait-${esc(c.id)}" data-profile="${esc(c.id)}" aria-label="查看${esc(c.name)}的角色档案">
        <span class="file-id">NC-${String(cards.indexOf(c)+1).padStart(2,'0')}<br>${esc(c.codename)}</span>
        <span class="character-state">${c.death_confirmed?'确认死亡':'命运未定'}</span>
        <span class="portrait-watermark" aria-hidden="true">${esc(c.codename)}</span>
        ${image?`<img class="character-image" src="${esc(image)}" alt="${esc(c.name)}官方角色立绘" loading="lazy" decoding="async" width="400" height="560">`:'<span class="image-fallback">档案影像待补充</span>'}
        <span class="portrait-reticle" aria-hidden="true">＋</span><span class="profile-hint">展开档案 <b>＋</b></span>
      </button>
      <div class="character-title"><h3>${esc(c.name)}</h3><span>${esc(c.codename)} ↗</span></div>
      <div class="character-info"><p>${esc(c.bio)}</p><div class="card-numbers"><div><small>${c.odds.live_reference?'本集实时参考':'开盘参考赔率'}</small><strong>${formatRatio(c.odds.live_reference??c.odds.opening_reference)}</strong></div><div><small>本集押注 / 人数</small><b>${number(c.odds.stake_total)} <em>€$</em></b><span>${c.odds.participant_count} 人参与</span></div></div><div class="card-actions"><button class="button primary" data-predict="${esc(c.id)}" ${!isOpen()||c.death_confirmed?'disabled':''}>${c.death_confirmed?'已确认死亡':isOpen()?'预测命运 ↗':roundLabels[current()?.status??'draft']}</button></div></div></article>`;
  }).join(''):'<div class="empty">没有找到对应角色，试试其他名字。</div>';
  document.querySelectorAll<HTMLImageElement>('.character-image').forEach(img=>{
    img.addEventListener('error',()=>{
      img.hidden=true;
      const label=document.createElement('span');label.className='image-fallback';label.textContent='影像暂时离线';img.parentElement?.appendChild(label);
    },{once:true});
  });
  revealElements();
  document.querySelector('#odds')!.innerHTML=[...cards].sort((a,b)=>b.odds.stake_total-a.odds.stake_total).slice(0,6).map((c,i)=>`<div class="odds-row"><span>0${i+1}</span><div>${esc(c.name)}<small>${c.odds.live_reference?'本集实时参考':'开盘参考'}</small></div><b>${formatRatio(c.odds.live_reference??c.odds.opening_reference)}</b></div>`).join('');
}
function updateTime(){const r=current();if(!r)return;const remaining=r.closes_at?Math.max(0,Date.parse(r.closes_at)-Date.now()-client.serverOffset):0;const state=r.status==='open'&&!remaining?'closed':r.status;document.querySelector('#round-state')!.textContent=roundLabels[state];document.querySelector('#timer')!.textContent=r.closes_at?`${String(Math.floor(remaining/3600000)).padStart(2,'0')} : ${String(Math.floor(remaining/60000)%60).padStart(2,'0')} : ${String(Math.floor(remaining/1000)%60).padStart(2,'0')}`:'待配置时间';document.querySelector('#closes')!.textContent=r.closes_at?`${new Date(r.closes_at).toLocaleString()} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`:'正式时刻与更新节奏待确认';if(r.status==='open'&&!remaining){r.status='closed';renderCards();}}
async function refresh(){
  const loaded=await Promise.all([client.rounds(),client.me()]);rounds=loaded[0];me=loaded[1];
  if(!rounds.some(r=>r.id===selected))selected=rounds[0]?.id??'';
  cards=selected?await client.characters(selected):[];
  document.querySelector('#round')!.innerHTML=rounds.map(r=>`<option value="${esc(r.id)}" ${r.id===selected?'selected':''}>${r.is_test?esc(r.title):`第 ${String(r.episode).padStart(2,'0')} 集`} · ${roundLabels[r.status]}</option>`).join('');
  document.querySelector('#pool')!.textContent=number(current()?.pool_total??0);document.querySelector('#participants')!.textContent=String(current()?.participant_count??0);renderAccount();renderCards();updateTime();
}
let disposeLogin: (()=>void)|undefined;
dialog.addEventListener('close',()=>{disposeLogin?.();disposeLogin=undefined;disposeGame?.();disposeGame=undefined;});
function login(){if(client.mode==='api'){open('');disposeLogin?.();disposeLogin=mountEmailLogin(body,async(name)=>{await client.login(name);dialog.close();await refresh();toast('登记完成。今天也请尽量保持呼吸。');});return;}open(`<h2 id="dialog-title">接入演示账户</h2><p>从 0 €$ 开始，每日签到领取 50 €$。演示数据保存在此浏览器，可随时清除；这不是正式注册。</p><form id="login-form"><label class="consent"><input type="checkbox" required> 我已满 18 岁，了解积分无现实价值，不能充值、提现、兑换或转让。</label><button class="button primary" type="submit">确认并进入演示 ↗</button></form>`);document.querySelector('#login-form')!.addEventListener('submit',e=>{e.preventDefault();void action(async()=>{await client.login();dialog.close();await refresh();toast('欢迎接入。先签到领取 50 €$ 吧。');});});}
async function action(fn:()=>Promise<void>){if(busy)return;busy=true;const submit=body.querySelector<HTMLButtonElement>('button[type="submit"]');if(submit)submit.disabled=true;try{await fn();}catch(e){toast(e instanceof Error?e.message:'操作失败，请重试');}finally{busy=false;if(submit)submit.disabled=false;}}
function predict(id:string){if(!me){login();return;}const c=cards.find(c=>c.id===id);if(!c||!isOpen()||c.death_confirmed){toast('本轮无法预测');return;}const key=crypto.randomUUID();const round=selected;open(`<h2 id="dialog-title">预测 · ${esc(c.name)}</h2><p>${current()?.is_test?'这是独立测试场，不对应动画剧情；投入后可以随时退回。':'你预测该角色将在本集死亡。'}参考赔率 <b class="cyan">${formatRatio(c.odds.live_reference??c.odds.opening_reference)}</b>，提交时不锁定最终返还。</p><form id="prediction-form"><label class="field">投入夜城欧元 <span>可用 ${number(me.wallet.balance)} €$</span><input name="amount" type="number" min="1" max="${me.wallet.balance}" step="1" value="10" required autofocus></label><div class="quick-amounts">${[10,25,50].map(n=>`<button type="button" data-amount="${n}">${n} €$</button>`).join('')}</div><p class="form-note">本集独立彩池，订单不跨集继承。无人押中时全额退款。</p><button class="button primary" type="submit">确认投入测试积分 ↗</button></form>`);body.querySelectorAll<HTMLButtonElement>('[data-amount]').forEach(b=>b.onclick=()=>{body.querySelector<HTMLInputElement>('[name="amount"]')!.value=b.dataset.amount!;});document.querySelector('#prediction-form')!.addEventListener('submit',e=>{e.preventDefault();const amount=Number(body.querySelector<HTMLInputElement>('[name="amount"]')!.value);void action(async()=>{await client.predict(round,{character_id:id,amount},key);dialog.close();await refresh();toast('预测已记录，可在我的流水中查看或退回测试积分。');});});}
function profile(){if(!me){login();return;}open(`<h2 id="dialog-title">你的夜城名片</h2><p>用户名会在你进入获奖榜时公开显示，修改后榜单同步更新。</p><form id="profile-form"><label class="field">公开用户名<input name="display_name" value="${esc(me.user.display_name)}" minlength="2" maxlength="20" autocomplete="nickname" required></label><p class="form-note">2–20 位文字、数字、空格、下划线或短横线。用户名不能重复。</p><button type="submit" class="button primary">保存用户名 ↗</button></form><button class="text-button" data-action="logout">退出登录</button>`);body.querySelector('form')!.onsubmit=e=>{e.preventDefault();const name=body.querySelector<HTMLInputElement>('input')!.value;void action(async()=>{await client.profile(name);await refresh();void loadRanking();dialog.close();toast('名片已更新。夜城记住你了。');});};}
async function ledger(){if(!me){login();return;}const [entries,orders]=await Promise.all([client.ledger(),client.predictions(selected)]);const labels={check_in:'每日签到',prediction:'角色预测',settlement:'本集返还',refund:'本集退款',activity_reward:'游艺厅投入 / 返还'};open(`<h2 id="dialog-title">我的夜城账户</h2><div class="balance-large">${number(me.wallet.balance)} <small>€$</small></div><h3>本集预测 <span class="muted">${orders.length} 笔</span></h3>${orders.length?orders.map(p=>`<div class="ledger-row"><span>${esc(cards.find(c=>c.id===p.character_id)?.name??p.character_id)}<small>最终返还：${p.cancelled_at?'测试积分已退回':p.payout===null?'尚未结算':p.payout+' €$'}</small></span><b>${p.amount} €$</b>${current()?.is_test&&!p.cancelled_at?`<button class="text-button" data-refund="${esc(p.id)}">退回测试积分</button>`:''}</div>`).join(''):'<p class="muted">本集还没有预测订单。</p>'}<h3>积分流水</h3>${entries.length?entries.map(l=>`<div class="ledger-row"><span>${labels[l.kind]}<small>${new Date(l.created_at).toLocaleString()}</small></span><b class="${l.delta>0?'cyan':''}">${l.delta>0?'+':''}${l.delta}<small>余额 ${l.balance_after}</small></b></div>`).join(''):'<p class="empty">还没有流水，签到后会出现在这里。</p>'}`);}
document.addEventListener('click',e=>{const t=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!t)return;if(t.dataset.game){if(!me){login();return;}open('');disposeGame=mountGame(body,t.dataset.game as 'roulette'|'slots',me,async()=>{me=await client.me();renderAccount();void loadRanking();});}if(t.dataset.refund)void action(async()=>{await client.refund(t.dataset.refund!);await refresh();await ledger();toast('测试积分已退回');});if(t.dataset.filter){filter=t.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('selected',(b as HTMLElement).dataset.filter===filter));renderCards();}if(t.dataset.predict)predict(t.dataset.predict);switch(t.dataset.action){case 'login':login();break;case 'ledger':void action(ledger);break;case 'rules':open(`<h2 id="dialog-title">参与须知，小字也算数。</h2><ol class="rules"><li><b>领取积分</b>每日签到 50 €$，按 UTC 日期每天一次，没有破产补助。</li><li><b>选择本集角色</b>预测谁会在这一集死亡。每集订单与彩池独立，钱包余额保留。</li><li><b>参考不是承诺</b>第一集开盘 1.00x；存活角色下一集继承上集封盘参考值。实时参考 = 本集总池 ÷ 该角色押注额。</li><li><b>等待确认与结算</b>所有押中死亡角色的订单共同按金额比例分配本集总池；多人死亡也只分配一次总池。整数余数按订单 ID 稳定顺序分配。</li><li><b>无人命中，全额退款</b>已死亡角色不进入下一轮。最终返还以服务端结算结果为准。</li></ol><p class="form-note">非官方、非盈利、18+。积分无现实价值，不可充值、提现、兑换、转让或交易。${client.mode==='mock'?'当前为本地演示，无正式竞猜订单。':'测试场预测可随时退回积分。正式剧集尚未开盘。'}</p>`);break;case 'checkin':if(!me)login();else void action(async()=>{await client.checkIn(crypto.randomUUID());await refresh();toast(client.mode==='mock'?'签到成功，50 €$ 已记入演示流水。':'生存确认，50 €$ 已到账。明天请继续保持。');});break;case 'account':profile();break;case 'logout':void action(async()=>{await client.logout();dialog.close();await refresh();});break;case 'retry':void load();break;}});
document.querySelector('#search')!.addEventListener('input',e=>{query=(e.target as HTMLInputElement).value.trim().toLowerCase();renderCards();});
document.querySelector('#round')!.addEventListener('change',e=>{selected=(e.target as HTMLSelectElement).value;void load();});
async function load(){try{await refresh();}catch(e){document.querySelector('#cards')!.innerHTML=`<div class="empty"><h3>信号暂时中断</h3><p>${esc(e instanceof Error?e.message:'无法加载数据')}</p><button class="button outline" data-action="retry">重新连接</button></div>`;}}
renderAccount();void load();setInterval(updateTime,1000);
