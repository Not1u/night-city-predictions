import type { Me } from '@night-city/contracts';
import { client } from './api';
export const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function mountComments(container:HTMLElement,id:string,title:string,getMe:()=>Me|null,login:()=>void){
  container.innerHTML=`<h2 id="dialog-title">${escapeHtml(title)} · 留言板</h2><p class="muted">${client.mode==='api'?'公开测试频道 · 最近 100 条':'本地演示频道'}。用户名会公开显示，请避免剧透与人身攻击。</p><div id="comment-list">正在接入频道…</div><form id="comment-form"><label class="field">${getMe()?escapeHtml(getMe()!.user.display_name)+'：':'写下你的看法'}<textarea name="comment" maxlength="500" rows="3" placeholder="夜城的下一个故事，你怎么看？" required></textarea></label><p class="comment-feedback" role="status"></p><button class="button primary" type="submit">${getMe()?'发送留言':'登录后留言'} ↗</button></form><button type="button" class="text-button" id="refresh-comments">刷新频道 ↻</button>`;
  const list=container.querySelector<HTMLElement>('#comment-list')!,form=container.querySelector<HTMLFormElement>('form')!,feedback=container.querySelector<HTMLElement>('.comment-feedback')!,submit=form.querySelector<HTMLButtonElement>('[type=submit]')!;
  let busy=false,key=crypto.randomUUID(),lastText='';
  const load=async()=>{
    const rows=await client.comments(id);if(!container.contains(list))return;
    list.innerHTML=rows.length?rows.map(c=>`<article class="comment"><p class="comment-line"><b>${escapeHtml(c.author.display_name)}：</b><span>${escapeHtml(c.body)}</span></p><div><small>${new Date(c.created_at).toLocaleString()}</small><button class="text-button" ${c.author.id===getMe()?.user.id?'data-remove':'data-report'}="${escapeHtml(c.id)}">${c.author.id===getMe()?.user.id?'撤下':'举报'}</button></div></article>`).join(''):'<p class="empty">频道安静，等你留下第一条信号。</p>';
  };
  form.onsubmit=async e=>{e.preventDefault();if(!getMe()){login();return;}if(busy)return;busy=true;submit.disabled=true;
    const input=form.querySelector('textarea')!,text=input.value.trim();if(text!==lastText){lastText=text;key=crypto.randomUUID();}
    try{await client.comment(id,text,key);key=crypto.randomUUID();input.value='';feedback.textContent='留言已发送。';await load();}catch(e){feedback.textContent=e instanceof Error?e.message:'发送失败';}finally{busy=false;submit.disabled=false;}
  };
  list.onclick=async e=>{const button=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||busy)return;if(!getMe()){login();return;}busy=true;button.disabled=true;
    try{if(button.dataset.remove){await client.removeComment(button.dataset.remove);feedback.textContent='已撤下你的留言。';}else if(button.dataset.report){await client.report(button.dataset.report);feedback.textContent='举报已记录。3 位不同用户举报后，留言会自动隐藏待核查。';}await load();}catch(e){feedback.textContent=e instanceof Error?e.message:'操作失败';}finally{busy=false;button.disabled=false;}
  };
  container.querySelector<HTMLButtonElement>('#refresh-comments')!.onclick=()=>{void load().catch(e=>{feedback.textContent=e.message;});};
  try{await load();}catch(e){list.textContent=e instanceof Error?e.message:'读取留言失败，请刷新频道';}
}
