import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { providerCallMachine, mutationMachine, startProtocol, advanceProtocol } from '../src/server/agent/protocol-machines.js';
import { hostedRunMachine, hostedRunFromFacts } from '../src/cloudflare/agent-machines.js';
import { CallBudget, CALL_RESERVES, reserveTurn } from '../src/cloudflare/agent-budget.js';
import { HostedAgent } from '../src/cloudflare/agent.js';
import { memoryD1 } from './fixtures/d1.js';

const step = (machine, snapshot, type, fields = {}) => advanceProtocol(machine, snapshot, { type, ...fields });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function database() {
  const db = memoryD1();
  for (const name of ['0004_hosted_agent.sql', '0006_agent_meter.sql', '0007_agent_workflow.sql', '0008_agent_billing_period.sql', '0009_service_budget.sql'])
    db.exec(readFileSync(new URL('../src/cloudflare/migrations/' + name, import.meta.url), 'utf8'));
  return db;
}

// All provider work below is injected; the fixtures use in-memory SQLite only.
async function queuedAgent(options = {}) {
  const db = database(), owner = 'owner', email = 'owner@example.test', origin = 'https://senda.example';
  let queued;
  const agent = new HostedAgent({ DB: db, OPENAI_API_KEY: 'fixture', AGENT_ALLOWED_EMAILS: email, ...options.env }, {}, origin, {
    pollMs: 1, dispatch: async params => { queued = params; }, ...options,
  });
  const post = (path, body) => agent.handle(new Request(origin + path, { method: 'POST', body: JSON.stringify(body) }), { userId: owner }, email);
  const chat = await (await post('/api/agent/chats', {})).json();
  const runId = randomUUID(), response = await post(`/api/agent/chats/${chat.id}/turn`, { requestId: runId, text: 'Map the interview.' });
  await response.body.cancel();
  return { db, agent, chatId: chat.id, runId, get queued() { return queued; } };
}

test('provider dispatch and successful return require reservation and completed settlement in order', () => {
  let phase = startProtocol(providerCallMachine);
  for (const event of ['DISPATCH', 'RETURNED', 'SETTLED'])
    assert.throws(() => step(providerCallMachine, phase, event), { code: 'CONFLICT' });
  phase = step(providerCallMachine, phase, 'RESERVE');
  assert.equal(phase.can({ type: 'DISPATCH' }), false);
  phase = step(providerCallMachine, phase, 'RESERVED');
  phase = step(providerCallMachine, phase, 'DISPATCH');
  assert.equal(phase.can({ type: 'SETTLED' }), false);
  phase = step(providerCallMachine, phase, 'RETURNED');
  assert.equal(phase.can({ type: 'DISPATCH' }), false);
  phase = step(providerCallMachine, phase, 'SETTLED');
  assert.equal(phase.value, 'succeeded');
  assert.equal(phase.can({ type: 'REJECTED' }), false);
});

test('provider rejection distinguishes known zero usage from unknown dispatch and settlement failures', () => {
  for (const statusCode of [401, 402, 403, 500]) {
    let phase = startProtocol(providerCallMachine);
    for (const type of ['RESERVE', 'RESERVED', 'DISPATCH']) phase = step(providerCallMachine, phase, type);
    phase = step(providerCallMachine, phase, 'REJECTED', { error: { statusCode } });
    assert.equal(phase.value, statusCode === 500 ? 'failureUnknown' : 'failureKnown');
    phase = step(providerCallMachine, phase, 'RECORDED');
    for (const type of ['DISPATCH', 'RETURNED', 'SETTLED', 'RECORDED']) assert.equal(phase.can({ type }), false);
  }
  let phase = startProtocol(providerCallMachine);
  for (const type of ['RESERVE', 'RESERVED', 'DISPATCH', 'RETURNED']) phase = step(providerCallMachine, phase, type);
  phase = step(providerCallMachine, phase, 'REJECTED', { error: { statusCode: 401 } });
  assert.equal(phase.value, 'failureUnknown', 'A ledger failure after a response is never a provider rejection');
});

test('a denied provider reservation has no dispatch or failure-accounting transition', () => {
  let phase = step(providerCallMachine, startProtocol(providerCallMachine), 'RESERVE');
  phase = step(providerCallMachine, phase, 'DENIED');
  for (const type of ['DISPATCH', 'REJECTED', 'RESERVED']) assert.equal(phase.can({ type }), false);
});

test('call accounting rejects overlapping reservation and settlement before another dispatch', async () => {
  const db = database(), day = new Date().toISOString().slice(0, 10);
  try {
    await reserveTurn(db, { runId: 'run', chatId: 'chat', owner: 'owner', day });
    const budget = new CallBudget(db, { runId: 'run', owner: 'owner', day });
    const reserving = budget.reserve('main');
    await assert.rejects(budget.reserve('review'), { code: 'CONFLICT' });
    await reserving;
    assert.equal(budget.first, false);
    const settling = budget.settle({ inputTokens: 1000, outputTokens: 100 });
    await assert.rejects(budget.reserve('main'), { code: 'CONFLICT' });
    await settling;
    await assert.rejects(budget.settle({ inputTokens: 0, outputTokens: 0 }), { code: 'CONFLICT' });
    await budget.reserve('review');
    await budget.failure(new Error('unknown outcome'));
    assert.equal(budget.phase.value, 'unknown');
    assert.equal(budget.active, 0);
    const before = db.prepare('SELECT reserved_usd FROM senda_agent_runs').first().reserved_usd;
    await budget.failure({ statusCode: 401 });
    assert.equal(db.prepare('SELECT reserved_usd FROM senda_agent_runs').first().reserved_usd, before, 'A late rejection cannot release a previously unknown call');
    await budget.reserve('main');
    await budget.failure({ statusCode: 403 });
    assert.equal(budget.phase.value, 'settled');
    assert.ok(Math.abs(db.prepare('SELECT reserved_usd FROM senda_agent_runs').first().reserved_usd - before) < 1e-12);
  } finally { db.close(); }
});

test('hosted admission reaches queue uncertainty without permitting a second dispatch', () => {
  let phase = startProtocol(hostedRunMachine);
  assert.equal(phase.can({ type: 'DISPATCH' }), false);
  for (const type of ['LOCKED', 'ADMITTED', 'DISPATCH', 'QUEUE_UNKNOWN']) phase = step(hostedRunMachine, phase, type);
  assert.equal(phase.value, 'uncertain');
  assert.equal(phase.can({ type: 'DISPATCH' }), false);
  assert.equal(phase.can({ type: 'INTERRUPT_UNSTARTED' }), true);
  phase = step(hostedRunMachine, phase, 'QUEUED');
  assert.equal(phase.value, 'queued');
});

test('canonical hosted facts reject duplicate claims and late terminal events', () => {
  const run = { id: 'run', status: 'running', started: 0 }, chat = { lock_id: 'run', lock_until: 101 };
  assert.equal(hostedRunFromFacts(run, chat, 100).can({ type: 'CLAIM' }), true);
  assert.equal(hostedRunFromFacts(run, chat, 101).can({ type: 'CLAIM' }), false);
  assert.equal(hostedRunFromFacts(run, { ...chat, lock_id: 'other' }, 100).can({ type: 'CLAIM' }), false);
  const started = hostedRunFromFacts({ ...run, started: 1 }, chat, 100);
  assert.equal(started.can({ type: 'CLAIM' }), false);
  assert.equal(started.can({ type: 'INTERRUPT_UNSTARTED' }), false);
  assert.equal(started.can({ type: 'COMPLETE' }), true);
  for (const status of ['complete', 'failed']) {
    const phase = hostedRunFromFacts({ ...run, started: 1, status }, chat, 100);
    for (const type of ['CLAIM', 'COMPLETE', 'FAIL', 'INTERRUPT']) assert.equal(phase.can({ type }), false);
  }
  assert.equal(hostedRunFromFacts(null, chat, 100).can({ type: 'CLAIM' }), false);
});

test('an unconfirmed queue response interrupts only a never-started run and does not redispatch it', async () => {
  let params, dispatches = 0;
  const fixture = await queuedAgent({ dispatch: async value => { params = value; dispatches++; throw new Error('lost response'); } });
  try {
    const run = fixture.db.prepare('SELECT status,started,cost_usd,meter_usd FROM senda_agent_runs').first();
    assert.deepEqual({ ...run }, { status: 'failed', started: 0, cost_usd: 0, meter_usd: 0 });
    assert.deepEqual(await fixture.agent.execute(params), { executed: false });
    assert.equal(dispatches, 1);
  } finally { fixture.db.close(); }
});

test('a confirmed queued Workflow survives a lost create response with its reservation held', async () => {
  let creates = 0;
  const fixture = await queuedAgent({ dispatch: undefined, env: { AGENT_WORKFLOW: {
    create: async () => { creates++; throw new Error('lost response'); },
    get: async () => ({ status: async () => ({ status: 'queued' }) }),
  } } });
  try {
    const run = fixture.db.prepare('SELECT status,started,reserved_usd FROM senda_agent_runs').first();
    assert.deepEqual({ ...run }, { status: 'running', started: 0, reserved_usd: CALL_RESERVES.main });
    assert.equal(creates, 1);
  } finally { fixture.db.close(); }
});

for (const outcome of ['complete', 'failed']) test(`a late ${outcome} result cannot replace a recovered started run`, async () => {
  const entered = deferred(), release = deferred();
  const fixture = await queuedAgent({ run: async options => {
    await options.reserveCall('main'); entered.resolve(); await release.promise;
    if (outcome === 'failed') throw new Error('late provider result');
    return { text: 'Late reply', messages: [], usage: { inputTokens: 10, outputTokens: 10 } };
  } });
  try {
    const executing = fixture.agent.execute(fixture.queued);
    await entered.promise;
    await fixture.agent.interrupt(fixture.chatId, fixture.runId, 'Recovered interruption');
    const before = fixture.db.prepare('SELECT status,cost_usd,meter_usd,response FROM senda_agent_runs').first();
    const beforeDisplay = fixture.db.prepare('SELECT display FROM senda_agent_chats').first().display;
    release.resolve(); await executing;
    assert.deepEqual(fixture.db.prepare('SELECT status,cost_usd,meter_usd,response FROM senda_agent_runs').first(), before);
    assert.equal(before.cost_usd, CALL_RESERVES.main);
    assert.equal(before.meter_usd, 0);
    assert.equal(fixture.db.prepare('SELECT display FROM senda_agent_chats').first().display, beforeDisplay);
    assert.deepEqual(await fixture.agent.execute(fixture.queued), { executed: false });
  } finally { release.resolve(); fixture.db.close(); }
});

test('a behavior proposal cannot commit before supported review and stays incomplete after rejection', () => {
  let phase = step(mutationMachine, startProtocol(mutationMachine), 'PROPOSE');
  assert.throws(() => step(mutationMachine, phase, 'COMMIT'), { code: 'CONFLICT' });
  phase = step(mutationMachine, phase, 'REVIEW');
  assert.equal(phase.can({ type: 'COMMIT' }), false);
  phase = step(mutationMachine, phase, 'REJECTED');
  phase = step(mutationMachine, phase, 'FINISH');
  assert.equal(phase.value, 'incomplete');
});

test('supported review permits one commit and a later unfinished proposal remains incomplete', () => {
  let phase = startProtocol(mutationMachine);
  for (const type of ['PROPOSE', 'REVIEW', 'SUPPORTED', 'COMMIT', 'COMMITTED']) phase = step(mutationMachine, phase, type);
  assert.equal(phase.can({ type: 'COMMIT' }), false);
  phase = step(mutationMachine, phase, 'PROPOSE');
  phase = step(mutationMachine, phase, 'FINISH');
  assert.equal(phase.value, 'incomplete');
});

test('initial diagram and sanitized-reply obligations govern turn completion', () => {
  let phase = step(mutationMachine, startProtocol(mutationMachine), 'PROJECT_CREATED');
  assert.equal(step(mutationMachine, phase, 'FINISH').value, 'incomplete');
  for (const type of ['PROPOSE', 'REVIEW', 'SUPPORTED', 'COMMIT', 'COMMITTED', 'DIAGRAM_SAVED']) phase = step(mutationMachine, phase, type);
  assert.equal(step(mutationMachine, phase, 'FINISH').value, 'complete');
  assert.equal(step(mutationMachine, phase, 'FINISH', { sanitized: true }).value, 'incomplete');
  let baseline = step(mutationMachine, startProtocol(mutationMachine), 'PROPOSE');
  for (const type of ['COPY_BASELINE', 'COMMITTED', 'DIAGRAM_SAVED']) baseline = step(mutationMachine, baseline, type);
  assert.equal(step(mutationMachine, baseline, 'FINISH').value, 'complete');
});

for (const outcome of ['complete', 'failed']) test(`atomic terminal predicates preserve recovery racing a ${outcome} commit`, async () => {
  const fixture = await queuedAgent({ run: async () => {
    if (outcome === 'failed') throw new Error('late error');
    return { text: 'Late reply', messages: [], usage: { inputTokens: 10, outputTokens: 10 } };
  } });
  try {
    const prepare = fixture.db.prepare.bind(fixture.db), batch = fixture.db.batch.bind(fixture.db);
    fixture.db.prepare = sql => Object.assign(prepare(sql), { sourceSql: sql });
    const recovered = JSON.stringify({ type: 'error', text: 'Concurrent recovery' });
    let recoveredDisplay, raced = false;
    fixture.db.batch = statements => {
      // Interleave after the XState decision read, at the actual D1 write boundary.
      if (!raced && statements.some(statement => statement.sourceSql?.includes(`SET status='${outcome}'`))) {
        raced = true;
        const display = JSON.parse(prepare('SELECT display FROM senda_agent_chats').first().display);
        display.push({ role: 'assistant', text: 'Concurrent recovery', incomplete: true });
        recoveredDisplay = JSON.stringify(display);
        prepare("UPDATE senda_agent_runs SET status='failed',cost_usd=reserved_usd,meter_usd=0,response=? WHERE id=?")
          .bind(recovered, fixture.runId).run();
        prepare('UPDATE senda_agent_chats SET display=?,lock_id=NULL,lock_until=0 WHERE id=?')
          .bind(recoveredDisplay, fixture.chatId).run();
      }
      return batch(statements);
    };
    await fixture.agent.execute(fixture.queued);
    assert.equal(raced, true);
    const run = prepare('SELECT status,meter_usd,response FROM senda_agent_runs').first();
    assert.deepEqual({ ...run }, { status: 'failed', meter_usd: 0, response: recovered });
    assert.equal(prepare('SELECT display FROM senda_agent_chats').first().display, recoveredDisplay);
  } finally { fixture.db.close(); }
});

test('a returned response with a settlement failure never becomes known zero provider usage', async () => {
  const db = database(), day = new Date().toISOString().slice(0, 10);
  try {
    await reserveTurn(db, { runId: 'run', chatId: 'chat', owner: 'owner', day });
    const budget = new CallBudget(db, { runId: 'run', owner: 'owner', day });
    await budget.reserve('main');
    await budget.failure({ statusCode: 401 }, { outcome: 'failureUnknown' });
    assert.equal(budget.phase.value, 'unknown');
    assert.equal(db.prepare('SELECT reserved_usd FROM senda_agent_runs').first().reserved_usd, CALL_RESERVES.main);
  } finally { db.close(); }
});
