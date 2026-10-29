export const SENDA_PLAN = Object.freeze({
  name: 'Senda Pro',
  priceUsd: 29,
  includedUsd: 6,
  freeProjects: 3,
  trialUsd: .5,
  proProjects: 100,
  paidDailyUsd: 3,
  serviceDailyUsd: 10,
  serviceMonthlyUsd: 100,
});

export function emailListed(value, email) {
  if (typeof email !== 'string' || !email.trim()) return false;
  return String(value || '').split(',').some(item => item.trim() && item.trim().toLowerCase() === email.trim().toLowerCase());
}

// Stripe test clocks advance independently of wall time. This server-only
// offset is accepted solely in sandbox mode; live access always uses real time.
export function billingNow(env = {}, now = Date.now()) {
  if (env.STRIPE_LIVEMODE !== 'false' || !env.BILLING_SANDBOX_CLOCK_OFFSET_SECONDS) return now;
  const offset = Number(env.BILLING_SANDBOX_CLOCK_OFFSET_SECONDS);
  if (!Number.isSafeInteger(offset) || Math.abs(offset) > 366 * 86400) throw new Error('Invalid sandbox billing clock.');
  return now + offset * 1000;
}
