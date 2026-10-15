import {randomUUID} from 'node:crypto';
import profile from '../../profiles/dealertrack-developer.json' with {type:'json'};
import {SlackError} from '../../server/slack-service.mjs';

export function slackAccessSummary(store,hireId){
 const hire=store.get('hires',hireId);
 if(hire?.profileId!==profile.id)return {supported:false,total:0,verified:0,percent:0,prepared:0,submitted:0,waiting:0,started:false,items:[]};
 const requests=store.list('requests',{hireId}).filter(r=>r.provider==='slack'&&r.kind==='entitlement');
 const items=profile.access.filter(x=>x.route==='helpdesk').map(item=>{const r=requests.find(x=>x.accessId===item.id);return {accessId:item.id,name:item.name,status:r?.status||'not-requested',ticketKeys:r?.ticketKeys||[]};});
 const verified=items.filter(x=>x.status==='verified').length;
 return {supported:true,total:items.length,verified,percent:items.length?Math.round(verified/items.length*100):0,prepared:items.filter(x=>x.status==='draft').length,submitted:items.filter(x=>!['not-requested','draft','failed'].includes(x.status)).length,waiting:items.filter(x=>['message-sent','waiting-for-answer','ticket-created','delivery-unknown'].includes(x.status)).length,started:requests.length>0,items};
}

// Async orchestration stays outside SQLite transactions. Checkpoints and final
// writes use short synchronous transactions on the platform's existing repository.
export function createSqliteSlackStore(store,hireId){
 let lock=Promise.resolve(),before=new Map();
 const read=()=>store.list('requests',{hireId}).filter(r=>r.provider==='slack'&&r.kind==='entitlement');
 function write(rows,checkpoint=false){store.transaction(()=>{
  for(const r of rows){
   if(r.hireId&&r.hireId!==hireId)throw new SlackError('request_hire_mismatch');
   const existing=store.get('requests',r.id),prior=before.get(r.id);
   if(checkpoint&&r.status==='delivery-unknown'&&prior&&['draft','failed'].includes(prior.status)&&existing?.status!==prior.status)throw new SlackError('already_sent_or_delivery_uncertain');
   const next={...r,hireId,kind:'entitlement',entitlementId:r.accessId,implementation:'slack-api',requestKey:JSON.stringify(['slack',hireId,r.key])};
   Object.assign(r,next);store.put('requests',r);
   if(existing?.status!==r.status)store.put('events',{id:randomUUID(),hireId,actorId:'hire-'+hireId,type:'slack-request-'+r.status,resourceId:r.id,detail:{accessId:r.accessId,provider:'slack'},createdAt:new Date().toISOString()});
  }
 });}
 return {read:async()=>read(),checkpoint:async rows=>write(rows,true),transaction(fn){const task=lock.then(async()=>{const rows=read();before=new Map(rows.map(r=>[r.id,{...r}]));const result=await fn(rows);write(rows);return result;});lock=task.catch(()=>{});return task;}};
}
