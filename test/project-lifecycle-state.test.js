import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { memoryD1 } from './fixtures/d1.js';
import { CloudProjects } from '../src/cloudflare/projects.js';
import { nextProjectState, projectIsActive, PROJECT_RETENTION_MS } from '../src/core/project-lifecycle.js';

test('project lifecycle permits restore only during retention and resumes interrupted purging', () => {
  const deletedAt = Date.parse('2026-10-31T12:00:00Z');
  const active = { state: 'active', deleted_at: null };
  const deleted = { state: 'deleted', deleted_at: new Date(deletedAt).toISOString() };
  assert.equal(projectIsActive(active), true);
  assert.equal(nextProjectState(active, 'DELETE', deletedAt), 'deleted');
  assert.equal(nextProjectState(active, 'RESTORE', deletedAt), undefined);
  assert.equal(nextProjectState(deleted, 'RESTORE', deletedAt + PROJECT_RETENTION_MS - 1), 'active');
  assert.equal(nextProjectState(deleted, 'BEGIN_PURGE', deletedAt + PROJECT_RETENTION_MS - 1), undefined);
  assert.equal(nextProjectState(deleted, 'RESTORE', deletedAt + PROJECT_RETENTION_MS), undefined);
  assert.equal(nextProjectState(deleted, 'BEGIN_PURGE', deletedAt + PROJECT_RETENTION_MS), 'purging');
  const purging = { ...deleted, state: 'purging' };
  assert.equal(projectIsActive(purging), false);
  assert.equal(nextProjectState(purging, 'BEGIN_PURGE', deletedAt + PROJECT_RETENTION_MS), 'purging');
  assert.equal(nextProjectState(purging, 'RESTORE', deletedAt + PROJECT_RETENTION_MS), undefined);
  assert.equal(nextProjectState(purging, 'FINISH_PURGE', deletedAt + PROJECT_RETENTION_MS), 'purged');
  assert.equal(nextProjectState({ ...deleted, state: 'purged' }, 'RESTORE', deletedAt), undefined);
});

function fixture(t) {
  const db = memoryD1(), objects = new Map();
  for (const name of readdirSync(new URL('../src/cloudflare/migrations/', import.meta.url)).sort())
    db.exec(readFileSync(new URL('../src/cloudflare/migrations/' + name, import.meta.url), 'utf8'));
  t.after(() => db.close());
  const bucket = {
    async put(key, value) { objects.set(key, value); },
    async get(key) { return objects.has(key) ? { text: async () => objects.get(key) } : null; },
    async delete(key) { objects.delete(key); },
  };
  const projects = new CloudProjects(db, bucket), actor = { userId: 'publication-owner' };
  return { db, objects, projects, actor,
    create: () => projects.create(actor, { name: 'Requests', purpose: 'Review requests', perspective: 'Operations' }) };
}

test('a confirmed publication exposes its saved revision and keeps immutable prior content', async t => {
  const f = fixture(t), project = await f.create(), opened = await f.projects.open(f.actor, project.id);
  const initial = opened.read(), saved = await opened.store.append(1, { ...initial, name: 'Updated requests' }, 'Rename process');
  assert.equal(saved.revision, 2);
  assert.equal(opened.read().name, 'Updated requests');
  assert.equal(opened.read(1).name, 'Requests');
  assert.equal(f.objects.size, 2);
  assert.equal((await f.projects.read(f.actor, project.id)).name, 'Updated requests');
});

test('a known competing publication removes only its own losing blob', async t => {
  const f = fixture(t), project = await f.create();
  const first = await f.projects.open(f.actor, project.id), second = await f.projects.open(f.actor, project.id);
  await first.store.append(1, { ...first.read(), name: 'Winning requests' }, 'First writer');
  await assert.rejects(second.store.append(1, { ...second.read(), name: 'Losing requests' }, 'Second writer'), { code: 'STALE_REVISION' });
  assert.equal(f.objects.size, 2);
  assert.equal(second.read().revision, 1, 'A failed append does not advance the opened store');
  assert.equal((await f.projects.read(f.actor, project.id)).name, 'Winning requests');
  assert.equal((await f.projects.list(f.actor))[0].name, 'Winning requests');
});

test('a lost publication response preserves a committed blob and can be read after reopening', async t => {
  const f = fixture(t), project = await f.create(), opened = await f.projects.open(f.actor, project.id);
  const batch = f.db.batch;
  f.db.batch = statements => {
    batch(statements);
    throw new Error('Lost database response');
  };
  await assert.rejects(opened.store.append(1, { ...opened.read(), name: 'Committed requests' }, 'Save despite lost response'), /Lost database response/);
  f.db.batch = batch;
  assert.equal(opened.read().revision, 1, 'The caller cannot infer success from an uncertain response');
  assert.equal(f.objects.size, 2, 'Uncertainty never triggers destructive cleanup');
  assert.equal((await f.projects.read(f.actor, project.id)).name, 'Committed requests');
  assert.equal((await f.projects.list(f.actor))[0].name, 'Committed requests');
});

test('a failed upload never starts publication or changes the saved model', async t => {
  const f = fixture(t), project = await f.create(), opened = await f.projects.open(f.actor, project.id);
  const put = opened.store.bucket.put;
  opened.store.bucket.put = async () => { throw new Error('Object storage unavailable'); };
  await assert.rejects(opened.store.append(1, opened.read(), 'Cannot upload'), /Object storage unavailable/);
  opened.store.bucket.put = put;
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM senda_revisions').first().count, 1);
  assert.equal((await f.projects.read(f.actor, project.id)).revision, 1);
});
