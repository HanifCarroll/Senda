import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CallBudget, CALL_RESERVES, RATE_CARD, reserveTurn, paidUsage, budgetPause } from '../src/cloudflare/agent-budget.js';
import { AGENT_LIMITS, usageCost } from '../src/server/agent/run.js';
import { memoryD1 } from './fixtures/d1.js';

function setup() {
  const db = memoryD1();
  for (const name of ['0004_hosted_agent.sql', '0005_billing.sql', '0006_agent_meter.sql', '0008_agent_billing_period.sql', '0009_service_budget.sql'])
    db.exec(readFileSync(new URL('../src/cloudflare/migrations/' + name, import.meta.url), 'utf8'));
  const day = new Date().toISOString().slice(0, 10);
  db.prepare("INSERT INTO senda_agent_runs(id,chat,owner,day,status,reserved_usd,created) VALUES('run','chat','owner',?,'running',?,?)")
    .bind(day, CALL_RESERVES.main, new Date().toISOString()).run();
  return { db, day, budget: new CallBudget(db, { runId: 'run', owner: 'owner', day }) };
}

test('new runs record the Luna rate card without relabeling historical DeepSeek usage', async () => {
  const { db, day } = setup();
  try {
    db.prepare("UPDATE senda_agent_runs SET status='complete',cost_usd=.3,meter_usd=.3").run();
    await reserveTurn(db, { runId: 'new', chatId: 'chat', owner: 'owner', day });
    const { results: rows } = await db.prepare('SELECT id,rate_card,cost_usd FROM senda_agent_runs ORDER BY id').all();
    assert.equal(rows.find(r => r.id === 'new').rate_card, RATE_CARD);
    assert.equal(rows.find(r => r.id === 'run').rate_card, 'deepseek-flash-2026-10-28-peak');
    assert.equal(rows.find(r => r.id === 'run').cost_usd, .3);
  } finally { db.close(); }
});

test('per-call accounting retains only unknown calls and each reservation covers its maximum payload', async () => {
  const { db, budget } = setup();
  try {
    assert.ok(CALL_RESERVES.main >= usageCost({ inputTokens: AGENT_LIMITS.requestBytes + 8192, outputTokens: AGENT_LIMITS.outputTokens }));
    assert.ok(CALL_RESERVES.review >= usageCost({ inputTokens: AGENT_LIMITS.reviewBytes, outputTokens: AGENT_LIMITS.reviewOutputTokens }));
    await budget.reserve('main');
    await budget.settle({ inputTokens: 1000, outputTokens: 100 });
    await budget.reserve('review');
    await budget.failure(new Error('unknown outcome'));
    await budget.reserve('main');
    await budget.settle({ inputTokens: 1000, outputTokens: 100 });
    const row = db.prepare('SELECT reserved_usd FROM senda_agent_runs').first();
    assert.ok(Math.abs(row.reserved_usd - (CALL_RESERVES.review + 2 * .000175)) < 1e-9);
    await assert.rejects(budget.settle({ inputTokens: 10, outputTokens: 10 }), { code: 'CONFLICT' });
  } finally { db.close(); }
});

test('paid callers can use the last fraction of an allowance, but every later call rechecks the cap and entitlement', async () => {
  const { db, day } = setup();
  const start = Math.floor(Date.now() / 1000) - 100, end = start + 10000;
  db.prepare("INSERT INTO senda_billing_subscriptions(context,id,owner,status,eligible,period_start,period_end,updated) VALUES('sandbox','sub','owner','active',1,?,?,?)")
    .bind(start, end, new Date().toISOString()).run();
  const entitlement = { context: 'sandbox', subscriptionId: 'sub', periodStart: new Date(start * 1000).toISOString(), periodEnd: new Date(end * 1000).toISOString(), limitUsd: CALL_RESERVES.main };
  db.prepare('UPDATE senda_agent_runs SET billing_context=?,billing_subscription=?,billing_period_start=?,billing_period_end=?').bind(entitlement.context, entitlement.subscriptionId, entitlement.periodStart, entitlement.periodEnd).run();
  const budget = new CallBudget(db, { runId: 'run', owner: 'owner', day, entitlement });
  try {
    await budget.reserve('main');
    await budget.settle({ inputTokens: 1000, outputTokens: 100 });
    await budget.reserve('review');
    await budget.settle({});
    await assert.rejects(budget.reserve('main'), { code: 'LIMIT' });
    assert.equal(budget.active, 0);
    db.prepare('UPDATE senda_billing_subscriptions SET eligible=0').run();
    await assert.rejects(budget.reserve('review'), { code: 'LIMIT' });
  } finally { db.close(); }
});

test('repair calls share the same atomic turn ceiling after measured calls release their unused reservation', async () => {
  const { db, budget } = setup();
  try {
    for (let i = 0; i < 20; i++) {
      await budget.reserve('main');
      await budget.settle({ inputTokens: 396000, outputTokens: 0 });
    }
    assert.ok(Math.abs(db.prepare('SELECT reserved_usd FROM senda_agent_runs').first().reserved_usd - .99) < 1e-9);
    await assert.rejects(budget.reserve('main'), { code: 'LIMIT' });
    assert.equal(budget.active, 0, 'No provider call may start beyond the original $1 turn cap');
  } finally { db.close(); }
});

test('authentication and exhausted provider balance release an unconsumed call reservation', async () => {
  for (const statusCode of [401, 402, 403]) {
    const { db, budget } = setup();
    try {
      await budget.reserve('main');
      await budget.failure({ statusCode });
      assert.equal(db.prepare('SELECT reserved_usd FROM senda_agent_runs').first().reserved_usd, 0);
    } finally { db.close(); }
  }
});

function paidFixture(db) {
  const start = Math.floor(Date.now() / 1000) - 100, end = start + 10000;
  db.prepare("INSERT INTO senda_billing_subscriptions(context,id,owner,status,eligible,period_start,period_end,updated) VALUES('sandbox','sub','owner','active',1,?,?,?)")
    .bind(start, end, new Date().toISOString()).run();
  return { context: 'sandbox', subscriptionId: 'sub', periodStart: new Date(start * 1000).toISOString(), periodEnd: new Date(end * 1000).toISOString(), limitUsd: 3 };
}

test('admission counts concurrent pending work, keeps it out of the used meter, and excludes operator runs', async () => {
  const { db, day } = setup();
  try {
    const entitlement = { ...paidFixture(db), limitUsd: .18 };
    const admit = runId => reserveTurn(db, { runId, chatId: 'chat', owner: 'owner', day, entitlement });
    await Promise.all([admit('one'), admit('two')]);
    await assert.rejects(admit('three'), { code: 'LIMIT' });
    const usage = await paidUsage(db, 'owner', entitlement);
    assert.equal(usage.usedUsd, 0);
    assert.equal(usage.pendingUsd, .10);
    assert.equal(usage.absorbedUsd, .10);
    assert.equal((await budgetPause(db, 'owner', day, entitlement)).reason, 'pending');
  } finally { db.close(); }
});

test('absorbed failures pause service without spending the allowance, and a new period does not erase old costs', async () => {
  const { db, day } = setup();
  try {
    const entitlement = paidFixture(db);
    db.prepare("UPDATE senda_agent_runs SET day='2000-01-01',status='failed',cost_usd=2.98,meter_usd=0,billing_context=?,billing_subscription=?,billing_period_start=?,billing_period_end=?")
      .bind(entitlement.context, entitlement.subscriptionId, entitlement.periodStart, entitlement.periodEnd).run();
    await assert.rejects(reserveTurn(db, { runId: 'blocked', chatId: 'chat', owner: 'owner', day, entitlement }), { code: 'LIMIT' });
    assert.equal((await budgetPause(db, 'owner', day, entitlement)).reason, 'service');
    assert.equal((await paidUsage(db, 'owner', entitlement)).usedUsd, 0);
    const next = { ...entitlement, periodStart: new Date(Date.parse(entitlement.periodStart) + 1000).toISOString() };
    db.prepare('UPDATE senda_billing_subscriptions SET period_start=?').bind(Date.parse(next.periodStart) / 1000).run();
    await reserveTurn(db, { runId: 'new-period', chatId: 'chat', owner: 'owner', day, entitlement: next });
    assert.equal((await paidUsage(db, 'owner', entitlement)).absorbedUsd, 2.98);
    assert.equal((await paidUsage(db, 'owner', next)).pendingUsd, .05);
    db.prepare("INSERT INTO senda_billing_subscriptions SELECT context,'old-sub',owner,'canceled',0,period_start,period_end,cancel_at,updated FROM senda_billing_subscriptions WHERE id='sub'").run();
    db.prepare("INSERT INTO senda_billing_risks(context,subscription,resource,kind,active) VALUES('sandbox','old-sub','dispute','dispute',1)").run();
    assert.equal((await budgetPause(db, 'owner', day, next)).reason, 'review');
    const held = new CallBudget(db, { runId: 'new-period', owner: 'owner', day, entitlement: next });
    await assert.rejects(held.reserve('main'), { code: 'LIMIT' });
  } finally { db.close(); }
});

test('an admitted turn continues against its original paid period after renewal, while known call charges stay bounded', async () => {
  const { db, day } = setup();
  try {
    const e = paidFixture(db), now = Date.now();
    e.periodEnd = new Date(now - 1000).toISOString();
    db.prepare('UPDATE senda_agent_runs SET billing_context=?,billing_subscription=?,billing_period_start=?,billing_period_end=?')
      .bind(e.context, e.subscriptionId, e.periodStart, e.periodEnd).run();
    const budget = new CallBudget(db, { runId: 'run', owner: 'owner', day, entitlement: e });
    await budget.reserve('main');
    await budget.settle({ inputTokens: 500000, outputTokens: 0 });
    assert.equal(budget.customerUsd, .05, 'Unexpected excess is operational spend, never a larger customer charge');
    await budget.reserve('review');
    await budget.failure(new Error('unknown transport'));
    assert.equal(budget.customerUsd, .05, 'Unknown usage adds no customer charge');
    const row = db.prepare('SELECT * FROM senda_agent_runs').first();
    assert.equal(row.billing_period_start, e.periodStart);
    assert.equal(row.billing_period_end, e.periodEnd);
    assert.ok(Math.abs(row.reserved_usd - .0825) < 1e-9);
  } finally { db.close(); }
});
