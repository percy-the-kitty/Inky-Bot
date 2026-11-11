'use strict';
const fs=require('node:fs');
const token=process.env.YAPPER_BOT_TOKEN;
const base='https://www.yapper.website/api/bot/v1';
const commands=[
  {
    "name": "ping",
    "description": "Check bot status",
    "reply": "pong"
  }
];
if(!token||!token.startsWith('yb_')){console.error('[Yapin] Missing YAPPER_BOT_TOKEN');process.exit(1)}
let cursor=null,quit=false,n=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function request(method,url,body){
 const res=await fetch(base+url,{method,headers:{Authorization:'Bot '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(40000)});
 const txt=await res.text();let data={};try{data=JSON.parse(txt)}catch{}
 if(!res.ok){const e=Error(data.error||('HTTP '+res.status));e.status=res.status;e.retry=1000*Math.max(2,Number(res.headers.get('retry-after'))||3);throw e}
 return data
}
async function init(){
 const me=await request('GET','/me');
 console.log('[Yapin] Signed in as',me.username||me.display_name||me.id);
 await request('PUT','/commands',{commands:commands.map(({name,description})=>({name,description}))});
 console.log('[Yapin] Registered',commands.map(c=>'/'+c.name).join(', '));
 try{cursor=String(fs.readFileSync('yapin-cursor.txt','utf8')).trim()||null}catch{}
 if(!cursor){const d=await request('GET','/events?after=0&wait=0');cursor=String(d.last||0)}
 console.log('[Yapin] Listening for new events');
}
async function poll(){
 const d=await request('GET','/events?after='+encodeURIComponent(cursor)+'&wait=25&max_age=900');
 for(const event of d.events||[]){
  if(event.type==='test'){console.log('[Yapin] Test event received');continue}
  if(event.type!=='message')continue;
  const m=event.data||{};if(m.author_bot||!m.channel_id)continue;
  const match=String(m.content||'').match(/^[\/!]([a-z0-9_-]+)(?:\s|$)/i);
  const name=m.command||match?.[1];const cmd=commands.find(c=>c.name===name);
  if(!cmd)continue;
  try{await request('POST','/channels/'+encodeURIComponent(m.channel_id)+'/messages',{content:cmd.reply,reply_to:m.id});console.log('[Yapin] /'+name+' replied in '+m.channel_id)}
  catch(e){console.error('[Yapin] /'+name+' error:',e.message)}
 }
 cursor=String(d.last??cursor);
 try{fs.writeFileSync('yapin-cursor.txt',cursor)}catch{}
}
process.on('SIGTERM',()=>quit=true);process.on('SIGINT',()=>quit=true);
(async()=>{while(!quit){try{if(cursor===null)await init();await poll();n=0}catch(e){console.error('[Yapin] Worker:',e.message);if(e.status===401||e.status===403){process.exitCode=1;break}n++;await sleep(e.status===429||e.status===503?e.retry:Math.min(30000,1500*2**Math.min(n,5)))}}})().catch(e=>{console.error(e);process.exitCode=1});