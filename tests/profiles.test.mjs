import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { openStore } from '../backend/db/store.mjs';
import { createPlatform, seedDemo } from '../backend/services/platform.mjs';
import { createApp } from '../server.mjs';

const fields = { name: 'Platform developer', groups: [' PLATFORM-DEV ', 'PLATFORM-DEV'], adminRequired: true };
const hireFields = { firstName: 'Profile', lastName: 'Example', startDate: '2026-11-12', location: 'Berlin' };
const rejects = (fn, status, code) => assert.throws(fn, error => error.status === status && (!code || error.code === code));
function fixture(t) {
  const store = openStore(':memory:'); seedDemo(store);
  t.after(() => store.close());
  return { store, app: createPlatform(store) };
}

test('EMs share persisted profiles; other roles cannot read or mutate the catalogue', t => {
  const { app } = fixture(t);
  const profile = app.createProfile('em-vibgy', 'profile-create', fields);
  assert.deepEqual(profile.groups, ['PLATFORM-DEV']);
  assert.deepEqual(app.createProfile('em-vibgy', 'profile-create', fields), profile);
  assert.ok(app.profiles('em-other').items.some(p => p.id === profile.id));
  const hireActor = app.actors().find(a => a.role === 'hire').id;
  for (const actor of ['network-toronto', hireActor]) {
    rejects(() => app.profiles(actor), 403);
    rejects(() => app.createProfile(actor, 'no-profile-create', fields), 403);
    rejects(() => app.updateProfile(actor, profile.id, 'no-profile-edit', { ...fields, revision: 1 }), 403);
  }
  const edited = app.updateProfile('em-other', profile.id, 'profile-edit', { ...fields, name: 'Shared platform developer', revision: 1 });
  assert.equal(edited.revision, 2);
  rejects(() => app.updateProfile('em-vibgy', profile.id, 'stale', { ...fields, revision: 1 }), 409, 'PROFILE_CHANGED');
  assert.equal(app.profiles('em-vibgy').items.find(p => p.id === profile.id).name, edited.name);
});

test('hire creation copies location defaults, supports explicit overrides and preserves earlier snapshots', t => {
  const { app } = fixture(t);
  const profile = app.createProfile('em-vibgy', 'profile', fields);
  const body = { ...hireFields, profileId: profile.id };
  const hire = app.create('em-vibgy', 'hire-defaults', body);
  assert.deepEqual(hire.requestedGroups, ['PLATFORM-DEV']);
  assert.equal(hire.adminRequired, true);
  assert.equal(hire.profileName, profile.name);
  assert.equal(hire.profileId, profile.id);
  app.updateProfile('em-vibgy', profile.id, 'edit', { ...fields, revision: 1, name: 'Renamed', groups: ['PLATFORM-NEW'] });
  assert.deepEqual(app.get('em-vibgy', hire.id), hire);
  assert.deepEqual(app.create('em-vibgy', 'hire-defaults', body), hire);
  const future = app.create('em-vibgy', 'future', body);
  assert.deepEqual(future.requestedGroups, ['PLATFORM-NEW']);
  assert.equal(future.profileName, 'Renamed');
  assert.equal(future.profileRevision, 2);
  const override = app.create('em-vibgy', 'override', { ...body, location: 'Toronto', requestedGroups: ['EXCEPTION'], adminRequired: false });
  assert.deepEqual(override.requestedGroups, ['EXCEPTION']);
  assert.equal(override.adminRequired, false);
  rejects(() => app.create('em-vibgy', 'unknown-profile', { ...body, profileId: 'missing' }), 400);
});

test('invalid profiles are atomic and edits cannot erase saved defaults', t => {
  const { app } = fixture(t);
  const before = app.profiles('em-vibgy').items;
  const invalid = [
    { ...fields, name: ' ' }, { ...fields, adminRequired: 'true' },
    { ...fields, groups: undefined },
    { ...fields, groups: [] },
    { ...fields, groups: [' '] },
    { ...fields, groups: ['x'.repeat(301)] },
    { ...fields, groups: Array(61).fill('T') }
  ];
  for (const [i, body] of invalid.entries()) rejects(() => app.createProfile('em-vibgy', `bad-${i}`, body), 400);
  assert.deepEqual(app.profiles('em-vibgy').items, before);
  rejects(() => app.updateProfile('em-vibgy', before[0].id, 'bad-update', { ...invalid[0], revision: 1 }), 400);
  assert.deepEqual(app.profiles('em-vibgy').items, before);
});

test('v1 database migrates without losing hires and catalogue edits survive restart and reseeding', t => {
  const dir = mkdtempSync(join(tmpdir(), 'onboarding-profiles-'));
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  const path = join(dir, 'profiles.sqlite');
  let store = openStore(path); seedDemo(store);
  const hireId = store.list('hires')[0].id;
  store.close();
  // Reconstruct the v1 boundary: no catalogue or profile snapshots.
  const legacy = new DatabaseSync(path);
  legacy.exec("DROP TABLE profiles; DROP TABLE locationDefaults; UPDATE hires SET body=json_remove(body,'$.profileName','$.profileRevision'); PRAGMA user_version=1;");
  legacy.close();
  store = openStore(path);
  let app = createPlatform(store);
  assert.equal(app.get('em-vibgy', hireId).profileName, 'Dealertrack developer');
  assert.equal(app.list('em-vibgy').items.length, 2);
  app.updateProfile('em-vibgy', 'dealertrack-developer', 'edit-seed', { ...fields, revision: 1 });
  store.close();
  store = openStore(path); seedDemo(store); app = createPlatform(store);
  assert.equal(app.profiles('em-vibgy').items[0].name, fields.name);
  assert.equal(app.profiles('em-vibgy').items[0].revision, 2);
  store.resetDemo(); seedDemo(store);
  assert.equal(app.profiles('em-vibgy').items[0].name, 'Dealertrack developer');
});

test('profile HTTP endpoints enforce EM permissions and default hires on the server', async t => {
  const { server } = createApp({ databasePath: ':memory:' });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'X-Demo-Actor-Id': 'em-vibgy', 'Content-Type': 'application/json', 'Idempotency-Key': 'profile-http' };
  const response = await fetch(`${base}/api/profiles`, { method: 'POST', headers, body: JSON.stringify(fields) });
  assert.equal(response.status, 200);
  const { data: profile } = await response.json();
  const listed = await (await fetch(`${base}/api/profiles`, { headers })).json();
  assert.ok(listed.data.items.some(p => p.id === profile.id));
  const edited = await fetch(`${base}/api/profiles/${profile.id}`, { method: 'PUT', headers, body: JSON.stringify({ ...fields, name: 'Edited profile', revision: 1 }) });
  assert.equal((await edited.json()).data.revision, 2);
  const hire = await (await fetch(`${base}/api/hires`, { method: 'POST', headers, body: JSON.stringify({ ...hireFields, profileId: profile.id }) })).json();
  assert.deepEqual(hire.data.requestedGroups, ['PLATFORM-DEV']);
  assert.equal((await fetch(`${base}/api/profiles`, { headers: { 'X-Demo-Actor-Id': 'network-berlin' } })).status, 403);
  const networkHeaders = { ...headers, 'X-Demo-Actor-Id': 'network-berlin' };
  const defaults = await (await fetch(`${base}/api/location-defaults`, { headers: networkHeaders })).json();
  assert.deepEqual(defaults.data.items.map(item => item.id), ['Berlin']);
  const update = await fetch(`${base}/api/location-defaults/Berlin`, { method: 'PUT', headers: networkHeaders, body: JSON.stringify({ groups: ['BER-NETWORK'], revision: 1 }) });
  assert.equal((await update.json()).data.revision, 2);
  assert.equal((await fetch(`${base}/api/location-defaults/Toronto`, { method: 'PUT', headers: networkHeaders, body: JSON.stringify({ groups: [], revision: 1 }) })).status, 403);
});

test('only assigned network teams configure location defaults, with revision checks and clear support', t => {
  const { app } = fixture(t);
  assert.deepEqual(app.locationDefaults('network-toronto').items.map(item => item.id), ['Toronto']);
  const body = { groups: ['TOR-BASE', 'TOR-BASE'], revision: 1 };
  const saved = app.updateLocationDefaults('network-toronto', 'Toronto', 'defaults', body);
  assert.deepEqual(saved.groups, ['TOR-BASE']);
  assert.deepEqual(app.updateLocationDefaults('network-toronto', 'Toronto', 'defaults', body), saved);
  rejects(() => app.updateLocationDefaults('network-berlin', 'Toronto', 'cross-location', body), 403);
  rejects(() => app.updateLocationDefaults('em-vibgy', 'Toronto', 'em-edit', body), 403);
  rejects(() => app.locationDefaults(app.actors().find(a => a.role === 'hire').id), 403);
  rejects(() => app.updateLocationDefaults('network-toronto', 'Toronto', 'stale', body), 409, 'LOCATION_CHANGED');
  rejects(() => app.updateLocationDefaults('network-toronto', 'Toronto', 'invalid', { revision: 2, groups: [' '] }), 400);
  assert.deepEqual(app.locationDefaults('network-toronto').items[0], saved);
  const cleared = app.updateLocationDefaults('network-toronto', 'Toronto', 'clear', { revision: 2, groups: [] });
  assert.deepEqual(cleared.groups, []);
  assert.equal(cleared.revision, 3);
});

test('new hires combine profile and network defaults once and retain snapshots after either changes', t => {
  const { app } = fixture(t);
  const profile = app.createProfile('em-vibgy', 'profile', { ...fields, groups: ['COMMON', 'ROLE'] });
  app.updateLocationDefaults('network-berlin', 'Berlin', 'network-defaults', { revision: 1, groups: ['COMMON', 'BER-BASE'] });
  app.updateLocationDefaults('network-toronto', 'Toronto', 'network-defaults', { revision: 1, groups: ['TOR-BASE'] });
  const body = { ...hireFields, profileId: profile.id };
  const hire = app.create('em-vibgy', 'combined', body);
  assert.deepEqual(hire.requestedGroups, ['COMMON', 'ROLE', 'BER-BASE']);
  assert.deepEqual(hire.profileGroups, ['COMMON', 'ROLE']);
  assert.deepEqual(hire.locationGroups, ['COMMON', 'BER-BASE']);
  const override = app.create('em-vibgy', 'override', { ...body, requestedGroups: ['SPECIAL'] });
  assert.deepEqual(override.requestedGroups, ['SPECIAL', 'COMMON', 'BER-BASE']);
  const toronto = app.create('em-vibgy', 'toronto', { ...body, location: 'Toronto' });
  assert.deepEqual(toronto.requestedGroups, ['COMMON', 'ROLE', 'TOR-BASE']);
  app.updateLocationDefaults('network-berlin', 'Berlin', 'updated-defaults', { revision: 2, groups: ['BER-NEW'] });
  app.updateProfile('em-vibgy', profile.id, 'updated-profile', { ...fields, revision: 1, groups: ['ROLE-NEW'] });
  assert.deepEqual(app.get('em-vibgy', hire.id), hire);
  assert.deepEqual(app.create('em-vibgy', 'combined', body), hire);
  const future = app.create('em-vibgy', 'future-combined', body);
  assert.deepEqual(future.requestedGroups, ['ROLE-NEW', 'BER-NEW']);
  assert.equal(future.locationRevision, 3);
  app.account('network-berlin', hire.id, 'account', { adId: 'demo', workEmail: 'demo@example.invalid', laptopId: 'demo' });
  const provisioned = app.provision('network-berlin', hire.id, 'provision', {});
  assert.deepEqual(provisioned.assignments.map(item => item.group), hire.requestedGroups);
});

test('v2 profiles migrate to one deduplicated list and location defaults persist across restart', t => {
  const dir = mkdtempSync(join(tmpdir(), 'onboarding-location-defaults-'));
  const path = join(dir, 'profiles.sqlite');
  let store = openStore(path); seedDemo(store);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  store.close();
  const legacy = new DatabaseSync(path);
  legacy.exec('DROP TABLE locationDefaults; PRAGMA user_version=2;');
  legacy.prepare('UPDATE profiles SET body=? WHERE id=?').run(JSON.stringify({ id: 'dealertrack-developer', name: 'Edited v2 profile', groupsByLocation: { Toronto: ['COMMON', 'TOR-OLD'], Berlin: ['COMMON', 'BER-OLD'] }, adminRequired: true, revision: 4 }), 'dealertrack-developer');
  legacy.close();
  store = openStore(path); let app = createPlatform(store);
  const profile = app.profiles('em-vibgy').items[0];
  assert.equal(profile.name, 'Edited v2 profile');
  assert.deepEqual(new Set(profile.groups), new Set(['COMMON', 'TOR-OLD', 'BER-OLD']));
  assert.equal(profile.groupsByLocation, undefined);
  app.updateLocationDefaults('network-berlin', 'Berlin', 'persist', { revision: 1, groups: ['BER-BASE'] });
  store.close(); store = openStore(path); seedDemo(store); app = createPlatform(store);
  assert.deepEqual(app.locationDefaults('network-berlin').items[0].groups, ['BER-BASE']);
  assert.equal(app.profiles('em-vibgy').items[0].revision, 4);
});
