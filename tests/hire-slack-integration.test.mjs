import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {openStore} from '../backend/db/store.mjs';
import {SlackError} from '../server/slack-service.mjs';

async function fixture(t,{databasePath=':memory:',userId='U0BUMD5CNP9',sendError,onSend}={}){
 const sends=[];
 const slackCall=async(method,args)=>{
  if(method==='auth.test')return {team_id:'TT299RP8X',user_id:userId,user:'rafay-fixture',team:'autoscout24'};
  if(method==='conversations.info')return {channel:{name:'helpdesk',is_member:true}};
  if(method==='chat.postMessage'){onSend?.();sends.push(args);if(sendError)throw sendError;return {ts:'123.000001',channel:args.channel};}
  if(method==='conversations.replies')return {messages:[{ts:'123.000001',text:'Parent'},{ts:'124.000001',bot_id:'BHELP',text:'OET-123 Approved'}],response_metadata:{}};
  throw Error('Unexpected Slack call: '+method);
 };
 const {server,platform}=createApp({databasePath,slackCall});server.listen(0,'127.0.0.1');await once(server,'listening');
 let closed=false;const close=async()=>{if(!closed){closed=true;await new Promise(resolve=>server.close(resolve));}};t.after(close);
 const base='http://127.0.0.1:'+server.address().port;
 const rafay=platform.list('em-vibgy').items.find(h=>h.firstName==='Rafay');
 const vibgy=platform.list('em-vibgy').items.find(h=>h.name==='Vibgy Joseph');
 const actor='hire-'+rafay.id;let csrf='';
 async function request(path,body,acting=actor){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'X-Demo-Actor-Id':acting,...(body===undefined?{}:{'Content-Type':'application/json','X-Onboarding-CSRF':csrf})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json()};}
 const prefix='/api/hires/'+rafay.id+'/slack/';
 const status=await request(prefix+'status');csrf=status.data.csrf;
 return {platform,rafay,vibgy,actor,prefix,request,status,sends,close};
}

test('hire-linked Slack requests persist in the shared repository and update portal progress',async t=>{
 const f=await fixture(t);assert.equal(f.status.data.connected,true);
 const prepared=await f.request(f.prefix+'requests',{accessId:'vs',justification:'Build Dealertrack applications using the approved tools.'});
 assert.equal(prepared.status,200);const r=prepared.data.request;assert.equal(r.hireId,f.rafay.id);assert.equal(r.provider,'slack');
 const again=await f.request(f.prefix+'requests',{accessId:'vs',justification:'Build Dealertrack applications using the approved tools.'});assert.equal(again.data.request.id,r.id);assert.equal(f.sends.length,0);
 const exact='Hi helpdesk, please provide Visual Studio for my Dealertrack development work.';
 const sent=await f.request(f.prefix+'requests/'+r.id+'/send',{confirmed:true,text:exact});assert.equal(sent.data.request.status,'message-sent');assert.equal(f.sends[0].text,exact);
 let summary=f.platform.get('em-vibgy',f.rafay.id).accessSummary;assert.equal(summary.waiting,1);assert.equal(summary.verified,0);
 await f.request(f.prefix+'requests/'+r.id+'/sync',{});
 await f.request(f.prefix+'requests/'+r.id+'/verify',{confirmed:true});
 summary=f.platform.get(f.actor,f.rafay.id).accessSummary;assert.equal(summary.verified,1);assert.equal(summary.percent,Math.round(100/summary.total));
 assert.equal(f.platform.get('em-vibgy',f.vibgy.id).accessSummary.verified,0);
 assert.throws(()=>f.platform.action('network-toronto','requests',r.id,'cannot-mock-live',{action:'grant'}),e=>e.code==='LIVE_REQUEST_ACTION_REQUIRED');
});

test('real submission requires the bound self actor; other hire and EM cannot use Rafay identity',async t=>{
 const f=await fixture(t);
 const other='/api/hires/'+f.vibgy.id+'/slack/';
 assert.equal((await f.request(f.prefix+'requests',{},'hire-'+f.vibgy.id)).status,403);
 assert.equal((await f.request(f.prefix+'requests',{},'em-vibgy')).status,403);
 const blocked=await f.request(other+'status',undefined,'hire-'+f.vibgy.id);assert.equal(blocked.data.connected,false);assert.match(blocked.data.error,/no connected Slack account/);
 assert.equal((await f.request(other+'requests',{accessId:'vs',justification:'A valid request justification.'},'hire-'+f.vibgy.id)).status,403);
 assert.equal(f.sends.length,0);
});

test('a mismatched OAuth identity cannot prepare a bound hire request',async t=>{
 const f=await fixture(t,{userId:'ANOTHER-SLACK-USER'});assert.equal(f.status.data.connected,false);
 const result=await f.request(f.prefix+'requests',{accessId:'vs',justification:'A valid request justification.'});assert.equal(result.status,400);assert.equal(result.data.error,'unexpected_slack_identity');assert.equal(f.sends.length,0);
});

test('SQLite checkpoint survives restart and prevents uncertain-send retries',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'hire-slack-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const databasePath=join(dir,'demo.sqlite');let checked=false;
 const f=await fixture(t,{databasePath,sendError:new SlackError('network_or_timeout',true),onSend(){const store=openStore(databasePath);try{const row=store.list('requests',{hireId:f.rafay.id}).find(r=>r.provider==='slack');assert.equal(row.status,'delivery-unknown');checked=true;}finally{store.close();}}});
 const draft=await f.request(f.prefix+'requests',{accessId:'vs',justification:'Build Dealertrack applications using the approved tools.'});const id=draft.data.request.id;
 const result=await f.request(f.prefix+'requests/'+id+'/send',{confirmed:true});assert.equal(result.data.request.status,'delivery-unknown');assert.equal(checked,true);await f.close();
 const restarted=await fixture(t,{databasePath});assert.equal(restarted.rafay.id,f.rafay.id);assert.equal((await restarted.request(restarted.prefix+'requests')).data.requests[0].status,'delivery-unknown');assert.equal((await restarted.request(restarted.prefix+'requests/'+id+'/send',{confirmed:true})).status,400);assert.equal(restarted.sends.length,0);await restarted.close();
});

test('a custom managed profile cannot submit through the Dealertrack Slack API',async t=>{
 const f=await fixture(t);
 const profile=f.platform.createProfile('em-vibgy','other-profile',{name:'Another team',groups:['OTHER-GROUP'],adminRequired:false});
 const hire=f.platform.create('em-vibgy','other-hire',{firstName:'Other',lastName:'Person',startDate:'2026-11-03',location:'Toronto',profileId:profile.id});
 const base='/api/hires/'+hire.id+'/slack/';
 const status=await f.request(base+'status',undefined,'hire-'+hire.id);assert.equal(status.data.connected,false);assert.match(status.data.error,/only for the Dealertrack/);
 const result=await f.request(base+'requests',{accessId:'vs',justification:'A valid request justification.'},'hire-'+hire.id);assert.equal(result.status,403);assert.equal(f.sends.length,0);
});
