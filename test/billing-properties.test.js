import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { CallBudget, CALL_RESERVES } from '../src/cloudflare/agent-budget.js';
import { memoryD1 } from './fixtures/d1.js';
import { fixture } from './fixtures/billing.js';

const options = { seed: Number(process.env.FC_SEED ?? 20261031), numRuns: 100 };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('generated measured, rejected and unknown call histories conserve reservations and never double settle', async () => {
  await fc.assert(fc.asyncProperty(fc.array(fc.record({
    kind: fc.constantFrom('main', 'review'), outcome: fc.constantFrom('measured', 'rejected', 'unknown'),
    inputTokens: fc.integer({ min: 0, max: 10000 }), outputTokens: fc.integer({ min: 0, max: 1000 }),
  }), { minLength: 1, maxLength: 35 }), async calls => {
    const db = memoryD1();
    for (const name of ['0004_hosted_agent.sql', '0005_billing.sql', '0006_agent_meter.sql', '0008_agent_billing_period.sql', '0009_service_budget.sql'])
      db.exec(readFileSync(new URL(`../src/cloudflare/migrations/${name}`, import.meta.url), 'utf8'));
    const day = new Date().toISOString().slice(0, 10);
    db.prepare("INSERT INTO senda_agent_runs(id,chat,owner,day,status,reserved_usd,created) VALUES('run','chat','owner',?,'running',?,?)")
      .bind(day, CALL_RESERVES.main, new Date().toISOString()).run();
    const budget = new CallBudget(db, { runId: 'run', owner: 'owner', day });
    let exposure = CALL_RESERVES.main, charged = 0, first = true;
    const stored = () => db.prepare("SELECT reserved_usd FROM senda_agent_runs WHERE id='run'").first().reserved_usd;
    try {
      for (const call of calls) {
        const reserve = CALL_RESERVES[call.kind], delta = first ? reserve - CALL_RESERVES.main : reserve;
        if (exposure + delta > 1) {
          await assert.rejects(budget.reserve(call.kind), { code: 'LIMIT' });
          close(stored(), exposure); assert.equal(budget.active, 0); continue;
        }
        await budget.reserve(call.kind); first = false; exposure += delta;
        close(stored(), exposure);
        await assert.rejects(budget.reserve(call.kind), { code: 'CONFLICT' });
        close(stored(), exposure);
        if (call.outcome === 'measured') {
          // Independent rate-card oracle in dollars, not the production cost helper.
          const cost = (call.inputTokens * 0.125 + call.outputTokens * 0.5) / 1_000_000;
          await budget.settle({ inputTokens: call.inputTokens, outputTokens: call.outputTokens });
          exposure += cost - reserve; charged += cost;
        } else if (call.outcome === 'rejected') {
          await budget.failure({ statusCode: 401 }); exposure -= reserve;
        } else await budget.failure(new Error('Synthetic unknown provider outcome'));
        close(stored(), exposure); close(budget.customerUsd, charged);
        assert.equal(budget.active, 0);
        await assert.rejects(budget.settle({ inputTokens: 0, outputTokens: 0 }), { code: 'CONFLICT' });
        close(stored(), exposure);
      }
    } finally { db.close(); }
  }), { ...options, examples: [[Array.from({ length: 35 }, () => ({
    kind: 'main', outcome: 'unknown', inputTokens: 0, outputTokens: 0,
  }))]] });
});

test('generated signed billing notifications deduplicate replays and use current subscription facts for the correct owner', async () => {
  await fc.assert(fc.asyncProperty(fc.array(fc.record({
    status: fc.constantFrom('active', 'canceled', 'past_due'), paid: fc.boolean(), replay: fc.boolean(),
  }), { minLength: 2, maxLength: 20 }), async actions => {
    const f = fixture(), owner = { userId: 'owner' };
    let expected = false, count = 0;
    const previous = [];
    try {
      await f.billing.checkout(owner, 'owner@example.test');
      for (const action of actions) {
        f.current.status = action.status; f.current.latest_invoice.status = action.paid ? 'paid' : 'open';
        if (action.replay && previous.length) {
          await f.billing.webhook(previous[0].request());
        } else {
          // Payload lies about owner and status; only the retrieved canonical subscription may grant access.
          const notice = f.notification('customer.subscription.updated', { id: f.current.id, customer: 'cus_other', metadata: { owner: 'other' }, status: 'active' });
          previous.push(notice); await f.billing.webhook(notice.request());
          expected = action.status === 'active' && action.paid; count++;
        }
        assert.equal(Boolean(await f.billing.entitlement(owner)), expected);
        assert.equal(await f.billing.entitlement({ userId: 'other' }), null);
        assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM senda_billing_events').first().n, count);
      }
    } finally { f.db.close(); }
  }), { ...options, numRuns: 40 });
});
