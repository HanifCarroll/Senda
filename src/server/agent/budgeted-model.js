import { wrapLanguageModel } from 'ai';
import { providerCallMachine, startProtocol, advanceProtocol } from './protocol-machines.js';

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
      let phase = startProtocol(providerCallMachine);
      const advance = event => { phase = advanceProtocol(providerCallMachine, phase, event); };
      advance({ type: 'RESERVE' });
      try { await measure('reserve', reserveCall); }
      catch (error) { advance({ type: 'DENIED' }); throw error; }
      advance({ type: 'RESERVED' });
      try {
        advance({ type: 'DISPATCH' });
        const result = await measure('provider', doGenerate);
        advance({ type: 'RETURNED' });
        await measure('settle', () => settleCall({ inputTokens: result.usage.inputTokens.total, outputTokens: result.usage.outputTokens.total }));
        advance({ type: 'SETTLED' });
        return result;
      } catch (error) {
        advance({ type: 'REJECTED', error });
        await measure('failure', () => failCall(error, { outcome: phase.value }));
        advance({ type: 'RECORDED' });
        throw error;
      }
    },
    wrapStream: async () => { throw new Error('Senda provider calls must use bounded generation.'); },
  } });
}
