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
// Conservative peak pricing: cache discounts are not needed to stay inside limits.
export function usageCost(usage = {}) {
  return (
    ((usage.inputTokens || 0) * 0.3 + (usage.outputTokens || 0) * 1.2) /
    1_000_000
  );
}
