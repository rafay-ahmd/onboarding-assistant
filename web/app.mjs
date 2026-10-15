import {mountLiveRequests} from './live-requests.mjs';
import {accessCardStatus} from './request-queue.mjs';
import {createRequestQueue} from './request-queue-ui.mjs';
import {accessProgress,accessStatuses,draftRequest,dependencyStatus,reconcileCompletions,validateReport,validateTicketUrl,normalizeState,planStorageKey} from './model.mjs';
const catalog = await fetch('/profiles.json').then(r => {if(!r.ok) throw Error('Profile catalog unavailable'); return r.json();});
const requestedProfile = new URL(location.href).searchParams.get('profile') || 'dealertrack-developer';
const selected = catalog.find(p=>p.id===requestedProfile);
if(!selected){document.getElementById('profile-notice').innerHTML='Unknown onboarding profile. <a href="/planner">Return to the default profile</a>.';throw Error('Unknown onboarding profile.');}
const profile = await fetch(selected.url).then(r => {if(!r.ok) throw Error('Profile unavailable'); return r.json();});
const storageKey = planStorageKey(profile.id);
let saved;
try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch {}
let state = normalizeState(saved,profile);
let report = null;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(text){$('message').textContent=text;}
$('profile-selector').innerHTML=catalog.map(p=>`<option value="${esc(p.id)}" ${p.id===profile.id?'selected':''}>${esc(p.name)}</option>`).join('');
$('profile-selector').addEventListener('change',e=>{const url=new URL(location.href);url.searchParams.set('profile',e.target.value);location.assign(url.href);});
document.title=profile.name+' · Onboarding workspace';
const localDraft=profile.id==='cms-developer';
$('local-plan').hidden=!localDraft;
$('request-queue').hidden=!localDraft;
$('slack-connection').hidden=localDraft;
$('profile-notice').textContent=localDraft?`${profile.name} · ${profile.reviewStatus}. CMS requests run locally for this draft; no external messages are sent.`:`${profile.name} · ${profile.reviewStatus}. Requests use the connected Slack account. Review each message before sending; verified access is recorded separately from approval.`;
$('github-team-field').hidden=!localDraft;
$('cms-repository-field').hidden=profile.id!=='cms-developer';
$('cms-subteam-field').hidden=profile.id!=='cms-developer';
$('cms-mirror-field').hidden=profile.id!=='cms-developer';
const inventorySupported=profile.inventorySupported!==false;
$('inventory-controls').hidden=!inventorySupported;
$('inventory-unavailable').hidden=inventorySupported;
$('report-list').hidden=!inventorySupported;
if(profile.openQuestions?.length){$('profile-questions').hidden=false;$('profile-questions').innerHTML='<h2>Confirm with the CMS engineering manager</h2><p>These unresolved requirements block the setup journey until the EM review is recorded. Documented group mappings are not automatic approval.</p><ul>'+profile.openQuestions.map(q=>`<li>${esc(q)}</li>`).join('')+'</ul>';}
if(profile.confirmedRequirements?.length){$('profile-confirmations').hidden=false;$('profile-confirmations').innerHTML='<h2>Confirmed CMS baseline</h2><ul>'+profile.confirmedRequirements.map(q=>`<li>${esc(q)}</li>`).join('')+'</ul><p class="fine">'+esc(profile.confirmationSource)+'</p>';}
$('profile-sources').innerHTML='<details><summary>Profile source documents</summary><ul>'+profile.sources.map(url=>`<li><a href="${esc(url)}" target="_blank" rel="noopener">${esc(new URL(url).pathname.split('/').filter(Boolean).slice(-2).join(' / ').replaceAll('-',' ').replaceAll('+',' '))}</a>${profile.sourceDocuments?.find(doc=>doc.url===url)?.status?` — ${esc(profile.sourceDocuments.find(doc=>doc.url===url).status)}`:''}</li>`).join('')+(profile.additionalReferences||[]).map(ref=>`<li><a href="${esc(ref.url)}" target="_blank" rel="noopener">${esc(ref.title)}</a> — ${esc(ref.reviewStatus)}</li>`).join('')+'</ul></details>';
let liveRequests=null;
let linkedRequests=[];
const requestQueue=localDraft?createRequestQueue({profile,container:$('request-queue'),notify:message,onChange:syncQueueCards}):null;
function syncQueueCards(requests=[]){
  if(!localDraft){updateAccessProgress(linkedRequests);liveRequests?.render();return;}
  for(const badge of document.querySelectorAll('[data-access-status]')){
    const id=badge.dataset.accessStatus;
    const actual=state.access[id].status;
    const display=accessCardStatus(requests,profile.id,state.hire.email,id,actual);
    badge.textContent=display.label.replace(/^Mock · /,'');
    badge.className='status '+display.status;
    badge.title=display.simulated?'Local queue progress. Actual access has not been changed.':'Actual access status, recorded manually.';
    const card=badge.closest('[data-access]');
    const note=card.querySelector('[data-status-source]');
    note.textContent=display.simulated?'Status updates from the local draft queue. No live access has been changed.':'Track this access manually until a request enters the queue.';
    card.querySelector('[data-automatic-status]').hidden=!display.simulated;
    card.querySelector('[data-automatic-value]').value=display.status.replaceAll('-',' ')+(display.simulated?' (local draft)':'');
    const manual=card.querySelector('[data-manual-record]');
    const mode=display.simulated?'automatic':'manual';
    if(manual.dataset.mode!==mode){manual.open=!display.simulated;manual.dataset.mode=mode;}
    card.querySelector('[data-manual-summary]').textContent=display.simulated?'Separate manual record for real access':'Manual access tracking';
  }
  const actualCount=profile.access.filter(x=>state.access[x.id].status==='verified').length;
  const mockCount=requests.filter(r=>r.status==='verified').length;
  $('access-count').textContent=mockCount+' DRAFT VERIFIED · '+actualCount+' / '+profile.access.length+' REAL VERIFIED';
  updateAccessProgress([]);
}
function updateAccessProgress(requests){
 linkedRequests=requests;
 let changed=false;
 for(const r of (localDraft?[]:requests))if(r.profileId===profile.id&&r.status==='verified'&&state.access[r.accessId]&&state.access[r.accessId].status!=='verified'){state.access[r.accessId].status='verified';changed=true;}
 if(changed){persist();renderSteps();}
 const {verified,total,percent}=accessProgress(profile,state.access,requests);
 if(!localDraft)$('access-count').textContent=verified+' / '+total+' ACCESS VERIFIED';
 $('access-progress-value').textContent=percent+'%';
 $('access-progress').value=percent;
 $('access-progress').setAttribute('aria-valuetext',verified+' of '+total+' permissions verified');
 $('access-progress-detail').textContent=verified+' of '+total+' permissions verified. Completed means you have checked that access works.';
}
function persist(){state.completedSteps=reconcileCompletions(profile,state.access,state.completedSteps);try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{message('Browser storage is unavailable. Keep this page open; changes will not persist.');}}
function fillForm(){for(const [key,value] of Object.entries(state.hire)) $('hire-form').elements[key].value=value;}
function renderAccess(){
  requestQueue?.setHire(state.hire);
  $('access-count').textContent=`${profile.access.filter(x=>state.access[x.id].status==='verified').length} / ${profile.access.length} ACCESS VERIFIED`;
  $('access-list').innerHTML=profile.access.map(item=>{
    const draft=draftRequest(item,state.hire,profile), tracked=state.access[item.id];
    return `<article class="card" data-access="${esc(item.id)}"><div class="card-top"><div><h3>${esc(item.name)}</h3><span class="tag">${esc(item.routeLabel || (item.route==='helpdesk'?'Separate helpdesk message':item.route==='form'?'Dedicated service-desk form':'Confirm route with team'))}${item.priority?' · '+esc(item.priority):''}</span></div><span data-access-status="${esc(item.id)}" class="status ${tracked.status}">${esc(tracked.status.replaceAll('-',' '))}</span></div><p class="fine" data-status-source></p><div data-automatic-status hidden><label>Request status (automatic)<input data-automatic-value readonly aria-label="${esc(item.name)} automatic request status"></label></div><p>${esc(item.reason)}</p><p class="fine">Basis: ${esc(item.evidence)}${item.source?` · <a href="${esc(item.source)}" target="_blank" rel="noopener">Documentation</a>`:''}</p>${item.route==='helpdesk'?`<p><button class="secondary" data-review-request="${esc(item.id)}" ${localDraft&&draft.missing.length?'disabled':''}>${localDraft?'Review draft request':'Review request'}</button></p>`:''}${localDraft?(draft.missing.length?`<p>Complete: ${esc(draft.missing.join(', '))} to prepare this request.</p>`:`<details><summary>${item.route==='form'?'Information for your form':item.route==='team'?'Draft for the owner':'Helpdesk draft'}</summary><textarea aria-label="${esc(item.name)} request draft" readonly>${esc(draft.text)}</textarea><button data-copy="${esc(item.id)}" class="secondary">Copy draft</button></details>`):''}${item.route==='team'?'<p class="fine">Contact your engineering manager or team owner to arrange this access, then record its status below.</p>':''}${!localDraft?`<div data-live-slot="${esc(item.id)}"></div>`:''}${item.url?`<p><a class="link-button" href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.urlLabel || 'Open required form')}</a></p>`:''}<details data-manual-record open><summary data-manual-summary>Manual access tracking</summary><div class="card-actions"><label>Actual access status (manual)<select data-status="${esc(item.id)}">${accessStatuses.map(s=>`<option value="${s}" ${s===tracked.status?'selected':''}>${s.replaceAll('-',' ')}</option>`).join('')}</select></label><label>Real helpdesk ticket link <span>Optional</span><input data-ticket="${esc(item.id)}" aria-label="Real helpdesk ticket link" type="url" placeholder="Paste an existing ticket URL" value="${esc(tracked.ticket)}"><span class="field-hint">Saved link only. Ticket status is not synced.</span></label>${tracked.ticket?`<a href="${esc(tracked.ticket)}" target="_blank" rel="noopener">View ticket ↗</a>`:''}</div></details></article>`;
  }).join('');
  syncQueueCards(requestQueue?.getRequests()||[]);
}
function renderSteps(){
  const name=id=>profile.access.find(x=>x.id===id)?.name||profile.steps.find(x=>x.id===id)?.name||id;
  $('step-list').innerHTML=profile.steps.map(s=>{const pending=dependencyStatus(s,state.access,state.completedSteps),done=state.completedSteps.includes(s.id);return `<article class="card"><div class="card-top"><h3>${esc(s.name)}</h3><span class="status ${done?'verified':pending.length?'blocked':'unverified'}">${done?'Recorded complete':pending.length?'Dependencies pending':'Ready to review'}</span></div><span class="tag">${esc(s.mode)}</span><p>${esc(s.action)}</p><p><strong>Verify:</strong> ${esc(s.verification)}</p>${pending.length?`<p><strong>Waiting for:</strong> ${esc(pending.map(name).join(', '))}</p>`:''}<button class="secondary step-button" data-step="${esc(s.id)}" ${pending.length&&!done?'disabled':''}>${done?'Undo recorded completion':'Record completion manually'}</button></article>`;}).join('');
}
function renderReport(){if(!report){$('report-list').innerHTML='<p class="empty">No report loaded. Run the checker and import your report.</p>';return;}
  const counts={};for(const c of report.checks)counts[c.status]=(counts[c.status]||0)+1;
  $('report-list').innerHTML=`<p class="fine">${report.demo?'FICTIONAL DEMO · ':''}Inspection time: ${esc(new Date(report.generatedAt).toLocaleString())}. Report import is not an independent verification of this machine.</p><div class="summary">${Object.entries(counts).map(([s,n])=>`<span class="status ${s}">${n} ${s}</span>`).join('')}</div>${report.checks.map(c=>`<article class="card check"><div><h3>${esc(c.name)}</h3><p>${esc(c.detail)}</p></div><span class="status ${c.status}">${c.status}</span></article>`).join('')}`;
}
function render(){renderAccess();renderSteps();}
fillForm();render();
if(!localDraft)liveRequests=mountLiveRequests({container:$('slack-connection'),cards:$('access-list'),profile,notify:message,onRequestsChange:updateAccessProgress,onVerified:r=>{
  if(r.profileId===profile.id && state.access[r.accessId]){
    state.access[r.accessId].status='verified';persist();render();
  }
}});

$('hire-form').addEventListener('input',e=>{state.hire[e.target.name]=e.target.value;persist();render();});
$('hire-form').addEventListener('submit',e=>e.preventDefault());
document.querySelector('nav').addEventListener('click',e=>{const tab=e.target.dataset.tab;if(!tab)return;document.querySelectorAll('.tab').forEach(x=>x.hidden=x.id!==tab);document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('selected',x.dataset.tab===tab));message('');});
$('access-list').addEventListener('change',e=>{const statusId=e.target.dataset.status,ticketId=e.target.dataset.ticket;if(statusId){state.access[statusId].status=e.target.value;persist();render();}if(ticketId){try{state.access[ticketId].ticket=validateTicketUrl(e.target.value);persist();renderAccess();message('Ticket link saved locally. Status is updated manually.');}catch(err){message(err.message);e.target.value=state.access[ticketId].ticket;}}});
$('access-list').addEventListener('click',async e=>{const reviewId=e.target.dataset.reviewRequest;if(reviewId){if(localDraft)requestQueue.openReview(profile.access.find(x=>x.id===reviewId),state.hire);else liveRequests.openReview(profile.access.find(x=>x.id===reviewId));return;}const id=e.target.dataset.copy;if(!id)return;const draft=draftRequest(profile.access.find(x=>x.id===id),state.hire,profile);try{await navigator.clipboard.writeText(draft.text);message('Draft copied. Review and submit it yourself; nothing was sent.');}catch{message('Clipboard unavailable. Select and copy the draft text.');}});
$('step-list').addEventListener('click',e=>{const id=e.target.dataset.step;if(!id)return;const step=profile.steps.find(s=>s.id===id);if(state.completedSteps.includes(id)){const remove=new Set([id]);let changed=true;while(changed){changed=false;for(const s of profile.steps)if(!remove.has(s.id)&&s.dependsOn.some(d=>remove.has(d))){remove.add(s.id);changed=true;}}state.completedSteps=state.completedSteps.filter(x=>!remove.has(x));}else if(!dependencyStatus(step,state.access,state.completedSteps).length)state.completedSteps.push(id);persist();renderSteps();});
$('demo').addEventListener('click',()=>{if(!confirm('Replace this browser’s saved plan with a fictional demo hire?'))return;state=normalizeState({hire:{name:'Alex Example',email:'alex@example.invalid',manager:'Taylor Example',githubUsername:'alex-example',awsGroup:profile.id==='dealertrack-developer'?'TR-RO-AWS-DEALERTRACK-DEV':''}},profile);persist();fillForm();render();message(profile.id==='cms-developer'?'Fictional CMS demo loaded. Repository details and subteam-specific AWS groups are left blank until confirmed.':'Fictional demo loaded. The example AWS group still requires EM confirmation.');});
$('clear').addEventListener('click',()=>{if(!confirm('Clear this browser’s saved plan and imported report?'))return;state=normalizeState({},profile);report=null;persist();fillForm();render();renderReport();$('report-file').value='';message('Local plan cleared. No tickets or machine configuration were changed.');});
$('report-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1024*1024)throw Error('Report must be under 1 MB.');const candidate=validateReport(JSON.parse(await file.text()),profile.id);report=candidate;renderReport();message('Report imported. Request status and setup completion remain separate.');}catch(err){message(err.message);}});
