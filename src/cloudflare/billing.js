import { randomUUID } from 'node:crypto';
import { createStripeClient, verifyStripeEvent, affectedSubscriptions } from '../server/billing/stripe.js';
import { requireThat, ScribeError } from '../core/errors.js';
import { hash } from '../core/hash.js';
import { paidUsage, budgetPause, MIN_PAID_TURN_USD } from './agent-budget.js';

const idOf = value => typeof value === 'string' ? value : value?.id;
const ACCOUNTS = { live: 'acct_1TX0nfGSlAkX1ZYL', sandbox: 'acct_1TX0nqK7alsSe3q5' };

// A catalog, a signing secret and an explicit release flag are all required.
// Prices and allowances are configuration, never accepted from a browser.
export function billingConfig(env) {
  const live = env.STRIPE_LIVEMODE === 'true';
  const configured = env.BILLING_ENABLED === '1' &&
    ['true', 'false'].includes(env.STRIPE_LIVEMODE) &&
    env.STRIPE_ACCOUNT_ID === (live ? ACCOUNTS.live : ACCOUNTS.sandbox) &&
    !!env.STRIPE_SECRET_KEY && !!env.STRIPE_WEBHOOK_SECRET &&
    /^price_/.test(env.STRIPE_PRICE_ID || '') &&
    Number(env.BILLING_INCLUDED_USD) > 0 && Number(env.BILLING_INCLUDED_USD) <= 10;
  return {
    configured: !!configured, live, accountId: env.STRIPE_ACCOUNT_ID,
    context: `${env.STRIPE_ACCOUNT_ID}:${live ? 'live' : 'sandbox'}`,
    priceId: env.STRIPE_PRICE_ID, includedUsd: Number(env.BILLING_INCLUDED_USD),
    paidAgentEnabled: env.PAID_AGENT_ENABLED === '1',
  };
}

export class CloudBilling {
  constructor(env, origin, { client } = {}) {
    this.env = env;
    this.db = env.DB;
    this.origin = origin;
    this.config = billingConfig(env);
    this.stripe = client || (this.config.configured ? createStripeClient(env.STRIPE_SECRET_KEY) : null);
  }
  requireConfigured() {
    requireThat(this.config.configured, 'BILLING_UNAVAILABLE', 'Paid plans are not available yet. You can keep using your connected agent.');
  }
  async customer(owner) {
    return this.db.prepare('SELECT * FROM senda_billing_customers WHERE context=? AND owner=?')
      .bind(this.config.context, owner).first();
  }
  async reviewHold(owner) {
    return this.db.prepare(`SELECT 1 FROM senda_billing_risks r JOIN senda_billing_subscriptions s
      ON s.context=r.context AND s.id=r.subscription WHERE s.context=? AND s.owner=? AND r.active=1`)
      .bind(this.config.context, owner).first();
  }
  async withCustomer(owner, action) {
    const context = this.config.context, now = Date.now(), lock = randomUUID();
    await this.db.prepare('INSERT OR IGNORE INTO senda_billing_customers(context,owner,checkout_attempt) VALUES(?,?,?)')
      .bind(context, owner, randomUUID()).run();
    const row = await this.db.prepare('UPDATE senda_billing_customers SET lock_id=?,lock_until=? WHERE context=? AND owner=? AND lock_until<? RETURNING *')
      .bind(lock, now + 120000, context, owner, now).first();
    requireThat(row, 'CONFLICT', 'Your billing account is being updated. Please try again in a moment.');
    try { return await action(row, lock); }
    finally {
      await this.db.prepare('UPDATE senda_billing_customers SET lock_id=NULL,lock_until=0 WHERE context=? AND owner=? AND lock_id=?')
        .bind(context, owner, lock).run();
    }
  }
  async verifyCatalog({ forCheckout = false } = {}) {
    const [account, price] = await Promise.all([
      this.stripe.accounts.retrieve(), this.stripe.prices.retrieve(this.config.priceId),
    ]);
    requireThat(account.id === this.config.accountId && price.livemode === this.config.live &&
      (!forCheckout || price.active) && price.type === 'recurring' && price.recurring?.interval === 'month' &&
      price.recurring.interval_count === 1 && price.currency === 'usd' && price.unit_amount > 0,
      'BILLING_UNAVAILABLE', 'The payment configuration needs operator attention.');
    return price;
  }
  async renewLease(owner, lock) {
    const now = Date.now();
    const row = await this.db.prepare('UPDATE senda_billing_customers SET lock_until=? WHERE context=? AND owner=? AND lock_id=? AND lock_until>? RETURNING owner')
      .bind(now + 120000, this.config.context, owner, lock, now).first();
    requireThat(row, 'CONFLICT', 'Your billing account changed during this request. Please try again.');
  }
  async checkout(actor, email) {
    this.requireConfigured();
    requireThat(this.config.paidAgentEnabled, 'BILLING_UNAVAILABLE', 'The hosted plan is not available yet.');
    await this.verifyCatalog({ forCheckout: true });
    return this.withCustomer(actor.userId, async row => {
      requireThat(!(await this.reviewHold(actor.userId)), 'FORBIDDEN', 'Your payment needs operator review before another subscription can be started. Your saved work remains available.');
      if (!row.customer) {
        await this.renewLease(actor.userId, row.lock_id);
        const customer = await this.stripe.customers.create({ email, metadata: { application: 'senda' } }, {
          idempotencyKey: `senda-customer-${hash(this.config.context + ':' + actor.userId)}`,
        });
        requireThat(customer.livemode === this.config.live, 'BILLING_CONTEXT_MISMATCH', 'The payment environment changed.');
        await this.db.prepare('UPDATE senda_billing_customers SET customer=? WHERE context=? AND owner=? AND lock_id=?')
          .bind(customer.id, this.config.context, actor.userId, row.lock_id).run();
        row.customer = customer.id;
      }
      // Canonical provider state prevents duplicate subscriptions even if a
      // successful payment's webhook is still in flight.
      for await (const subscription of this.stripe.subscriptions.list({ customer: row.customer, status: 'all', limit: 100 }))
        requireThat(!['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'].includes(subscription.status),
          'SUBSCRIPTION_EXISTS', 'You already have a subscription. Use Manage subscription to update it.');
      if (row.checkout_id) {
        const prior = await this.stripe.checkout.sessions.retrieve(row.checkout_id);
        if (prior.status === 'open' && prior.url) return { url: prior.url };
        await this.renewLease(actor.userId, row.lock_id);
        const attempt = randomUUID();
        const changed = await this.db.prepare('UPDATE senda_billing_customers SET checkout_id=NULL,checkout_attempt=? WHERE context=? AND owner=? AND lock_id=? AND lock_until>?')
          .bind(attempt, this.config.context, actor.userId, row.lock_id, Date.now()).run();
        requireThat(changed.meta.changes === 1, 'CONFLICT', 'Your billing account changed during this request. Please try again.');
        row.checkout_attempt = attempt;
      }
      await this.renewLease(actor.userId, row.lock_id);
      const session = await this.stripe.checkout.sessions.create({
        mode: 'subscription', customer: row.customer,
        line_items: [{ price: this.config.priceId, quantity: 1 }],
        subscription_data: { billing_mode: { type: 'flexible' }, metadata: { application: 'senda' } },
        integration_identifier: `senda_${row.checkout_attempt.replace(/[^a-z]/g, '').slice(0, 8).padEnd(8, 's')}`,
        success_url: this.origin + '/app/billing?checkout=complete',
        cancel_url: this.origin + '/app/billing',
        metadata: { application: 'senda' },
      }, { idempotencyKey: 'senda-checkout-' + row.checkout_attempt });
      requireThat(session.livemode === this.config.live && session.url, 'BILLING_CONTEXT_MISMATCH', 'The payment environment changed.');
      await this.db.prepare('UPDATE senda_billing_customers SET checkout_id=? WHERE context=? AND owner=? AND lock_id=?')
        .bind(session.id, this.config.context, actor.userId, row.lock_id).run();
      return { url: session.url };
    });
  }
  async portal(actor) {
    this.requireConfigured();
    const row = await this.customer(actor.userId);
    requireThat(row?.customer, 'NOT_FOUND', 'This account has no subscription to manage yet.');
    const [account, customer] = await Promise.all([
      this.stripe.accounts.retrieve(), this.stripe.customers.retrieve(row.customer),
    ]);
    requireThat(account.id === this.config.accountId && !customer.deleted && customer.livemode === this.config.live,
      'BILLING_CONTEXT_MISMATCH', 'The payment environment changed.');
    const session = await this.stripe.billingPortal.sessions.create({
      customer: row.customer, return_url: this.origin + '/app/billing',
      ...(this.env.STRIPE_PORTAL_CONFIGURATION ? { configuration: this.env.STRIPE_PORTAL_CONFIGURATION } : {}),
    });
    return { url: session.url };
  }
  async status(actor) {
    if (!this.config.configured) return { available: false };
    const customer = await this.customer(actor.userId);
    const subscriptions = (await this.db.prepare('SELECT id,status,eligible,period_start,period_end,cancel_at FROM senda_billing_subscriptions WHERE context=? AND owner=? ORDER BY period_end DESC')
      .bind(this.config.context, actor.userId).all()).results;
    const current = subscriptions[0];
    const held = await this.reviewHold(actor.userId);
    const price = await this.verifyCatalog();
    const period = current && { context: this.config.context, subscriptionId: current.id,
      periodStart: new Date(current.period_start * 1000).toISOString(), periodEnd: new Date(current.period_end * 1000).toISOString(), limitUsd: this.config.includedUsd };
    const usage = period ? await paidUsage(this.db, actor.userId, period) : null;
    const pause = period ? await budgetPause(this.db, actor.userId, new Date().toISOString().slice(0, 10), period) : null;
    return {
      available: true, checkoutAvailable: this.config.paidAgentEnabled && !held && !subscriptions.some(s => ['active','trialing','past_due','unpaid','paused','incomplete'].includes(s.status)), sandbox: !this.config.live, priceUsd: price.unit_amount / 100,
      includedUsd: this.config.includedUsd, usedUsd: usage?.usedUsd || 0, pendingUsd: usage?.pendingUsd || 0,
      minimumTurnUsd: MIN_PAID_TURN_USD, pause,
      managed: !!customer?.customer,
      subscription: current ? {
        status: current.status, active: !!current.eligible && current.period_end * 1000 > Date.now(),
        periodEnd: new Date(current.period_end * 1000).toISOString(), cancelAt: current.cancel_at,
      } : null,
    };
  }
  async entitlement(actor) {
    if (!this.config.configured || !this.config.paidAgentEnabled) return null;
    const grant = await this.db.prepare(`SELECT * FROM senda_billing_subscriptions s WHERE context=? AND owner=? AND eligible=1 AND period_start<=? AND period_end>?
      AND NOT EXISTS(SELECT 1 FROM senda_billing_risks r JOIN senda_billing_subscriptions held ON held.context=r.context AND held.id=r.subscription WHERE r.context=s.context AND held.owner=s.owner AND r.active=1)
      ORDER BY period_end DESC LIMIT 1`)
      .bind(this.config.context, actor.userId, Date.now() / 1000, Date.now() / 1000).first();
    return grant ? {
      context: this.config.context, subscriptionId: grant.id,
      periodStart: new Date(grant.period_start * 1000).toISOString(),
      periodEnd: new Date(grant.period_end * 1000).toISOString(), limitUsd: this.config.includedUsd,
    } : null;
  }
  async unavailableMessage(actor) {
    if (!this.config.configured || !this.config.paidAgentEnabled) return null;
    const hold = await this.reviewHold(actor.userId);
    if (hold) return 'The built-in agent is paused while your payment is reviewed. Your saved work and connected agent remain available. Check Your plan for details.';
    const customer = await this.customer(actor.userId);
    return customer?.customer ? 'Your paid plan is not active. Check Your plan for payment or subscription details. Your saved work and connected agent remain available.' : null;
  }
  async risk(event) {
    const object = event.data.object;
    if (event.type === 'charge.refunded') {
      const charge = await this.stripe.charges.retrieve(object.id);
      return { resource: charge.id, kind: 'refund', active: charge.amount_refunded > 0 && charge.amount_refunded >= charge.amount };
    }
    if (event.type.startsWith('charge.dispute.')) {
      const dispute = await this.stripe.disputes.retrieve(object.id);
      return { resource: dispute.id, kind: 'dispute', active: !['won', 'prevented'].includes(dispute.status) };
    }
    if (event.type === 'radar.early_fraud_warning.created') {
      const warning = await this.stripe.radar.earlyFraudWarnings.retrieve(object.id);
      return { resource: warning.id, kind: 'fraud', active: true };
    }
    return null;
  }
  async webhook(request) {
    this.requireConfigured();
    const event = await verifyStripeEvent(this.stripe, await request.text(), request.headers.get('stripe-signature'), {
      webhookSecret: this.env.STRIPE_WEBHOOK_SECRET, accountId: this.config.accountId, livemode: this.config.live,
    });
    const seen = await this.db.prepare('SELECT 1 FROM senda_billing_events WHERE context=? AND id=?')
      .bind(this.config.context, event.id).first();
    if (seen) return { received: true };
    const subscriptions = await affectedSubscriptions(this.stripe, event);
    const risk = await this.risk(event);
    for (const candidate of subscriptions) {
      const owner = await this.db.prepare('SELECT owner FROM senda_billing_customers WHERE context=? AND customer=?')
        .bind(this.config.context, idOf(candidate.customer)).first();
      if (!owner) continue; // A signed event never creates a customer/owner link.
      await this.withCustomer(owner.owner, async row => {
        const subscription = await this.stripe.subscriptions.retrieve(candidate.id, { expand: ['latest_invoice'] });
        requireThat(subscription.livemode === this.config.live && idOf(subscription.customer) === row.customer,
          'BILLING_CONTEXT_MISMATCH', 'The payment environment changed.');
        const item = subscription.items.data.find(x => x.price.id === this.config.priceId && x.quantity === 1);
        const invoice = typeof subscription.latest_invoice === 'string'
          ? await this.stripe.invoices.retrieve(subscription.latest_invoice) : subscription.latest_invoice;
        const context = this.config.context;
        // The same lease predicate guards every statement in the atomic batch.
        const guard = 'EXISTS(SELECT 1 FROM senda_billing_customers WHERE context=? AND owner=? AND lock_id=? AND lock_until>?)';
        const lease = [context, owner.owner, row.lock_id, Date.now()];
        const writes = [];
        // Resolution alone does not undo an operator-review hold. An explicit
        // reviewed release may clear it; unrelated/reordered events cannot.
        if (risk) writes.push(this.db.prepare(`INSERT INTO senda_billing_risks(context,subscription,resource,kind,active) SELECT ?,?,?,?,? WHERE ${guard} ON CONFLICT(context,subscription,resource) DO UPDATE SET active=MAX(senda_billing_risks.active,excluded.active)`)
          .bind(context, subscription.id, risk.resource, risk.kind, Number(risk.active), ...lease));
        const eligible = subscription.status === 'active' && !subscription.pause_collection &&
          !!item && invoice?.status === 'paid' && item.current_period_start <= Date.now() / 1000 && item.current_period_end > Date.now() / 1000;
        writes.push(this.db.prepare(`INSERT INTO senda_billing_subscriptions(context,id,owner,status,eligible,period_start,period_end,cancel_at,updated) SELECT ?,?,?,?,CASE WHEN ? AND NOT EXISTS(SELECT 1 FROM senda_billing_risks WHERE context=? AND subscription=? AND active=1) THEN 1 ELSE 0 END,?,?,?,? WHERE ${guard} ON CONFLICT(context,id) DO UPDATE SET status=excluded.status,eligible=excluded.eligible,period_start=excluded.period_start,period_end=excluded.period_end,cancel_at=excluded.cancel_at,updated=excluded.updated`)
          .bind(context, subscription.id, owner.owner, subscription.status, Number(eligible), context, subscription.id,
            item?.current_period_start || 0, item?.current_period_end || 0, subscription.cancel_at || null, new Date().toISOString(), ...lease));
        const results = await this.db.batch(writes);
        requireThat(results.at(-1).meta.changes === 1, 'CONFLICT', 'Billing changed during this update. Please retry.');
      });
    }
    await this.db.prepare('INSERT OR IGNORE INTO senda_billing_events(context,id,type,processed) VALUES(?,?,?,?)')
      .bind(this.config.context, event.id, event.type, new Date().toISOString()).run();
    return { received: true };
  }
  async handle(request, actor, email) {
    const path = new URL(request.url).pathname;
    try {
      if (path === '/api/billing/config' && request.method === 'GET') return Response.json({ available: this.config.configured });
      if (path === '/api/billing' && request.method === 'GET') return Response.json(await this.status(actor));
      if (path === '/api/billing/checkout' && request.method === 'POST') return Response.json(await this.checkout(actor, email));
      if (path === '/api/billing/portal' && request.method === 'POST') return Response.json(await this.portal(actor));
      throw new ScribeError('NOT_FOUND', 'This billing page is not available.');
    } catch (error) {
      if (error instanceof ScribeError) throw error;
      throw new ScribeError('BILLING_UNAVAILABLE', 'Stripe could not complete this request. Please try again later.');
    }
  }
}
