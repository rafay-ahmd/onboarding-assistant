import {draftRequest} from './model.mjs';

export const queueStates = ['draft','message-sent','waiting-for-answer','ticket-created','granted','verified','denied','failed','delivery-unknown'];
export const normalizeEmail = email => String(email || '').trim().toLowerCase();
export function requestKey(profileId, email, accessId) {
  return JSON.stringify([profileId, normalizeEmail(email), accessId]);
}
function note(request, type, text) {
  return {...request, updatedAt:new Date().toISOString(), history:[...request.history,{type,text,at:new Date().toISOString()}]};
}
export function prepareRequest(profile, item, hire, justification) {
  if (!profile.access.some(x=>x.id===item.id && x.route==='helpdesk') || item.route!=='helpdesk') throw Error('This access uses a form or a team contact; it cannot enter the Slack queue.');
  const clean = Object.fromEntries(Object.entries(hire).map(([k,v])=>[k,String(v||'').trim()]));
  clean.email=normalizeEmail(clean.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) throw Error('Enter a valid work email before preparing a request.');
  const draft=draftRequest(item,clean);
  if (draft.missing.length) throw Error(`Complete these details first: ${draft.missing.join(', ')}.`);
  const reason=String(justification||'').trim();
  if(reason.length<15 || reason.length>2000) throw Error('Provide a business justification between 15 and 2,000 characters.');
  const text=`${draft.text}\n\nBusiness justification: ${reason}`;
  const now=new Date().toISOString();
  return {schemaVersion:1,provider:'mock',key:requestKey(profile.id,clean.email,item.id),id:crypto.randomUUID(),profileId:profile.id,accessId:item.id,accessName:item.name,employee:{name:clean.name,email:clean.email},text,justification:reason,status:'draft',attempts:0,receipt:null,ticket:null,question:null,answer:null,error:null,createdAt:now,updatedAt:now,history:[{type:'draft',text:'Reviewed mock request queued. Nothing sent externally.',at:now}]};
}
export function enqueue(queue, request) {
  const existing=queue.find(x=>x.key===request.key);
  return existing ? {queue,request:existing,duplicate:true} : {queue:[...queue,request],request,duplicate:false};
}
export function sendRequest(request, adapter, scenario='success') {
  if(!['draft','failed'].includes(request.status)) throw Error('This request was already sent or its delivery is uncertain. Reconcile uncertain delivery before retrying.');
  const result=adapter.send(request,scenario);
  const base={...request,attempts:request.attempts+1,error:null};
  if(result.kind==='failed')return note({...base,status:'failed',error:result.message},'failed',result.message);
  if(result.kind==='unknown')return note({...base,status:'delivery-unknown',error:result.message},'delivery-unknown',result.message);
  return note({...base,status:'message-sent',receipt:result.receipt},'message-sent','Mock adapter accepted the message. No ticket exists yet.');
}
export function reconcileDelivery(request,adapter) {
  if(request.status!=='delivery-unknown')throw Error('Only uncertain delivery can be reconciled.');
  return note({...request,status:'message-sent',error:null,receipt:adapter.findReceipt(request)},'reconciled','Mock delivery receipt recovered without resending.');
}
export function advanceRequest(request,action,answer='') {
  if(action==='question' && request.status==='message-sent')return note({...request,status:'waiting-for-answer',question:'Please confirm why this individual needs this access for their role.',answer:null},'question','Mock helpdesk asked for clarification.');
  if(action==='answer' && request.status==='waiting-for-answer') {
    const text=answer.trim();
    if(text.length<10 || text.length>2000)throw Error('Reply with 10 to 2,000 characters.');
    return note({...request,status:'message-sent',answer:text,question:null},'answer',`Mock reply: ${text}`);
  }
  if(action==='ticket' && request.status==='message-sent')return note({...request,status:'ticket-created',ticket:{key:`DEMO-${request.id.slice(0,8).toUpperCase()}`,provider:'mock'}},'ticket-created','Fictional ticket associated with this request; no live URL.');
  if(action==='grant' && request.status==='ticket-created')return note({...request,status:'granted'},'granted','Mock helpdesk granted access; functionality has not been verified.');
  if(action==='verify' && request.status==='granted')return note({...request,status:'verified'},'verified','Verification simulated. Real access and setup statuses are unchanged.');
  if(action==='deny' && ['message-sent','waiting-for-answer','ticket-created'].includes(request.status))return note({...request,status:'denied',question:null},'denied','Mock helpdesk denied this request. No automatic retry.');
  throw Error('That action is not available in the current request state.');
}
export function readQueue(serialized) {
  const data=JSON.parse(serialized || '[]');
  if(!Array.isArray(data) || data.length>500)throw Error('Invalid saved queue.');
  const keys=new Set();
  for(const r of data) {
    if(!r || r.provider!=='mock' || r.schemaVersion!==1 || !queueStates.includes(r.status) || typeof r.id!=='string' || !/^[a-f0-9-]{36}$/i.test(r.id) || typeof r.profileId!=='string' || typeof r.accessId!=='string' || typeof r.accessName!=='string' || typeof r.employee?.name!=='string' || typeof r.employee?.email!=='string' || r.key!==requestKey(r.profileId,r.employee.email,r.accessId) || keys.has(r.key) || typeof r.text!=='string' || typeof r.justification!=='string' || !Array.isArray(r.history) || !Number.isInteger(r.attempts) || r.attempts<0)throw Error('Saved queue is incompatible. Nothing was submitted.');
    if(r.history.some(h=>!h || typeof h.type!=='string' || typeof h.text!=='string' || typeof h.at!=='string'))throw Error('Invalid request history.');
    if(r.question!==null && typeof r.question!=='string')throw Error('Invalid follow-up question.');
    if(r.ticket!==null && (r.ticket.provider!=='mock' || typeof r.ticket.key!=='string'))throw Error('Invalid mock ticket.');
    if(r.receipt!==null && (typeof r.receipt.channel!=='string' || typeof r.receipt.thread!=='string'))throw Error('Invalid mock receipt.');
    keys.add(r.key);
  }
  return data;
}

export function accessCardStatus(queue, profileId, email, accessId, actualStatus) {
  const request=queue.find(r=>r.provider==='mock' && r.key===requestKey(profileId,email,accessId));
  return request ? {status:request.status,label:'Mock · '+request.status.replaceAll('-',' '),simulated:true} : {status:actualStatus,label:actualStatus.replaceAll('-',' '),simulated:false};
}
