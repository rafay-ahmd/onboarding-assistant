const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Small, local SVG set: decorative icons always accompany visible text.
const iconPaths = {
  attention: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v4m0 4h.01"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  device: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  groups: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5v1"/>',
  key: '<circle cx="8" cy="9" r="5"/><path d="m12 13 8 8m-4-4 3-3m-6 0 3-3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  ticket: '<path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5Z"/><path d="M15 5v3m0 3v2m0 3v3"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>'
};
const icon = name => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconPaths[name]}</svg>`;
$('refresh').insertAdjacentHTML('afterbegin', icon('refresh'));
$('create-form').querySelector('button[type="submit"]').insertAdjacentHTML('afterbegin', icon('plus'));
let actors = [], actorId = '', selectedId = '', hires = [], nextOffset = null, version = 0;
let busy = false;
let onboardingProfiles = [], editingProfileId = '', editingRevision = null;
let locationDefaults = [], editingLocationRevision = null;
const formBaselines = new WeakMap();
const formValues = form => JSON.stringify([...new FormData(form)].map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
function canSubmit(form) {
  const values = [...new FormData(form)];
  for (const field of form.querySelectorAll('input[type="email"]')) {
    field.setCustomValidity(field.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value.trim()) ? 'Enter a valid email address.' : '');
  }
  for (const groups of form.querySelectorAll('[data-groups]')) {
    const names = groups.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const max = Number(groups.dataset.maxGroups || 30);
    groups.setCustomValidity((!names.length && groups.dataset.allowEmpty !== 'true') || names.length > max || names.some(name => name.length > 300) ? `Enter up to ${max} groups, up to 300 characters each.` : '');
  }
  return !busy && values.every(([key, value]) => !form.elements[key].required || String(value).trim())
    && formValues(form) !== formBaselines.get(form) && form.checkValidity();
}
function syncForm(form) {
  form.querySelector('button[type="submit"], button:not([type])').disabled = !canSubmit(form);
  if (form.id === 'account-form') {
    const provision = $('detail').querySelector('[data-provision]');
    provision.disabled = busy || provision.dataset.available !== 'true' || formValues(form) !== formBaselines.get(form);
    provision.title = formValues(form) !== formBaselines.get(form) ? 'Save account changes before provisioning.' : '';
  }
}
function trackForm(form) {
  formBaselines.set(form, formValues(form));
  form.addEventListener('input', () => syncForm(form));
  form.addEventListener('change', () => syncForm(form));
  syncForm(form);
}
trackForm($('create-form'));
trackForm($('profile-form'));
trackForm($('location-form'));
try { actorId = sessionStorage.getItem('onboarding-demo-actor') || ''; } catch { /* Selection still works without browser storage. */ }
const pendingCommands = new Map();
function feedback(message, error = false) { $('feedback').textContent = String(message).replace(/\bmock\s*/gi, ''); $('feedback').dataset.error = String(error); }
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
function groupNames(value) { return value.split(/\r?\n/).map(s => s.trim()).filter(Boolean); }
function applyProfileDefaults() {
  const form = $('create-form');
  const profile = onboardingProfiles.find(p => p.id === form.elements.profileId.value);
  form.elements.requestedGroups.value = profile?.groups.join('\n') || '';
  form.elements.adminRequired.value = String(profile?.adminRequired ?? false);
  renderLocationPreview();
  syncForm(form);
}
function renderLocationPreview() {
  const defaults = locationDefaults.find(item => item.id === $('create-form').elements.location.value);
  $('location-defaults-preview').textContent = defaults?.groups.length ? `Also added by the ${defaults.id} network team: ${defaults.groups.join(', ')}` : 'No additional location groups configured by the network team.';
}
function editLocationDefaults() {
  const defaults = locationDefaults.find(item => item.id === $('location-editor-select').value);
  editingLocationRevision = defaults?.revision ?? null;
  $('location-form').elements.groups.value = defaults?.groups.join('\n') || '';
  formBaselines.set($('location-form'), formValues($('location-form')));
  syncForm($('location-form'));
}
async function loadLocationDefaults() {
  locationDefaults = (await api('/api/location-defaults')).items;
  const previous = $('location-editor-select').value;
  $('location-editor-select').innerHTML = locationDefaults.map(item => `<option value="${esc(item.id)}">${esc(item.id)}</option>`).join('');
  $('location-editor-select').value = locationDefaults.some(item => item.id === previous) ? previous : locationDefaults[0]?.id || '';
  renderLocationPreview();
  if (currentActor().role === 'network') editLocationDefaults();
}
function editProfile() {
  editingProfileId = $('profile-editor-select').value;
  const profile = onboardingProfiles.find(p => p.id === editingProfileId);
  editingRevision = profile?.revision ?? null;
  const form = $('profile-form');
  form.reset();
  form.elements.namedItem('name').value = profile?.name || '';
  form.elements.adminRequired.value = String(profile?.adminRequired ?? false);
  form.elements.groups.value = profile?.groups.join('\n') || '';
  $('save-profile').textContent = profile ? 'Save profile changes' : 'Create profile';
  formBaselines.set(form, formValues(form));
  syncForm(form);
}
async function loadProfiles() {
  const { items } = await api('/api/profiles');
  onboardingProfiles = items;
  const form = $('create-form');
  const previous = form.elements.profileId.value;
  const options = items.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  form.elements.profileId.innerHTML = '<option value="">Choose a profile</option>' + options;
  form.elements.profileId.value = items.some(p => p.id === previous) ? previous : items[0]?.id || '';
  $('profile-editor-select').innerHTML = '<option value="">Create a new profile</option>' + options;
  $('profile-editor-select').value = editingProfileId;
  if (!previous) applyProfileDefaults();
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
  $('profiles-section').hidden = actor.role !== 'em';
  $('location-section').hidden = actor.role !== 'network';
  if (['em', 'network'].includes(actor.role)) await loadLocationDefaults();
  if (actor.role === 'em') await loadProfiles();
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
function actionButton(type, resource, action, label) { return `<button class="secondary" data-kind="${type}" data-resource="${esc(resource)}" data-action="${action}">${icon(({ success: 'check', failure: 'attention', retry: 'refresh', ticket: 'ticket', grant: 'key', deny: 'close', verify: 'check' })[action])}${label}</button>`; }
async function loadDetail(hireId) {
  const token = version;
  const d = await api(`/api/hires/${hireId}`);
  if (token !== version || selectedId !== hireId) return;
  $('planner-link').href='/planner?hireId='+encodeURIComponent(d.id)+'&profile='+encodeURIComponent(d.profileId);
  $('planner-link').hidden=currentActor().role!=='hire'||!d.accessSummary?.supported;
  const network = currentActor().role === 'network';
  const provisioningQueued = d.requestedGroups.every(group => d.assignments.some(a => a.group === group))
    && (!d.adminRequired || d.requests.some(r => r.kind === 'admin'));
  const groupStatus = status => ({ pending: 'Awaiting assignment', succeeded: 'Assigned', failed: 'Assignment failed' })[status] || status;
  $('detail').innerHTML = `<p class="eyebrow">${esc(d.location)} · ${esc(d.profileName || d.profileId)}</p><h2>${esc(d.name)}</h2><p>Starts ${esc(d.startDate)}</p>
    <span class="badge">ONBOARDING PROGRESS</span>
    ${d.accessSummary?.supported?`<section class="access-progress panel"><div class="progress-heading"><strong>Slack access requests</strong><strong>${d.accessSummary.percent}%</strong></div><progress max="100" value="${d.accessSummary.percent}" aria-label="Verified Slack access"></progress><p>${d.accessSummary.verified} / ${d.accessSummary.total} verified · ${d.accessSummary.waiting} awaiting follow-up</p><p class="fine">Shared with this hire’s access workflow. Approval is separate from actual access verification.</p>${currentActor().role==='hire'?`<a href="/planner?hireId=${encodeURIComponent(d.id)}">Open access requests and workstation setup →</a>`:''}</section>`:''}
    <section class="attention-box ${d.blockers.length ? '' : 'complete'}" aria-labelledby="attention-title">
      ${icon(d.blockers.length ? 'attention' : 'check')}
      <div><h3 id="attention-title">${d.blockers.length ? 'What needs attention' : 'Onboarding plan complete'}</h3>
      ${d.blockers.length ? `<ul>${d.blockers.map(b => `<li>${esc(d.assignments.some(a => a.status === 'pending' && b === `${a.group}: pending`) ? b.replace(/: pending$/, ': awaiting assignment') : b.replace(/Simulated /g, ""))}</li>`).join('')}</ul>` : '<p>Your onboarding plan is complete.</p>'}</div>
    </section>
    <h3 class="icon-heading">${icon('device')}Account & device</h3>
    ${network ? `<form id="account-form" data-hire-id="${esc(d.id)}"><div class="account-grid"><label>AD ID<input name="adId" required maxlength="300" ${d.assignments.length ? 'readonly title="AD ID is locked after provisioning starts."' : ''} value="${esc(d.account?.adId)}"></label><label>Work email<input name="workEmail" type="email" required maxlength="300" value="${esc(d.account?.workEmail)}"></label><label>Laptop ID<input name="laptopId" required maxlength="300" value="${esc(d.account?.laptopId)}"></label></div><div class="actions"><button>Save account details</button></div></form><div class="actions"><button data-provision="${esc(d.id)}" data-available="${!!d.account && !provisioningQueued}" ${!d.account || provisioningQueued ? 'disabled' : ''}>${icon('key')}${provisioningQueued ? 'Access queued' : 'Provision access'}</button></div><p class="fine">${!d.account ? 'Save account details before provisioning access.' : provisioningQueued ? 'Access work is queued. Resolve each group below; repeated provisioning will not create duplicates.' : 'Queue the requested group assignments and any required admin access.'}</p>` : `<dl><dt>AD ID</dt><dd>${esc(d.account?.adId || 'Awaiting network team')}</dd><dt>Work email</dt><dd>${esc(d.account?.workEmail || 'Not recorded')}</dd><dt>Laptop ID</dt><dd>${esc(d.account?.laptopId || 'Not recorded')}</dd></dl>`}
    <h3 class="icon-heading">${icon('groups')}Requested groups</h3><ul>${d.requestedGroups.map(g => `<li>${esc(g)}</li>`).join('')}</ul>
    ${d.assignments.map(a => `<div class="resource"><strong>${esc(a.group)}</strong><p>${esc(groupStatus(a.status))} · ${a.attempts} attempt(s)</p>${a.status === 'pending' ? `<p class="fine">${network ? 'Choose Mark assigned once group membership is confirmed, or Record failure if it could not be assigned.' : 'The network team is preparing this group membership.'}</p>` : ''}${a.error ? `<p>${esc(a.error.replace(/^Simulated /, ""))}</p>` : ''}${network ? `<div class="actions">${a.status === 'pending' ? actionButton('assignments', a.id, 'success', 'Mark assigned') + actionButton('assignments', a.id, 'failure', 'Record failure') : a.status === 'failed' ? actionButton('assignments', a.id, 'retry', 'Retry failed group') : ''}</div>` : ''}</div>`).join('')}
    <h3 class="icon-heading">${icon('key')}Access requests</h3>${d.requests.filter(r=>r.provider!=='slack').map(r => `<div class="resource"><strong>${esc(r.kind)} request</strong><p>${esc(r.status)}${r.ticket ? ` · ${esc(r.ticket.key)}` : ''}</p>${r.kind === 'admin' ? '<p>Dedicated-form route; separate from Slack.</p>' : ''}${network ? `<div class="actions">${r.status === 'pending' ? actionButton('requests', r.id, 'ticket', 'Create ticket') : r.kind === 'admin' && r.status === 'ticket-created' ? actionButton('requests', r.id, 'grant', 'Grant access') + actionButton('requests', r.id, 'deny', 'Decline request') : r.kind === 'admin' && r.status === 'granted' ? actionButton('requests', r.id, 'verify', 'Verify access') : ''}</div>` : ''}</div>`).join('')}
    <h3 class="icon-heading">${icon('clock')}Recent activity</h3><ul>${d.events.map(e => `<li>${esc(e.type.replaceAll('-', ' '))} · ${esc(new Date(e.createdAt).toLocaleString())}</li>`).join('')}</ul>
    <p class="fine">Real workstation readiness: ${esc(d.realReadiness)}.</p>`;
  if ($('account-form')) trackForm($('account-form'));
}
async function run(action) {
  if (busy) return;
  busy = true;
  $('profile-editor-select').disabled = true;
  $('location-editor-select').disabled = true;
  $('refresh').disabled = true;
  document.querySelectorAll('button').forEach(b => { if (!b.disabled) { b.dataset.pending = 'true'; b.disabled = true; } });
  try { const result = await action(); feedback(result || 'Up to date.'); }
  catch (error) { feedback(error.message, true); }
  finally {
    busy = false; $('refresh').disabled = false;
    $('profile-editor-select').disabled = false;
    $('location-editor-select').disabled = false;
    document.querySelectorAll('[data-pending]').forEach(b => { b.disabled = false; delete b.dataset.pending; });
    renderProfile();
    for (const form of document.querySelectorAll('#create-form, #account-form, #profile-form, #location-form')) syncForm(form);
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
  $('profile-editor-select').value = ''; editProfile();
  renderProfile();
  hires = []; nextOffset = null; renderList();
  $('detail').innerHTML = '<p>Loading your workspace…</p>';
  run(() => refresh());
});
document.addEventListener('click', event => { if (!$('profile-menu').contains(event.target)) $('profile-menu').open = false; });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('profile-menu').open) { $('profile-menu').open = false; $('profile-toggle').focus(); }
});
$('refresh').addEventListener('click', () => run(async () => { await loadActors(); await refresh(); if (currentActor().role === 'em') editProfile(); }));
$('more').addEventListener('click', () => run(() => refresh({ more: true })));
$('hires').addEventListener('click', event => {
  const button = event.target.closest('[data-hire]');
  if (button) run(async () => { selectedId = button.dataset.hire; version++; renderList(); await loadDetail(selectedId); });
});
$('create-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!canSubmit(event.target)) return;
  const body = Object.fromEntries(new FormData(event.target));
  body.requestedGroups = body.requestedGroups.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  body.adminRequired = body.adminRequired === 'true';
  run(async () => {
    const hire = await api('/api/hires', 'POST', body);
    selectedId = hire.id; event.target.reset(); await loadActors(); await refresh(); applyProfileDefaults();
  });
});
$('create-form').elements.profileId.addEventListener('change', applyProfileDefaults);
$('create-form').elements.location.addEventListener('change', renderLocationPreview);
$('profile-editor-select').addEventListener('change', editProfile);
$('profile-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!canSubmit(event.target)) return;
  const fields = new FormData(event.target);
  const body = { name: fields.get('name'), adminRequired: fields.get('adminRequired') === 'true', groups: groupNames(fields.get('groups')) };
  if (editingProfileId) body.revision = editingRevision;
  run(async () => {
    const profile = await api(editingProfileId ? `/api/profiles/${editingProfileId}` : '/api/profiles', editingProfileId ? 'PUT' : 'POST', body);
    editingProfileId = profile.id;
    await loadProfiles(); $('profile-editor-select').value = profile.id; editProfile();
    $('create-form').elements.profileId.value = profile.id; applyProfileDefaults();
    return 'Profile saved. Its defaults are ready for the next hire; existing plans are unchanged.';
  });
});
$('location-editor-select').addEventListener('change', editLocationDefaults);
$('location-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!canSubmit(event.target)) return;
  const location = $('location-editor-select').value;
  const body = { groups: groupNames(event.target.elements.groups.value), revision: editingLocationRevision };
  run(async () => {
    await api(`/api/location-defaults/${encodeURIComponent(location)}`, 'PUT', body);
    await loadLocationDefaults();
    return 'Location defaults saved. New hires here will receive these groups; existing plans are unchanged.';
  });
});
$('detail').addEventListener('submit', event => {
  if (event.target.id !== 'account-form') return;
  event.preventDefault();
  if (!canSubmit(event.target)) return;
  const body = Object.fromEntries(new FormData(event.target));
  run(async () => { await api(`/api/hires/${event.target.dataset.hireId}/account`, 'PUT', body); await refresh(); });
});
$('detail').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button?.disabled) return;
  if (button?.dataset.provision) run(async () => { await api(`/api/hires/${button.dataset.provision}/provision`, 'POST', {}); await refresh(); return 'Access work queued. Resolve the group assignments below and follow any admin request.'; });
  else if (button?.dataset.action) run(async () => { await api(`/api/${button.dataset.kind}/${button.dataset.resource}/actions`, 'POST', { action: button.dataset.action }); await refresh(); });
});
try { await loadActors(); await refresh(); }
catch (error) { feedback(`Portal unavailable: ${error.message}`, true); }
