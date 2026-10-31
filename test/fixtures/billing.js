import { readFileSync } from 'node:fs';
import { CloudBilling } from '../../src/cloudflare/billing.js';
import { createStripeClient } from '../../src/server/billing/stripe.js';
import { memoryD1 } from './d1.js';

export const env = {
  BILLING_ENABLED: '1', STRIPE_LIVEMODE: 'false',
  STRIPE_ACCOUNT_ID: 'acct_1TX0nqK7alsSe3q5', STRIPE_PRICE_ID: 'price_fixture',
  STRIPE_SECRET_KEY: 'test-fixture-not-a-key', STRIPE_WEBHOOK_SECRET: 'test-signing-secret',
  BILLING_INCLUDED_USD: '3', PAID_AGENT_ENABLED: '1',
};
const signer = createStripeClient('test-fixture-not-a-key');
export function fixture() {
  const db = memoryD1();
  for (const name of ['0004_hosted_agent.sql', '0005_billing.sql', '0006_agent_meter.sql', '0008_agent_billing_period.sql', '0009_service_budget.sql'])
    db.exec(readFileSync(new URL('../../src/cloudflare/migrations/' + name, import.meta.url), 'utf8'));
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
