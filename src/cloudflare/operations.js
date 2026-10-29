import { serviceUsage, serviceLimits } from './agent-budget.js';
import { billingNow, emailListed, SENDA_PLAN } from '../server/billing/plan.js';
import { emailForDelivery } from './email.js';

export class OperationalAlerts {
  constructor(env) { this.env = env; this.db = env.DB; }
  get recipient() {
    const email = this.env.BILLING_OPERATOR_EMAIL;
    return emailListed(this.env.AGENT_ALLOWED_EMAILS, email) ? email : null;
  }
  async notify(id, kind, text) {
    if (!this.recipient || !this.env.EMAIL) return;
    const claim = await this.db.prepare('INSERT OR IGNORE INTO senda_operational_alerts(id,kind,created) VALUES(?,?,?)')
      .bind(id, kind, new Date().toISOString()).run();
    if (!claim.meta.changes) return;
    console.warn('Senda operator alert', { id, kind });
    const sandbox = this.env.STRIPE_LIVEMODE === 'false';
    try {
      await this.env.EMAIL.send(emailForDelivery({
        from: { email: 'accounts@mail.senda.hanifcarroll.com', name: 'Senda' },
        to: this.recipient, subject: `${sandbox ? '[Senda sandbox]' : '[Senda]'} Operator attention: ${kind}`,
        text: `${text}\n\nNo provider funding, spending limit or payment was changed automatically.`,
        attachments: [],
      }));
      await this.db.prepare("UPDATE senda_operational_alerts SET status='sent',sent=? WHERE id=?")
        .bind(new Date().toISOString(), id).run();
    } catch (error) {
      // A lost mail response might still have delivered. Retain the alert and
      // console receipt, and never automatically send an uncertain mail twice.
      await this.db.prepare("UPDATE senda_operational_alerts SET status='unknown' WHERE id=?").bind(id).run();
      console.error('Senda operator notification needs review', { id, name: error.name });
    }
  }
  async observe() {
    if (!this.recipient || !this.env.EMAIL) return;
    try {
      const day = new Date().toISOString().slice(0, 10), month = day.slice(0, 7),
        usage = await serviceUsage(this.db, day), limits = serviceLimits(this.env);
      if (usage.dailyUsd >= .6 * limits.dailyUsd)
        await this.notify(`service-day-${day}`, 'daily capacity', `Aggregate hosted-AI admission usage and reservations have reached at least 60% of the $${limits.dailyUsd} daily service limit. Review capacity before new replies are paused.`);
      if (usage.monthlyUsd >= .6 * limits.monthlyUsd)
        await this.notify(`service-month-${month}`, 'monthly capacity', `Aggregate hosted-AI admission usage and reservations have reached at least 60% of the $${limits.monthlyUsd} monthly service limit. Review capacity before new replies are paused.`);
      const context = `${this.env.STRIPE_ACCOUNT_ID}:${this.env.STRIPE_LIVEMODE === 'true' ? 'live' : 'sandbox'}`,
        now = billingNow(this.env) / 1000;
      const active = await this.db.prepare('SELECT COUNT(DISTINCT owner) AS count FROM senda_billing_subscriptions WHERE context=? AND eligible=1 AND period_start<=? AND period_end>?')
        .bind(context, now, now).first();
      if (active.count * SENDA_PLAN.includedUsd > .8 * limits.monthlyUsd)
        await this.notify(`service-growth-${month}`, 'subscriber capacity', `Active paid allowances now exceed 80% of the monthly service admission budget. Review legitimate capacity before accepting further growth. Existing saved work and connected-agent access remain available.`);
    } catch (error) {
      console.error('Senda operational observation stopped', { name: error.name, code: error.code });
    }
  }
}
