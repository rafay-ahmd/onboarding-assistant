import {slackAccessSummary} from './slack-request-store.mjs';
import { randomUUID } from 'node:crypto';
import { requireValue } from './errors.mjs';
import { demoWorkflows } from './demo-workflows.mjs';

export const locations = ['Toronto', 'Berlin'];
export const profileId = 'dealertrack-developer';
const now = () => new Date().toISOString();
const id = () => randomUUID();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function text(value, field, optional = false) {
  requireValue(typeof value === 'string' && value.trim().length <= 300 && (optional || value.trim()), 400, 'INVALID_INPUT', `Provide ${field} (up to 300 characters).`);
  return value.trim();
}
function groups(value, { empty = false, max = 60 } = {}) {
  requireValue(Array.isArray(value) && (empty || value.length > 0) && value.length <= max, 400, 'INVALID_INPUT', `Supply ${empty ? '0' : '1'}–${max} explicit groups.`);
  return [...new Set(value.map(g => text(g, 'group')))];
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function createPlatform(store, { workflows = demoWorkflows } = {}) {
  function actor(actorId) {
    requireValue(typeof actorId === 'string' && actorId.length > 0, 403, 'ACTOR_REQUIRED', 'Select a valid demo actor using X-Demo-Actor-Id.');
    const result = store.get('actors', actorId);
    requireValue(result, 403, 'ACTOR_REQUIRED', 'Select a valid demo actor using X-Demo-Actor-Id.');
    return result;
  }
  function visible(actor, hire) {
    return actor.role === 'em' ? hire.managerId === actor.id : actor.role === 'network' ? actor.locations.includes(hire.location) : actor.hireId === hire.id;
  }
  function hireFor(actor, hireId) {
    const hire = store.get('hires', hireId);
    requireValue(hire, 404, 'NOT_FOUND', 'Hire not found.');
    requireValue(visible(actor, hire), 403, 'FORBIDDEN', 'This hire is outside your demo role or location.');
    return hire;
  }
  function network(actor) { requireValue(actor.role === 'network', 403, 'FORBIDDEN', 'This operation requires the assigned network operator.'); }
  function manager(actor) { requireValue(actor.role === 'em', 403, 'FORBIDDEN', 'Only an EM can manage onboarding profiles.'); }
  function profileFields(body) {
    requireValue(typeof body.adminRequired === 'boolean', 400, 'INVALID_INPUT', 'adminRequired must be true or false.');
    return { name: text(body.name, 'profile name'), groups: groups(body.groups), adminRequired: body.adminRequired };
  }
  function event(actor, hireId, type, resourceId, detail = {}) {
    return store.put('events', { id: id(), hireId, actorId: actor.id, type, resourceId, detail, createdAt: now() });
  }
  function request(actor, hire, kind, entitlementId, payload) {
    const requestKey = JSON.stringify([hire.id, hire.profileId, kind, entitlementId]);
    const existing = store.list('requests', { hireId: hire.id }).find(r => r.requestKey === requestKey);
    if (existing) return existing;
    const record = { id: id(), hireId: hire.id, profileId: hire.profileId, kind, entitlementId,
      requestKey, provider: 'mock', implementation: 'platform-stub', payload, status: 'pending', ticket: null, attempts: 0, createdAt: now(), updatedAt: now() };
    store.put('requests', record);
    event(actor, hire.id, 'request-queued', record.id, { kind });
    return record;
  }
  function detail(actor, hireId) {
    const hire = hireFor(actor, hireId);
    const account = store.get('accounts', hire.id);
    const requests = store.list('requests', { hireId: hire.id });
    const assignments = store.list('assignments', { hireId: hire.id });
    const accessSummary=slackAccessSummary(store,hire.id);
    const blockers = [];
    if (!account) blockers.push('Network team must record AD ID, work email and laptop ID.');
    if (requests.some(r => r.kind === 'account' && r.status !== 'completed')) blockers.push('Account-creation request is pending.');
    if (!assignments.length) blockers.push('Group provisioning has not been started.');
    for (const a of assignments.filter(a => a.status !== 'succeeded')) blockers.push(`${a.group}: ${a.status}${a.error ? ` — ${a.error}` : ''}`);
    if (hire.adminRequired && !requests.some(r => r.kind === 'admin')) blockers.push('Admin access request has not been queued.');
    for (const r of requests.filter(r => r.provider !== 'slack' && r.kind !== 'account' && r.status !== 'verified')) blockers.push(`${r.kind} access: ${r.status}`);
    if(accessSummary.started)for(const item of accessSummary.items.filter(x=>x.status!=='verified'))blockers.push(item.name+': '+item.status.replaceAll('-',' '));
    return { ...hire, account, requests, assignments, accessSummary, events: store.list('events', { hireId: hire.id }), blockers,
      simulation: true, workflowImplementation: workflows.name || 'injected-workflow', realReadiness: 'Not assessed by this portal' };
  }
  function mutate(actorId, operation, key, body, action) {
    const acting = actor(actorId);
    requireValue(typeof key === 'string' && key.trim().length > 0 && key.length <= 200, 400, 'IDEMPOTENCY_REQUIRED', 'Supply an Idempotency-Key of 1–200 characters.');
    requireValue(body && typeof body === 'object' && !Array.isArray(body), 400, 'INVALID_INPUT', 'Expected a JSON object.');
    const payload = JSON.stringify(canonical(body));
    return store.transaction(() => {
      const previous = store.command(acting.id, operation, key);
      if (previous) {
        requireValue(previous.payload === payload, 409, 'IDEMPOTENCY_CONFLICT', 'This key was already used with a different payload.');
        return JSON.parse(previous.response);
      }
      const response = action(acting);
      store.saveCommand(acting.id, operation, key, payload, response);
      return response;
    });
  }
  return {
    actors: () => store.list('actors'),
    locationDefaults(actorId) {
      const acting = actor(actorId);
      requireValue(['em', 'network'].includes(acting.role), 403, 'FORBIDDEN', 'Location defaults are available to EM and network teams.');
      return { items: locations.filter(location => acting.locations.includes(location)).map(location => store.get('locationDefaults', location)) };
    },
    updateLocationDefaults(actorId, location, key, body) {
      return mutate(actorId, `location-defaults:${location}`, key, body, acting => {
        network(acting);
        requireValue(acting.locations.includes(location), 403, 'FORBIDDEN', 'Only your assigned location can be configured.');
        const previous = store.get('locationDefaults', location);
        requireValue(previous, 404, 'NOT_FOUND', 'Location not found.');
        requireValue(body.revision === previous.revision, 409, 'LOCATION_CHANGED', 'Location defaults changed in another session. Refresh and try again.');
        return store.put('locationDefaults', { ...previous, groups: groups(body.groups, { empty: true, max: 30 }), revision: previous.revision + 1, updatedBy: acting.id, updatedAt: now() });
      });
    },
    profiles(actorId) {
      manager(actor(actorId));
      const items = [];
      for (let offset = 0;; offset += 100) {
        const rows = store.list('profiles', { offset });
        items.push(...rows);
        if (rows.length < 100) break;
      }
      return { items };
    },
    createProfile(actorId, key, body) {
      return mutate(actorId, 'create-profile', key, body, acting => {
        manager(acting);
        return store.put('profiles', { id: id(), ...profileFields(body), revision: 1, updatedBy: acting.id, updatedAt: now() });
      });
    },
    updateProfile(actorId, profileId, key, body) {
      return mutate(actorId, `profile:${profileId}`, key, body, acting => {
        manager(acting);
        const previous = store.get('profiles', profileId);
        requireValue(previous, 404, 'NOT_FOUND', 'Profile not found.');
        requireValue(body.revision === previous.revision, 409, 'PROFILE_CHANGED', 'This profile changed in another session. Refresh profiles and try again.');
        return store.put('profiles', { ...previous, ...profileFields(body), revision: previous.revision + 1, updatedBy: acting.id, updatedAt: now() });
      });
    },
    list(actorId, offset = 0) {
      const acting = actor(actorId);
      requireValue(Number.isInteger(offset) && offset >= 0, 400, 'INVALID_INPUT', 'offset must be a non-negative integer.');
      // Walk bounded repository pages so filtering never drops authorized hires from a page.
      const matches = [];
      for (let page = 0;; page += 100) {
        const rows = store.list('hires', { offset: page });
        matches.push(...rows.filter(h => visible(acting, h)));
        if (matches.length > offset + 50 || rows.length < 100) break;
      }
      return { items: matches.slice(offset, offset + 50), nextOffset: matches.length > offset + 50 ? offset + 50 : null };
    },
    get: (actorId, hireId) => detail(actor(actorId), hireId),
    create(actorId, key, body) {
      return mutate(actorId, 'create-hire', key, body, acting => {
        requireValue(acting.role === 'em', 403, 'FORBIDDEN', 'Only an EM can create a hire.');
        // Keep legacy name-only clients working while MCP moves to separate name fields.
        const structuredName = body.firstName !== undefined || body.lastName !== undefined;
        const firstName = structuredName ? text(body.firstName, 'first name') : undefined;
        const lastName = structuredName ? text(body.lastName, 'last name') : undefined;
        const name = structuredName ? `${firstName} ${lastName}` : text(body.name, 'employee name');
        const email = text(body.email ?? '', 'email', true);
        requireValue(!email || emailPattern.test(email), 400, 'INVALID_INPUT', 'Provide a valid email or leave it empty.');
        requireValue(locations.includes(body.location) && acting.locations.includes(body.location), 400, 'INVALID_INPUT', 'Choose a permitted location.');
        const profile = typeof body.profileId === 'string' && store.get('profiles', body.profileId);
        requireValue(profile, 400, 'INVALID_INPUT', 'Choose an existing onboarding profile.');
        requireValue(!body.managerId || body.managerId === acting.id, 403, 'FORBIDDEN', 'An EM can only create their own hires.');
        requireValue(typeof body.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate) && Number.isFinite(Date.parse(body.startDate)) && new Date(body.startDate).toISOString().slice(0, 10) === body.startDate, 400, 'INVALID_INPUT', 'Provide a valid start date.');
        const profileGroups = groups(body.requestedGroups ?? profile.groups);
        const locationDefaults = store.get('locationDefaults', body.location);
        const locationGroups = locationDefaults.groups;
        const requestedGroups = [...new Set([...profileGroups, ...locationGroups])];
        const adminRequired = body.adminRequired ?? profile.adminRequired;
        requireValue(typeof adminRequired === 'boolean', 400, 'INVALID_INPUT', 'adminRequired must be true or false.');
        const hire = { id: id(), name, email, startDate: body.startDate, managerId: acting.id, location: body.location,
          profileId: profile.id, profileName: profile.name, profileRevision: profile.revision, profileGroups, locationGroups, locationRevision: locationDefaults.revision, requestedGroups, adminRequired, createdAt: now() };
        if (structuredName) Object.assign(hire, { firstName, lastName });
        store.put('hires', hire);
        request(acting, hire, 'account', 'account', { name, ...(structuredName ? { firstName, lastName } : {}), location: hire.location, startDate: hire.startDate });
        event(acting, hire.id, 'hire-created', hire.id);
        store.put('actors', { id: `hire-${hire.id}`, name: `${hire.name} (demo hire)`, role: 'hire', locations: [], hireId: hire.id });
        return detail(acting, hire.id);
      });
    },
    account(actorId, hireId, key, body) {
      return mutate(actorId, `account:${hireId}`, key, body, acting => {
        const hire = hireFor(acting, hireId); network(acting);
        const account = { hireId, adId: text(body.adId, 'AD ID'), workEmail: text(body.workEmail, 'work email'), laptopId: text(body.laptopId, 'laptop ID'), updatedBy: acting.id, updatedAt: now() };
        requireValue(emailPattern.test(account.workEmail), 400, 'INVALID_INPUT', 'Provide a valid work email.');
        const previous = store.get('accounts', hireId);
        requireValue(!previous || previous.adId === account.adId || store.list('assignments', { hireId }).length === 0, 409, 'ACCOUNT_IN_USE', 'AD ID cannot change after provisioning starts. Keep the existing ID or use a new demo hire.');
        store.put('accounts', account);
        const accountRequest = store.list('requests', { hireId }).find(r => r.kind === 'account');
        if (accountRequest) store.put('requests', { ...accountRequest, status: 'completed', updatedAt: now() });
        event(acting, hire.id, 'account-recorded', hire.id);
        return detail(acting, hire.id);
      });
    },
    provision(actorId, hireId, key, body) {
      return mutate(actorId, `provision:${hireId}`, key, body, acting => {
        const hire = hireFor(acting, hireId); network(acting);
        requireValue(store.get('accounts', hireId), 409, 'ACCOUNT_REQUIRED', 'Record account details before provisioning.');
        workflows.provision({ store, hire, now, id, request: (kind, entitlementId, payload) => request(acting, hire, kind, entitlementId, payload), event: (type, resourceId, detail) => event(acting, hire.id, type, resourceId, detail) });
        return detail(acting, hire.id);
      });
    },
    action(actorId, type, resourceId, key, body) {
      return mutate(actorId, `${type}:${resourceId}`, key, body, acting => {
        const resource = store.get(type, resourceId);
        requireValue(resource, 404, 'NOT_FOUND', 'Resource not found.');
        hireFor(acting, resource.hireId); network(acting);
        requireValue(resource.provider!=='slack',409,'LIVE_REQUEST_ACTION_REQUIRED','Use the linked Slack workflow to update this request.');
        const updated = type === 'assignments' ? workflows.assignmentAction({ assignment: resource, body }) : workflows.requestAction({ request: resource, body });
        store.put(type, { ...updated, updatedAt: now() });
        event(acting, resource.hireId, `${type}-${body.action}`, resource.id);
        return detail(acting, resource.hireId);
      });
    }
  };
}

export function seedDemo(store) {
  const actors = [
    { id: 'em-vibgy', name: 'Alex Example (demo EM)', role: 'em', locations },
    { id: 'em-other', name: 'Morgan (other demo EM)', role: 'em', locations },
    { id: 'network-toronto', name: 'Toronto network (demo)', role: 'network', locations: ['Toronto'] },
    { id: 'network-berlin', name: 'Berlin network (demo)', role: 'network', locations: ['Berlin'] }
  ];
  store.transaction(() => {
    // Recreate the seed only after an explicit demo reset; never overwrite EM edits.
    if (!store.get('profiles', profileId)) store.put('profiles', { id: profileId, name: 'Dealertrack developer', groups: ['DEMO-DEVELOPERS'], adminRequired: false, revision: 1 });
    for (const location of locations) if (!store.get('locationDefaults', location)) store.put('locationDefaults', { id: location, groups: [], revision: 1 });
    for (const a of actors) {
      const existing = store.get('actors', a.id);
      if (!existing || (a.id === 'em-vibgy' && existing.name === 'Vibgy (demo EM)')) store.put('actors', a);
    }
  });
  const platform = createPlatform(store);
  // Keep v1 command payloads stable so startup can replay receipts from existing databases.
  for (const [index, location] of locations.entries()) {
    const seeded = platform.create('em-vibgy', `seed-hire-${location}-v1`, {
    name: index ? 'Jamie Example' : 'Alex Example', email: '', startDate: '2026-11-02', location, profileId,
    requestedGroups: [`DEMO-${location.toUpperCase()}-DEVELOPERS`], adminRequired: !index
    });
    if (!index) store.transaction(() => {
      const hire = store.get('hires', seeded.id);
      if (hire.name !== 'Alex Example') return;
      // Only upgrade the identified fictional seed, preserving all workflow progress and IDs.
      store.put('hires', { ...hire, firstName: 'Vibgy', lastName: 'Joseph', name: 'Vibgy Joseph' });
      const hireActor = store.get('actors', `hire-${hire.id}`);
      store.put('actors', { ...hireActor, name: 'Vibgy Joseph (demo hire)' });
      const accountRequest = store.list('requests', { hireId: hire.id }).find(r => r.kind === 'account');
      if (accountRequest) store.put('requests', { ...accountRequest, payload: { ...accountRequest.payload, firstName: 'Vibgy', lastName: 'Joseph', name: 'Vibgy Joseph' } });
    });
  }
}
