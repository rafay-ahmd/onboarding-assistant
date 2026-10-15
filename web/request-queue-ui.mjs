import {prepareRequest,enqueue,sendRequest,reconcileDelivery,advanceRequest,readQueue,normalizeEmail} from './request-queue.mjs';
import {mockSlackAdapter} from './mock-slack-adapter.mjs';

const storageKey='dt-onboarding-mock-queue-v1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createRequestQueue({profile,container,notify,onChange=()=>{}}) {
  let hire={},pending=null,unavailable=false;
  function load() {try{return readQueue(localStorage.getItem(storageKey));}catch(err){unavailable=true;notify(`${err.message} The mock queue is disabled; use Reset mock queue to clear its local data.`);return [];}}
  function save(queue){try{localStorage.setItem(storageKey,JSON.stringify(queue));}catch{throw Error('Unable to save the mock queue. No simulated send was started.');}}
  let queue=load();
  const dialog=document.createElement('dialog');
  dialog.className='request-review';dialog.setAttribute('aria-label','Review mock access request');document.body.append(dialog);
  function visible(){return queue.filter(r=>r.profileId===profile.id && r.employee.email===normalizeEmail(hire.email));}
  function render(){
    container.innerHTML=`<div class="section-title"><div><h2>Request queue</h2><p>MOCK ONLY · No Slack messages or real tickets. Queue statuses do not verify actual access.</p></div><button class="secondary" data-queue-reset>Reset mock queue</button></div>${unavailable?'<p role="alert">Saved queue unavailable. Reset only the mock queue to continue.</p>':''}${!visible().length?'<p class="empty">Use “Review mock request” on an access card below. Complete the employee details first.</p>':''}${visible().map(r=>`<article class="card queue-card" data-request="${esc(r.id)}"><div class="card-top"><h3>${esc(r.accessName)}</h3><span class="status ${esc(r.status)}">MOCK · ${esc(r.status.replaceAll('-',' '))}</span></div><p>${esc(r.employee.name)} · ${esc(r.employee.email)}</p>${r.receipt?`<p class="fine">${esc(r.receipt.channel)} / ${esc(r.receipt.thread)}</p>`:''}${r.ticket?`<p><strong>Fictional ticket:</strong> ${esc(r.ticket.key)}</p>`:''}${r.error?`<p role="alert">${esc(r.error)}</p>`:''}<details><summary>Reviewed request and history</summary><pre class="queue-draft">${esc(r.text)}</pre><ol>${r.history.map(h=>`<li>${esc(h.text)} <span class="fine">${esc(new Date(h.at).toLocaleString())}</span></li>`).join('')}</ol></details><div class="actions queue-actions">${['draft','failed'].includes(r.status)?`<label>Mock delivery result<select data-scenario="${esc(r.id)}"><option value="success">Message accepted</option><option value="failure">Failure before delivery</option><option value="unknown">Timeout / delivery uncertain</option></select></label><button data-queue-action="send">${r.status==='failed'?'Retry mock send':'Send to mock adapter'}</button>`:''}${r.status==='delivery-unknown'?'<button data-queue-action="reconcile">Check mock delivery</button>':''}${r.status==='message-sent'?'<button class="secondary" data-queue-action="question">Simulate follow-up question</button><button data-queue-action="ticket">Simulate ticket creation</button>':''}${r.status==='waiting-for-answer'?`<label class="queue-answer">${esc(r.question)}<textarea data-answer="${esc(r.id)}" aria-label="Reply for ${esc(r.accessName)}" maxlength="2000"></textarea></label><button data-queue-action="answer">Send mock reply</button>`:''}${r.status==='ticket-created'?'<button data-queue-action="grant">Simulate access granted</button>':''}${r.status==='granted'?'<button data-queue-action="verify">Simulate access verification</button>':''}${['message-sent','waiting-for-answer','ticket-created'].includes(r.status)?'<button class="secondary" data-queue-action="deny">Simulate denial</button>':''}</div></article>`).join('')}`;
    onChange(visible());
  }
  function openReview(item,currentHire){
    if(unavailable)return notify('Reset the unavailable mock queue first.');
    try{
      pending={item,hire:{...currentHire}};
      const defaultReason=`As a new Dealertrack software developer, I need this access to ${item.reason.charAt(0).toLowerCase()+item.reason.slice(1)}`;
      const prepared=prepareRequest(profile,item,pending.hire,defaultReason);
      dialog.innerHTML=`<form method="dialog"><div class="section-title"><h2>Review ${esc(item.name)}</h2><button value="cancel" class="secondary">Cancel</button></div><p class="tag">MOCK ONLY · One entitlement per request</p><label>Business justification<textarea id="queue-justification" minlength="15" maxlength="2000" required>${esc(defaultReason)}</textarea></label><label>Message preview<textarea id="queue-preview" readonly>${esc(prepared.text)}</textarea></label><p>Review the employee, entitlement and justification. Adding to the queue does not send a message.</p><button id="queue-confirm" type="button">Add reviewed request to mock queue</button><p id="queue-review-error" role="alert"></p></form>`;
      dialog.querySelector('#queue-justification').addEventListener('input',e=>{try{dialog.querySelector('#queue-preview').value=prepareRequest(profile,item,pending.hire,e.target.value).text;dialog.querySelector('#queue-review-error').textContent='';}catch(err){dialog.querySelector('#queue-review-error').textContent=err.message;}});
      dialog.querySelector('#queue-confirm').addEventListener('click',()=>{try{
        queue=load();if(unavailable)throw Error('Saved queue unavailable. Reset it before adding requests.');
        const result=enqueue(queue,prepareRequest(profile,pending.item,pending.hire,dialog.querySelector('#queue-justification').value));
        save(result.queue);queue=result.queue;dialog.close();render();notify(result.duplicate?'This employee already has this entitlement in the mock queue. No duplicate was added.':'Reviewed request queued locally. Use Send to mock adapter to simulate delivery.');
      }catch(err){dialog.querySelector('#queue-review-error').textContent=err.message;}});
      dialog.showModal();
    }catch(err){notify(err.message);}
  }
  container.addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-queue-reset')){if(!confirm('Clear ALL fictional mock requests stored in this browser, across employees? Real access records and tickets are unaffected.'))return;try{save([]);queue=[];unavailable=false;render();notify('Mock queue cleared.');}catch(err){notify(err.message);}return;}
    const action=button.dataset.queueAction;if(!action || unavailable)return;
    const card=button.closest('[data-request]'),id=card.dataset.request;
    try{
      queue=load();if(unavailable)return;
      const index=queue.findIndex(r=>r.id===id && r.employee.email===normalizeEmail(hire.email));if(index<0)throw Error('Request not found for the current employee.');
      const current=queue[index];
      const next=action==='send'?sendRequest(current,mockSlackAdapter,card.querySelector('[data-scenario]').value):action==='reconcile'?reconcileDelivery(current,mockSlackAdapter):advanceRequest(current,action,card.querySelector('[data-answer]')?.value||'');
      const updated=queue.map((r,i)=>i===index?next:r);save(updated);queue=updated;render();notify(`Mock request: ${next.status.replaceAll('-',' ')}. Nothing was sent externally.`);
    }catch(err){notify(err.message);render();}
  });
  window.addEventListener('storage',e=>{if(e.key===storageKey){queue=load();render();}});
  render();
  return {openReview,getRequests(){return visible();},setHire(currentHire){hire={...currentHire};queue=load();render();}};
}
