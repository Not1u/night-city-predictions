type Mode='login'|'register'|'recover'|'password'|'claim';
/** Passwords and recovery codes never enter localStorage or logs. Session is HttpOnly. */
export function mountPasswordLogin(container:HTMLElement,done:()=>Promise<void>,initial:Mode='login'):()=>void {
  let disposed=false, busy=false;
  const render=(mode:Mode)=>{
    container.innerHTML=`<h2 id="dialog-title">${{login:'欢迎回城。证件带了吗？',register:'夜城不问来路。只记住名字。',recover:'记忆可以丢，恢复码不行。',password:'给你的账户换把锁。',claim:'老居民，欢迎换证。'}[mode]}</h2>
    <p>${mode==='password'?'修改密码后，其他设备会退出登录，旧恢复码也会失效。':'用户名与密码即可进入，无需邮箱或短信。积分没有现实价值。'}</p>
    <form class="email-login-form">
      ${mode==='password'?'<label class="field">当前密码<input name="current_password" type="password" autocomplete="current-password" minlength="12" maxlength="128" required></label>':'<label class="field">用户名<input name="username" autocomplete="username" minlength="2" maxlength="20" required></label>'}
      ${mode==='register'?'<p class="form-note">2–20 位文字、数字、空格、下划线或短横线。用户名是登录名，也会出现在获奖榜上。</p>':''}
      ${mode==='claim'?'<label class="field">迁移码<input name="claim_code" autocomplete="off" spellcheck="false" minlength="43" maxlength="43" required></label><p class="form-note">管理员核实旧账户归属后提供一次性迁移码。旧积分和订单保留；不能仅凭用户名申请。</p>':''}
      ${mode==='recover'?'<label class="field">恢复码<input name="recovery_code" autocomplete="off" spellcheck="false" minlength="43" maxlength="43" required></label>':''}
      <label class="field">${mode==='login'?'密码':'新密码'}<input name="password" type="password" autocomplete="${mode==='login'?'current-password':'new-password'}" minlength="12" maxlength="128" required></label>
      ${mode==='login'?'':'<p class="form-note">至少 12 位。请使用独立的长密码，别和其他网站共用。</p><label class="field">再次输入密码<input name="confirm" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>'}
      ${mode==='register'?'<label class="consent"><input name="consent" type="checkbox" required>我已满 18 岁，了解积分不可充值、提现、兑换或转让。</label><p class="auth-privacy">注册后请保存恢复码。不绑定邮箱；密码和恢复码都遗失时，无法凭用户名找回账户。</p>':''}
      <p class="auth-error" role="alert"></p>
      <button type="submit" class="button primary">${{login:'登录夜城',register:'注册并保存恢复码',recover:'重设密码',password:'更新密码',claim:'设置密码并迁移'}[mode]} ↗</button>
    </form>
    ${mode==='password'?'':'<div class="auth-links"><button class="text-button" data-mode="login">已有账户</button><button class="text-button" data-mode="register">注册居民</button><button class="text-button" data-mode="recover">忘记密码</button><button class="text-button" data-mode="claim">旧账户迁移</button></div>'}`;
    container.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button=>{button.disabled=button.dataset.mode===mode;button.onclick=()=>{if(!busy)render(button.dataset.mode as Mode);};});
    const form=container.querySelector('form')!,error=container.querySelector<HTMLElement>('[role=alert]')!;
    form.onsubmit=async(event)=>{
      event.preventDefault();if(disposed||busy)return;
      const data=Object.fromEntries(new FormData(form)),button=form.querySelector<HTMLButtonElement>('[type=submit]')!;
      if(mode!=='login'&&data.password!==data.confirm){error.textContent='两次输入的密码不一致';return;}
      busy=true;button.disabled=true;error.textContent='';
      try {
        const response=await fetch(`/api/v1/auth/${mode}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,consent:data.consent==='on'}),signal:AbortSignal.timeout(20000)});
        const result=await response.json() as {error?:{message:string};data:{recovery_code?:string}};
        if(!response.ok||result.error)throw new Error(result.error?.message||'暂时无法登录，请稍后重试');
        if(disposed)return;
        form.reset();
        if(result.data.recovery_code){
          container.innerHTML='<h2 id="dialog-title">这是你的备用钥匙。</h2><p>把恢复码存入密码管理器或安全的离线位置。它只显示这一次，可以用来重设密码；请勿分享给别人。</p><label class="field">恢复码<input readonly autocomplete="off" spellcheck="false"></label><p class="form-note">下次修改或找回密码后，这份恢复码会失效。</p><button class="button primary" type="button">已保存，进入夜城 ↗</button><p role="alert" class="auth-error"></p>';
          container.querySelector('input')!.value=result.data.recovery_code;
          container.querySelector('button')!.onclick=()=>{void done().catch(e=>{container.querySelector('[role=alert]')!.textContent=e instanceof Error?e.message:'加载失败，请刷新';});};
        }else await done();
      }catch(e){if(!disposed)error.textContent=e instanceof Error?e.message:'无法连接服务，请稍后重试';}
      finally{busy=false;button.disabled=false;}
    };
  };
  render(initial);return ()=>{disposed=true;container.querySelectorAll('input').forEach(input=>{input.value='';});};
}
