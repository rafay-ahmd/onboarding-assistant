import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { openStore } from '../backend/db/store.mjs';
import { createPlatform, seedDemo } from '../backend/services/platform.mjs';
import { createApp } from '../server.mjs';

const input = { name: 'Taylor Example', email: '', startDate: '2026-11-03', location: 'Toronto', profileId: 'dealertrack-developer', requestedGroups: ['DEMO-DEVELOPERS'], adminRequired: true };
function fixture(t, options) {
  const store = openStore(':memory:'); seedDemo(store);
  t.after(() => store.close());
  return { store, app: createPlatform(store, options) };
}
const rejects = (fn, status, code) => assert.throws(fn, e => e.status === status && (!code || e.code === code));

test('structured names preserve compound names and validate both fields without splitting legacy records', t => {
  const { app } = fixture(t);
  const { name, ...fields } = input;
  const hire = app.create('em-vibgy', 'structured', { ...fields, firstName: '  Ana María ', lastName: ' de la Cruz  ' });
  assert.equal(hire.firstName, 'Ana María');
  assert.equal(hire.lastName, 'de la Cruz');
  assert.equal(hire.name, 'Ana María de la Cruz');
  assert.equal(hire.requests[0].payload.lastName, 'de la Cruz');
  assert.equal(app.get(`hire-${hire.id}`, hire.id).firstName, 'Ana María');
  for (const [index, invalid] of [{ firstName: 'Ana' }, { lastName: 'Cruz' }, { firstName: ' ', lastName: 'Cruz' }, { firstName: 'Ana', lastName: ' ' }].entries()) {
    rejects(() => app.create('em-vibgy', `invalid-name-${index}`, { ...fields, ...invalid }), 400, 'INVALID_INPUT');
  }
  const legacy = app.create('em-vibgy', 'legacy', input);
  assert.equal(legacy.name, name);
  assert.equal(legacy.firstName, undefined);
});

test('create is atomic/idempotent, independent of payload key order, with conflict detection', t => {
  const { store, app } = fixture(t);
  const hire = app.create('em-vibgy', 'create-1', input);
  assert.equal(hire.requests.length, 1);
  assert.equal(hire.requests[0].status, 'pending');
  assert.equal(hire.account, null);
  assert.ok(hire.blockers.length > 0);
  assert.equal(app.create('em-vibgy', 'create-1', Object.fromEntries(Object.entries(input).reverse())).id, hire.id);
  rejects(() => app.create('em-vibgy', 'create-1', { ...input, name: 'Changed' }), 409, 'IDEMPOTENCY_CONFLICT');
  assert.equal(store.list('hires').length, 3);
  assert.equal(store.list('requests', { hireId: hire.id }).length, 1);
  rejects(() => app.create('em-vibgy', '', input), 400);
  rejects(() => app.create('em-vibgy', 'invalid', { ...input, startDate: '2026-02-30' }), 400);
  rejects(() => app.create('em-vibgy', 'no-groups', { ...input, requestedGroups: [] }), 400);
  assert.equal(store.list('hires').length, 3);
});

test('roles, location and immutable self mapping are enforced by service operations', t => {
  const { app } = fixture(t);
  const hire = app.create('em-vibgy', 'roles', input);
  const account = { adId: 'DEMO-TAYLOR', workEmail: 'taylor@example.invalid', laptopId: 'DEMO-LAPTOP' };
  assert.equal(app.list('em-other').items.length, 0);
  assert.equal(app.list('network-berlin').items.every(h => h.location === 'Berlin'), true);
  assert.equal(app.list(`hire-${hire.id}`).items.length, 1);
  rejects(() => app.get('em-other', hire.id), 403);
  rejects(() => app.get('missing', hire.id), 403);
  rejects(() => app.account('network-berlin', hire.id, 'wrong-location', account), 403);
  rejects(() => app.account('em-vibgy', hire.id, 'wrong-role', account), 403);
  rejects(() => app.create('network-toronto', 'network-create', input), 403);
  rejects(() => app.provision('network-toronto', hire.id, 'too-early', {}), 409, 'ACCOUNT_REQUIRED');
  const updated = app.account('network-toronto', hire.id, 'account', account);
  assert.equal(updated.requests[0].status, 'completed');
  assert.equal(updated.id, hire.id);
  const changed = app.account('network-toronto', hire.id, 'email-change', { ...account, workEmail: 'new@example.invalid' });
  assert.equal(changed.id, hire.id);
  assert.equal(app.get(`hire-${hire.id}`, hire.id).account.workEmail, 'new@example.invalid');
});

test('provisioning deduplicates and retries only failed groups; admin routing stays separate', t => {
  const { app } = fixture(t);
  const hire = app.create('em-vibgy', 'provision', input);
  app.account('network-toronto', hire.id, 'account', { adId: 'demo', workEmail: 't@example.invalid', laptopId: 'demo' });
  const pending = app.provision('network-toronto', hire.id, 'p1', {});
  const again = app.provision('network-toronto', hire.id, 'p2', {});
  assert.equal(again.assignments.length, 1);
  assert.equal(again.requests.filter(r => r.kind === 'admin').length, 1);
  assert.equal(again.requests.find(r => r.kind === 'admin').payload.route, 'form');
  const assignmentId = pending.assignments[0].id;
  rejects(() => app.action('network-berlin', 'assignments', assignmentId, 'cross-location', { action: 'success' }), 403);
  rejects(() => app.action(`hire-${hire.id}`, 'assignments', assignmentId, 'self-action', { action: 'success' }), 403);
  app.action('network-toronto', 'assignments', assignmentId, 'f1', { action: 'failure' });
  app.action('network-toronto', 'assignments', assignmentId, 'r1', { action: 'retry' });
  const succeeded = app.action('network-toronto', 'assignments', assignmentId, 's1', { action: 'success' });
  assert.equal(succeeded.assignments[0].attempts, 2);
  rejects(() => app.action('network-toronto', 'assignments', assignmentId, 'r2', { action: 'retry' }), 409);
  const adminId = succeeded.requests.find(r => r.kind === 'admin').id;
  for (const action of ['ticket', 'grant', 'verify']) app.action('network-toronto', 'requests', adminId, action, { action });
  const completed = app.get('em-vibgy', hire.id);
  assert.deepEqual(completed.blockers, []);
  assert.equal(completed.simulation, true);
  assert.equal(completed.realReadiness, 'Not assessed by this portal');
  assert.equal(completed.access, undefined);
  const standard = app.create('em-vibgy', 'standard', { ...input, adminRequired: false });
  app.account('network-toronto', standard.id, 'account', { adId: 'demo2', workEmail: 's@example.invalid', laptopId: 'demo2' });
  assert.equal(app.provision('network-toronto', standard.id, 'p', {}).requests.some(r => r.kind === 'admin'), false);
});

test('workflow failure rolls back assignments/events and does not consume idempotency key', t => {
  const { store, app } = fixture(t);
  const hire = app.create('em-vibgy', 'rollback', input);
  app.account('network-toronto', hire.id, 'account', { adId: 'demo', workEmail: 't@example.invalid', laptopId: 'demo' });
  const broken = createPlatform(store, { workflows: { provision({ store, hire, id }) {
    store.put('assignments', { id: id(), hireId: hire.id, group: 'partial' });
    throw Error('Simulated workflow crash');
  } } });
  assert.throws(() => broken.provision('network-toronto', hire.id, 'same-key', {}), /workflow crash/);
  assert.equal(store.list('assignments', { hireId: hire.id }).length, 0);
  assert.equal(app.provision('network-toronto', hire.id, 'same-key', {}).assignments.length, 1);
});

test('a failed group retry does not rerun successful groups or allow AD identity replacement', t => {
  const { app } = fixture(t);
  const hire = app.create('em-vibgy', 'two-groups', { ...input, requestedGroups: ['GROUP-A', 'GROUP-B'] });
  const account = { adId: 'demo', workEmail: 't@example.invalid', laptopId: 'demo' };
  app.account('network-toronto', hire.id, 'account', account);
  const pending = app.provision('network-toronto', hire.id, 'p', {});
  const [first, second] = pending.assignments;
  app.action('network-toronto', 'assignments', first.id, 'success', { action: 'success' });
  app.action('network-toronto', 'assignments', second.id, 'failure', { action: 'failure' });
  app.action('network-toronto', 'assignments', second.id, 'retry', { action: 'retry' });
  const result = app.provision('network-toronto', hire.id, 'p-again', {});
  assert.equal(result.assignments[0].status, 'succeeded');
  assert.equal(result.assignments[0].attempts, 1);
  assert.equal(result.assignments[1].status, 'pending');
  rejects(() => app.account('network-toronto', hire.id, 'change-ad', { ...account, adId: 'different' }), 409, 'ACCOUNT_IN_USE');
  assert.equal(app.account('network-toronto', hire.id, 'change-email', { ...account, workEmail: 'new@example.invalid' }).id, hire.id);
});

test('seed is repeatable and reset clears only the application tables before reseeding', t => {
  const { store, app } = fixture(t);
  app.create('em-vibgy', 'extra', input);
  seedDemo(store);
  assert.equal(app.list('em-vibgy').items.length, 3);
  store.resetDemo();
  assert.equal(store.list('hires').length, 0);
  assert.equal(store.list('actors').length, 0);
  seedDemo(store);
  assert.equal(app.list('em-vibgy').items.length, 2);
  assert.equal(store.list('requests').length, 2);
});

test('SQLite restart preserves identity, account, requests, history and command receipts', t => {
  const dir = mkdtempSync(join(tmpdir(), 'onboarding-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'test.sqlite');
  let store = openStore(path); seedDemo(store);
  let app = createPlatform(store);
  const hire = app.create('em-vibgy', 'restart', input);
  app.account('network-toronto', hire.id, 'account', { adId: 'demo', workEmail: 't@example.invalid', laptopId: 'demo' });
  app.provision('network-toronto', hire.id, 'provision', {});
  const before = app.get('em-vibgy', hire.id);
  store.close();
  store = openStore(path); seedDemo(store); app = createPlatform(store);
  try {
    assert.deepEqual(app.get('em-vibgy', hire.id), before);
    assert.equal(app.create('em-vibgy', 'restart', input).id, hire.id);
    assert.equal(app.list(`hire-${hire.id}`).items[0].id, hire.id);
  } finally { store.close(); }
});

test('HTTP contract supports two clients, envelopes, idempotency and local-origin checks', async t => {
  const { server } = createApp({ databasePath: ':memory:' });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'X-Demo-Actor-Id': 'em-vibgy', 'Content-Type': 'application/json', 'Idempotency-Key': 'http-create' };
  const request = () => fetch(`${base}/api/hires`, { method: 'POST', headers, body: JSON.stringify(input) });
  const created = await (await request()).json();
  assert.ok(created.data.id);
  assert.equal((await (await request()).json()).data.id, created.data.id);
  const listed = await (await fetch(`${base}/api/hires`, { headers: { 'X-Demo-Actor-Id': 'network-toronto' } })).json();
  assert.ok(listed.data.items.some(h => h.id === created.data.id));
  assert.equal((await fetch(`${base}/api/hires`)).status, 403);
  assert.equal((await fetch(`${base}/api/hires`, { headers: { ...headers, Origin: 'https://external.invalid' } })).status, 403);
  const malformed = await fetch(`${base}/api/hires`, { method: 'POST', headers, body: '{bad' });
  assert.equal(malformed.status, 400); assert.equal((await malformed.json()).error.code, 'INVALID_JSON');
  assert.equal((await fetch(`${base}/api/hires`, { method: 'POST', headers, body: JSON.stringify({ text: 'x'.repeat(33000) }) })).status, 413);
  const portal = await fetch(base); assert.match(await portal.text(), /portal.mjs/);
  assert.match(await (await fetch(`${base}/planner`)).text(), /app.mjs/);
});
