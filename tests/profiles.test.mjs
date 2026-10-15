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

const fields = { name: 'Platform developer', groupsByLocation: { Toronto: [' TOR-DEV ', 'TOR-DEV'], Berlin: ['BER-DEV'] }, adminRequired: true };
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
  assert.deepEqual(profile.groupsByLocation.Toronto, ['TOR-DEV']);
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
  assert.deepEqual(hire.requestedGroups, ['BER-DEV']);
  assert.equal(hire.adminRequired, true);
  assert.equal(hire.profileName, profile.name);
  assert.equal(hire.profileId, profile.id);
  app.updateProfile('em-vibgy', profile.id, 'edit', { ...fields, revision: 1, name: 'Renamed', groupsByLocation: { Toronto: ['TOR-NEW'], Berlin: ['BER-NEW'] } });
  assert.deepEqual(app.get('em-vibgy', hire.id), hire);
  assert.deepEqual(app.create('em-vibgy', 'hire-defaults', body), hire);
  const future = app.create('em-vibgy', 'future', body);
  assert.deepEqual(future.requestedGroups, ['BER-NEW']);
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
    { ...fields, groupsByLocation: { Toronto: ['T'] } },
    { ...fields, groupsByLocation: { Toronto: [], Berlin: ['B'] } },
    { ...fields, groupsByLocation: { Toronto: ['T'], Berlin: [' '] } },
    { ...fields, groupsByLocation: { Toronto: ['T'], Berlin: ['x'.repeat(301)] } },
    { ...fields, groupsByLocation: { Toronto: Array(31).fill('T'), Berlin: ['B'] } }
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
  legacy.exec("DROP TABLE profiles; UPDATE hires SET body=json_remove(body,'$.profileName','$.profileRevision'); PRAGMA user_version=1;");
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
  assert.deepEqual(hire.data.requestedGroups, ['BER-DEV']);
  assert.equal((await fetch(`${base}/api/profiles`, { headers: { 'X-Demo-Actor-Id': 'network-berlin' } })).status, 403);
});
