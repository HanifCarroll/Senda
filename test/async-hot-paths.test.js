import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { trialStatus } from '../src/cloudflare/agent-trial.js';
import { HostedAgent } from '../src/cloudflare/agent.js';
import { CloudBilling } from '../src/cloudflare/billing.js';
import { CloudStore } from '../src/cloudflare/store.js';
import { hash } from '../src/core/hash.js';
import { memoryD1 } from './fixtures/d1.js';

const actor = { userId: 'owner' };

test('trial status starts its grant and usage reads together', async () => {
  const gate = Promise.withResolvers(), started = [];
  const db = { prepare(sql) { return { bind() { return this; }, first() {
    const grant = sql.includes('senda_agent_trials');
    started.push(grant ? 'grant' : 'usage');
    return gate.promise.then(() => grant ? { limit_usd: .5, project: 'project', chat: 'chat' } : { used: .1, pending: .2 });
  } }; } };
  const pending = trialStatus(db, actor.userId);
  try { assert.deepEqual(started, ['grant', 'usage']); }
  finally { gate.resolve(); }
  const result = await pending;
  assert.equal(result.projectId, 'project');
  assert.ok(Math.abs(result.remainingUsd - .2) < 1e-9);
});

test('trial workspace checks overlap listing projects and reading their allowance', async () => {
  const gate = Promise.withResolvers(), started = [];
  const projects = {
    list: () => { started.push('list'); return gate.promise.then(() => [{ id: 'project' }]); },
    projectLimit: () => { started.push('limit'); return gate.promise.then(() => 3); },
  };
  const pending = new HostedAgent({}, projects).trialProjectRoom(actor);
  try { assert.deepEqual(started, ['list', 'limit']); }
  finally { gate.resolve(); }
  assert.equal(await pending, true);
});

for (const fail of [false, true]) test(`chat polling reads run and project in one snapshot (${fail ? 'failure' : 'success'})`, async t => {
  const gate = Promise.withResolvers(), started = [], db = memoryD1();
  t.after(() => db.close());
  db.exec(`CREATE TABLE senda_agent_chats(id TEXT,project TEXT);
    CREATE TABLE senda_agent_runs(id TEXT,chat TEXT,status TEXT,response TEXT,progress TEXT);
    INSERT INTO senda_agent_chats VALUES('chat','project');`);
  db.prepare('INSERT INTO senda_agent_runs(id,chat,status,response) VALUES(?,?,?,?)')
    .bind('run', 'chat', 'complete', JSON.stringify({ type: 'done', text: 'Saved' })).run();
  const prepare = db.prepare.bind(db);
  db.prepare = sql => {
    const statement = prepare(sql), first = statement.first;
    statement.first = () => {
      started.push(sql);
      return gate.promise.then(() => {
        if (fail) throw new Error('PRIVATE storage failure');
        return first();
      });
    };
    return statement;
  };
  const pending = new HostedAgent({ DB: db }, {}).observe(new Request('https://senda.example'), 'chat', 'run');
  try {
    assert.equal(started.length, 1);
    assert.match(started[0], /LEFT JOIN senda_agent_runs/);
  } finally { gate.resolve(); }
  const events = (await (await pending).text()).trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(events.map(event => event.type), fail ? ['error'] : ['project', 'done']);
  if (!fail) assert.equal(events[0].projectId, 'project');
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE/);
});

test('chat polling cannot emit a run belonging to another conversation', async t => {
  const db = memoryD1();
  t.after(() => db.close());
  db.exec(`CREATE TABLE senda_agent_chats(id TEXT,project TEXT);
    CREATE TABLE senda_agent_runs(id TEXT,chat TEXT,status TEXT,response TEXT,progress TEXT);
    INSERT INTO senda_agent_chats VALUES('chat','project');`);
  db.prepare('INSERT INTO senda_agent_runs(id,chat,status,response) VALUES(?,?,?,?)')
    .bind('run', 'another-chat', 'complete', JSON.stringify({ type: 'done', text: 'PRIVATE reply' })).run();
  const response = await new HostedAgent({ DB: db }, {}).observe(new Request('https://senda.example'), 'chat', 'run');
  const text = await response.text();
  assert.doesNotMatch(text, /PRIVATE|"done"/);
  assert.match(text, /"error"/);
});

test('historical snapshot loading overlaps R2 reads without fetching the head twice', async () => {
  for (const revision of [1, 2]) {
    const gate = Promise.withResolvers(), started = [];
    const records = [1, 2].map(revision => {
      const json = JSON.stringify({ formatVersion: 2, revision });
      return { revision, object_key: String(revision), digest: hash(json), json };
    });
    const db = { prepare() { return { bind() { return this; }, all: async () => ({ results: records }) }; } };
    const bucket = { get(key) {
      started.push(key);
      return gate.promise.then(() => ({ text: async () => records.find(row => row.object_key === key).json }));
    } };
    const pending = CloudStore.open(db, bucket, 'model', revision);
    await nextTurn();
    try { assert.deepEqual(started, revision === 1 ? ['2', '1'] : ['2']); }
    finally { gate.resolve(); }
    const store = await pending;
    assert.equal(store.read().revision, 2);
    assert.equal(store.read(revision).revision, revision);
  }
});

test('billing status starts customer, subscriptions, hold, catalog and quota reads together', async () => {
  const gate = Promise.withResolvers(), started = [];
  const read = (name, value) => () => { started.push(name); return gate.promise.then(() => value); };
  const db = { prepare() { return { bind() { return this; }, all: read('subscriptions', { results: [] }) }; } };
  const billing = new CloudBilling({ DB: db }, 'https://senda.example');
  billing.config.configured = true;
  billing.customer = read('customer', { customer: 'customer' });
  billing.reviewHold = read('hold', null);
  billing.verifyCatalog = read('catalog', { unit_amount: 2000 });
  billing.workspaceLimit = read('quota', 3);
  const pending = billing.status(actor);
  try { assert.deepEqual(started, ['customer', 'subscriptions', 'hold', 'catalog', 'quota']); }
  finally { gate.resolve(); }
  const status = await pending;
  assert.equal(status.managed, true);
  assert.equal(status.projectLimit, 3);
  assert.equal(status.usedUsd, 0);
  assert.equal(status.pause, null);
});

test('billing usage and pause checks overlap after the subscription period is known', async () => {
  const gate = Promise.withResolvers(), started = [];
  const db = { prepare(sql) { return { bind() { return this; },
    all: async () => ({ results: [{ id: 'subscription', eligible: 1, period_start: 1, period_end: 9999999999 }] }),
    first() {
      const usage = sql.includes('AS used');
      started.push(usage ? 'usage' : 'hold');
      return gate.promise.then(() => usage ? { used: .1, pending: .2, absorbed: 0 } : { held: true });
    },
  }; } };
  const billing = new CloudBilling({ DB: db }, 'https://senda.example');
  Object.assign(billing.config, { configured: true, includedUsd: 5 });
  billing.customer = async () => null;
  billing.reviewHold = async () => null;
  billing.verifyCatalog = async () => ({ unit_amount: 2000 });
  billing.workspaceLimit = async () => 100;
  const pending = billing.status(actor);
  await nextTurn();
  try { assert.deepEqual(started, ['usage', 'hold']); }
  finally { gate.resolve(); }
  const status = await pending;
  assert.equal(status.usedUsd, .1);
  assert.equal(status.pendingUsd, .2);
  assert.equal(status.pause.reason, 'review');
});
