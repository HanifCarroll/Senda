export const AGENT_LIMITS = Object.freeze({
  steps: 16,
  outputTokens: 32000,
  requestBytes: 240000,
  reviewCalls: 6,
  reviewBytes: 60000,
  reviewOutputTokens: 16000,
  reservationUsd: 1,
  dailyUsd: 2,
});
// Fixed application ceiling for GPT-6 Luna with an explicit 30-minute cache TTL.
// All input is charged as a new cache write; cache reads cost less at the provider.
export function usageCost(usage = {}) {
  return (
    ((usage.inputTokens || 0) * 0.125 + (usage.outputTokens || 0) * 0.5) /
    1_000_000
  );
}
