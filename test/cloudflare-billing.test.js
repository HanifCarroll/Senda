import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CloudBilling, billingConfig } from '../src/cloudflare/billing.js';
import { createStripeClient } from '../src/server/billing/stripe.js';
import { memoryD1 } from './fixtures/d1.js';

const env = {
  BILLING_ENABLED: '1', STRIPE_LIVEMODE: 'false',
  STRIPE_ACCOUNT_ID: 'acct_1TX0nqK7alsSe3q5', STRIPE_PRICE_ID: 'price_fixture',
  STRIPE_SECRET_KEY: 'test-fixture-not-a-key', STRIPE_WEBHOOK_SECRET: 'test-signing-secret',
  BILLING_INCLUDED_USD: '3', PAID_AGENT_ENABLED: '1',
};
const signer = createStripeClient('test-fixture-not-a-key');
function fixture() {
  const db = memoryD1();
  for (const name of ['0004_hosted_agent.sql', '0005_billing.sql', '0006_agent_meter.sql', '0008_agent_billing_period.sql'])
    db.exec(readFileSync(new URL('../src/cloudflare/migrations/' + name, import.meta.url), 'utf8'));
  const now = Math.floor(Date.now() / 1000), calls = [];
  const current = {
    id: 'sub_fixture', customer: 'cus_fixture', livemode: false, status: 'active', pause_collection: null,
    latest_invoice: { id: 'in_fixture', status: 'paid' },
    items: { data: [{ price: { id: 'price_fixture' }, quantity: 1, current_period_start: now - 100, current_period_end: now + 10000 }] },
  };
  const client = {
    accounts: { retrieve: async () => ({ id: env.STRIPE_ACCOUNT_ID }) },
    prices: { retrieve: async () => ({ livemode: false, active: true, type: 'recurring', recurring: { interval: 'month', interval_count: 1 }, currency: 'usd', unit_amount: 1500 }) },
    customers: { retrieve: async id => ({ id, livemode: false }), create: async (data, options) => { calls.push({ kind: 'customer', data, options }); return { id: 'cus_fixture', livemode: false }; } },
    subscriptions: {
      async *list() {},
      retrieve: async () => structuredClone(current),
    },
    checkout: { sessions: {
      create: async (data, options) => { calls.push({ kind: 'checkout', data, options }); return { id: 'cs_fixture', livemode: false, url: 'https://checkout.stripe.com/fixture' }; },
      retrieve: async () => ({ id: 'cs_fixture', status: 'open', url: 'https://checkout.stripe.com/fixture' }),
    } },
    billingPortal: { sessions: { create: async data => { calls.push({ kind: 'portal', data }); return { url: 'https://billing.stripe.com/fixture' }; } } },
    webhooks: signer.webhooks,
    disputes: { retrieve: async () => ({ id: 'dp_fixture', status: 'needs_response' }) },
    charges: { retrieve: async () => ({ id: 'ch_fixture', payment_intent: 'pi_fixture', amount: 1500, amount_refunded: 1500 }) },
    invoicePayments: { async *list() { yield { invoice: 'in_fixture' }; } },
    invoices: { retrieve: async () => ({ id: 'in_fixture', status: 'paid', parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_fixture' } } }) },
  };
  const billing = new CloudBilling({ ...env, DB: db }, 'https://senda.example', { client });
  let serial = 0;
  function notification(type, object = { id: current.id, customer: current.customer }) {
    const event = { id: 'evt_' + ++serial, type, livemode: false, created: now, data: { object } };
    const body = JSON.stringify(event);
    const signature = signer.webhooks.generateTestHeaderString({ payload: body, secret: env.STRIPE_WEBHOOK_SECRET });
    return { event, request: () => new Request('https://senda.example/api/billing/webhook', { method: 'POST', body, headers: { 'stripe-signature': signature } }) };
  }
  return { db, billing, client, current, calls, notification };
}

test('billing stays disabled without explicit account, mode, catalog and allowance configuration', () => {
  assert.equal(billingConfig({}).configured, false);
  assert.equal(billingConfig(env).configured, true);
  for (const change of [{ STRIPE_LIVEMODE: 'true' }, { STRIPE_ACCOUNT_ID: 'acct_other' }, { BILLING_ENABLED: '0' }, { BILLING_INCLUDED_USD: 'NaN' }, { STRIPE_WEBHOOK_SECRET: '' }])
    assert.equal(billingConfig({ ...env, ...change }).configured, false);
  assert.equal(billingConfig({ ...env, PAID_AGENT_ENABLED: '0' }).paidAgentEnabled, false);
});

test('Checkout reuses its customer and open session; browser data cannot choose price, owner or portal customer', async () => {
  const f = fixture();
  try {
    const owner = { userId: 'owner' };
    const first = await f.billing.checkout(owner, 'owner@example.test');
    assert.deepEqual(await f.billing.checkout(owner, 'owner@example.test'), first);
    assert.equal(f.calls.filter(c => c.kind === 'customer').length, 1);
    const checkout = f.calls.filter(c => c.kind === 'checkout');
    assert.equal(checkout.length, 1);
    assert.deepEqual(checkout[0].data.line_items, [{ price: 'price_fixture', quantity: 1 }]);
    assert.equal(checkout[0].data.payment_method_types, undefined);
    assert.equal(checkout[0].data.subscription_data.billing_mode.type, 'flexible');
    assert.match(checkout[0].options.idempotencyKey, /^senda-checkout-/);
    await assert.rejects(f.billing.portal({ userId: 'other-owner' }), { code: 'NOT_FOUND' });
    await f.billing.portal(owner);
    assert.equal(f.calls.at(-1).data.customer, 'cus_fixture');
    f.client.subscriptions.list = async function* () { yield { status: 'active' }; };
    await assert.rejects(f.billing.checkout(owner, 'owner@example.test'), { code: 'SUBSCRIPTION_EXISTS' });
    assert.equal(f.calls.filter(c => c.kind === 'checkout').length, 1);
  } finally { f.db.close(); }
});

test('a slow Stripe read cannot create a Checkout session after its account lease expires', async () => {
  const f = fixture();
  try {
    f.client.subscriptions.list = async function* () {
      f.db.prepare('UPDATE senda_billing_customers SET lock_until=?').bind(Date.now() - 1).run();
    };
    await assert.rejects(f.billing.checkout({ userId: 'owner' }, 'owner@example.test'), { code: 'CONFLICT' });
    assert.equal(f.calls.filter(c => c.kind === 'checkout').length, 0, 'A stale request must not make an external payment session');
  } finally { f.db.close(); }
});

test('signed webhooks bind canonical customers, deduplicate events and reconcile current status rather than stale payloads', async () => {
  const f = fixture();
  try {
    const owner = { userId: 'owner' };
    await f.billing.checkout(owner, 'owner@example.test');
    const paid = f.notification('customer.subscription.updated', { id: f.current.id, customer: 'cus_forged', metadata: { owner: 'other-owner' } });
    await f.billing.webhook(paid.request());
    assert.ok(await f.billing.entitlement(owner));
    assert.equal(await f.billing.entitlement({ userId: 'other-owner' }), null);
    assert.equal((await f.billing.status(owner)).subscription.active, true);
    await f.billing.webhook(paid.request());
    assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM senda_billing_events').first().count, 1);
    f.current.status = 'canceled';
    await f.billing.webhook(f.notification('customer.subscription.deleted', { id: f.current.id, status: 'active' }).request());
    assert.equal(await f.billing.entitlement(owner), null);
    await f.billing.webhook(paid.request());
    assert.equal(await f.billing.entitlement(owner), null);
    f.current.status = 'active';
    f.current.latest_invoice.status = 'open';
    await f.billing.webhook(f.notification('invoice.payment_failed', { id: 'in_fixture' }).request());
    assert.equal(await f.billing.entitlement(owner), null);
    f.current.latest_invoice.status = 'paid';
    await f.billing.webhook(f.notification('invoice.paid', { id: 'in_fixture' }).request());
    assert.ok(await f.billing.entitlement(owner));
    f.current.cancel_at = f.current.items.data[0].current_period_end;
    await f.billing.webhook(f.notification('customer.subscription.updated').request());
    assert.ok(await f.billing.entitlement(owner), 'Cancel at period end retains paid access until expiry');
    f.current.items.data[0].current_period_end = Math.floor(Date.now() / 1000) - 1;
    await f.billing.webhook(f.notification('customer.subscription.updated').request());
    assert.equal(await f.billing.entitlement(owner), null);
  } finally { f.db.close(); }
});

test('refunds and disputes hold access until operator review; later notifications cannot erase a hold', async () => {
  const f = fixture();
  try {
    const owner = { userId: 'owner' };
    await f.billing.checkout(owner, 'owner@example.test');
    await f.billing.webhook(f.notification('invoice.paid', { id: 'in_fixture' }).request());
    await f.billing.webhook(f.notification('charge.dispute.created', { id: 'dp_fixture', charge: 'ch_fixture' }).request());
    assert.equal(await f.billing.entitlement(owner), null);
    f.client.disputes.retrieve = async () => ({ id: 'dp_fixture', status: 'won' });
    await f.billing.webhook(f.notification('charge.dispute.closed', { id: 'dp_fixture', charge: 'ch_fixture', status: 'lost' }).request());
    assert.equal(await f.billing.entitlement(owner), null, 'A resolved dispute still needs the agreed operator review');
    f.db.prepare("UPDATE senda_billing_risks SET active=0 WHERE resource='dp_fixture'").run();
    await f.billing.webhook(f.notification('customer.subscription.updated').request());
    assert.ok(await f.billing.entitlement(owner), 'An explicit operator-reviewed release can restore canonical paid access');
    f.client.charges.retrieve = async () => ({ id: 'ch_fixture', payment_intent: 'pi_fixture', amount: 1500, amount_refunded: 500 });
    await f.billing.webhook(f.notification('charge.refunded', { id: 'ch_fixture' }).request());
    assert.ok(await f.billing.entitlement(owner), 'A partial refund retains access for operator review');
    f.client.charges.retrieve = async () => ({ id: 'ch_fixture', payment_intent: 'pi_fixture', amount: 1500, amount_refunded: 1500 });
    await f.billing.webhook(f.notification('charge.refunded', { id: 'ch_fixture' }).request());
    await f.billing.webhook(f.notification('invoice.paid', { id: 'in_fixture' }).request());
    assert.equal(await f.billing.entitlement(owner), null, 'An unrelated later webhook cannot erase a refund hold');
    f.current.id = 'sub_replacement';
    await f.billing.webhook(f.notification('customer.subscription.updated').request());
    assert.equal(await f.billing.entitlement(owner), null, 'A replacement subscription cannot bypass an unresolved account review');
    assert.equal((await f.billing.status(owner)).checkoutAvailable, false);
    assert.match(await f.billing.unavailableMessage(owner), /payment is reviewed/);
    await assert.rejects(f.billing.checkout(owner, 'owner@example.test'), { code: 'FORBIDDEN' });
  } finally { f.db.close(); }
});
