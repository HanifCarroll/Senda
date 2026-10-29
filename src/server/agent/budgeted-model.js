import { wrapLanguageModel } from 'ai';

export async function measureAgentPhase({ phase, kind, toolName }, onTiming, action) {
  const started = performance.now();
  let result, status = 'error';
  try {
    result = await action();
    status = 'success';
    return result;
  } finally {
    try {
      const event = { phase, kind, ...(toolName ? { toolName } : {}), durationMs: Math.max(0, performance.now() - started),
        status: phase === 'tool' && result?.error ? 'error' : status };
      if (phase === 'provider') {
        const usage = result?.usage;
        for (const [key, value] of Object.entries({ inputTokens: usage?.inputTokens?.total, outputTokens: usage?.outputTokens?.total,
          cacheReadTokens: usage?.inputTokens?.cacheRead, reasoningTokens: usage?.outputTokens?.reasoning }))
          if (Number.isSafeInteger(value) && value >= 0) event[key] = value;
      }
      Promise.resolve(onTiming(event)).catch(() => {});
    } catch {}
  }
}

export function budgetedModel(model, { reserveCall, settleCall, failCall, kind = 'main', onTiming = () => {} }) {
  const measure = (phase, action) => measureAgentPhase({ phase, kind }, onTiming, action);
  return wrapLanguageModel({ model, middleware: {
    specificationVersion: 'v4',
    // SDK notification hooks swallow errors; this boundary must stop dispatch.
    wrapGenerate: async ({ doGenerate }) => {
      await measure('reserve', reserveCall);
      try {
        const result = await measure('provider', doGenerate);
        await measure('settle', () => settleCall({ inputTokens: result.usage.inputTokens.total, outputTokens: result.usage.outputTokens.total }));
        return result;
      } catch (error) {
        await measure('failure', () => failCall(error));
        throw error;
      }
    },
    wrapStream: async () => { throw new Error('Senda provider calls must use bounded generation.'); },
  } });
}
