import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Each migration is applied once; JSON keeps provider-owned payloads out of the platform schema.
const migrations = [String.raw`
  CREATE TABLE actors (id TEXT PRIMARY KEY, body TEXT NOT NULL);
  CREATE TABLE hires (id TEXT PRIMARY KEY, body TEXT NOT NULL);
  CREATE TABLE accounts (hireId TEXT PRIMARY KEY REFERENCES hires(id), body TEXT NOT NULL);
  CREATE TABLE requests (id TEXT PRIMARY KEY, hireId TEXT NOT NULL REFERENCES hires(id),
    requestKey TEXT NOT NULL UNIQUE, body TEXT NOT NULL);
  CREATE INDEX requests_hire ON requests(hireId);
  CREATE TABLE assignments (id TEXT PRIMARY KEY, hireId TEXT NOT NULL REFERENCES hires(id),
    groupName TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(hireId, groupName));
  CREATE TABLE events (id TEXT PRIMARY KEY, hireId TEXT NOT NULL REFERENCES hires(id), body TEXT NOT NULL);
  CREATE INDEX events_hire ON events(hireId);
  CREATE TABLE commands (actorId TEXT NOT NULL REFERENCES actors(id), operation TEXT NOT NULL,
    commandKey TEXT NOT NULL, payload TEXT NOT NULL, response TEXT NOT NULL,
    PRIMARY KEY(actorId, operation, commandKey));
`];

const tables = new Set(['actors', 'hires', 'accounts', 'requests', 'assignments', 'events']);
export function openStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > migrations.length) throw Error('Database is newer than this application.');
  for (let i = version; i < migrations.length; i++) {
    db.exec('BEGIN IMMEDIATE');
    try { db.exec(migrations[i]); db.exec(`PRAGMA user_version=${i + 1}`); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function table(name) {
    if (!tables.has(name)) throw Error('Unknown repository');
    return name;
  }
  return {
    close: () => db.close(),
    resetDemo() {
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const name of ['commands', 'events', 'assignments', 'requests', 'accounts', 'hires', 'actors']) db.exec(`DELETE FROM ${name}`);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    transaction(fn) {
      db.exec('BEGIN IMMEDIATE');
      try { const result = fn(); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    get(name, id) {
      const key = name === 'accounts' ? 'hireId' : 'id';
      const row = db.prepare(`SELECT body FROM ${table(name)} WHERE ${key}=?`).get(id);
      return row ? JSON.parse(row.body) : null;
    },
    list(name, { hireId, offset = 0, limit = 100 } = {}) {
      const where = hireId ? 'WHERE hireId=?' : '';
      const params = hireId ? [hireId, limit, offset] : [limit, offset];
      return db.prepare(`SELECT body FROM ${table(name)} ${where} ORDER BY rowid ${name === 'events' ? 'DESC' : 'ASC'} LIMIT ? OFFSET ?`)
        .all(...params).map(row => JSON.parse(row.body));
    },
    put(name, record) {
      const body = JSON.stringify(record);
      if (name === 'accounts') db.prepare('INSERT INTO accounts VALUES (?,?) ON CONFLICT(hireId) DO UPDATE SET body=excluded.body').run(record.hireId, body);
      else if (name === 'requests') db.prepare('INSERT INTO requests VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(record.id, record.hireId, record.requestKey, body);
      else if (name === 'assignments') db.prepare('INSERT INTO assignments VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(record.id, record.hireId, record.group, body);
      else if (name === 'events') db.prepare('INSERT INTO events VALUES (?,?,?)').run(record.id, record.hireId, body);
      else db.prepare(`INSERT INTO ${table(name)} VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body`).run(record.id, body);
      return record;
    },
    command(actorId, operation, key) {
      return db.prepare('SELECT payload,response FROM commands WHERE actorId=? AND operation=? AND commandKey=?').get(actorId, operation, key);
    },
    saveCommand(actorId, operation, key, payload, response) {
      db.prepare('INSERT INTO commands VALUES (?,?,?,?,?)').run(actorId, operation, key, payload, JSON.stringify(response));
    }
  };
}
