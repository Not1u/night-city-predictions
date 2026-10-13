import { authToken, emailAuthReady, sendEmailCode, verifyEmailCode } from './auth';

/** No email or code is written to local application storage. Appwrite owns session persistence. */
export function mountEmailLogin(container: HTMLElement, done: (name?:string) => Promise<void>): () => void {
  container.innerHTML = `<h2 id="dialog-title">先证明您还收得到邮件。</h2><p>输入邮箱，收取 6 位验证码。新居民自动登记，老居民直接回城。</p>
    <form id="email-login-form" class="email-login-form">
      <label class="field">公开用户名<input name="display_name" type="text" autocomplete="nickname" minlength="2" maxlength="20" placeholder="首次注册必填，老居民可留空"></label><p class="form-note">2–20 位文字、数字、空格、下划线或短横线。留言将显示「用户名：内容」。老账户登录不会被这里的名字覆盖。</p>
      <label class="field" id="email-field">邮箱地址<input name="email" type="email" autocomplete="email" placeholder="you@example.com" maxlength="254" required></label>
      <div id="code-step" hidden><p id="code-destination"></p><label class="field">邮件验证码<input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000"></label><p class="form-note">核对邮件中的安全短语：<strong id="security-phrase"></strong></p></div>
      <label class="consent"><input name="consent" type="checkbox" required>我已满 18 岁，了解积分无现实价值，不可充值、提现、兑换或转让。</label>
      <p class="auth-privacy">邮箱仅用于登录验证，交由 Appwrite 发送验证码；不会作为公开昵称展示。</p>
      <p id="auth-error" class="auth-error" role="alert"></p>
      <button class="button primary" type="submit">发送验证码 <span>↗</span></button>
      <div class="auth-links" hidden><button type="button" id="resend-code" class="text-button">重新发送</button><button type="button" id="change-email" class="text-button">换个邮箱</button></div>
    </form>`;
  const form = container.querySelector<HTMLFormElement>('form')!;
  const email = form.elements.namedItem('email') as HTMLInputElement;
  const code = form.elements.namedItem('code') as HTMLInputElement;
  const submit = form.querySelector<HTMLButtonElement>('[type=submit]')!;
  const resend = form.querySelector<HTMLButtonElement>('#resend-code')!;
  const change = form.querySelector<HTMLButtonElement>('#change-email')!;
  const error = form.querySelector<HTMLElement>('#auth-error')!;
  let challenge: {userId:string;phrase:string} | null=null, sending=false, disposed=false, activeSession=false, nextSend=0;
  const setBusy=(value:boolean)=>{sending=value;submit.disabled=value;resend.disabled=value||Date.now()<nextSend;change.disabled=value;};
  const tick=()=>{const seconds=Math.max(0,Math.ceil((nextSend-Date.now())/1000));resend.textContent=seconds?`${seconds} 秒后重发`:'重新发送';resend.disabled=sending||seconds>0;};
  const timer=setInterval(tick,1000);
  const send=async()=>{
    challenge=await sendEmailCode(email.value.trim());
    if(disposed)return;
    email.readOnly=true;code.required=true;
    form.querySelector<HTMLElement>('#code-step')!.hidden=false;
    form.querySelector<HTMLElement>('.auth-links')!.hidden=false;
    form.querySelector('#code-destination')!.textContent=`验证码已发送至 ${email.value.trim()}，请检查收件箱或垃圾邮件。`;
    form.querySelector('#security-phrase')!.textContent=challenge.phrase;
    nextSend=Date.now()+60000;tick();submit.innerHTML='验证并进入夜城 <span>↗</span>';code.focus();
  };
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(sending||disposed)return;setBusy(true);error.textContent='';
    try {
      const name=(form.elements.namedItem('display_name') as HTMLInputElement).value.trim()||undefined;
      if(activeSession){await done(name);return;}
      if(!challenge){await send();return;}
      await verifyEmailCode(challenge.userId,code.value.trim());activeSession=true;
      if(disposed)return;
      await done(name);
    } catch(e){if(!disposed)error.textContent=e instanceof Error?e.message:'登录暂时失败，请重试';}
    finally{if(!disposed)setBusy(false);}
  });
  resend.onclick=async()=>{if(sending||Date.now()<nextSend)return;setBusy(true);error.textContent='';try{await send();}catch(e){error.textContent=e instanceof Error?e.message:'发送失败';}finally{setBusy(false);}};
  change.onclick=()=>{challenge=null;code.value='';code.required=false;email.readOnly=false;form.querySelector<HTMLElement>('#code-step')!.hidden=true;form.querySelector<HTMLElement>('.auth-links')!.hidden=true;submit.innerHTML='发送验证码 <span>↗</span>';error.textContent='';email.focus();};
  if(!emailAuthReady){error.textContent='邮箱登录正在配置中，请稍后再试。';submit.disabled=true;}
  else {
    setBusy(true);
    void authToken().then(token=>{if(disposed||!token)return;activeSession=true;email.required=false;form.querySelector<HTMLElement>('#email-field')!.hidden=true;submit.innerHTML='确认并接入账户 <span>↗</span>';container.querySelector('p')!.textContent='邮箱已经验证，请确认年龄及积分说明，完成本站账户登记。';})
      .catch(e=>{if(!disposed)error.textContent=e instanceof Error?e.message:'暂时无法连接登录服务';})
      .finally(()=>{if(!disposed)setBusy(false);});
  }
  return ()=>{disposed=true;clearInterval(timer);};
}
