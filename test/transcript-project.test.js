import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { memoryD1 } from './fixtures/d1.js';
import { CloudProjects } from '../src/cloudflare/projects.js';
import { HostedProjects } from '../src/server/projects.js';

const actor = { userId: 'transcript-owner' };
const source = { id: 'Interview', title: 'Intake interview', kind: 'transcript', text: 'Coordinator: I receive each repair request and arrange a visit.' };

async function fixture(kind) {
  if (kind === 'node') {
    const directory = await mkdtemp(path.join(tmpdir(), 'senda-transcript-project-'));
    const projects = new HostedProjects(directory);
    return { projects, close: async () => { projects.db.close(); await rm(directory, { recursive: true, force: true }); } };
  }
  const db = memoryD1(), objects = new Map();
  for (const file of (await readdir(new URL('../src/cloudflare/migrations/', import.meta.url))).sort()) {
    db.exec(await readFile(new URL('../src/cloudflare/migrations/' + file, import.meta.url), 'utf8'));
  }
  const bucket = {
    put: async (key, value) => { objects.set(key, value); },
    get: async key => objects.has(key) ? { text: async () => objects.get(key) } : null,
    delete: async key => { objects.delete(key); },
  };
  return { projects: new CloudProjects(db, bucket), db, close: async () => db.close() };
}

for (const kind of ['node', 'cloudflare']) {
  test(`${kind}: a transcript starts a project without a questionnaire; the agent can draft its details`, async () => {
    const f = await fixture(kind), p = f.projects;
    try {
      const created = await p.create(actor, { source });
      assert.equal(created.name, 'Untitled process');
      const initial = await p.read(actor, created.id);
      assert.equal(initial.discovery.sources[0].text, source.text);
      assert.equal(initial.discovery.context.purpose, 'No purpose added yet');
      assert.equal(initial.discovery.context.perspective, 'No perspective added yet');
      await p.apply(actor, created.id, {
        expectedRevision: 1, summary: 'Draft the process details from the interview',
        name: 'Repair requests', context: { purpose: 'Map repair request handling', perspective: 'Repair coordinator' },
        operations: [{ op: 'add', kind: 'task', id: 'Receive_Request', name: 'Receive repair request' }],
      });
      const drafted = await p.read(actor, created.id);
      assert.equal(drafted.name, 'Repair requests');
      assert.equal(drafted.discovery.context.purpose, 'Map repair request handling');
      assert.equal((await p.list(actor))[0].name, 'Repair requests');
      assert.equal((await p.models(actor, created.id)).name, 'Repair requests');
      assert.equal((await p.read(actor, created.id, 1)).name, 'Untitled process');
      await assert.rejects(p.apply(actor, created.id, { expectedRevision: 1, name: 'Stale name', summary: 'Rejected stale rename' }), { code: 'STALE_REVISION' });
      assert.equal((await p.list(actor))[0].name, 'Repair requests');
      await assert.rejects(p.apply({ userId: 'someone-else' }, created.id, { expectedRevision: 2, name: 'Unauthorized', summary: 'Rejected unauthorized rename' }), { code: 'NOT_FOUND' });
      await p.createToBe(actor, created.id, { baselineRevision: 2, brief: 'Plan future repair request handling.' });
      await p.apply(actor, created.id, { expectedRevision: 1, name: 'Future repair requests', summary: 'Name the separate future model' }, 'to-be');
      assert.equal((await p.read(actor, created.id, undefined, 'to-be')).name, 'Future repair requests');
      assert.equal((await p.list(actor))[0].name, 'Repair requests');
    } finally { await f.close(); }
  });

  test(`${kind}: supplied details stay intact and missing context requires source text`, async () => {
    const f = await fixture(kind), p = f.projects;
    try {
      const created = await p.create(actor, { name: '  Visits  ', purpose: 'Schedule visits', perspective: 'Coordinator', source });
      assert.equal(created.name, 'Visits');
      assert.equal((await p.read(actor, created.id)).discovery.context.perspective, 'Coordinator');
      await assert.rejects(p.create(actor, {}));
      await assert.rejects(p.create(actor, { source: { ...source, text: '  \n ' } }));
      const partial = await p.create(actor, { name: '  ', purpose: 'Understand delays', source });
      assert.equal(partial.name, 'Untitled process');
      assert.equal((await p.read(actor, partial.id)).discovery.context.purpose, 'Understand delays');
    } finally { await f.close(); }
  });
}

test('cloudflare: a failed catalog rename rolls back its revision in the same batch', async () => {
  const f = await fixture('cloudflare'), p = f.projects;
  try {
    const created = await p.create(actor, { source });
    const prepare = f.db.prepare;
    f.db.prepare = sql => {
      const statement = prepare(sql);
      if (sql.startsWith('UPDATE senda_projects SET name=')) statement.run = () => { throw new Error('Catalog write failed'); };
      return statement;
    };
    await assert.rejects(p.apply(actor, created.id, { expectedRevision: 1, name: 'Unpublished name', summary: 'Attempt an atomic rename' }), /Catalog write failed/);
    f.db.prepare = prepare;
    assert.equal((await p.read(actor, created.id)).revision, 1);
    assert.equal((await p.read(actor, created.id)).name, 'Untitled process');
    assert.equal((await p.list(actor))[0].name, 'Untitled process');
  } finally { await f.close(); }
});
