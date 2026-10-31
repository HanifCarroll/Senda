import test from 'node:test';
import assert from 'node:assert/strict';
import { createActor, SimulatedClock } from 'xstate';
import { createProjectListMachine, createProjectReviewMachine, createProjectMutationMachine } from '../src/web/lib/project-machines.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const models = revision => ({ asIs: { revision }, toBe: null });

test('restoring during a delayed initial list ignores the old list and stays pending through refresh', async () => {
  const old = deferred(), refreshed = deferred(), restore = deferred(), calls = [];
  let reads = 0;
  const actor = createActor(createProjectListMachine({
    list: () => reads++ === 0 ? old.promise : refreshed.promise,
    deleted: async () => [{ id: 'first' }, { id: 'second' }], quota: async () => ({ projectLimit: 3 }),
    restore: id => { calls.push(id); return restore.promise; }, navigate: () => {},
  })).start();
  actor.send({ type: 'START' });
  await tick();
  actor.send({ type: 'RESTORE', projectId: 'first' });
  actor.send({ type: 'RESTORE', projectId: 'second' });
  restore.resolve({}); await tick();
  assert.equal(actor.getSnapshot().hasTag('restoring'), true);
  actor.send({ type: 'RESTORE', projectId: 'second' });
  old.resolve([]); await tick();
  assert.equal(actor.getSnapshot().context.projects, null);
  refreshed.resolve([{ id: 'first' }]); await tick();
  assert.deepEqual(actor.getSnapshot().context.projects, [{ id: 'first' }]);
  assert.deepEqual(calls, ['first']);
  assert.equal(actor.getSnapshot().hasTag('restoring'), false);
  assert.deepEqual(actor.getSnapshot().context.deletedProjects, [{ id: 'second' }]);
  actor.stop();
});

test('restore errors keep the project recoverable and refresh failure explains the saved restore', async () => {
  let reads = 0, attempts = 0;
  const actor = createActor(createProjectListMachine({
    list: async () => { if (reads++) throw new Error('offline'); return []; },
    deleted: async () => [{ id: 'first' }], quota: async () => null,
    restore: async () => { if (!attempts++) throw new Error('Your workspace is full.'); }, navigate: () => {},
  })).start();
  actor.send({ type: 'START' }); await tick();
  actor.send({ type: 'RESTORE', projectId: 'first' }); await tick();
  assert.match(actor.getSnapshot().context.restoreError, /full/);
  assert.equal(actor.getSnapshot().context.deletedProjects.length, 1);
  actor.send({ type: 'RESTORE', projectId: 'first' }); await tick(); await tick();
  assert.equal(actor.getSnapshot().context.restoredId, 'first');
  assert.match(actor.getSnapshot().context.error, /restored.*could not refresh/);
  assert.equal(actor.getSnapshot().hasTag('restoring'), false);
  actor.stop();
});

test('metadata paints before a slow review and polling never replaces that cold review', async () => {
  const review = deferred(), clock = new SimulatedClock();
  let metadataReads = 0;
  const actor = createActor(createProjectReviewMachine({
    models: async () => { metadataReads++; return models(1); }, review: () => review.promise,
    visible: () => true, navigate: () => {},
  }), { clock }).start();
  actor.send({ type: 'SELECT', selection: { projectId: 'one', model: 'as-is' } }); await tick();
  assert.equal(actor.getSnapshot().context.models.asIs.revision, 1);
  assert.equal(actor.getSnapshot().context.review, null);
  clock.increment(15000); await tick();
  assert.equal(metadataReads, 1);
  review.resolve({ revision: 1 }); await tick();
  assert.equal(actor.getSnapshot().context.review.revision, 1);
  actor.stop();
});

test('latest polling recovers after failure, skips hidden pages and stops for historical selection', async () => {
  const clock = new SimulatedClock(); let visible = true, reads = 0;
  const actor = createActor(createProjectReviewMachine({
    models: async () => { if (++reads === 2) throw new Error('offline'); return models(1); },
    review: async input => ({ revision: input.revision || 1 }), visible: () => visible, navigate: () => {},
  }), { clock }).start();
  actor.send({ type: 'SELECT', selection: { projectId: 'one', model: 'as-is' } }); await tick();
  clock.increment(5000); await tick();
  assert.match(actor.getSnapshot().context.notice, /Updates paused/);
  clock.increment(5000); await tick();
  assert.equal(actor.getSnapshot().context.notice, '');
  visible = false; clock.increment(5000); await tick();
  assert.equal(reads, 3);
  actor.send({ type: 'SELECT', selection: { projectId: 'one', model: 'as-is', revision: 1 } }); await tick();
  const before = reads; visible = true; clock.increment(15000); await tick();
  assert.equal(reads, before);
  actor.stop();
});

test('selection changes cancel old loads and absent To-be is normal even when its review returns 404', async () => {
  const old = deferred(); let firstSignal;
  const actor = createActor(createProjectReviewMachine({
    models: async () => models(2),
    review: (selection, signal) => {
      if (selection.model === 'to-be') throw Object.assign(new Error('missing'), { status: 404 });
      if (!selection.revision) { firstSignal = signal; return old.promise; }
      return Promise.resolve({ revision: selection.revision });
    },
    visible: () => true, navigate: () => {},
  })).start();
  actor.send({ type: 'SELECT', selection: { projectId: 'one', model: 'as-is' } }); await tick();
  actor.send({ type: 'SELECT', selection: { projectId: 'one', model: 'as-is', revision: 1 } }); await tick();
  assert.equal(firstSignal.aborted, true);
  old.resolve({ revision: 2 }); await tick();
  assert.equal(actor.getSnapshot().context.review.revision, 1);
  actor.send({ type: 'SELECT', selection: { projectId: 'one', model: 'to-be' } }); await tick();
  assert.equal(actor.getSnapshot().context.review, null);
  assert.equal(actor.getSnapshot().context.error, '');
  actor.stop();
});

test('mutation blocks duplicate saves until refresh finishes and exposes revision conflict', async () => {
  const saved = deferred(), refreshed = deferred(), calls = [];
  const actor = createActor(createProjectMutationMachine({
    submit: data => { calls.push(data); return saved.promise; }, committed: () => refreshed.promise,
    failure: error => error.status === 409 ? 'Your project changed while you were writing.' : error.message,
  })).start();
  actor.send({ type: 'SUBMIT', data: { kind: 'answer', expectedRevision: 3 } });
  actor.send({ type: 'SUBMIT', data: { kind: 'answer' } });
  saved.resolve({}); await tick();
  assert.equal(actor.getSnapshot().hasTag('busy'), true);
  actor.send({ type: 'SUBMIT', data: { kind: 'answer' } });
  refreshed.resolve(); await tick();
  assert.equal(calls.length, 1);
  assert.equal(actor.getSnapshot().hasTag('busy'), false);
  actor.stop();
  const failing = createActor(createProjectMutationMachine({
    submit: async () => { throw Object.assign(new Error('conflict'), { status: 409 }); }, committed: () => {},
    failure: error => error.status === 409 ? 'Your project changed while you were writing.' : error.message,
  })).start();
  failing.send({ type: 'SUBMIT', data: {} }); await tick();
  assert.match(failing.getSnapshot().context.error, /changed while/);
  assert.equal(failing.getSnapshot().hasTag('busy'), false);
  failing.stop();
});

test('a newly published head refreshes the diagram and a failed render can recover on a later poll', async () => {
  const clock = new SimulatedClock(); let head = 1, renderReads = 0;
  const actor = createActor(createProjectReviewMachine({
    models: async () => models(head),
    review: async () => {
      if (++renderReads === 2) throw new Error('render temporarily unavailable');
      return { revision: head };
    },
    visible: () => true, navigate: () => {},
  }), { clock }).start();
  actor.send({ type: 'SELECT', selection: { projectId: 'one', model: 'as-is' } }); await tick();
  head = 2; clock.increment(5000); await tick(); await tick();
  assert.match(actor.getSnapshot().context.error, /temporarily unavailable/);
  assert.equal(actor.getSnapshot().context.review.revision, 1);
  clock.increment(5000); await tick(); await tick();
  assert.equal(actor.getSnapshot().context.review.revision, 2);
  assert.equal(actor.getSnapshot().context.error, '');
  assert.equal(actor.getSnapshot().context.notice, 'The latest revision is ready.');
  actor.stop();
});

test('an initial render failure after metadata recovers automatically on the next latest poll', async () => {
  const clock = new SimulatedClock(); let renders = 0;
  const actor = createActor(createProjectReviewMachine({
    models: async () => models(1),
    review: async () => { if (!renders++) throw new Error('temporary render failure'); return { revision: 1 }; },
    visible: () => true, navigate: () => {},
  }), { clock }).start();
  actor.send({ type: 'SELECT', selection: { projectId: 'one', model: 'as-is' } }); await tick();
  assert.match(actor.getSnapshot().context.error, /temporary render failure/);
  assert.equal(actor.getSnapshot().context.models.asIs.revision, 1);
  clock.increment(5000); await tick(); await tick();
  assert.equal(actor.getSnapshot().context.review.revision, 1);
  assert.equal(actor.getSnapshot().context.error, '');
  actor.stop();
});

test('successful deletion stops current review requests and navigates once', async () => {
  const old = deferred(), saved = deferred(), navigation = []; let signal;
  const review = createActor(createProjectReviewMachine({
    models: async () => models(1),
    review: (_input, requestSignal) => { signal = requestSignal; return old.promise; },
    visible: () => true, navigate: () => {},
  })).start();
  review.send({ type: 'SELECT', selection: { projectId: 'one', model: 'as-is' } }); await tick();
  const deletion = createActor(createProjectMutationMachine({
    submit: () => saved.promise,
    committed: () => { review.send({ type: 'STOP' }); navigation.push('/app?deleted=one'); },
    redirecting: true,
  })).start();
  assert.equal(deletion.getSnapshot().can({ type: 'SUBMIT', data: null }), true);
  assert.deepEqual(navigation, []);
  deletion.send({ type: 'SUBMIT', data: null });
  deletion.send({ type: 'SUBMIT', data: null });
  saved.resolve({}); await tick();
  assert.equal(signal.aborted, true);
  assert.deepEqual(navigation, ['/app?deleted=one']);
  assert.equal(deletion.getSnapshot().hasTag('busy'), true);
  old.resolve({ revision: 1 }); await tick();
  assert.equal(review.getSnapshot().context.review, null);
  deletion.stop(); review.stop();
});

test('To-be creation keeps its chosen baseline and brief through submission and refresh', async () => {
  const refresh = deferred(), received = [];
  const actor = createActor(createProjectMutationMachine({
    submit: async data => { received.push(data); return { revision: 1 }; },
    committed: async (result, data) => { received.push({ result, data }); await refresh.promise; },
  })).start();
  const data = { baselineRevision: 3, brief: 'Have Finance and Delivery work at the same time.' };
  actor.send({ type: 'SUBMIT', data }); await tick();
  assert.deepEqual(received, [data, { result: { revision: 1 }, data }]);
  assert.equal(actor.getSnapshot().hasTag('busy'), true);
  refresh.resolve(); await tick();
  assert.equal(actor.getSnapshot().hasTag('busy'), false);
  actor.stop();
});
