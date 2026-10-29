import { AGENT_LIMITS, usageCost } from '../server/agent/limits.js';
import { requireThat } from '../core/errors.js';

// Include prompt/protocol overhead beyond the bounded application payload.
// Reserve each call's maximum before dispatch, then settle measured usage.
// Extra repair calls fit only while the atomic $1 turn ceiling still permits them.
export const CALL_RESERVES = Object.freeze({ main: .12, review: .04 });
export const RATE_CARD = 'deepseek-flash-2026-10-28-peak';
export const measuredUsage = usage => usage &&
  [usage.inputTokens, usage.outputTokens].every(n => Number.isSafeInteger(n) && n >= 0);
export const MIN_PAID_TURN_USD = .35;
export const absorbedLimit = allowance => Math.min(allowance, Math.max(3, allowance * .5));
const operational = 'COALESCE(cost_usd,reserved_usd)';
const customer = "COALESCE(meter_usd,CASE WHEN status='running' THEN reserved_usd ELSE 0 END)";
const period = 'owner=? AND billing_context=? AND billing_subscription=? AND billing_period_start=?';
const periodArgs = (owner, e) => [owner, e.context, e.subscriptionId, e.periodStart];

// These predicates are part of the mutation, not an earlier advisory read.
function constraints({ owner, day, entitlement: e, delta, admission = false }) {
  const sql = [`COALESCE((SELECT SUM(${operational}) FROM senda_agent_runs WHERE owner=? AND day=?),0)+?<=?`];
  const args = [owner, day, delta, AGENT_LIMITS.dailyUsd];
  if (e) {
    sql.push(`COALESCE((SELECT SUM(${customer}) FROM senda_agent_runs WHERE ${period}),0)+?<=?`);
    args.push(...periodArgs(owner, e), admission ? Math.max(delta, MIN_PAID_TURN_USD) : delta, e.limitUsd);
    sql.push(`COALESCE((SELECT SUM(MAX(0,${operational}-COALESCE(meter_usd,0))) FROM senda_agent_runs WHERE ${period}),0)+?<=?`);
    args.push(...periodArgs(owner, e), delta, absorbedLimit(e.limitUsd));
    const now = Date.now() / 1000, end = Date.parse(e.periodEnd) / 1000;
    sql.push(`EXISTS(SELECT 1 FROM senda_billing_subscriptions s WHERE s.context=? AND s.id=? AND s.owner=? AND
      NOT EXISTS(SELECT 1 FROM senda_billing_risks r JOIN senda_billing_subscriptions held ON held.context=r.context AND held.id=r.subscription WHERE r.context=s.context AND held.owner=s.owner AND r.active=1) AND
      ${admission ? 's.eligible=1 AND s.period_start=? AND s.period_end=? AND s.period_start<=? AND s.period_end>?' : "(s.eligible=1 OR (? >= ? AND s.period_end>=? AND s.status IN ('active','past_due','unpaid','canceled')))"})`);
    args.push(e.context, e.subscriptionId, owner,
      ...(admission ? [Date.parse(e.periodStart) / 1000, end, now, now] : [now, end, end]));
  }
  return { sql: sql.join(' AND '), args };
}

export async function paidUsage(db, owner, e) {
  const row = await db.prepare(`SELECT COALESCE(SUM(COALESCE(meter_usd,0)),0) AS used,
    COALESCE(SUM(CASE WHEN status='running' THEN reserved_usd ELSE 0 END),0) AS pending,
    COALESCE(SUM(MAX(0,${operational}-COALESCE(meter_usd,0))),0) AS absorbed
    FROM senda_agent_runs WHERE ${period}`).bind(...periodArgs(owner, e)).first();
  return { usedUsd: row.used, pendingUsd: row.pending, absorbedUsd: row.absorbed };
}

export async function budgetPause(db, owner, day, e) {
  const pending = { reason: 'pending', message: 'Some allowance is temporarily reserved for replies being prepared. Please wait for them to finish, then try again. It has not been shown as used.' };
  if (e) {
    const hold = await db.prepare('SELECT 1 FROM senda_billing_risks r JOIN senda_billing_subscriptions s ON s.context=r.context AND s.id=r.subscription WHERE r.context=? AND s.owner=? AND r.active=1')
      .bind(e.context, owner).first();
    if (hold) return { reason: 'review', message: 'The built-in agent is paused while your payment is reviewed. Your saved work and connected agent remain available.' };
    const usage = await paidUsage(db, owner, e);
    if (usage.absorbedUsd + CALL_RESERVES.main > absorbedLimit(e.limitUsd)) return usage.pendingUsd && usage.absorbedUsd - usage.pendingUsd + CALL_RESERVES.main <= absorbedLimit(e.limitUsd) ? pending : { reason: 'service', resetAt: e.periodEnd,
      message: `Several replies could not be completed this billing period, so the built-in agent is paused until ${e.periodEnd}. Those attempts did not use your allowance. Nothing extra will be charged; your saved work and connected agent remain available.` };
    if (e.limitUsd - usage.usedUsd - usage.pendingUsd < MIN_PAID_TURN_USD) return usage.pendingUsd && e.limitUsd - usage.usedUsd >= MIN_PAID_TURN_USD ? pending : { reason: 'allowance', resetAt: e.periodEnd,
      message: `There is not enough allowance to begin another reply. The remaining allowance is unavailable until ${e.periodEnd}; it has not been spent. Your saved work and connected agent remain available.` };
  }
  const daily = await db.prepare(`SELECT COALESCE(SUM(${operational}),0) AS usd,
    COALESCE(SUM(CASE WHEN status='running' THEN reserved_usd ELSE 0 END),0) AS pending FROM senda_agent_runs WHERE owner=? AND day=?`).bind(owner, day).first();
  if (daily.usd + CALL_RESERVES.main > AGENT_LIMITS.dailyUsd) {
    if (daily.pending && daily.usd - daily.pending + CALL_RESERVES.main <= AGENT_LIMITS.dailyUsd) return pending;
    const resetAt = new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString();
    return { reason: 'daily', resetAt, message: `The built-in agent has reached its daily limit. It resumes at ${resetAt}. Your saved work and connected agent remain available.` };
  }
  return null;
}

export async function reserveTurn(db, { runId, chatId, owner, day, entitlement: e }) {
  const check = constraints({ owner, day, entitlement: e, delta: CALL_RESERVES.main, admission: true });
  const row = await db.prepare(`INSERT INTO senda_agent_runs(id,chat,owner,day,status,reserved_usd,created,billing_context,billing_subscription,billing_period_start,billing_period_end)
    SELECT ?,?,?,?,'running',?,?,?,?,?,? WHERE ${check.sql} RETURNING id`)
    .bind(runId, chatId, owner, day, CALL_RESERVES.main, new Date().toISOString(), e?.context || null,
      e?.subscriptionId || null, e?.periodStart || null, e?.periodEnd || null, ...check.args).first();
  const pause = !row && await budgetPause(db, owner, day, e);
  requireThat(row, 'LIMIT', pause?.message || 'Your account access changed. Check Billing before starting another reply.');
}

export class CallBudget {
  constructor(db, { runId, owner, day, entitlement }) {
    Object.assign(this, { db, runId, owner, day, entitlement });
    this.first = true;
    this.active = 0;
    this.customerUsd = 0;
  }
  async reserve(kind) {
    requireThat(!this.active, 'CONFLICT', 'A model call is already running.');
    const amount = CALL_RESERVES[kind];
    requireThat(amount, 'INVALID_REQUEST', 'Unknown model call.');
    const delta = this.first ? amount - CALL_RESERVES.main : amount;
    const check = constraints({ owner: this.owner, day: this.day, entitlement: this.entitlement, delta });
    const result = await this.db.prepare(`UPDATE senda_agent_runs SET reserved_usd=reserved_usd+? WHERE id=? AND owner=? AND status='running' AND reserved_usd+?<=? AND ${check.sql} RETURNING id`)
      .bind(delta, this.runId, this.owner, delta, AGENT_LIMITS.reservationUsd, ...check.args).first();
    const pause = !result && await budgetPause(this.db, this.owner, this.day, this.entitlement);
    requireThat(result, 'LIMIT', pause?.message || 'This reply reached its spending limit or your account access changed. Your saved progress is safe; continue with a smaller change.');
    this.first = false;
    this.active = amount;
  }
  async settle(usage) {
    requireThat(this.active, 'CONFLICT', 'There is no model call to settle.');
    const amount = this.active;
    if (measuredUsage(usage)) {
      const cost = usageCost(usage);
      this.customerUsd += Math.min(cost, amount);
      if (cost > amount) console.error('Senda call exceeded reservation', { runId: this.runId, reservedUsd: amount, measuredUsd: cost });
      await this.db.prepare("UPDATE senda_agent_runs SET reserved_usd=MAX(0,reserved_usd+?) WHERE id=? AND status='running'")
        .bind(cost - amount, this.runId).run();
    }
    // Missing usage retains just this call's reservation, not the whole turn.
    this.active = 0;
  }
  async failure(error) {
    if (!this.active) return;
    if ([401, 402, 403].includes(error.statusCode)) await this.settle({ inputTokens: 0, outputTokens: 0 });
    else this.active = 0; // Unknown outcome: retain this call's reservation.
  }
}
