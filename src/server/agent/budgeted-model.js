import { wrapLanguageModel } from 'ai';

export function budgetedModel(model, { reserveCall, settleCall, failCall }) {
  return wrapLanguageModel({ model, middleware: {
    specificationVersion: 'v4',
    // SDK notification hooks swallow errors; this boundary must stop dispatch.
    wrapGenerate: async ({ doGenerate }) => {
      await reserveCall();
      try {
        const result = await doGenerate();
        await settleCall({ inputTokens: result.usage.inputTokens.total, outputTokens: result.usage.outputTokens.total });
        return result;
      } catch (error) {
        await failCall(error);
        throw error;
      }
    },
    wrapStream: async () => { throw new Error('Senda provider calls must use bounded generation.'); },
  } });
}
