import assert from 'node:assert/strict';

const site=process.env.SITE_URL||'https://not1u.github.io/night-city-predictions/';
const base=(process.env.API_BASE_URL||'https://night-city-api.night-city-predictions.workers.dev').replace(/\/+$/,'');
const origin=new URL(site).origin;
async function read(url,format='json'){
  // Public, read-only probes can retry. This script never submits account or wallet mutations.
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(url,{headers:{Origin:origin},signal:AbortSignal.timeout(20000)});
      assert.equal(response.status,200,`HTTP ${response.status}: ${new URL(url).pathname}`);
      if(url.startsWith(base))assert.equal(response.headers.get('access-control-allow-origin'),origin,'API CORS origin mismatch');
      return format==='json'?await response.json():await response.text();
    }catch(error){if(attempt===2)throw error;await new Promise(resolve=>setTimeout(resolve,2000));}
  }
}
const started=Date.now();
const [html,health,rounds]=await Promise.all([read(site,'text'),read(base+'/api/v1/health'),read(base+'/api/v1/rounds')]);
assert.match(html,/<div[^>]+id=["']app["']/);
const script=html.match(/<script[^>]+src=["']([^"']+)["']/)?.[1];
assert.ok(script,'Frontend script missing');
await read(new URL(script,site).href,'text');
assert.equal(health.data?.status,'ok');
assert.equal(health.data?.database,'connected');
assert.equal(health.data?.accounts_enabled,true);
assert.ok(Array.isArray(rounds.data?.items)&&rounds.data.items.length>0);
const round=rounds.data.items.find(r=>r.is_test)||rounds.data.items[0];
const cards=await read(base+'/api/v1/rounds/'+encodeURIComponent(round.id)+'/characters');
assert.ok(Array.isArray(cards.data?.items)&&cards.data.items.length>0);
console.log(JSON.stringify({ok:true,release:health.data.release,frontend:true,database:true,publicMarket:true,cors:true,elapsed_ms:Date.now()-started}));
