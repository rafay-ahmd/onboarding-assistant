const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountLiveRequests({container,cards,profile,notify,onVerified=()=>{},onRequestsChange=()=>{}}){
  let connection=null,requests=[],busy=false;
  let modalRules=[];
  const dialog=document.createElement('dialog');dialog.className='request-review';dialog.setAttribute('aria-label','Review access request');document.body.append(dialog);
  function syncModal(){for(const [selector,allowed] of modalRules){const button=dialog.querySelector(selector);if(button)button.disabled=busy||!connection?.connected||!allowed();}}
  function setModalRules(rules){modalRules=rules;syncModal();}
  const validText=(selector,min,max)=>{const value=dialog.querySelector(selector).value;return value.trim().length>=min&&value.length<=max;};
  dialog.addEventListener('input',syncModal);
  dialog.addEventListener('change',syncModal);
  async function api(path,body){const res=await fetch('/api/slack/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-Onboarding-CSRF':connection?.csrf||''}:{},...(body?{body:JSON.stringify(body)}:{})});const data=await res.json();if(!res.ok)throw Error(data.error==='thread_not_found'?'This Slack thread is no longer available. Open the saved thread link to check whether it was deleted or your access changed.':data.error||'Request failed');return data;}
  async function refresh(){connection=await api('status');if(connection.connected){requests=(await api('requests')).requests;}render();}
  function render(){
  container.innerHTML=`<p><strong>Slack:</strong> ${connection?.connected?esc(connection.user)+' · '+esc(connection.team)+' · #'+esc(connection.channelName):esc(connection?.error||'Connecting…')} <button class="secondary" data-live-refresh ${busy?'disabled':''}>Refresh connection</button></p><p class="fine">Requests are sent as the connected Slack account. Review each message before sending.</p>`;
  onRequestsChange(requests);
  for(const slot of cards.querySelectorAll('[data-live-slot]')){
    const r=requests.find(x=>x.accessId===slot.dataset.liveSlot);
    slot.innerHTML=r?`<div data-live-id="${esc(r.id)}">${r.receipt?`<p><a href="https://app.slack.com/archives/${esc(r.receipt.channel)}/p${esc(r.receipt.thread.replace('.',''))}" target="_blank" rel="noopener">Open Slack thread ↗</a></p>`:''}${r.ticketKeys.length?`<p>Detected ticket: ${r.ticketKeys.map(k=>`<a href="https://go.helpdesk.autoscout24.com/servicedesk/customer/portal/105/${esc(k)}" target="_blank" rel="noopener">${esc(k)}</a>`).join(', ')}</p>`:''}${r.error?`<p role="alert">${esc(r.error)}</p>`:''}<details><summary>Reviewed message</summary><pre class="queue-draft">${esc(r.text)}</pre></details><details ${r.question?'open':''}><summary>Slack replies (${r.replies.length})</summary>${r.replies.map(m=>`<p><strong>${esc(m.user)}</strong><br>${esc(m.text)}</p>`).join('')||'<p>No replies loaded yet.</p>'}</details><div class="actions queue-actions">${['draft','failed'].includes(r.status)?'<button data-live-action="send">Review and send to Slack</button>':''}${r.receipt?'<button class="secondary" data-live-action="sync">Sync Slack replies</button><button class="secondary" data-live-action="reply">Reply in thread</button>':''}${r.ticketKeys.length&&r.status!=='verified'?'<button class="secondary" data-live-action="verify">Confirm my access works</button>':''}${r.status==='delivery-unknown'?'<p>Delivery is uncertain. Check Slack before taking further action; automatic resend is disabled.</p>':''}</div></div>`:'';
    for(const button of slot.querySelectorAll('button')){
      button.disabled=busy||!connection?.connected||(button.dataset.liveAction==='reply'&&r.replyUncertain);
      if(button.dataset.liveAction==='reply'&&r.replyUncertain)button.title='Check Slack: the previous reply delivery is uncertain.';
    }
    const card=slot.closest('[data-access]'),badge=card.querySelector('[data-access-status]'),review=card.querySelector('[data-review-request]');
    if(review){review.disabled=busy||!connection?.connected||!!r;review.hidden=!!r;}
    if(r){badge.textContent=r.status.replaceAll('-',' ');badge.className='status '+r.status;card.querySelector('[data-status-source]').textContent='Updated from your Slack request.';card.querySelector('[data-manual-record]').open=false;}
  }
}
  async function handleClick(e){const button=e.target.closest('button');if(!button||button.disabled||busy)return;
    if(button.hasAttribute('data-live-refresh')){try{busy=true;render();await refresh();}catch(err){connection={connected:false,error:err.message};notify(err.message);}finally{busy=false;render();}return;}
    const action=button.dataset.liveAction;if(!action)return;const r=requests.find(x=>x.id===button.closest('[data-live-id]').dataset.liveId);if(!r)return;
    if(action==='send'){openSend(r);return;}
    if(action==='reply'){openAction(r,'reply');return;}
    if(action==='verify'){openAction(r,'verify');return;}
    try{await perform(r,action,{confirmed:true});}catch(err){notify(err.message);}
  }
  async function perform(r,action,input){
    busy=true;render();
    try{const result=await api(`requests/${r.id}/${action}`,input);if(result.request.status==='verified')onVerified(result.request);await refresh();notify(result.request.error||'Request updated: '+result.request.status.replaceAll('-',' '));return result.request;}
    finally{busy=false;render();}
  }
  function modal(title,content,buttons){
    modalRules=[];
    dialog.setAttribute('aria-labelledby','review-title');
    dialog.innerHTML=`<form method="dialog"><div class="section-title"><div><p class="eyebrow">ACCESS REQUEST</p><h2 id="review-title">${esc(title)}</h2></div><button class="secondary" value="cancel" aria-label="Close review">Close</button></div>${content}<p role="alert" id="live-error"></p><div class="actions review-footer">${buttons}</div></form>`;
    dialog.showModal();
  }
  function bindModal(selector,fn){dialog.querySelector(selector).addEventListener('click',async()=>{
    if(busy||dialog.querySelector(selector).disabled)return;
    const buttons=[...dialog.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);dialog.querySelector('#live-error').textContent='';
    // Keep Escape from dismissing an in-flight operation; errors stay in the dialog.
    const prevent=e=>e.preventDefault();dialog.addEventListener('cancel',prevent);
    try{await fn();dialog.close();}catch(err){dialog.querySelector('#live-error').textContent=err.message;}
    finally{buttons.forEach(b=>b.disabled=false);syncModal();dialog.removeEventListener('cancel',prevent);}
  });}
  function openSend(r){
    modal('Review '+r.accessName,`<div class="review-destination"><strong>To #${esc(connection.channelName)}</strong><span>Sending as ${esc(connection.user)} · ${esc(connection.team)}</span></div><label>Message to helpdesk<textarea id="live-message" minlength="15" maxlength="6000">${esc(r.text)}</textarea></label><p>Edit the complete message. Keep this request focused on ${esc(r.accessName)} and include the details helpdesk needs.</p><p class="fine">Send to Slack posts exactly the message above. Saving changes keeps it as a draft.</p>`,'<button type="button" class="secondary" id="save-message">Save changes</button><button type="button" id="send-message">Send to Slack</button>');
    bindModal('#save-message',()=>perform(r,'edit',{text:dialog.querySelector('#live-message').value}));
    bindModal('#send-message',()=>perform(r,'send',{confirmed:true,text:dialog.querySelector('#live-message').value}));
    setModalRules([
      ['#save-message',()=>validText('#live-message',15,6000)&&dialog.querySelector('#live-message').value!==r.text],
      ['#send-message',()=>validText('#live-message',15,6000)]
    ]);
  }
  function openAction(r,action){
    if(action==='reply'){
      modal('Reply about '+r.accessName,`<div class="review-destination"><strong>#${esc(connection.channelName)} · existing request thread</strong><span>Sending as ${esc(connection.user)}</span></div><label>Your reply<textarea id="live-answer" minlength="10" maxlength="2000" placeholder="Answer helpdesk’s question…"></textarea></label>`,'<button type="button" id="confirm-action">Send reply</button>');
      bindModal('#confirm-action',()=>perform(r,'reply',{confirmed:true,text:dialog.querySelector('#live-answer').value}));
      setModalRules([['#confirm-action',()=>!r.replyUncertain&&validText('#live-answer',10,2000)]]);
    }else{
      modal('Verify '+r.accessName,'<p>Confirm you have opened the relevant tool or service and checked that this permission works.</p><p>Approval alone does not verify access. This confirmation records that your access is ready to use.</p>','<button type="button" id="confirm-action">My access works</button>');
      bindModal('#confirm-action',()=>perform(r,'verify',{confirmed:true}));
      setModalRules([['#confirm-action',()=>r.ticketKeys.length>0&&r.status!=='verified']]);
    }
  }
  container.addEventListener('click',handleClick);cards.addEventListener('click',handleClick);
  function openReview(item,hire={}){
    if(!connection?.connected)return notify('Connect Slack before preparing a request.');
    dialog.innerHTML=`<form method="dialog"><div class="section-title"><h2>Review ${esc(item.name)}</h2><button class="secondary" value="cancel">Cancel</button></div><p>For <strong>${esc(connection.user)}</strong> in #${esc(connection.channelName)}. This requests access for your connected account.</p><label>Business justification<textarea id="live-reason" maxlength="2000">${esc(item.reason)}</textarea></label>${item.fields.includes('githubUsername')?`<label>GitHub username<input id="live-github" maxlength="200" value="${esc(hire.githubUsername)}"></label>`:''}${item.fields.includes('awsGroup')?`<label>AWS group<input id="live-aws" maxlength="200" value="${esc(hire.awsGroup)}"></label>`:''}<p>Continue to edit the complete message before sending.</p><button type="button" id="live-save">Continue to message review</button><p role="alert" id="live-error"></p></form>`;
    setModalRules([['#live-save',()=>validText('#live-reason',15,2000)&&['#live-github','#live-aws'].every(selector=>{const field=dialog.querySelector(selector);return !field||(field.value.trim().length>0&&field.value.length<=200);})]]);
    dialog.querySelector('#live-save').addEventListener('click',async()=>{const save=dialog.querySelector('#live-save');if(save.disabled||busy)return;save.disabled=true;busy=true;render();try{await api('requests',{accessId:item.id,justification:dialog.querySelector('#live-reason').value,githubUsername:dialog.querySelector('#live-github')?.value||'',awsGroup:dialog.querySelector('#live-aws')?.value||''});dialog.close();await refresh();const saved=requests.find(r=>r.accessId===item.id);if(saved&&['draft','failed'].includes(saved.status))openSend(saved);notify('Draft prepared. Edit the message and review it before sending.');}catch(err){dialog.querySelector('#live-error').textContent=err.message;}finally{busy=false;render();syncModal();}});dialog.showModal();
  }
  render();refresh().catch(err=>{connection={connected:false,error:err.message};render();});
  return {openReview,render};
}
