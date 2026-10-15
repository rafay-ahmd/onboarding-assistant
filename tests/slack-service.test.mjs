import test from 'node:test';
import assert from 'node:assert/strict';
import {createSlackClient,createSlackService,SlackError,summarizeThread} from '../server/slack-service.mjs';
const profile={id:'dealertrack-developer',access:[{id:'vs',name:'Visual Studio subscription',route:'helpdesk'},{id:'github',name:'GitHub',route:'helpdesk'},{id:'admin',name:'Admin',route:'form'}]};
function fixture(overrides={}){
  let rows=[],lock=Promise.resolve();const events=[],sentMessages=[];
  const clone=x=>JSON.parse(JSON.stringify(x));
  const store={read:async()=>clone(rows),checkpoint:async data=>{rows=clone(data);events.push('checkpoint');},transaction(fn){const task=lock.then(async()=>{const pending=clone(rows);const result=await fn(pending);rows=clone(pending);return clone(result);});lock=task.catch(()=>{});return task;}};
  const call=async(method,args)=>{
    if(method==='auth.test')return {team_id:'TT299RP8X',user_id:'UACTOR',user:'demo',team:'autoscout24',grantedScopes:['chat:write']};
    if(method==='conversations.info')return {channel:{name:'helpdesk',is_member:true}};
    if(method==='chat.postMessage'){events.push('send');sentMessages.push(args.text);if(overrides.sendError)throw overrides.sendError;return {ts:'123.000001',channel:args.channel};}
    if(method==='conversations.replies')return {messages:overrides.messages||[],response_metadata:{}};
    throw Error('Unexpected method');
  };
  const service=createSlackService({call,store,profile,expectedUserId:overrides.expectedUserId});
  return {service,events,store,sentMessages};
}
const input={accessId:'vs',justification:'Required to develop the Dealertrack platform.'};
test('preparation uses connected Slack identity, excludes admin and requires details',async()=>{
  const {service,events}=fixture();const {request}=await service.prepare(input);assert.match(request.text,/<@UACTOR>/);assert.equal(request.status,'draft');assert.equal(events.length,0);
  await assert.rejects(service.prepare({...input,accessId:'admin'}),/use_required_form/);
  await assert.rejects(service.prepare({...input,accessId:'github'}),/github_username_required/);
});
test('concurrent preparation is deduplicated and no sends happen',async()=>{
  const {service,events}=fixture();const results=await Promise.all([service.prepare(input),service.prepare(input)]);assert.equal(results[0].request.id,results[1].request.id);assert.equal((await service.list()).length,1);assert.equal(events.length,0);
});
test('send requires confirmation, checkpoints before network and refuses a second send',async()=>{
  const {service,events}=fixture();const {request}=await service.prepare(input);await assert.rejects(service.send(request.id,false),/confirmation/);
  const sent=await service.send(request.id,true);assert.equal(sent.status,'message-sent');assert.deepEqual(events,['checkpoint','send']);assert.ok(sent.receipt.thread);assert.deepEqual(sent.ticketKeys,[]);await assert.rejects(service.send(request.id,true),/already_sent/);
});
test('uncertain delivery blocks resending; confirmed Slack rejection can retry',async()=>{
  const unknown=fixture({sendError:new SlackError('network_or_timeout',true)});const a=await unknown.service.prepare(input);assert.equal((await unknown.service.send(a.request.id,true)).status,'delivery-unknown');await assert.rejects(unknown.service.send(a.request.id,true),/uncertain/);
  const denied=fixture({sendError:new SlackError('missing_scope')});const b=await denied.service.prepare(input);assert.equal((await denied.service.send(b.request.id,true)).status,'failed');assert.equal((await denied.service.send(b.request.id,true)).status,'failed');
});
test('thread sync discovers block-only tickets but never infers verified access',async()=>{
  const f=fixture({messages:[{ts:'123.000001',text:'parent'},{ts:'124.000001',bot_id:'BHELP',blocks:[{text:{type:'mrkdwn',text:'<https://example.test/OET-123|OET-123> Approved and permission granted'}}]}]});const {request}=await f.service.prepare(input);await f.service.send(request.id,true);const synced=await f.service.sync(request.id);assert.equal(synced.status,'ticket-created');assert.deepEqual(synced.ticketKeys,['OET-123']);assert.match(synced.replies[0].text,/Approved/);await assert.rejects(f.service.verify(request.id,false),/confirmation/);assert.equal((await f.service.verify(request.id,true)).status,'verified');
});
test('a user reply clears the previous helpdesk question',()=>{
 const result=summarizeThread([{ts:'1',text:'parent'},{ts:'2',user:'U0ALX5239FZ',text:'Why is access needed?'},{ts:'3',user:'UACTOR',text:'For development.'}],'1','UACTOR');assert.equal(result.question,null);
});
test('wrong Slack identity prevents request preparation',async()=>{
 await assert.rejects(fixture({expectedUserId:'OTHER'}).service.prepare(input),/unexpected_slack_identity/);
});
test('client keeps tokens in authorization header and sanitizes transport failures',async()=>{
 let seen;const call=createSlackClient({userToken:'secret-fixture',fetchImpl:async(url,options)=>{seen={url,options};return new Response(JSON.stringify({ok:true,user_id:'U'}),{headers:{'x-oauth-scopes':'chat:write'}});}});assert.deepEqual((await call('auth.test')).grantedScopes,['chat:write']);assert.equal(seen.options.headers.Authorization,'Bearer secret-fixture');assert.doesNotMatch(seen.url,/secret-fixture/);
 const failed=createSlackClient({userToken:'secret-fixture',fetchImpl:async()=>{throw Error('token=secret-fixture');}});await assert.rejects(failed('chat.postMessage'),e=>e.code==='network_or_timeout'&&e.uncertain&&!e.message.includes('secret-fixture'));
});

test('message edits persist; send uses exactly the final reviewed text and locks edits after delivery',async()=>{
 const f=fixture();const {request}=await f.service.prepare(input);
 const draft='Hi helpdesk, could I please get a Visual Studio subscription?\nMy manager approved it for Dealertrack development.';
 await f.service.edit(request.id,draft);assert.equal((await f.service.list())[0].text,draft);assert.equal(f.events.length,0);
 const final=draft+'\nThank you!';await f.service.send(request.id,true,final);
 assert.equal(f.sentMessages[0],final);assert.equal((await f.service.list())[0].text,final);
 await assert.rejects(f.service.edit(request.id,'A sufficiently long replacement message.'),/cannot_be_edited/);
});
test('invalid edits and unconfirmed sends leave drafts unchanged without sending',async()=>{
 const f=fixture();const {request}=await f.service.prepare(input);
 for(const text of ['',null,'x'.repeat(6001)]){await assert.rejects(f.service.edit(request.id,text),/message_requires/);await assert.rejects(f.service.send(request.id,true,text),/message_requires/);}
 await assert.rejects(f.service.send(request.id,false,'A valid message that was not confirmed.'),/confirmation/);
 assert.equal((await f.service.list())[0].text,request.text);assert.equal((await f.service.list())[0].status,'draft');assert.equal(f.events.length,0);
});
