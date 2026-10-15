import {mountLiveRequests} from './live-requests.mjs';
import {accessProgress,accessStatuses,draftRequest,dependencyStatus,reconcileCompletions,validateReport,validateTicketUrl,normalizeState} from './model.mjs';
const profile = await fetch('/profile.json').then(r => {if(!r.ok) throw Error('Profile unavailable'); return r.json();});
const storageKey = 'dt-onboarding-v1';
let saved;
try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch {}
let state = normalizeState(saved,profile);
let report = null;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(text){$('message').textContent=text;}
let liveRequests=null;
let linkedRequests=[];
function syncQueueCards(){
  updateAccessProgress(linkedRequests);
  for(const card of document.querySelectorAll('[data-access]'))card.querySelector('[data-status-source]').textContent='';
  liveRequests?.render();
}
function updateAccessProgress(requests){
 linkedRequests=requests;
 const {verified,total,percent}=accessProgress(profile,state.access,requests);
 $('access-count').textContent=verified+' / '+total+' ACCESS VERIFIED';
 $('access-progress-value').textContent=percent+'%';
 $('access-progress').value=percent;
 $('access-progress').setAttribute('aria-valuetext',verified+' of '+total+' permissions verified');
 $('access-progress-detail').textContent=verified+' of '+total+' permissions verified. Completed means you have checked that access works.';
}
function persist(){state.completedSteps=reconcileCompletions(profile,state.access,state.completedSteps);try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{message('Browser storage is unavailable. Keep this page open; changes will not persist.');}}
function fillForm(){for(const [key,value] of Object.entries(state.hire)) $('hire-form').elements[key].value=value;}
function syncClear(){
  $('clear').disabled=!report&&!Object.values(state.hire).some(value=>String(value).trim())
    &&!state.completedSteps.length&&!Object.values(state.access).some(item=>item.status!=='not-requested'||item.ticket);
}
function renderAccess(){

  $('access-count').textContent=`${profile.access.filter(x=>state.access[x.id].status==='verified').length} / ${profile.access.length} ACCESS VERIFIED`;
  $('access-list').innerHTML=profile.access.map(item=>{
    const draft=draftRequest(item,state.hire), tracked=state.access[item.id];
    return `<article class="card" data-access="${esc(item.id)}"><div class="card-top"><div><h3>${esc(item.name)}</h3><span class="tag">${esc(item.route==='helpdesk'?'Separate helpdesk message':item.route==='form'?'Dedicated service-desk form':'Confirm route with team')}${item.priority?' · '+esc(item.priority):''}</span></div><span data-access-status="${esc(item.id)}" class="status ${tracked.status}">${esc(tracked.status.replaceAll('-',' '))}</span></div><p class="fine" data-status-source></p><div data-automatic-status hidden><label>Request status (automatic)<input data-automatic-value readonly aria-label="${esc(item.name)} automatic request status"></label></div><p>${esc(item.reason)}</p><p class="fine">Basis: ${esc(item.evidence)}</p>${item.route==='helpdesk'?`<p><button class="secondary" data-review-request="${esc(item.id)}" >Review request</button></p>`:''}${item.route!=='helpdesk'&&draft.missing.length?`<p>Complete: ${esc(draft.missing.join(', '))} to prepare this request.</p>`:item.route==='helpdesk'?'':`<details><summary>${item.route==='form'?'Information for your form':item.route==='team'?'Draft for the owner':'Helpdesk draft'}</summary><textarea aria-label="${esc(item.name)} request draft" readonly>${esc(draft.text)}</textarea><button data-copy="${esc(item.id)}" class="secondary">Copy draft</button></details>`}${item.url?`<p><a class="link-button" href="${esc(item.url)}" target="_blank" rel="noopener">Open required form</a></p>`:''}<div data-live-slot="${esc(item.id)}"></div><details data-manual-record open><summary data-manual-summary>Manual record</summary><div class="card-actions"><label>Access status (manual)<select data-status="${esc(item.id)}">${accessStatuses.map(s=>`<option value="${s}" ${s===tracked.status?'selected':''}>${s.replaceAll('-',' ')}</option>`).join('')}</select></label><label>Real helpdesk ticket link <span>Optional</span><input data-ticket="${esc(item.id)}" aria-label="Real helpdesk ticket link" type="url" placeholder="Paste an existing ticket URL" value="${esc(tracked.ticket)}"><span class="field-hint">Saved link only. Ticket status is not synced.</span></label>${tracked.ticket?`<a href="${esc(tracked.ticket)}" target="_blank" rel="noopener">View ticket ↗</a>`:''}</div></details></article>`;
  }).join('');
  syncQueueCards();
}
function renderSteps(){
  const name=id=>profile.access.find(x=>x.id===id)?.name||profile.steps.find(x=>x.id===id)?.name||id;
  $('step-list').innerHTML=profile.steps.map(s=>{const pending=dependencyStatus(s,state.access,state.completedSteps),done=state.completedSteps.includes(s.id);return `<article class="card"><div class="card-top"><h3>${esc(s.name)}</h3><span class="status ${done?'verified':pending.length?'blocked':'unverified'}">${done?'Recorded complete':pending.length?'Dependencies pending':'Ready to review'}</span></div><span class="tag">${esc(s.mode)}</span><p>${esc(s.action)}</p><p><strong>Verify:</strong> ${esc(s.verification)}</p>${pending.length?`<p><strong>Waiting for:</strong> ${esc(pending.map(name).join(', '))}</p>`:''}<button class="secondary step-button" data-step="${esc(s.id)}" ${pending.length&&!done?'disabled':''}>${done?'Undo recorded completion':'Record completion manually'}</button></article>`;}).join('');
}
function renderReport(){syncClear();if(!report){$('report-list').innerHTML='<p class="empty">No report loaded. Run the checker and import your report.</p>';return;}
  const counts={};for(const c of report.checks)counts[c.status]=(counts[c.status]||0)+1;
  $('report-list').innerHTML=`<p class="fine">${report.demo?'FICTIONAL DEMO · ':''}Inspection time: ${esc(new Date(report.generatedAt).toLocaleString())}. Report import is not an independent verification of this machine.</p><div class="summary">${Object.entries(counts).map(([s,n])=>`<span class="status ${s}">${n} ${s}</span>`).join('')}</div>${report.checks.map(c=>`<article class="card check"><div><h3>${esc(c.name)}</h3><p>${esc(c.detail)}</p></div><span class="status ${c.status}">${c.status}</span></article>`).join('')}`;
}
function render(){renderAccess();renderSteps();syncClear();}
fillForm();render();
liveRequests=mountLiveRequests({container:$('slack-connection'),cards:$('access-list'),profile,notify:message,onRequestsChange:updateAccessProgress,onVerified:r=>{
  if(r.actorEmail && r.actorEmail.toLowerCase()===String(state.hire.email||'').trim().toLowerCase() && state.access[r.accessId]){
    state.access[r.accessId].status='verified';persist();render();
  }
}});
$('hire-form').addEventListener('input',e=>{state.hire[e.target.name]=e.target.value;persist();render();});
$('hire-form').addEventListener('submit',e=>e.preventDefault());
document.querySelector('nav').addEventListener('click',e=>{const tab=e.target.dataset.tab;if(!tab)return;document.querySelectorAll('.tab').forEach(x=>x.hidden=x.id!==tab);document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('selected',x.dataset.tab===tab));message('');});
$('access-list').addEventListener('change',e=>{const statusId=e.target.dataset.status,ticketId=e.target.dataset.ticket;if(statusId){state.access[statusId].status=e.target.value;persist();render();}if(ticketId){try{state.access[ticketId].ticket=validateTicketUrl(e.target.value);persist();renderAccess();syncClear();message('Ticket link saved locally. Status is updated manually.');}catch(err){message(err.message);e.target.value=state.access[ticketId].ticket;}}});
$('access-list').addEventListener('click',async e=>{const reviewId=e.target.dataset.reviewRequest;if(reviewId){liveRequests.openReview(profile.access.find(x=>x.id===reviewId),state.hire);return;}const id=e.target.dataset.copy;if(!id)return;const draft=draftRequest(profile.access.find(x=>x.id===id),state.hire);try{await navigator.clipboard.writeText(draft.text);message('Draft copied. Review and submit it yourself; nothing was sent.');}catch{message('Clipboard unavailable. Select and copy the draft text.');}});
$('step-list').addEventListener('click',e=>{const id=e.target.dataset.step;if(!id)return;const step=profile.steps.find(s=>s.id===id);if(state.completedSteps.includes(id)){const remove=new Set([id]);let changed=true;while(changed){changed=false;for(const s of profile.steps)if(!remove.has(s.id)&&s.dependsOn.some(d=>remove.has(d))){remove.add(s.id);changed=true;}}state.completedSteps=state.completedSteps.filter(x=>!remove.has(x));}else if(!dependencyStatus(step,state.access,state.completedSteps).length)state.completedSteps.push(id);persist();renderSteps();syncClear();});
$('clear').addEventListener('click',()=>{if(!confirm('Clear this browser’s saved plan and imported report?'))return;state=normalizeState({},profile);report=null;persist();fillForm();render();renderReport();$('report-file').value='';message('Local plan cleared. No tickets or machine configuration were changed.');});
$('report-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1024*1024)throw Error('Report must be under 1 MB.');const candidate=validateReport(JSON.parse(await file.text()));report=candidate;renderReport();message('Report imported. Request status and setup completion remain separate.');}catch(err){message(err.message);}});
