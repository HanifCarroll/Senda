import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, closeSync, openSync } from 'node:fs';
import path from 'node:path';
import { hash } from './hash.js';
export { hash, contentHash } from './hash.js';
import { requireThat, ScribeError } from './errors.js';


export class Store {
  constructor(directory, { create = false } = {}) {
    this.directory = path.resolve(directory);
    this.filename = path.join(this.directory, 'process-scribe.sqlite');
    if (create) {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      try { closeSync(openSync(this.filename, 'wx', 0o600)); }
      catch (e) { if (e.code === 'EEXIST') throw new ScribeError('PROJECT_EXISTS', 'This directory already contains a project.'); throw e; }
    } else requireThat(existsSync(this.filename), 'PROJECT_NOT_FOUND', 'No project exists here. Run init first.');
    this.db = new DatabaseSync(this.filename);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
    if (create) this.db.exec(`
      CREATE TABLE metadata (version INTEGER NOT NULL);
      INSERT INTO metadata VALUES (1);
      CREATE TABLE revisions (
        revision INTEGER PRIMARY KEY, parent INTEGER, created_at TEXT NOT NULL,
        summary TEXT NOT NULL, snapshot TEXT NOT NULL, digest TEXT NOT NULL,
        FOREIGN KEY(parent) REFERENCES revisions(revision)
      );
      CREATE TRIGGER immutable_update BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT, 'Revisions are immutable'); END;
      CREATE TRIGGER immutable_delete BEFORE DELETE ON revisions BEGIN SELECT RAISE(ABORT, 'Revisions are immutable'); END;
    `);
    requireThat(this.db.prepare('SELECT version FROM metadata').get()?.version === 1, 'UNSUPPORTED_PROJECT', 'Unsupported project database version.');
  }

  read(revision) {
    const row = revision === undefined
      ? this.db.prepare('SELECT * FROM revisions ORDER BY revision DESC LIMIT 1').get()
      : this.db.prepare('SELECT * FROM revisions WHERE revision = ?').get(revision);
    requireThat(row, 'REVISION_NOT_FOUND', 'The requested revision does not exist.');
    requireThat(hash(row.snapshot) === row.digest, 'CORRUPT_REVISION', 'The saved revision failed its integrity check.');
    const snapshot = JSON.parse(row.snapshot);
    requireThat([1, 2].includes(snapshot.formatVersion), 'UNSUPPORTED_PROJECT', 'Unsupported project snapshot version.');
    return snapshot;
  }

  append(expectedRevision, candidate, summary) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.db.prepare('SELECT MAX(revision) AS revision FROM revisions').get().revision || 0;
      requireThat(current === expectedRevision, 'STALE_REVISION', 'The project changed. Read it again before applying this proposal.', { expected: expectedRevision, actual: current });
      const snapshot = { ...candidate, revision: current + 1, createdAt: new Date().toISOString() };
      const json = JSON.stringify(snapshot);
      this.db.prepare('INSERT INTO revisions VALUES (?,?,?,?,?,?)').run(snapshot.revision, current || null, snapshot.createdAt, summary, json, hash(json));
      this.db.exec('COMMIT');
      return snapshot;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  history() { return this.db.prepare('SELECT revision,parent,created_at AS createdAt,summary FROM revisions ORDER BY revision').all(); }
  close() { this.db.close(); }
}
