import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export class SlackError extends Error {
  constructor(code,uncertain=false){super(code);this.code=code;this.uncertain=uncertain;}
}
export function createSlackClient({userToken,botToken,fetchImpl=fetch}) {
  return async function call(method,args={},identity='user') {
    const token=identity==='bot'?botToken:userToken;
    if(!token)throw new SlackError('not_configured');
    let response;
    try{
      response=await fetchImpl('https://slack.com/api/'+method,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(Object.entries(args).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)])),signal:AbortSignal.timeout(15000)});
    }catch{throw new SlackError('network_or_timeout',method==='chat.postMessage');}
    if(response.status===429)throw new SlackError('rate_limited_wait_'+(response.headers.get('retry-after')||'60')+'_seconds');
    if(!response.ok)throw new SlackError('slack_http_'+response.status,method==='chat.postMessage');
    let data;try{data=await response.json();}catch{throw new SlackError('invalid_slack_response',method==='chat.postMessage');}
    if(!data.ok)throw new SlackError(/^[a-z0-9_]+$/.test(data.error||'')?data.error:'slack_error');
    return {...data,grantedScopes:(response.headers.get('x-oauth-scopes')||'').split(',').filter(Boolean)};
  };
}
export function createStore(file){
  let lock=Promise.resolve();
  async function read(){try{const rows=JSON.parse(await readFile(file,'utf8'));if(!Array.isArray(rows))throw Error();return rows;}catch(e){if(e.code==='ENOENT')return [];throw new SlackError('request_store_unreadable');}}
  async function write(rows){await mkdir(path.dirname(file),{recursive:true});const temporary=file+'.tmp';await writeFile(temporary,JSON.stringify(rows,null,2),{mode:0o600});await rename(temporary,file);}
  return {read,checkpoint:write,transaction(fn){const task=lock.then(async()=>{const rows=await read();const result=await fn(rows);await write(rows);return result;});lock=task.catch(()=>{});return task;}};
}
export function summarizeThread(messages,parentTs,actorId='') {
  function textOf(m){const parts=[];function visit(v){if(!v||typeof v!=='object')return;for(const [key,value] of Object.entries(v)){if(['text','url','title'].includes(key)&&typeof value==='string')parts.push(value);else if(typeof value==='object')visit(value);}}visit(m.blocks);visit(m.attachments);return [m.text||'',...parts].join('\n').slice(0,6000);}
  const replies=messages.filter(m=>m.ts!==parentTs).map(m=>({ts:m.ts,user:m.user||m.bot_id||'unknown',text:textOf(m)}));
  // Ticket references are discovered in this exact thread. Approval is never inferred.
  const tickets=[...new Set(messages.filter(m=>m.bot_id||m.user==='U0ALX5239FZ').flatMap(m=>(textOf(m).match(/\bOET-\d+\b/g)||[])))];
  const latestHelpdesk=[...replies].reverse().find(m=>m.user==='U0ALX5239FZ');
  const latestAnswer=[...replies].reverse().find(m=>m.user===actorId);
  return {replies,ticketKeys:tickets,question:latestHelpdesk?.text.includes('?')&&(!latestAnswer||Number(latestHelpdesk.ts)>Number(latestAnswer.ts))?latestHelpdesk.text:null};
}
export function createSlackService({call,store,profile,channelId='C0111SZ86CE',expectedTeamId='TT299RP8X',expectedUserId,actorEmail='',now=()=>new Date().toISOString()}) {
  let cached;
  async function connection(){
    if(cached&&cached.until>Date.now())return cached.value;
    const user=await call('auth.test');
    if(user.team_id!==expectedTeamId || (expectedUserId&&user.user_id!==expectedUserId))throw new SlackError('unexpected_slack_identity');
    const channel=await call('conversations.info',{channel:channelId});
    if(channel.channel?.is_ext_shared)throw new SlackError('external_shared_channel_not_supported');
    if(channel.channel?.is_archived)throw new SlackError('channel_archived');
    if(!channel.channel?.is_member)throw new SlackError('connected_user_not_in_channel');
    const value={connected:true,team:user.team,teamId:user.team_id,userId:user.user_id,user:user.user,email:actorEmail,channelId,channelName:channel.channel.name,scopes:user.grantedScopes};
    cached={until:Date.now()+60000,value};return value;
  }
  const own=(r,c)=>r.provider==='slack'&&r.actorId===c.userId&&r.teamId===c.teamId;
  async function list(){const c=await connection();return (await store.read()).filter(r=>own(r,c));}
  async function prepare({accessId,justification,githubUsername='',awsGroup=''}){
    const c=await connection();const item=profile.access.find(x=>x.id===accessId&&x.route==='helpdesk');
    if(!item)throw new SlackError('use_required_form_or_team_route');
    const reason=String(justification||'').trim();
    if(reason.length<15||reason.length>2000)throw new SlackError('justification_requires_15_to_2000_characters');
    if(item.id==='github'&&!String(githubUsername).trim())throw new SlackError('github_username_required');
    if(item.id==='aws'&&!String(awsGroup).trim())throw new SlackError('aws_group_required');
    if([githubUsername,awsGroup].some(v=>typeof v!=='string'||v.length>200))throw new SlackError('invalid_request_details');
    const key=JSON.stringify([c.teamId,c.userId,profile.id,item.id]);
    return store.transaction(rows=>{
      const existing=rows.find(r=>r.key===key);if(existing)return {request:existing,duplicate:true};
      const text=`<!subteam^S010NGQMLLT> Hi, could I please get ${item.name}?\n\nRequester: <@${c.userId}>\nRole: Dealertrack software developer\nBusiness justification: ${reason}${item.id==='github'?'\nGitHub username: '+githubUsername.trim():''}${item.id==='aws'?'\nRequested Okta group (confirmed with EM): '+awsGroup.trim():''}\n\nThis is one individual access request.`;
      const r={id:randomUUID(),key,provider:'slack',profileId:profile.id,accessId:item.id,accessName:item.name,actorId:c.userId,actorEmail:c.email,teamId:c.teamId,channelId,status:'draft',text,createdAt:now(),updatedAt:now(),receipt:null,ticketKeys:[],replies:[],history:[{at:now(),text:'Live request prepared. Not sent.'}]};rows.push(r);return {request:r,duplicate:false};
    });
  }
  async function change(id,operation){const c=await connection();return store.transaction(async rows=>{const r=rows.find(x=>x.id===id&&own(x,c));if(!r)throw new SlackError('request_not_found');await operation(r,c);r.updatedAt=now();return r;});}
  function messageText(text){if(typeof text!=='string'||text.trim().length<15||text.length>6000)throw new SlackError('message_requires_15_to_6000_characters');return text;}
  async function edit(id,text){const reviewed=messageText(text);return change(id,r=>{if(!['draft','failed'].includes(r.status))throw new SlackError('sent_requests_cannot_be_edited');r.text=reviewed;r.history.push({at:now(),text:'Request message edited before submission.'});});}
  async function send(id,confirmed,text){if(confirmed!==true)throw new SlackError('explicit_review_confirmation_required');return change(id,async r=>{
    if(!['draft','failed'].includes(r.status))throw new SlackError('already_sent_or_delivery_uncertain');
    if(text!==undefined)r.text=messageText(text);
    // Persist in-flight state BEFORE the network side effect. Crash recovery must not resend.
    r.status='delivery-unknown';r.error='Submission in progress; check the channel before retrying.';
    const saved=await store.read();const snapshot=saved.map(x=>x.id===r.id?{...r}:x);
    // A separate checkpoint supplied by the store avoids a retry after a process crash.
    if(store.checkpoint)await store.checkpoint(snapshot);
    try{
      const sent=await call('chat.postMessage',{channel:r.channelId,text:r.text,client_msg_id:r.id,unfurl_links:false,unfurl_media:false});
      if(!sent.ts||sent.channel!==r.channelId)throw new SlackError('invalid_send_receipt',true);
      r.receipt={channel:sent.channel,thread:sent.ts};r.status='message-sent';r.error=null;r.history.push({at:now(),text:'Slack accepted the message. A ticket has not yet been confirmed.'});
    }catch(e){r.status=e.uncertain?'delivery-unknown':'failed';r.error=e.code||'send_failed';r.history.push({at:now(),text:r.error});}
  });}
  async function sync(id){return change(id,async r=>{
    if(!r.receipt)throw new SlackError('no_thread_to_sync');
    let cursor='',messages=[];
    do{const page=await call('conversations.replies',{channel:r.receipt.channel,ts:r.receipt.thread,limit:100,cursor:cursor||undefined});messages.push(...page.messages);cursor=page.response_metadata?.next_cursor||'';if(messages.length>=1000&&cursor)throw new SlackError('thread_too_large_for_demo');}while(cursor);
    const summary=summarizeThread(messages,r.receipt.thread,r.actorId);Object.assign(r,summary);r.lastSyncedAt=now();
    if(r.status!=='verified')r.status=summary.question?'waiting-for-answer':summary.ticketKeys.length?'ticket-created':'message-sent';
  });}
  async function reply(id,text,confirmed){if(confirmed!==true)throw new SlackError('explicit_review_confirmation_required');const answer=String(text||'').trim();if(answer.length<10||answer.length>2000)throw new SlackError('reply_requires_10_to_2000_characters');return change(id,async r=>{if(!r.receipt)throw new SlackError('no_thread_to_reply');if(r.replyUncertain)throw new SlackError('previous_reply_delivery_uncertain_check_slack');try{await call('chat.postMessage',{channel:r.receipt.channel,thread_ts:r.receipt.thread,text:answer,unfurl_links:false,unfurl_media:false});r.history.push({at:now(),text:'Reply sent: '+answer});r.question=null;r.status='message-sent';}catch(e){if(e.uncertain)r.replyUncertain=true;r.error=e.code||'reply_failed';}});}
  async function verify(id,confirmed){if(confirmed!==true)throw new SlackError('verification_confirmation_required');return change(id,r=>{if(!r.ticketKeys.length)throw new SlackError('ticket_reference_required_before_verification');r.status='verified';r.history.push({at:now(),text:'Connected user confirmed the actual access works.'});});}
  return {connection,list,prepare,edit,send,sync,reply,verify};
}
