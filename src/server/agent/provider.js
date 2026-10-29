import { createOpenAI } from '@ai-sdk/openai';

export const AGENT_MODEL_ID = 'gpt-6-luna';
export const AGENT_MODEL_NAME = 'GPT-6 Luna';

export function createAgentModel(apiKey, options = {}) {
  return createOpenAI({ ...options, apiKey }).responses(AGENT_MODEL_ID);
}

export function agentProviderOptions(parallelToolCalls = false) {
  return { openai: {
    reasoningEffort: 'medium', reasoningSummary: null, store: false,
    parallelToolCalls, serviceTier: 'default',
    promptCacheOptions: { mode: 'implicit', ttl: '30m' },
  } };
}
