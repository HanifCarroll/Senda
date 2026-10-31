import test from 'node:test';
import assert from 'node:assert/strict';
import { readAgentTurnStream } from '../src/web/lib/agent-chat-machine.ts';

const streamed = chunks => new Response(new ReadableStream({ start(controller) {
  for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
  controller.close();
} }));

test('chat stream characterization: fragmented newline events keep server status, model and incomplete completion', async () => {
  const events = [];
  const terminal = await readAgentTurnStream(streamed([
    '{"type":"status","text":"Saving', '…"}\n',
    '{"type":"done","text":"Saved first change.","projectId":"project","model":"to-be","incomplete":true}\n',
  ]), event => events.push(event));
  assert.deepEqual(events.map(event => event.type), ['status', 'done']);
  assert.equal(events[0].text, 'Saving…');
  assert.equal(terminal.incomplete, true);
  assert.equal(terminal.model, 'to-be');
});

test('chat stream characterization: closing without a newline-delimited terminal never implies completion', async () => {
  for (const ending of ['', '{"type":"done","text":"not newline terminated"}']) {
    await assert.rejects(readAgentTurnStream(streamed(['{"type":"status","text":"Working"}\n', ending]), () => {}), /The connection closed before the reply finished/);
  }
});

test('chat stream characterization: server error terminates while an HTTP failure keeps the existing message', async () => {
  const events = [];
  const terminal = await readAgentTurnStream(streamed(['{"type":"error","text":"Your saved work is safe."}\n']), event => events.push(event));
  assert.equal(terminal.type, 'error');
  assert.equal(events[0].text, 'Your saved work is safe.');
  await assert.rejects(readAgentTurnStream(new Response(JSON.stringify({}), { status: 409 }), () => {}), /Your message could not be sent/);
});

import { createActor, SimulatedClock, transition } from 'xstate';
import { createAgentChatMachine } from '../src/web/lib/agent-chat-machine.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function controlledStream() {
  let controller;
  const response = new Response(new ReadableStream({ start(value) { controller = value; } }));
  return {
    response,
    event(event) { controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + '\n')); },
    close() { controller.close(); },
  };
}
const saved = (overrides = {}) => ({ id: 'chat', projectId: 'project', model: 'to-be', working: false, messages: [], ...overrides });
function fixture(overrides = {}, route = {}) {
  const calls = [], clock = new SimulatedClock();
  const services = {
    config: async (route, signal) => { calls.push(['config', route, signal]); return { available: true }; },
    load: async (id, signal) => { calls.push(['load', id, signal]); return saved({ id }); },
    create: async (project, fresh, signal) => { calls.push(['create', project, fresh, signal]); return { id: 'created' }; },
    turn: async (turn, signal) => { calls.push(['turn', turn, signal]); return streamed(['{"type":"done","text":"Saved."}\n']); },
    navigate: (route, replace) => calls.push(['navigate', route, replace]),
    reset: () => calls.push(['reset']),
    saved: value => calls.push(['saved', value]),
    user: text => calls.push(['user', text]),
    stream: event => calls.push(['stream', event]),
    draft: text => calls.push(['draft', text]),
    unauthorized: () => false,
    ...overrides,
  };
  const machine = createAgentChatMachine(services);
  const actor = createActor(machine, { input: route, clock }).start();
  return { actor, machine, calls, clock, services };
}
const state = actor => actor.getSnapshot().value.active?.conversation;

test('chat lifecycle rejects sends before config, empty sends and double sends through its real entrypoint', async t => {
  const config = deferred(), stream = controlledStream();
  const f = fixture({ config: () => config.promise, turn: async (...args) => { f.calls.push(['turn', ...args]); return stream.response; } });
  t.after(() => f.actor.stop());
  f.actor.send({ type: 'SEND', text: 'Too soon' });
  assert.equal(f.calls.filter(call => call[0] === 'turn').length, 0);
  config.resolve({ available: true }); await tick();
  f.actor.send({ type: 'SEND', text: '   ' });
  assert.equal(state(f.actor), 'ready');
  f.actor.send({ type: 'SEND', text: '  Map this.  ' });
  f.actor.send({ type: 'SEND', text: 'Duplicate' });
  await tick();
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 1);
  assert.deepEqual(f.calls.filter(call => call[0] === 'user'), [['user', 'Map this.']]);
  assert.equal(f.calls.filter(call => call[0] === 'turn').length, 1);
  assert.deepEqual(state(f.actor), { sending: { turn: 'streaming' } });
  assert.deepEqual(f.calls.find(call => call[0] === 'navigate'), ['navigate', { chat: 'created', project: undefined }, true]);
  f.actor.send({ type: 'ROUTE_CHANGED', route: { chat: 'created' } });
  assert.equal(f.calls.find(call => call[0] === 'turn')[2].aborted, false, 'The URL update for the newly-created chat keeps its turn alive');
  stream.event({ type: 'status', text: 'Saving changes…' }); await tick();
  assert.equal(f.actor.getSnapshot().context.status, 'Saving changes…');
  stream.event({ type: 'done', text: 'Saved.', incomplete: true, projectId: 'new-project', model: 'to-be' }); await tick();
  assert.equal(f.actor.getSnapshot().hasTag('pending'), true, 'A terminal event is consumed while the stream is still open');
  stream.close(); await tick();
  assert.equal(state(f.actor), 'ready');
  assert.equal(f.calls.filter(call => call[0] === 'load').length, 1, 'Finished stream is reconciled with the saved conversation');
});

test('saved working progress polls every two seconds, blocks work and ends in the saved incomplete state', async t => {
  let loads = 0;
  const f = fixture({ load: async () => { loads++; return saved({ working: loads < 3, messages: loads < 3 ? [] : [{ role: 'assistant', text: 'Some changes saved.', incomplete: true }] }); } }, { chat: 'chat' });
  t.after(() => f.actor.stop());
  await tick();
  assert.deepEqual(state(f.actor), { resuming: 'waiting' });
  assert.equal(f.actor.getSnapshot().context.status, 'A reply is being prepared. Your saved progress will appear here.');
  f.actor.send({ type: 'SEND', text: 'duplicate' });
  f.actor.send({ type: 'NEW_CONVERSATION' });
  f.clock.increment(1999); await tick(); assert.equal(loads, 1);
  f.clock.increment(1); await tick(); assert.equal(loads, 2);
  assert.equal(f.actor.getSnapshot().context.status, 'A reply is being prepared. Your saved progress will appear here.');
  f.clock.increment(2000); await tick();
  assert.equal(loads, 3);
  assert.equal(state(f.actor), 'incomplete');
  assert.equal(f.actor.getSnapshot().hasTag('pending'), false);
  assert.equal(f.actor.getSnapshot().context.status, '');
  assert.equal(f.calls.filter(call => call[0] === 'turn' || call[0] === 'create').length, 0);
  f.clock.increment(10000); await tick(); assert.equal(loads, 3);
});

test('a disconnected stream restores the draft and checks saved progress without retrying the provider turn', async t => {
  const stream = controlledStream();
  let loads = 0, turns = 0;
  const recovery = deferred();
  const f = fixture({
    load: async () => { loads++; return loads === 1 ? saved() : recovery.promise; },
    turn: async () => { turns++; return stream.response; },
  }, { chat: 'chat' });
  t.after(() => f.actor.stop()); await tick();
  f.actor.send({ type: 'SEND', text: 'Continue.' }); await tick();
  stream.event({ type: 'status', text: 'Working…' }); stream.close(); await tick();
  assert.equal(state(f.actor), 'recovering');
  assert.match(f.actor.getSnapshot().context.error, /Check the saved conversation before sending again/);
  assert.ok(f.calls.some(call => call[0] === 'draft' && call[1] === 'Continue.'));
  f.actor.send({ type: 'SEND', text: 'Continue.' });
  recovery.resolve(saved({ working: true })); await tick();
  assert.deepEqual(state(f.actor), { resuming: 'waiting' });
  assert.equal(turns, 1);
});

test('server terminal errors reconcile saved messages without restoring the already-accepted draft', async t => {
  const stream = controlledStream(), recovery = deferred();
  let loads = 0;
  const f = fixture({
    load: async () => ++loads === 1 ? saved() : recovery.promise,
    turn: async () => stream.response,
  }, { chat: 'chat' });
  t.after(() => f.actor.stop()); await tick();
  f.actor.send({ type: 'SEND', text: 'Continue.' }); await tick();
  stream.event({ type: 'error', text: 'The operator needs to check access.' }); await tick();
  assert.equal(f.actor.getSnapshot().context.error, 'The operator needs to check access.');
  stream.close(); await tick();
  assert.equal(state(f.actor), 'loading');
  assert.deepEqual(f.calls.filter(call => call[0] === 'draft'), [['draft', '']]);
  recovery.resolve(saved({ messages: [{ role: 'assistant', text: 'The operator needs to check access.' }] })); await tick();
  assert.equal(state(f.actor), 'ready');
});

test('route replacement cancels stale opening results and polling, while saved work remains readable without access', async t => {
  const old = deferred();
  let oldSignal;
  const f = fixture({
    config: async () => ({ available: false, message: 'Your plan needs attention.' }),
    load: async (id, signal) => {
      if (id === 'old') { oldSignal = signal; return old.promise; }
      return saved({ id, working: true });
    },
  }, { chat: 'old' });
  t.after(() => f.actor.stop()); await tick();
  f.actor.send({ type: 'ROUTE_CHANGED', route: { chat: 'current' } }); await tick();
  assert.equal(oldSignal.aborted, true);
  old.resolve(saved({ id: 'old' })); await tick();
  assert.equal(f.actor.getSnapshot().context.chat, 'current');
  assert.equal(f.actor.getSnapshot().context.available, false);
  assert.equal(f.calls.some(call => call[0] === 'saved' && call[1].id === 'old'), false);
  f.actor.send({ type: 'ROUTE_CHANGED', route: {} }); await tick();
  assert.equal(state(f.actor), 'ready');
  const savedCount = f.calls.filter(call => call[0] === 'saved').length;
  f.clock.increment(2000); await tick();
  assert.equal(f.calls.filter(call => call[0] === 'saved').length, savedCount, 'Leaving the chat cancels its poll timer');
  f.actor.send({ type: 'SEND', text: 'No account access' });
  assert.equal(f.calls.some(call => call[0] === 'turn'), false);
});

test('project opening, trial continuation and fresh conversations preserve URL navigation contracts', async t => {
  const f = fixture({}, { project: 'project' });
  t.after(() => f.actor.stop()); await tick();
  assert.deepEqual(f.calls.find(call => call[0] === 'create').slice(0, 3), ['create', 'project', false]);
  assert.deepEqual(f.calls.find(call => call[0] === 'navigate'), ['navigate', { chat: 'created', project: undefined }, true]);
  assert.deepEqual(f.calls.filter(call => call[0] === 'config').map(call => call[1]), [{ project: 'project' }, { chat: 'created', project: undefined }]);
  f.actor.send({ type: 'NEW_CONVERSATION' });
  f.actor.send({ type: 'NEW_CONVERSATION' }); await tick();
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 2);
  assert.equal(f.calls.filter(call => call[0] === 'create').at(-1)[2], true);
  assert.deepEqual(f.calls.filter(call => call[0] === 'navigate').at(-1), ['navigate', { chat: 'created', project: undefined }, false]);
  assert.ok(f.calls.some(call => call[0] === 'draft' && call[1] === ''));
  const trial = fixture({ config: async () => ({ available: true, trial: { chatId: 'trial-chat' } }) });
  t.after(() => trial.actor.stop()); await tick();
  assert.deepEqual(trial.calls.find(call => call[0] === 'navigate'), ['navigate', { chat: 'trial-chat', project: undefined }, true]);
});

test('failed opening permits an explicit send; failed fresh creation keeps the existing transcript', async t => {
  let loads = 0;
  const f = fixture({
    load: async () => { if (++loads === 1) throw new Error('Opening failed'); return saved(); },
    create: async () => { throw new Error('Could not start a new conversation'); },
  }, { chat: 'chat', project: 'project' });
  t.after(() => f.actor.stop()); await tick();
  assert.equal(state(f.actor), 'error');
  assert.equal(f.actor.getSnapshot().context.error, 'Opening failed');
  f.actor.send({ type: 'NEW_CONVERSATION' }); await tick();
  assert.equal(state(f.actor), 'error');
  assert.equal(f.calls.some(call => call[0] === 'reset'), false);
  assert.equal(f.actor.getSnapshot().context.error, 'Could not start a new conversation');
  f.actor.send({ type: 'SEND', text: 'Try this once.' }); await tick();
  assert.equal(state(f.actor), 'ready');
  assert.equal(f.calls.filter(call => call[0] === 'turn').length, 1);
});

test('cancel and actor stop abort active transport and ignore its late completion', async t => {
  for (const cancel of ['event', 'stop', 'route']) {
    const response = deferred();
    let signal;
    const f = fixture({ turn: async (_turn, abortSignal) => { signal = abortSignal; return response.promise; } }, { chat: 'chat' });
    t.after(() => f.actor.stop()); await tick();
    f.actor.send({ type: 'SEND', text: 'Map this.' }); await tick();
    if (cancel === 'event') f.actor.send({ type: 'CANCEL' });
    else if (cancel === 'route') f.actor.send({ type: 'ROUTE_CHANGED', route: {} });
    else f.actor.stop();
    assert.equal(signal.aborted, true);
    response.resolve(streamed(['{"type":"done","text":"late"}\n'])); await tick();
    assert.equal(f.calls.some(call => call[0] === 'stream'), false);
    assert.equal(f.calls.filter(call => call[0] === 'saved').length, 1);
  }
});


test('stopping while reading the reply fences late events and aborts the active fetch', async t => {
  const stream = controlledStream();
  let signal;
  const f = fixture({ turn: async (_turn, abortSignal) => { signal = abortSignal; return stream.response; } }, { chat: 'chat' });
  t.after(() => f.actor.stop()); await tick();
  f.actor.send({ type: 'SEND', text: 'Continue.' }); await tick();
  assert.deepEqual(state(f.actor), { sending: { turn: 'streaming' } });
  f.actor.stop();
  assert.equal(signal.aborted, true);
  stream.event({ type: 'done', text: 'Late reply.' }); stream.close(); await tick();
  assert.equal(f.calls.some(call => call[0] === 'stream'), false);
  assert.equal(f.calls.filter(call => call[0] === 'saved').length, 1);
});


test('native v6 chat transition checks enqueue navigation and stream callbacks without executing them', async t => {
  const config = deferred();
  const f = fixture({ config: () => config.promise });
  t.after(() => f.actor.stop());
  const trial = { projectId: 'trial-project', chatId: 'trial-chat', limitUsd: 1, usedUsd: 0, pendingUsd: 0, remainingUsd: 1 };
  const checking = f.actor.getSnapshot();
  const child = Object.values(checking.children)[0];
  const completed = { type: 'xstate.done.actor', actorId: child.id, sessionId: child.sessionId, output: { available: true, trial } };
  assert.equal(checking.can(completed), true);
  assert.equal(checking.can(completed), true);
  assert.equal(transition(f.machine, checking, completed)[0].context.trial.chatId, trial.chatId);
  assert.equal(f.calls.filter(call => call[0] === 'navigate').length, 0);
  config.resolve(completed.output); await tick();
  assert.deepEqual(f.calls.filter(call => call[0] === 'navigate'), [['navigate', { chat: trial.chatId, project: undefined }, true]]);

  const stream = controlledStream();
  const g = fixture({ turn: async () => stream.response }, { chat: 'chat' });
  t.after(() => g.actor.stop()); await tick();
  const ready = g.actor.getSnapshot(), before = g.calls.length;
  const send = { type: 'SEND', text: 'Continue.' };
  assert.equal(ready.can(send), true);
  assert.equal(ready.can(send), true);
  assert.equal(transition(g.machine, ready, send)[0].context.request, send.text);
  assert.equal(g.calls.length, before, 'Pure transitions do not invoke user or draft callbacks or start transport');
  g.actor.send(send); await tick();
  assert.deepEqual(g.calls.filter(call => call[0] === 'user'), [['user', send.text]]);
  const streaming = g.actor.getSnapshot();
  const update = { type: 'STREAM_EVENT', event: { type: 'status', text: 'Saving.' } };
  assert.equal(streaming.can(update), true);
  assert.equal(streaming.can(update), true);
  assert.equal(transition(g.machine, streaming, update)[0].context.status, update.event.text);
  assert.equal(g.calls.filter(call => call[0] === 'stream').length, 0);
  g.actor.send(update);
  assert.deepEqual(g.calls.filter(call => call[0] === 'stream'), [['stream', update.event]]);
});
