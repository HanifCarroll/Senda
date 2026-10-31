import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Project, exportBundle } from '../src/core/index.js';
import { describeModel } from '../src/core/model.js';
import { openHostedProjects } from '../src/server/projects.js';
import { createApplication } from '../src/server/application.js';

const seed = Number(process.env.FC_SEED ?? 20261031);
const label = fc.string({ minLength: 1, maxLength: 40 }).filter(s => s.trim().length > 0);
const init = { name: 'Synthetic process', purpose: 'Exercise saved work', perspective: 'Test operator' };
async function temporary(work) {
  const directory = await mkdtemp(path.join(tmpdir(), 'senda-property-'));
  try { await work(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

test('generated edit histories preserve atomic revisions, previews and stale-writer protection after reopening', async () => {
  await fc.assert(fc.asyncProperty(fc.array(fc.record({
    kind: fc.constantFrom('edit', 'preview', 'stale', 'invalid', 'reopen', 'noop', 'review'), text: label,
  }), { minLength: 3, maxLength: 12 }), async actions => temporary(async directory => {
    let project = await Project.create(directory, init);
    const snapshots = [project.read()];
    try {
      for (const action of actions) {
        const before = project.read(), history = project.history();
        const proposal = { expectedRevision: before.revision, summary: 'Generated change', context: { scopeNotes: action.text } };
        if (action.kind === 'edit') {
          const result = await project.apply(proposal);
          const changed = before.discovery.context.scopeNotes !== action.text;
          assert.equal(result.revision, before.revision + Number(changed));
          assert.equal(project.read().discovery.context.scopeNotes, action.text);
          if (changed) {
            snapshots.push(project.read());
            assert.deepEqual(project.read().reviews, {});
            assert.equal(project.read().status, 'draft');
          }
        } else if (action.kind === 'review') {
          await project.review({ expectedRevision: before.revision, aspect: 'semantic', outcome: 'approved', reviewer: 'Synthetic reviewer', notes: action.text });
          assert.equal(project.read().revision, before.revision + 1);
          snapshots.push(project.read());
        } else if (action.kind === 'preview') {
          const preview = await project.preview(proposal);
          assert.equal(preview.candidate.discovery.context.scopeNotes, action.text);
          assert.deepEqual(project.read(), before);
          assert.deepEqual(project.history(), history);
        } else if (action.kind === 'stale') {
          await assert.rejects(project.apply({ ...proposal, expectedRevision: before.revision + 1 }), { code: 'STALE_REVISION' });
        } else if (action.kind === 'invalid') {
          await assert.rejects(project.apply({ ...proposal, operations: [
            { op: 'add', kind: 'task', id: 'Transient', name: 'Must roll back' },
            { op: 'connect', source: 'Transient', target: 'Missing' },
          ] }));
        } else if (action.kind === 'noop') {
          assert.equal((await project.apply({ expectedRevision: before.revision, summary: 'No content change' })).unchanged, true);
        } else {
          project.close(); project = new Project(directory);
        }
        if (!['edit', 'preview', 'review'].includes(action.kind)) {
          assert.deepEqual(project.read(), before);
          assert.deepEqual(project.history(), history);
        }
        assert.equal(project.history().length, snapshots.length);
        for (const snapshot of snapshots) assert.deepEqual(project.read(snapshot.revision), snapshot);
      }
    } finally { project.close(); }
  })), { seed, numRuns: 35 });
});

test('generated BPMN edits survive portable export and reimport with names and control flow intact', async () => {
  const xml = await readFile(new URL('./fixtures/simple.bpmn', import.meta.url), 'utf8');
  await fc.assert(fc.asyncProperty(label, label, async (name, source) => temporary(async directory => {
    const project = await Project.create(path.join(directory, 'original'), init);
    let imported;
    try {
      await project.import({ expectedRevision: 1, summary: 'Import synthetic flow', xml });
      await project.apply({ expectedRevision: 2, summary: 'Edit imported task',
        sources: [{ id: 'Interview', title: 'Synthetic source', kind: 'document', text: source }],
        operations: [{ op: 'set', id: 'Prepare', values: { name } }],
      });
      const model = await describeModel(project.read().xml);
      assert.equal(model.find(e => e.id === 'Prepare').name, name);
      assert.deepEqual(model.filter(e => e.type === 'bpmn:SequenceFlow').map(e => [e.source, e.target]), [['Start', 'Prepare'], ['Prepare', 'End']]);
      const bundle = await exportBundle(project, path.join(directory, 'export'));
      const portable = await readFile(path.join(bundle.directory, 'model.bpmn'), 'utf8');
      assert.deepEqual(await describeModel(portable), model);
      const discovery = JSON.parse(await readFile(path.join(bundle.directory, 'discovery.json'), 'utf8'));
      assert.deepEqual(discovery.discovery, project.read().discovery);
      imported = await Project.create(path.join(directory, 'imported'), init);
      await imported.import({ expectedRevision: 1, summary: 'Round trip portable BPMN', xml: portable });
      assert.deepEqual(await describeModel(imported.read().xml), model);
      await assert.rejects(exportBundle(project, bundle.directory), { code: 'EXPORT_EXISTS' });
      assert.equal(await readFile(path.join(bundle.directory, 'model.bpmn'), 'utf8'), portable);
    } finally { project.close(); imported?.close(); }
  })), { seed, numRuns: 25 });
});

test('generated share, revoke, delete and restore histories never expose another owner or resurrect grants', async () => {
  await fc.assert(fc.asyncProperty(fc.array(fc.constantFrom('grant', 'revoke', 'delete', 'restore', 'reopen'), { minLength: 5, maxLength: 25 }), async actions => temporary(async directory => {
    let projects = await openHostedProjects(directory);
    const owner = { userId: 'owner' }, other = { userId: 'other' }, agent = { userId: 'owner', clientId: 'client' };
    let active = true, shared = false;
    try {
      const project = await projects.create(owner, init);
      const saved = await projects.withProject(owner, project.id, p => p.read());
      for (const action of actions) {
        if (action === 'grant' && active) { projects.grant(owner.userId, agent.clientId, project.id); shared = true; }
        if (action === 'revoke') { projects.revokeAll(owner.userId); shared = false; }
        if (action === 'delete' && active) { await projects.delete(owner, project.id); active = false; shared = false; }
        if (action === 'restore' && !active) { await projects.restore(owner, project.id); active = true; }
        if (action === 'reopen') { projects.close(); projects = await openHostedProjects(directory); }
        assert.deepEqual(projects.list(other), []);
        assert.throws(() => projects.authorize(other, project.id), { code: 'NOT_FOUND' });
        await assert.rejects(projects.delete(other, project.id), { code: 'NOT_FOUND' });
        await assert.rejects(projects.restore(other, project.id), { code: 'NOT_FOUND' });
        assert.equal(projects.list(owner).length, Number(active));
        assert.equal(projects.list(agent).length, Number(active && shared));
        assert.equal(projects.deleted(owner).length, Number(!active));
        if (active) assert.deepEqual(await projects.withProject(owner, project.id, p => p.read()), saved);
        else await assert.rejects(projects.read(owner, project.id), { code: 'PROJECT_DELETED' });
        if (active && shared) assert.equal(projects.authorize(agent, project.id).owner, owner.userId);
        else assert.throws(() => projects.authorize(agent, project.id), { code: active ? 'NOT_FOUND' : 'PROJECT_DELETED' });
      }
    } finally { projects.close(); }
  })), { seed, numRuns: 40 });
});

test('malformed JSON is a client error and cannot create projects', async () => temporary(async directory => {
  const origin = 'http://127.0.0.1:32323';
  const application = await createApplication({ origin, directory, secret: 'synthetic-property-secret-never-used-in-production' });
  try {
    const signup = await application.handle(new Request(`${origin}/api/auth/sign-up/email`, {
      method: 'POST', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'property@example.test', password: 'synthetic-password', name: 'Test' }),
    }));
    assert.equal(signup.status, 200);
    const cookie = signup.headers.getSetCookie().map(item => item.split(';')[0]).join('; ');
    await fc.assert(fc.asyncProperty(fc.string({ maxLength: 100 }), async text => {
      const response = await application.handle(new Request(`${origin}/api/projects`, {
        method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' }, body: `!${text}`,
      }));
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'INVALID_REQUEST');
      const listed = await application.handle(new Request(`${origin}/api/projects`, { headers: { cookie } }));
      assert.deepEqual(await listed.json(), []);
    }), { seed, numRuns: 100, examples: [['']] });
    const unreadable = new Request(`${origin}/api/projects`, {
      method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' }, body: '{}',
    });
    unreadable.json = async () => { throw new Error('Synthetic body reader failure'); };
    const failed = await application.handle(unreadable);
    assert.equal(failed.status, 500);
    const failure = await failed.json();
    assert.equal(failure.code, 'FAILED');
    assert.ok(!failure.message.includes('Synthetic body reader failure'));
    const listed = await application.handle(new Request(`${origin}/api/projects`, { headers: { cookie } }));
    assert.deepEqual(await listed.json(), []);
  } finally { application.close(); }
}));

test('generated As-is and To-be edits keep independent histories and the pinned baseline after reopening', async () => {
  const xml = await readFile(new URL('./fixtures/simple.bpmn', import.meta.url), 'utf8');
  await fc.assert(fc.asyncProperty(fc.array(fc.record({ future: fc.boolean(), text: label }), { minLength: 2, maxLength: 8 }), async edits => temporary(async directory => {
    let projects = await openHostedProjects(directory);
    const owner = { userId: 'owner' };
    try {
      const project = await projects.create(owner, init);
      await projects.withProject(owner, project.id, p => p.import({ expectedRevision: 1, summary: 'Import current flow', xml }));
      const baseline = await projects.withProject(owner, project.id, p => p.read());
      await projects.createToBe(owner, project.id, { baselineRevision: 2, brief: 'Plan a simpler process' });
      const pinned = (await projects.models(owner, project.id)).toBe.baseline;
      assert.equal(pinned.revision, 2);
      const read = model => projects.withProject(owner, project.id, p => p.read(), model);
      const histories = { 'as-is': [baseline], 'to-be': [await read('to-be')] };
      for (const edit of edits) {
        const model = edit.future ? 'to-be' : 'as-is', untouched = edit.future ? 'as-is' : 'to-be';
        const before = await read(model), other = await read(untouched);
        const result = await projects.apply(owner, project.id, { expectedRevision: before.revision, summary: 'Clarify one model', context: { scopeNotes: edit.text } }, model);
        const changed = before.discovery.context.scopeNotes !== edit.text;
        const selected = await read(model);
        assert.equal(selected.discovery.context.scopeNotes, edit.text);
        assert.equal(selected.revision, before.revision + Number(changed));
        assert.equal(result.revision, selected.revision);
        assert.equal(result.unchanged, !changed);
        if (changed) histories[model].push(selected);
        assert.deepEqual(await read(untouched), other);
        projects.close(); projects = await openHostedProjects(directory);
        assert.deepEqual(await read(model), selected);
        assert.deepEqual((await projects.models(owner, project.id)).toBe.baseline, pinned);
        for (const kind of ['as-is', 'to-be']) for (const snapshot of histories[kind])
          assert.deepEqual(await projects.withProject(owner, project.id, p => p.read(snapshot.revision), kind), snapshot);
        assert.deepEqual(await projects.withProject(owner, project.id, p => p.read(2)), baseline);
      }
      await assert.rejects(projects.createToBe(owner, project.id, { baselineRevision: 2, brief: 'Duplicate plan' }), { code: 'MODEL_EXISTS' });
    } finally { projects.close(); }
  })), { seed, numRuns: 25 });
});
