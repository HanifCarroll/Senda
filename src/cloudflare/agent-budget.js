import { AGENT_LIMITS, usageCost } from '../server/agent/limits.js';
import { requireThat } from '../core/errors.js';
import { SENDA_PLAN } from '../server/billing/plan.js';

// Include prompt/protocol overhead beyond the bounded application payload.
// Reserve each call's maximum before dispatch, then settle measured usage.
// Extra repair calls fit only while the atomic $1 turn ceiling still permits them.
export const CALL_RESERVES = Object.freeze({ main: .05, review: .02 });
export const RATE_CARD = 'gpt-6-luna-2026-10-29-30m-ceiling';
export const measuredUsage = usage => usage &&
  [usage.inputTokens, usage.outputTokens].every(n => Number.isSafeInteger(n) && n >= 0);
export const MIN_TURN_USD = .10;
export const absorbedLimit = allowance => Math.min(allowance, Math.max(3, allowance * .5));
const operational = 'COALESCE(cost_usd,reserved_usd)';
const customer = "COALESCE(meter_usd,CASE WHEN status='running' THEN reserved_usd ELSE 0 END)";
const period = 'owner=? AND billing_context=? AND billing_subscription=? AND billing_period_start=?';
const periodArgs = (owner, e) => [owner, e.context, e.subscriptionId, e.periodStart];
const serviceDayOf = 'COALESCE(service_day,day)';
export function serviceLimits(env = {}) {
  const dailyUsd = Number(env.AGENT_SERVICE_DAILY_USD || SENDA_PLAN.serviceDailyUsd),
    monthlyUsd = Number(env.AGENT_SERVICE_MONTHLY_USD || SENDA_PLAN.serviceMonthlyUsd);
  requireThat(Number.isFinite(dailyUsd) && dailyUsd > 0 && dailyUsd <= 1000 &&
    Number.isFinite(monthlyUsd) && monthlyUsd > 0 && monthlyUsd <= 10000,
    'LIMIT', 'The built-in agent needs operator attention. Your saved work remains available.');
  return { dailyUsd, monthlyUsd };
}
function monthWindow(day) {
  const start = day.slice(0, 7) + '-01', date = new Date(start + 'T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + 1);
  return [start, date.toISOString().slice(0, 10)];
}
export async function serviceUsage(db, day = new Date().toISOString().slice(0, 10)) {
  const [start, end] = monthWindow(day);
  return db.prepare(`SELECT COALESCE(SUM(CASE WHEN ${serviceDayOf}=? THEN ${operational} ELSE 0 END),0) AS dailyUsd,
    COALESCE(SUM(${operational}),0) AS monthlyUsd,
    COALESCE(SUM(CASE WHEN ${serviceDayOf}=? AND status='running' THEN reserved_usd ELSE 0 END),0) AS dailyPendingUsd,
    COALESCE(SUM(CASE WHEN status='running' THEN reserved_usd ELSE 0 END),0) AS monthlyPendingUsd
    FROM senda_agent_runs WHERE ${serviceDayOf}>=? AND ${serviceDayOf}<?`).bind(day, day, start, end).first();
}

// These predicates are part of the mutation, not an earlier advisory read.
function constraints({ owner, day, entitlement: e, delta, admission = false, chatId,
  nowMs = Date.now(), serviceDay = new Date().toISOString().slice(0, 10), runId = '', existing = false, limits = serviceLimits() }) {
  const sql = [`COALESCE((SELECT SUM(${operational}) FROM senda_agent_runs WHERE owner=? AND day=?),0)+?<=?`];
  const args = [owner, day, delta, e?.dailyUsd || AGENT_LIMITS.dailyUsd];
  const [start, end] = monthWindow(serviceDay), exposure = existing ? 'reserved_usd+?' : '?';
  sql.push(`COALESCE((SELECT SUM(${operational}) FROM senda_agent_runs WHERE id<>? AND ${serviceDayOf}=?),0)+${exposure}<=?`);
  args.push(runId, serviceDay, delta, limits.dailyUsd);
  sql.push(`COALESCE((SELECT SUM(${operational}) FROM senda_agent_runs WHERE id<>? AND ${serviceDayOf}>=? AND ${serviceDayOf}<?),0)+${exposure}<=?`);
  args.push(runId, start, end, delta, limits.monthlyUsd);
  if (e?.kind === 'trial') {
    sql.push(`COALESCE((SELECT SUM(${operational}) FROM senda_agent_runs WHERE trial_owner=?),0)+?<=?`);
    args.push(owner, admission ? Math.max(delta, MIN_TURN_USD) : delta, e.limitUsd);
    sql.push(`EXISTS(SELECT 1 FROM senda_agent_trials t JOIN senda_agent_chats c
      ON c.id=${admission ? '?' : '(SELECT chat FROM senda_agent_runs WHERE id=?)'} AND c.owner=t.owner
      WHERE t.owner=? AND t.limit_usd>=? AND ((t.project IS NULL AND t.chat=c.id AND c.project IS NULL) OR t.project=c.project)
      AND NOT EXISTS(SELECT 1 FROM senda_billing_risks r JOIN senda_billing_subscriptions s ON s.context=r.context AND s.id=r.subscription WHERE s.owner=t.owner AND r.active=1))`);
    args.push(admission ? chatId : runId, owner, e.limitUsd);
  } else if (e) {
    sql.push(`COALESCE((SELECT SUM(${customer}) FROM senda_agent_runs WHERE ${period}),0)+?<=?`);
    args.push(...periodArgs(owner, e), admission ? Math.max(delta, MIN_TURN_USD) : delta, e.limitUsd);
    sql.push(`COALESCE((SELECT SUM(MAX(0,${operational}-COALESCE(meter_usd,0))) FROM senda_agent_runs WHERE ${period}),0)+?<=?`);
    args.push(...periodArgs(owner, e), delta, absorbedLimit(e.limitUsd));
    const now = nowMs / 1000, end = Date.parse(e.periodEnd) / 1000;
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

export async function budgetPause(db, owner, day, e, { nowMs = Date.now(), limits = serviceLimits() } = {}) {
  const pending = { reason: 'pending', message: 'Some allowance is temporarily reserved for replies being prepared. Please wait for them to finish, then try again. It has not been shown as used.' };
  if (e && e.kind !== 'trial') {
    const hold = await db.prepare('SELECT 1 FROM senda_billing_risks r JOIN senda_billing_subscriptions s ON s.context=r.context AND s.id=r.subscription WHERE r.context=? AND s.owner=? AND r.active=1')
      .bind(e.context, owner).first();
    if (hold) return { reason: 'review', message: 'The built-in agent is paused while your payment is reviewed. Your saved work and connected agent remain available.' };
  }
  const service = await serviceUsage(db);
  for (const [total, pendingUsd, cap] of [[service.dailyUsd, service.dailyPendingUsd, limits.dailyUsd], [service.monthlyUsd, service.monthlyPendingUsd, limits.monthlyUsd]]) {
    if (total + CALL_RESERVES.main > cap) {
      if (pendingUsd && total - pendingUsd + CALL_RESERVES.main <= cap) return pending;
      return { reason: 'capacity', message: 'The built-in agent is temporarily paused across the service. Your unspent allowance and saved work are safe, and your connected agent remains available. Contact support for a prorated refund if this interrupts your paid service.' };
    }
  }
  if (e?.kind === 'trial') {
    const usage = await db.prepare(`SELECT COALESCE(SUM(${operational}),0) AS usd FROM senda_agent_runs WHERE trial_owner=?`).bind(owner).first();
    if (e.limitUsd - usage.usd < MIN_TURN_USD)
      return { reason: 'trial', message: 'Your free Luna trial allowance is finished or reserved for a reply. Your project, evidence and downloads stay available. Choose Pro to continue with Luna, or use your connected agent.' };
  } else if (e) {
    const usage = await paidUsage(db, owner, e);
    if (usage.absorbedUsd + CALL_RESERVES.main > absorbedLimit(e.limitUsd)) return usage.pendingUsd && usage.absorbedUsd - usage.pendingUsd + CALL_RESERVES.main <= absorbedLimit(e.limitUsd) ? pending : { reason: 'service', resetAt: e.periodEnd,
      message: `Several replies could not be completed this billing period, so the built-in agent is paused until ${e.periodEnd}. Those attempts did not use your allowance. Nothing extra will be charged; your saved work and connected agent remain available.` };
    if (e.limitUsd - usage.usedUsd - usage.pendingUsd < MIN_TURN_USD) return usage.pendingUsd && e.limitUsd - usage.usedUsd >= MIN_TURN_USD ? pending : { reason: 'allowance', resetAt: e.periodEnd,
      message: `There is not enough allowance to begin another reply. The remaining allowance is unavailable until ${e.periodEnd}; it has not been spent. Your saved work and connected agent remain available.` };
  }
  const daily = await db.prepare(`SELECT COALESCE(SUM(${operational}),0) AS usd,
    COALESCE(SUM(CASE WHEN status='running' THEN reserved_usd ELSE 0 END),0) AS pending FROM senda_agent_runs WHERE owner=? AND day=?`).bind(owner, day).first();
  const dailyLimit = e?.dailyUsd || AGENT_LIMITS.dailyUsd;
  if (daily.usd + CALL_RESERVES.main > dailyLimit) {
    if (daily.pending && daily.usd - daily.pending + CALL_RESERVES.main <= dailyLimit) return pending;
    const resetAt = new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString();
    return { reason: 'daily', resetAt, message: `The built-in agent has reached its daily limit. It resumes at ${resetAt}. Your saved work and connected agent remain available.` };
  }
  return null;
}

export async function reserveTurn(db, { runId, chatId, owner, day, entitlement: e, nowMs = Date.now(), limits = serviceLimits() }) {
  const check = constraints({ owner, day, entitlement: e, runId, chatId, delta: CALL_RESERVES.main, admission: true, nowMs, limits });
  const trial = e?.kind === 'trial';
  const row = await db.prepare(`INSERT INTO senda_agent_runs(id,chat,owner,day,status,reserved_usd,created,billing_context,billing_subscription,billing_period_start,billing_period_end,service_day,rate_card${trial ? ',trial_owner' : ''})
    SELECT ?,?,?,?,'running',?,?,?,?,?,?,?,?${trial ? ',?' : ''} WHERE ${check.sql} RETURNING id`)
    .bind(runId, chatId, owner, day, CALL_RESERVES.main, new Date().toISOString(), e?.context || null,
      e?.subscriptionId || null, e?.periodStart || null, e?.periodEnd || null, day, RATE_CARD, ...(trial ? [owner] : []), ...check.args).first();
  const pause = !row && await budgetPause(db, owner, day, e, { nowMs, limits });
  requireThat(row, 'LIMIT', pause?.message || 'Your account access changed. Check Billing before starting another reply.');
}

export class CallBudget {
  constructor(db, { runId, owner, day, entitlement, now = Date.now, limits = serviceLimits(), onExceeded = async () => {} }) {
    Object.assign(this, { db, runId, owner, day, entitlement, now, limits, onExceeded });
    this.first = true;
    this.active = 0;
    this.customerUsd = 0;
  }
  async reserve(kind) {
    requireThat(!this.active, 'CONFLICT', 'A model call is already running.');
    const amount = CALL_RESERVES[kind];
    requireThat(amount, 'INVALID_REQUEST', 'Unknown model call.');
    const delta = this.first ? amount - CALL_RESERVES.main : amount;
    const serviceDay = new Date().toISOString().slice(0, 10), nowMs = this.now();
    const check = constraints({ owner: this.owner, day: this.day, entitlement: this.entitlement, delta,
      runId: this.runId, existing: true, serviceDay, nowMs, limits: this.limits });
    const result = await this.db.prepare(`UPDATE senda_agent_runs SET reserved_usd=reserved_usd+?,service_day=? WHERE id=? AND owner=? AND status='running' AND reserved_usd+?<=? AND ${check.sql} RETURNING id`)
      .bind(delta, serviceDay, this.runId, this.owner, delta, AGENT_LIMITS.reservationUsd, ...check.args).first();
    const pause = !result && await budgetPause(this.db, this.owner, this.day, this.entitlement, { nowMs, limits: this.limits });
    requireThat(result, 'LIMIT', pause?.message || 'This reply reached its spending limit or your account access changed. Your saved progress is safe; continue with a smaller change.');
    this.first = false;
    this.active = amount;
  }
  async settle(usage) {
    requireThat(this.active, 'CONFLICT', 'There is no model call to settle.');
    const amount = this.active;
    let exceeded = false;
    if (measuredUsage(usage)) {
      const cost = usageCost(usage);
      this.customerUsd += Math.min(cost, amount);
      if (cost > amount) {
        console.error('Senda call exceeded reservation', { runId: this.runId, reservedUsd: amount, measuredUsd: cost });
        exceeded = true;
      }
      await this.db.prepare("UPDATE senda_agent_runs SET reserved_usd=MAX(0,reserved_usd+?) WHERE id=? AND status='running'")
        .bind(cost - amount, this.runId).run();
    }
    // Missing usage retains just this call's reservation, not the whole turn.
    this.active = 0;
    if (exceeded) try { await this.onExceeded({ runId: this.runId }); }
    catch (error) { console.error('Senda reservation alert stopped', { name: error.name }); }
  }
  async failure(error) {
    if (!this.active) return;
    if ([401, 402, 403].includes(error.statusCode)) await this.settle({ inputTokens: 0, outputTokens: 0 });
    else this.active = 0; // Unknown outcome: retain this call's reservation.
  }
}
