const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let actors = [], actorId = '', selectedId = '', hires = [], nextOffset = null, version = 0;
let busy = false;
try { actorId = sessionStorage.getItem('onboarding-demo-actor') || ''; } catch { /* Selection still works without browser storage. */ }
const pendingCommands = new Map();
function feedback(message, error = false) { $('feedback').textContent = message; $('feedback').dataset.error = String(error); }
async function api(path, method = 'GET', body) {
  const headers = { 'X-Demo-Actor-Id': actorId };
  let pendingKey;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    // A lost response can be retried from the unchanged form without creating another record.
    pendingKey = JSON.stringify([actorId, path, method, body]);
    if (!pendingCommands.has(pendingKey)) pendingCommands.set(pendingKey, crypto.randomUUID());
    headers['Idempotency-Key'] = pendingCommands.get(pendingKey);
  }
  const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) {
    if (response.status < 500) pendingCommands.delete(pendingKey);
    throw Error(payload.error?.message || 'Request failed.');
  }
  if (pendingKey) pendingCommands.delete(pendingKey);
  return payload.data;
}
function currentActor() { return actors.find(a => a.id === actorId); }
const displayName = actor => actor.name.replace(/\s*\([^)]*\)/g, '').trim();
const roleLabel = actor => actor.role === 'em' ? 'Engineering manager' : actor.role === 'network' ? `Network team · ${actor.locations.join(', ')}` : 'Team member';
const initials = actor => displayName(actor).split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
function renderProfile() {
  const actor = currentActor();
  $('profile-initials').textContent = initials(actor);
  $('profile-name').textContent = displayName(actor);
  $('profile-role').textContent = roleLabel(actor);
  $('profile-toggle').setAttribute('aria-label', `Profile: ${displayName(actor)}. Switch account`);
  $('profile-accounts').innerHTML = actors.map(a => `<button class="account-option" data-actor="${esc(a.id)}" aria-pressed="${a.id === actorId}" ${busy ? 'disabled' : ''}><span class="avatar" aria-hidden="true">${esc(initials(a))}</span><span>${esc(displayName(a))}<small>${esc(roleLabel(a))}</small></span></button>`).join('');
}
async function loadActors() {
  actors = await api('/api/demo/actors');
  if (!actors.some(a => a.id === actorId)) actorId = actors[0]?.id || '';
  renderProfile();
}
function renderList() {
  $('hires').innerHTML = hires.length ? hires.map(h => `<button class="hire-choice" data-hire="${esc(h.id)}" aria-pressed="${h.id === selectedId}"><strong>${esc(h.name)}</strong><span>${esc(h.location)} · ${esc(h.startDate)}</span><span>${h.adminRequired ? 'Admin access required' : 'Standard access'}</span></button>`).join('') : '<p>No onboarding plans yet.</p>';
  $('list-summary').textContent = currentActor().role === 'hire' ? 'Your account, device and access progress in one place.' : `${hires.length} teammate${hires.length === 1 ? '' : 's'}${currentActor().role === 'network' ? ' assigned to your location' : ' joining your team'}`;
  $('more').hidden = nextOffset === null;
}
async function refresh({ more = false } = {}) {
  const token = ++version;
  const actor = currentActor();
  const personal = actor.role === 'hire';
  $('create-section').hidden = actor.role !== 'em';
  $('hire-sidebar').hidden = personal;
  $('workspace').classList.toggle('personal', personal);
  $('planner-link').hidden = !personal;
  $('intro-eyebrow').textContent = actor.role === 'em' ? 'ENGINEERING MANAGER' : actor.role === 'network' ? 'NETWORK OPERATIONS' : 'YOUR ONBOARDING';
  $('intro-title').textContent = actor.role === 'em' ? 'Build a great first day.' : actor.role === 'network' ? 'Get your teammates connected.' : `Welcome, ${displayName(actor)}.`;
  $('intro-description').textContent = actor.role === 'em' ? 'Welcome new teammates, plan their access, and follow their progress.' : actor.role === 'network' ? 'Prepare accounts and devices, assign access, and resolve onboarding blockers.' : 'Follow your progress and find everything you need to get started.';
  document.title = `${roleLabel(actor)} · DT onboarding`;
  $('scope').textContent = actor.role === 'em' ? 'Your hires · Toronto and Berlin' : actor.role === 'network' ? `Network queue · ${actor.locations.join(', ')}` : 'Your onboarding progress';
  $('list-title').textContent = actor.role === 'network' ? 'Accounts awaiting your team.' : actor.role === 'hire' ? 'Your onboarding.' : 'Your incoming teammates.';
  const page = await api(`/api/hires?offset=${more ? nextOffset : 0}`);
  if (token !== version) return;
  hires = more ? [...hires, ...page.items] : page.items;
  nextOffset = page.nextOffset;
  if (!hires.some(h => h.id === selectedId)) selectedId = hires[0]?.id || '';
  renderList();
  if (selectedId) await loadDetail(selectedId);
  else $('detail').innerHTML = '<p>No onboarding plan to display.</p>';
}
function actionButton(type, resource, action, label) { return `<button class="secondary" data-kind="${type}" data-resource="${esc(resource)}" data-action="${action}">${label}</button>`; }
async function loadDetail(hireId) {
  const token = version;
  const d = await api(`/api/hires/${hireId}`);
  if (token !== version || selectedId !== hireId) return;
  const network = currentActor().role === 'network';
  $('detail').innerHTML = `<p class="eyebrow">${esc(d.location)} · Dealertrack developer</p><h2>${esc(d.name)}</h2><p>Starts ${esc(d.startDate)}</p>
    <span class="badge">SIMULATED ACCESS</span>
    <h3>${d.blockers.length ? 'What needs attention' : 'Onboarding plan complete'}</h3>
    ${d.blockers.length ? `<ul>${d.blockers.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : '<p>All simulated onboarding steps are complete. Actual access remains unverified.</p>'}
    <h3>Account & device</h3>
    ${network ? `<form id="account-form" data-hire-id="${esc(d.id)}"><div class="account-grid"><label>AD ID<input name="adId" required maxlength="300" value="${esc(d.account?.adId)}"></label><label>Work email<input name="workEmail" type="email" required maxlength="300" value="${esc(d.account?.workEmail)}"></label><label>Laptop ID<input name="laptopId" required maxlength="300" value="${esc(d.account?.laptopId)}"></label></div><div class="actions"><button>Save account details</button></div></form><div class="actions"><button data-provision="${esc(d.id)}" ${d.account ? '' : 'disabled'}>Queue mock provisioning</button></div>` : `<dl><dt>AD ID</dt><dd>${esc(d.account?.adId || 'Awaiting network team')}</dd><dt>Work email</dt><dd>${esc(d.account?.workEmail || 'Not recorded')}</dd><dt>Laptop ID</dt><dd>${esc(d.account?.laptopId || 'Not recorded')}</dd></dl>`}
    <h3>Requested groups</h3><ul>${d.requestedGroups.map(g => `<li>${esc(g)}</li>`).join('')}</ul>
    ${d.assignments.map(a => `<div class="resource"><strong>${esc(a.group)}</strong><p>Mock · ${esc(a.status)} · ${a.attempts} attempt(s)</p>${a.error ? `<p>${esc(a.error)}</p>` : ''}${network ? `<div class="actions">${a.status === 'pending' ? actionButton('assignments', a.id, 'success', 'Simulate success') + actionButton('assignments', a.id, 'failure', 'Simulate failure') : a.status === 'failed' ? actionButton('assignments', a.id, 'retry', 'Retry failed group') : ''}</div>` : ''}</div>`).join('')}
    <h3>Access requests</h3>${d.requests.map(r => `<div class="resource"><strong>${esc(r.kind)} request</strong><p>Mock · ${esc(r.status)}${r.ticket ? ` · ${esc(r.ticket.key)}` : ''}</p>${r.kind === 'admin' ? '<p>Dedicated-form route; separate from Slack.</p>' : ''}${network ? `<div class="actions">${r.status === 'pending' ? actionButton('requests', r.id, 'ticket', 'Create fictional ticket') : r.kind === 'admin' && r.status === 'ticket-created' ? actionButton('requests', r.id, 'grant', 'Simulate grant') + actionButton('requests', r.id, 'deny', 'Simulate denial') : r.kind === 'admin' && r.status === 'granted' ? actionButton('requests', r.id, 'verify', 'Simulate verification') : ''}</div>` : ''}</div>`).join('')}
    <h3>Recent activity</h3><ul>${d.events.map(e => `<li>${esc(e.type.replaceAll('-', ' '))} · ${esc(new Date(e.createdAt).toLocaleString())}</li>`).join('')}</ul>
    <p class="fine">Real workstation readiness: ${esc(d.realReadiness)}.</p>`;
}
async function run(action) {
  if (busy) return;
  busy = true;
  $('refresh').disabled = true;
  document.querySelectorAll('button').forEach(b => { if (!b.disabled) { b.dataset.pending = 'true'; b.disabled = true; } });
  try { await action(); feedback('Up to date.'); }
  catch (error) { feedback(error.message, true); }
  finally {
    busy = false; $('refresh').disabled = false;
    document.querySelectorAll('[data-pending]').forEach(b => { b.disabled = false; delete b.dataset.pending; });
    renderProfile();
  }
}
$('profile-accounts').addEventListener('click', event => {
  const option = event.target.closest('[data-actor]');
  if (!option || busy) return;
  actorId = option.dataset.actor; selectedId = ''; version++;
  try { sessionStorage.setItem('onboarding-demo-actor', actorId); } catch { /* In-memory selection remains available. */ }
  $('profile-menu').open = false;
  $('profile-toggle').focus();
  $('create-form').reset();
  renderProfile();
  hires = []; nextOffset = null; renderList();
  $('detail').innerHTML = '<p>Loading your workspace…</p>';
  run(() => refresh());
});
document.addEventListener('click', event => { if (!$('profile-menu').contains(event.target)) $('profile-menu').open = false; });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('profile-menu').open) { $('profile-menu').open = false; $('profile-toggle').focus(); }
});
$('refresh').addEventListener('click', () => run(async () => { await loadActors(); await refresh(); }));
$('more').addEventListener('click', () => run(() => refresh({ more: true })));
$('hires').addEventListener('click', event => {
  const button = event.target.closest('[data-hire]');
  if (button) run(async () => { selectedId = button.dataset.hire; version++; renderList(); await loadDetail(selectedId); });
});
$('create-form').addEventListener('submit', event => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.target));
  body.requestedGroups = body.requestedGroups.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  body.adminRequired = body.adminRequired === 'true';
  run(async () => {
    const hire = await api('/api/hires', 'POST', body);
    selectedId = hire.id; event.target.reset(); await loadActors(); await refresh();
  });
});
$('detail').addEventListener('submit', event => {
  if (event.target.id !== 'account-form') return;
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.target));
  run(async () => { await api(`/api/hires/${event.target.dataset.hireId}/account`, 'PUT', body); await refresh(); });
});
$('detail').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button?.dataset.provision) run(async () => { await api(`/api/hires/${button.dataset.provision}/provision`, 'POST', {}); await refresh(); });
  else if (button?.dataset.action) run(async () => { await api(`/api/${button.dataset.kind}/${button.dataset.resource}/actions`, 'POST', { action: button.dataset.action }); await refresh(); });
});
try { await loadActors(); await refresh(); }
catch (error) { feedback(`Portal unavailable: ${error.message}`, true); }
