import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { generateText } from 'ai';
import { createAgentModel } from '../src/server/agent/provider.js';
import { budgetedModel } from '../src/server/agent/budgeted-model.js';
import { runAgent } from '../src/server/agent/run.js';
import { reviewCandidate } from '../src/server/agent/semantic-review.js';

function response(text) {
  return Response.json({ id: 'resp_PRIVATE', object: 'response', created_at: 1, model: 'gpt-6-luna', status: 'completed',
    output: [{ type: 'message', id: 'msg_PRIVATE', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text, annotations: [] }] }],
    usage: { input_tokens: 120, output_tokens: 10, total_tokens: 130,
      input_tokens_details: { cached_tokens: 60 }, output_tokens_details: { reasoning_tokens: 3 } } });
}

test('real adapter timings separate reservation, provider and settlement without exposing request or response data', async () => {
  const timings = [], accounting = [];
  const model = budgetedModel(createAgentModel('PRIVATE-key', { fetch: async () => {
    accounting.push('provider'); await delay(12); return response('PRIVATE customer detail');
  } }), {
    kind: 'main', onTiming: event => timings.push(event),
    reserveCall: async () => { accounting.push('reserve'); await delay(6); },
    settleCall: async usage => { assert.deepEqual(usage, { inputTokens: 120, outputTokens: 10 }); accounting.push('settle'); await delay(18); },
    failCall: async () => assert.fail('A successful call must not fail accounting'),
  });
  const result = await generateText({ model, prompt: 'PRIVATE source passage', maxOutputTokens: 100, maxRetries: 0 });
  assert.equal(result.text, 'PRIVATE customer detail');
  assert.deepEqual(accounting, ['reserve', 'provider', 'settle']);
  assert.deepEqual(timings.map(e => [e.phase, e.kind, e.status]), [
    ['reserve', 'main', 'success'], ['provider', 'main', 'success'], ['settle', 'main', 'success'],
  ]);
  assert.ok(timings[0].durationMs >= 5 && timings[1].durationMs >= 11 && timings[2].durationMs >= 17);
  assert.deepEqual(Object.fromEntries(['inputTokens', 'outputTokens', 'cacheReadTokens', 'reasoningTokens'].map(k => [k, timings[1][k]])),
    { inputTokens: 120, outputTokens: 10, cacheReadTokens: 60, reasoningTokens: 3 });
  for (const event of timings) for (const key of Object.keys(event))
    assert.ok(['phase', 'kind', 'toolName', 'durationMs', 'status', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'reasoningTokens'].includes(key));
  assert.doesNotMatch(JSON.stringify(timings), /PRIVATE|customer|source passage/);
});

test('timing observers cannot permit denied dispatch, suppress failed settlement or alter accounting order', async () => {
  for (const failure of ['reserve', 'settle']) {
    const events = [], denied = new Error('PRIVATE accounting rejection');
    let requests = 0;
    const model = budgetedModel(createAgentModel('PRIVATE-key', { fetch: async () => {
      requests++; events.push('provider'); return response('Ready');
    } }), {
      kind: 'review', onTiming: event => {
        events.push(`${event.phase}:${event.status}`);
        const error = new Error('PRIVATE observer failure');
        if (failure === 'reserve') throw error;
        return Promise.reject(error);
      },
      reserveCall: async () => { events.push('reserve'); if (failure === 'reserve') throw denied; },
      settleCall: async () => { events.push('settle'); if (failure === 'settle') throw denied; },
      failCall: async error => { assert.equal(error, denied); events.push('failure'); },
    });
    await assert.rejects(generateText({ model, prompt: 'Check the scope.', maxRetries: 0 }), error => error === denied);
    assert.equal(requests, failure === 'reserve' ? 0 : 1);
    assert.deepEqual(events, failure === 'reserve' ? ['reserve', 'reserve:error'] :
      ['reserve', 'reserve:success', 'provider', 'provider:success', 'settle', 'settle:error', 'failure', 'failure:success']);
    await delay(0); // An observer's rejected promise must not escape as unhandled.
  }
});

test('a failed provider records its own span and failure settlement without waiting for a timing sink', { timeout: 1000 }, async () => {
  const timings = [], accounting = [];
  const model = budgetedModel(createAgentModel('PRIVATE-key', { fetch: async () => {
    accounting.push('provider');
    return Response.json({ error: { message: 'PRIVATE provider details', type: 'authentication_error', code: 'invalid_api_key', param: null } }, { status: 401 });
  } }), {
    kind: 'review', onTiming: event => { timings.push(event); return new Promise(() => {}); },
    reserveCall: async () => { accounting.push('reserve'); },
    settleCall: async () => assert.fail('No provider response exists to settle'),
    failCall: async error => { assert.equal(error.statusCode, 401); accounting.push('failure'); },
  });
  await assert.rejects(generateText({ model, prompt: 'PRIVATE source', maxRetries: 0 }), error => error.statusCode === 401);
  assert.deepEqual(accounting, ['reserve', 'provider', 'failure']);
  assert.deepEqual(timings.map(e => [e.phase, e.kind, e.status]), [
    ['reserve', 'review', 'success'], ['provider', 'review', 'error'], ['failure', 'review', 'success'],
  ]);
  assert.doesNotMatch(JSON.stringify(timings), /PRIVATE|invalid_api_key|authentication_error/);
});

test('agent tool timings distinguish a nested actual semantic review and checkpoints from the enclosing tool', async () => {
  const timings = [], id = '5a1ce263-893b-41d9-9d42-9c8171471085';
  const xml = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs"><bpmn:process id="Process_Main" /></bpmn:definitions>';
  const candidate = { xml, mode: 'current', discovery: { context: { purpose: 'Map requests' }, sources: [], questions: [], claims: [], abstractions: [], walkthrough: { steps: [] } } };
  const verdict = { audit: { boundaryBindings: [], triggerScope: '', timerClock: '', explanations: [] }, verdict: 'supported', issues: [] };
  const model = createAgentModel('PRIVATE-key', { fetch: async () => { await delay(8); return response(JSON.stringify(verdict)); } });
  const result = await runAgent({ apiKey: 'PRIVATE-key', actor: { userId: 'owner' }, projectId: id,
    origin: 'https://senda.example', messages: [{ role: 'user', content: 'PRIVATE transcript' }], emit: () => {},
    onTiming: event => timings.push(event), saveStep: async () => { await delay(5); },
    projects: { preview: async () => ({ previous: { xml }, candidate }), applyPreview: async () => ({ revision: 2, quality: {} }) },
    review: options => reviewCandidate({ ...options, model }),
    generate: async options => {
      const denied = await options.tools.read_project.execute({ projectId: '00000000-0000-4000-8000-000000000001', model: 'as-is' });
      assert.equal(denied.error, 'FORBIDDEN');
      const saved = await options.tools.apply_revision.execute({ projectId: id, model: 'as-is', proposal: {
        expectedRevision: 1, summary: 'Record scope', context: { purpose: 'Map requests' },
      } });
      assert.equal(saved.revision, 2);
      await options.onStepEnd({ usage: { inputTokens: 1, outputTokens: 1 }, response: { messages: [] } });
      return { text: 'Saved the process.', responseMessages: [], totalUsage: { inputTokens: 1, outputTokens: 1 } };
    },
  });
  assert.equal(result.incomplete, false);
  const tool = timings.find(e => e.phase === 'tool' && e.toolName === 'apply_revision');
  const review = timings.find(e => e.phase === 'review');
  assert.ok(tool && review && tool.durationMs >= review.durationMs);
  assert.equal(tool.status, 'success');
  assert.equal(timings.find(e => e.phase === 'tool' && e.toolName === 'read_project').status, 'error');
  assert.equal(timings.filter(e => e.phase === 'provider' && e.kind === 'review').length, 1);
  assert.deepEqual(timings.filter(e => e.phase === 'checkpoint').map(e => e.kind), ['review', 'main']);
  assert.doesNotMatch(JSON.stringify(timings), /PRIVATE|transcript|Defs|Process_Main/);
});
