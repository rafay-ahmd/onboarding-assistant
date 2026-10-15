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
    const blockers = [];
    if (!account) blockers.push('Network team must record AD ID, work email and laptop ID.');
    if (requests.some(r => r.kind === 'account' && r.status !== 'completed')) blockers.push('Account-creation request is pending.');
    if (!assignments.length) blockers.push('Group provisioning has not been started.');
    for (const a of assignments.filter(a => a.status !== 'succeeded')) blockers.push(`${a.group}: ${a.status}${a.error ? ` — ${a.error}` : ''}`);
    if (hire.adminRequired && !requests.some(r => r.kind === 'admin')) blockers.push('Admin access request has not been queued.');
    for (const r of requests.filter(r => r.kind !== 'account' && r.status !== 'verified')) blockers.push(`${r.kind} access: ${r.status}`);
    return { ...hire, account, requests, assignments, events: store.list('events', { hireId: hire.id }), blockers,
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
        requireValue(body.profileId === profileId, 400, 'INVALID_INPUT', 'Choose the Dealertrack developer profile.');
        requireValue(!body.managerId || body.managerId === acting.id, 403, 'FORBIDDEN', 'An EM can only create their own hires.');
        requireValue(typeof body.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate) && Number.isFinite(Date.parse(body.startDate)) && new Date(body.startDate).toISOString().slice(0, 10) === body.startDate, 400, 'INVALID_INPUT', 'Provide a valid start date.');
        requireValue(Array.isArray(body.requestedGroups) && body.requestedGroups.length > 0 && body.requestedGroups.length <= 30, 400, 'INVALID_INPUT', 'Supply 1–30 explicit groups.');
        const requestedGroups = [...new Set(body.requestedGroups.map(g => text(g, 'group')))];
        requireValue(typeof body.adminRequired === 'boolean', 400, 'INVALID_INPUT', 'adminRequired must be true or false.');
        const hire = { id: id(), name, email, startDate: body.startDate, managerId: acting.id, location: body.location,
          profileId, requestedGroups, adminRequired: body.adminRequired, createdAt: now() };
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
    { id: 'em-vibgy', name: 'Vibgy (demo EM)', role: 'em', locations },
    { id: 'em-other', name: 'Morgan (other demo EM)', role: 'em', locations },
    { id: 'network-toronto', name: 'Toronto network (demo)', role: 'network', locations: ['Toronto'] },
    { id: 'network-berlin', name: 'Berlin network (demo)', role: 'network', locations: ['Berlin'] }
  ];
  store.transaction(() => { for (const a of actors) if (!store.get('actors', a.id)) store.put('actors', a); });
  const platform = createPlatform(store);
  for (const [index, location] of locations.entries()) platform.create('em-vibgy', `seed-hire-${location}-v1`, {
    name: index ? 'Jamie Example' : 'Alex Example', email: '', startDate: '2026-11-02', location, profileId,
    requestedGroups: [`DEMO-${location.toUpperCase()}-DEVELOPERS`], adminRequired: !index
  });
}
