import test from 'node:test';
import assert from 'node:assert/strict';
import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { createAgentModel, agentProviderOptions } from '../src/server/agent/provider.js';
import { budgetedModel } from '../src/server/agent/budgeted-model.js';
import { reviewCandidate } from '../src/server/agent/semantic-review.js';
import { CallBudget, CALL_RESERVES, reserveTurn } from '../src/cloudflare/agent-budget.js';
import { memoryD1 } from './fixtures/d1.js';

function response(output) {
  return Response.json({ id: 'resp_fixture', object: 'response', created_at: 1, model: 'gpt-6-luna', status: 'completed', output,
    usage: { input_tokens: 120, output_tokens: 10, total_tokens: 130,
      input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 3 } } });
}
const message = text => ({ type: 'message', id: 'msg_fixture', role: 'assistant', status: 'completed',
  content: [{ type: 'output_text', text, annotations: [] }] });
async function budgetFixture() {
  const db = memoryD1(), day = new Date().toISOString().slice(0, 10);
  for (const name of ['0004_hosted_agent.sql', '0005_billing.sql', '0006_agent_meter.sql', '0008_agent_billing_period.sql', '0009_service_budget.sql'])
    db.exec(readFileSync(new URL('../src/cloudflare/migrations/' + name, import.meta.url), 'utf8'));
  await reserveTurn(db, { runId: 'run', chatId: 'chat', owner: 'owner', day });
  const budget = new CallBudget(db, { runId: 'run', owner: 'owner', day });
  const callbacks = kind => ({ reserveCall: () => budget.reserve(kind), settleCall: usage => budget.settle(usage), failCall: error => budget.failure(error) });
  return { db, budget, callbacks };
}

test('the real SDK sends Luna Responses requests directly with bounded caching and no storage', async () => {
  let request;
  const model = createAgentModel('fixture-key', { fetch: async (url, init) => {
    request = { url: String(url), body: JSON.parse(init.body) };
    return Response.json({
      id: 'resp_fixture', object: 'response', created_at: 1, model: 'gpt-6-luna', status: 'completed',
      output: [{ type: 'message', id: 'msg_fixture', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: 'Saved the process.', annotations: [] }] }],
      usage: { input_tokens: 120, output_tokens: 10, total_tokens: 130,
        input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 3 } },
    });
  } });
  const result = await generateText({ model, prompt: 'Map our order process.', maxOutputTokens: 100,
    maxRetries: 0, providerOptions: agentProviderOptions(true) });
  assert.equal(result.text, 'Saved the process.');
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.body.model, 'gpt-6-luna');
  assert.equal(request.body.store, false);
  assert.equal(request.body.reasoning.effort, 'medium');
  assert.equal(request.body.reasoning.summary, undefined);
  assert.equal(request.body.parallel_tool_calls, true);
  assert.equal(request.body.service_tier, 'default');
  assert.equal(request.body.max_output_tokens, 100);
  assert.deepEqual(request.body.prompt_cache_options, { mode: 'implicit', ttl: '30m' });
  assert.equal(result.totalUsage.outputTokens, 10, 'Reasoning is already included in total output usage');
});

test('a rejected reservation stops the real SDK before any HTTP request', async () => {
  let requests = 0;
  const denied = Object.assign(new Error('Reservation denied'), { code: 'LIMIT' });
  const model = budgetedModel(createAgentModel('fixture-key', { fetch: async () => { requests++; return response([message('Should not be sent')]); } }), {
    reserveCall: async () => { throw denied; },
    settleCall: async () => assert.fail('No response exists to settle'), failCall: async () => assert.fail('No provider dispatch started'),
  });
  await assert.rejects(generateText({ model, prompt: 'Map the order.', maxOutputTokens: 100, maxRetries: 0 }), error => error === denied);
  assert.equal(requests, 0);
});

test('the real SDK tool round trip reserves and settles each request before continuing', async () => {
  const { db, budget, callbacks } = await budgetFixture();
  const requests = [], events = [];
  const accounting = callbacks('main');
  const model = budgetedModel(createAgentModel('fixture-key', { fetch: async (url, init) => {
    events.push('http'); requests.push(JSON.parse(init.body));
    return response(requests.length === 1 ? [{ type: 'function_call', id: 'fc_fixture', call_id: 'call_fixture',
      name: 'save_process', arguments: '{"summary":"Recorded order"}', status: 'completed' }] : [message('Saved the order.')]);
  } }), { ...accounting,
    reserveCall: async () => { events.push('reserve'); await accounting.reserveCall(); },
    settleCall: async usage => { await accounting.settleCall(usage); events.push('settle'); },
  });
  try {
    const result = await generateText({ model, prompt: 'Record the order.', maxOutputTokens: 100, maxRetries: 0,
      providerOptions: agentProviderOptions(true), stopWhen: stepCountIs(3),
      tools: { save_process: tool({ inputSchema: z.object({ summary: z.string() }), execute: async ({ summary }) => {
        assert.equal(summary, 'Recorded order'); return { saved: true };
      } }) },
    });
    assert.equal(result.text, 'Saved the order.');
    assert.deepEqual(events, ['reserve', 'http', 'settle', 'reserve', 'http', 'settle']);
    assert.equal(requests.length, 2);
    assert.ok(requests[1].input.some(e => e.type === 'function_call_output' && e.call_id === 'call_fixture'));
    assert.equal(result.totalUsage.inputTokens, 240);
    assert.equal(result.totalUsage.outputTokens, 20);
    assert.ok(Math.abs(budget.customerUsd - .00004) < 1e-12);
    assert.ok(Math.abs(db.prepare('SELECT reserved_usd FROM senda_agent_runs').first().reserved_usd - .00004) < 1e-12);
  } finally { db.close(); }
});

test('the real Responses adapter returns a structured semantic verdict and settles review usage', async () => {
  const { db, budget, callbacks } = await budgetFixture();
  let request, usage;
  const verdict = { audit: { boundaryBindings: [], triggerScope: 'No boundary events.', timerClock: 'No timers.', explanations: [] }, verdict: 'supported', issues: [] };
  const model = createAgentModel('fixture-key', { fetch: async (url, init) => { request = JSON.parse(init.body); return response([message(JSON.stringify(verdict))]); } });
  const xml = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs"><bpmn:process id="Process_Main" /></bpmn:definitions>';
  try {
    const checked = await reviewCandidate({ model, ...callbacks('review'),
      candidate: { xml, previousXml: xml, mode: 'current', discovery: { context: { purpose: 'Define scope' }, sources: [], questions: [], claims: [], abstractions: [], walkthrough: { steps: [] } } },
      userMessage: 'Check the scope.', maxBytes: 60000, maxOutputTokens: 16000, onUsage: value => { usage = value; },
    });
    assert.deepEqual(checked, verdict);
    assert.equal(request.text.format.type, 'json_schema');
    assert.equal(request.store, false);
    assert.equal(usage.inputTokens, 120);
    assert.equal(usage.outputTokens, 10);
    assert.ok(Math.abs(budget.customerUsd - .00002) < 1e-12);
    assert.equal(budget.active, 0);
  } finally { db.close(); }
});

test('real adapter authentication rejection releases its reserve and an uncertain abort retains it', async () => {
  for (const failure of ['unauthorized', 'abort']) {
    const { db, budget, callbacks } = await budgetFixture();
    let requests = 0;
    const model = budgetedModel(createAgentModel('fixture-key', { fetch: async () => {
      requests++;
      if (failure === 'abort') throw new DOMException('Fixture abort', 'AbortError');
      return Response.json({ error: { message: 'Fixture rejected', type: 'authentication_error', code: 'invalid_api_key', param: null } }, { status: 401 });
    } }), callbacks('main'));
    try {
      await assert.rejects(generateText({ model, prompt: 'Map the order.', maxOutputTokens: 100, maxRetries: 0 }));
      assert.equal(requests, 1);
      assert.equal(budget.active, 0);
      assert.equal(budget.customerUsd, 0);
      assert.equal(db.prepare('SELECT reserved_usd FROM senda_agent_runs').first().reserved_usd, failure === 'unauthorized' ? 0 : CALL_RESERVES.main);
    } finally { db.close(); }
  }
});

test('a settlement failure propagates after HTTP rather than returning a successful reply', async () => {
  let requests = 0, failures = 0, mutations = 0;
  const error = new Error('Ledger unavailable');
  const model = budgetedModel(createAgentModel('fixture-key', { fetch: async () => { requests++; return response([{ type: 'function_call', id: 'fc_fixture', call_id: 'call_fixture', name: 'save_process', arguments: '{}', status: 'completed' }]); } }), {
    reserveCall: async () => {}, settleCall: async () => { throw error; }, failCall: async value => { assert.equal(value, error); failures++; },
  });
  await assert.rejects(generateText({ model, prompt: 'Map the order.', maxOutputTokens: 100, maxRetries: 0, tools: { save_process: tool({ inputSchema: z.object({}), execute: async () => { mutations++; return { saved: true }; } }) } }), value => value === error);
  assert.equal(requests, 1);
  assert.equal(failures, 1);
  assert.equal(mutations, 0, 'An unaccounted response must not run a mutation tool');
});
