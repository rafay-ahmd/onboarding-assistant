const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let actors = [], actorId = '', selectedId = '', hires = [], nextOffset = null, version = 0;
let busy = false;
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
async function loadActors() {
  actors = await api('/api/demo/actors');
  $('actor').innerHTML = actors.map(a => `<option value="${esc(a.id)}">${esc(a.name)} · ${esc(a.role)}</option>`).join('');
  if (!actors.some(a => a.id === actorId)) actorId = actors[0]?.id || '';
  $('actor').value = actorId;
}
function renderList() {
  $('hires').innerHTML = hires.length ? hires.map(h => `<button class="hire-choice" data-hire="${esc(h.id)}" aria-pressed="${h.id === selectedId}"><strong>${esc(h.name)}</strong><span>${esc(h.location)} · ${esc(h.startDate)}</span><span>${h.adminRequired ? 'Admin access required' : 'Standard access'}</span></button>`).join('') : '<p>No hires are assigned to this actor yet.</p>';
  $('list-summary').textContent = `${hires.length} visible hire${hires.length === 1 ? '' : 's'} · filtered by your demo role`;
  $('more').hidden = nextOffset === null;
}
async function refresh({ more = false } = {}) {
  const token = ++version;
  const actor = currentActor();
  $('create-section').hidden = actor.role !== 'em';
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
  $('detail').innerHTML = `<p class="eyebrow">${esc(d.location)} · ${esc(d.profileId)}</p><h2>${esc(d.name)}</h2><p>Starts ${esc(d.startDate)}</p>
    <span class="badge">SIMULATED ONBOARDING · TEMPORARY STUBS</span>
    <h3>${d.blockers.length ? 'What needs attention' : 'Demo onboarding complete'}</h3>
    ${d.blockers.length ? `<ul>${d.blockers.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : '<p>All simulated onboarding steps are complete. Actual access remains unverified.</p>'}
    <h3>Account & device</h3>
    ${network ? `<form id="account-form" data-hire-id="${esc(d.id)}"><div class="account-grid"><label>AD ID<input name="adId" required maxlength="300" value="${esc(d.account?.adId)}"></label><label>Work email<input name="workEmail" type="email" required maxlength="300" value="${esc(d.account?.workEmail)}"></label><label>Laptop ID<input name="laptopId" required maxlength="300" value="${esc(d.account?.laptopId)}"></label></div><div class="actions"><button>Save account details</button></div></form><div class="actions"><button data-provision="${esc(d.id)}" ${d.account ? '' : 'disabled'}>Queue mock provisioning</button></div>` : `<dl><dt>AD ID</dt><dd>${esc(d.account?.adId || 'Awaiting network team')}</dd><dt>Work email</dt><dd>${esc(d.account?.workEmail || 'Not recorded')}</dd><dt>Laptop ID</dt><dd>${esc(d.account?.laptopId || 'Not recorded')}</dd></dl>`}
    <h3>Requested groups</h3><ul>${d.requestedGroups.map(g => `<li>${esc(g)}</li>`).join('')}</ul>
    ${d.assignments.map(a => `<div class="resource"><strong>${esc(a.group)}</strong><p>Mock · ${esc(a.status)} · ${a.attempts} attempt(s)</p>${a.error ? `<p>${esc(a.error)}</p>` : ''}${network ? `<div class="actions">${a.status === 'pending' ? actionButton('assignments', a.id, 'success', 'Simulate success') + actionButton('assignments', a.id, 'failure', 'Simulate failure') : a.status === 'failed' ? actionButton('assignments', a.id, 'retry', 'Retry failed group') : ''}</div>` : ''}</div>`).join('')}
    <h3>Mock requests</h3>${d.requests.map(r => `<div class="resource"><strong>${esc(r.kind)} request</strong><p>Mock · ${esc(r.status)}${r.ticket ? ` · ${esc(r.ticket.key)}` : ''}</p>${r.kind === 'admin' ? '<p>Dedicated-form route; separate from Slack.</p>' : ''}${network ? `<div class="actions">${r.status === 'pending' ? actionButton('requests', r.id, 'ticket', 'Create fictional ticket') : r.kind === 'admin' && r.status === 'ticket-created' ? actionButton('requests', r.id, 'grant', 'Simulate grant') + actionButton('requests', r.id, 'deny', 'Simulate denial') : r.kind === 'admin' && r.status === 'granted' ? actionButton('requests', r.id, 'verify', 'Simulate verification') : ''}</div>` : ''}</div>`).join('')}
    <h3>Recent activity</h3><ul>${d.events.map(e => `<li>${esc(e.type.replaceAll('-', ' '))} · ${esc(new Date(e.createdAt).toLocaleString())}</li>`).join('')}</ul>
    <p class="fine">Real workstation readiness: ${esc(d.realReadiness)}. The separate local planner retains its own browser data.</p>`;
}
async function run(action) {
  if (busy) return;
  busy = true;
  $('actor').disabled = true;
  $('refresh').disabled = true;
  document.querySelectorAll('button').forEach(b => { if (!b.disabled) { b.dataset.pending = 'true'; b.disabled = true; } });
  try { await action(); feedback('Shared demo data updated.'); }
  catch (error) { feedback(error.message, true); }
  finally {
    busy = false; $('actor').disabled = false; $('refresh').disabled = false;
    document.querySelectorAll('[data-pending]').forEach(b => { b.disabled = false; delete b.dataset.pending; });
  }
}
$('actor').addEventListener('change', () => {
  actorId = $('actor').value; selectedId = ''; version++;
  hires = []; nextOffset = null; renderList();
  $('detail').innerHTML = '<p>Loading this actor’s onboarding plans…</p>';
  run(() => refresh());
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
