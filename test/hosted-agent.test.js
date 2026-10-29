import test from "node:test";
import assert from "node:assert/strict";
import { assertLiteralTimers, reviewCandidate } from '../src/server/agent/semantic-review.js';
import {
  runDeepSeek,
  agentAllowed,
  AGENT_LIMITS,
  usageCost,
  agentReply,
} from "../src/server/agent/deepseek.js";

test("hosted agent is off without a key and explicit account access", () => {
  assert.equal(
    agentAllowed({ DEEPSEEK_API_KEY: "test" }, "owner@example.test"),
    false,
  );
  assert.equal(
    agentAllowed(
      { AGENT_ALLOWED_EMAILS: "owner@example.test" },
      "owner@example.test",
    ),
    false,
  );
  assert.equal(
    agentAllowed(
      {
        DEEPSEEK_API_KEY: "test",
        AGENT_ALLOWED_EMAILS: " OWNER@example.test ",
      },
      "owner@example.test",
    ),
    true,
  );
  assert.equal(
    agentAllowed(
      { DEEPSEEK_API_KEY: "test", AGENT_ALLOWED_EMAILS: "owner@example.test" },
      "other@example.test",
    ),
    false,
  );
  assert.equal(AGENT_LIMITS.reservationUsd, 1);
  assert.ok(CALL_RESERVES.main >= usageCost({ inputTokens: AGENT_LIMITS.requestBytes, outputTokens: AGENT_LIMITS.outputTokens }));
  assert.ok(CALL_RESERVES.review >= usageCost({ inputTokens: AGENT_LIMITS.reviewBytes, outputTokens: AGENT_LIMITS.reviewOutputTokens }));
  assert.equal(usageCost({ inputTokens: 1000000, outputTokens: 1000000 }), 1.5);
});

test('literal timer units are checked mechanically before a provider review', () => {
  const graph = duration => [{ id: 'Reminder', definitions: [{ duration }] }];
  for (const value of ['P7D', 'P2W', 'PT7H', 'P1DT2H', 'PT0S']) assert.doesNotThrow(() => assertLiteralTimers(graph(value)));
  for (const value of ['PT7D', 'P', 'PT', 'P7H']) assert.throws(() => assertLiteralTimers(graph(value)), { code: 'INVALID_TIMER' });
});

test('an independent review that skips or contradicts an explanation cannot authorize a save', async () => {
  const xml = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs"><bpmn:process id="Process_Main" /></bpmn:definitions>';
  const candidate = { xml, previousXml: xml, mode: 'current', discovery: {
    context: { purpose: 'Document intake' }, sources: [], questions: [], claims: [], abstractions: [],
    walkthrough: { steps: [{ id: 'w1', text: 'The intake starts.', elementIds: ['Process_Main'] }] },
  } };
  const check = explanations => reviewCandidate({ candidate, model: {}, userMessage: 'Check the explanation.',
    maxBytes: 60000, maxOutputTokens: 16000,
    generate: async () => ({ output: { audit: { triggerScope: '', timerClock: '', explanations }, verdict: 'supported', issues: [] } }),
  });
  await assert.rejects(check([]), { code: 'SEMANTIC_REVIEW' });
  await assert.rejects(check([{ kind: 'walkthrough', id: 'w1', matches: false, finding: 'Contradiction.' }]), { code: 'SEMANTIC_REVIEW' });
  const item = { kind: 'walkthrough', id: 'w1', matches: true, finding: 'The process scope matches.' };
  await assert.rejects(check([item, item]), { code: 'SEMANTIC_REVIEW' });
  assert.equal((await check([item])).verdict, 'supported');
});

test('a semantic rejection cannot save a diagram; corrected candidates are checked and review usage is counted', async () => {
  const id = '5a1ce263-893b-41d9-9d42-9c8171471085';
  let applies = 0, reviews = 0, checkpoints = 0;
  const projects = {
    preview: async (actor, projectId, proposal) => {
      assert.equal(projectId, id);
      return { candidate: { xml: '<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" id=\"Defs\"><bpmn:process id=\"Process_Main\"><bpmn:task id=\"Task\" name=\"' + proposal.summary + '\" /></bpmn:process></bpmn:definitions>', discovery: {}, mode: 'current' }, previous: { xml: '' } };
    },
    applyPreview: async () => { applies++; return { revision: 2, quality: {} }; },
  };
  const result = await runDeepSeek({
    apiKey: 'fixture', projects, actor: { userId: 'owner' }, projectId: id,
    origin: 'https://senda.example', messages: [{ role: 'user', content: 'The order is unknown.' }],
    emit: () => {}, saveStep: async step => { checkpoints++; assert.equal(step.response.messages.length, 0); },
    review: async ({ candidate, onUsage }) => {
      reviews++;
      await onUsage({ inputTokens: 100, outputTokens: 20 });
      return candidate.xml.includes('name=\"Speculative\"') ? { verdict: 'needs_revision', issues: [{ elementIds: ['Flow'], reason: 'Unknown order', correction: 'Leave the stage unspecified' }] }
        : { verdict: 'supported', issues: [] };
    },
    generate: async ({ tools }) => {
      const input = summary => ({ projectId: id, model: 'as-is', proposal: { expectedRevision: 1, summary, operations: [{ op: 'add', kind: 'task', id: 'Task', name: 'Known work' }] } });
      assert.equal((await tools.apply_revision.execute(input('Speculative'))).error, 'SEMANTIC_REVIEW');
      assert.equal(applies, 0);
      assert.equal((await tools.apply_revision.execute(input('Speculative'))).error, 'SEMANTIC_REVIEW');
      assert.equal(reviews, 1, 'An identical rejected candidate does not spend another review');
      assert.equal((await tools.apply_revision.execute(input('Supported'))).revision, 2);
      for (let i = 2; i < AGENT_LIMITS.reviewCalls; i++)
        assert.equal((await tools.apply_revision.execute(input('Supported ' + i))).revision, 2);
      assert.equal((await tools.apply_revision.execute(input('Third candidate'))).error, 'LIMIT');
      assert.equal(applies, AGENT_LIMITS.reviewCalls - 1);
      return { text: 'Saved the supported part.', responseMessages: [], totalUsage: { inputTokens: 1000, outputTokens: 100 } };
    },
  });
  assert.equal(reviews, AGENT_LIMITS.reviewCalls);
  assert.equal(checkpoints, AGENT_LIMITS.reviewCalls);
  assert.deepEqual(result.usage, { inputTokens: 1000 + AGENT_LIMITS.reviewCalls * 100, outputTokens: 100 + AGENT_LIMITS.reviewCalls * 20 });
});

test('a failed semantic provider call cannot save and retains unknown usage', async () => {
  const validId = '5a1ce263-893b-41d9-9d42-9c8171471085';
  let applied = false, checkpoint;
  const result = await runDeepSeek({ apiKey: 'fixture', projectId: validId,
    actor: { userId: 'owner' }, origin: 'https://senda.example', messages: [{ role: 'user', content: 'Draw the known work.' }],
    projects: { preview: async () => ({ candidate: { xml: '<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" id=\"Defs\"><bpmn:process id=\"Process_Main\" /></bpmn:definitions>', discovery: {}, mode: 'current' }, previous: { xml: '' } }), applyPreview: async () => { applied = true; } },
    emit: () => {}, saveStep: async step => { checkpoint = step; },
    review: async () => { throw new Error('uncertain provider transport'); },
    generate: async ({ tools }) => {
      const result = await tools.apply_revision.execute({ projectId: validId, model: 'as-is', proposal: { expectedRevision: 1, summary: 'Known work', operations: [{ op: 'add', kind: 'task', id: 'Task' }] } });
      assert.equal(result.error, 'FAILED');
      return { text: 'The change remains unfinished.', responseMessages: [], totalUsage: { inputTokens: 100, outputTokens: 20 } };
    },
  });
  assert.equal(applied, false);
  assert.deepEqual(checkpoint.usage, {});
  assert.deepEqual(result.usage, {});
});

test('a walkthrough-only revision cannot bypass the consistency review and must report a rejected explanation as incomplete', async () => {
  const id = '5a1ce263-893b-41d9-9d42-9c8171471085';
  const xml = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs"><bpmn:process id="Process_Main" /></bpmn:definitions>';
  let saved = false, reviewed = false;
  const result = await runDeepSeek({ apiKey: 'fixture', projectId: id, actor: { userId: 'owner' },
    origin: 'https://senda.example', messages: [{ role: 'user', content: 'Keep cancellation limited to the deposit wait.' }],
    emit: () => {}, saveStep: async () => {},
    projects: { preview: async () => ({ previous: { xml }, candidate: { xml, mode: 'current', discovery: {} } }), applyPreview: async () => { saved = true; } },
    review: async () => { reviewed = true; return { verdict: 'needs_revision', issues: [{ elementIds: ['Withdrawal'], reason: 'The later setup cannot be active while the deposit wait remains active.', correction: 'Keep the explanation limited to the deposit wait.' }] }; },
    generate: async ({ tools }) => {
      const value = await tools.apply_revision.execute({ projectId: id, model: 'as-is', proposal: { expectedRevision: 2, summary: 'Explain cancellation', walkthrough: { steps: [{ id: 'Cancellation', text: 'A later withdrawal stops workspace setup already underway.', elementIds: ['Process_Main'] }] } } });
      assert.equal(value.error, 'SEMANTIC_REVIEW');
      return { text: 'The explanation is unfinished.', responseMessages: [], totalUsage: { inputTokens: 100, outputTokens: 20 } };
    },
  });
  assert.equal(reviewed, true);
  assert.equal(saved, false);
  assert.equal(result.incomplete, true);
});

test('future revisions use their fixed baseline evidence and comparison reads cannot switch the edited model', async () => {
  const id = '5a1ce263-893b-41d9-9d42-9c8171471085', actor = { userId: 'owner' };
  const xml = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs"><bpmn:process id="Process_Main"><bpmn:task id="Task" name="Check pack" /></bpmn:process></bpmn:definitions>';
  const discovery = { sources: [{ id: 'Interview', text: 'Ask the client to correct the pack, then check again.' }], claims: [{ id: 'Correction', status: 'supported', statement: 'Corrected packs are checked again.' }], abstractions: [] };
  let baselineReads = 0;
  const result = await runDeepSeek({
    apiKey: 'fixture', projects: {
      models: async (a, p) => { assert.equal(a, actor); assert.equal(p, id); return { asIs: { revision: 9 }, toBe: { baseline: { revision: 3 } } }; },
      read: async (a, p, revision, model) => {
        assert.equal(a, actor); assert.equal(p, id);
        if (model === 'as-is' && revision === 3) baselineReads++;
        else assert.ok(model === 'to-be' || (model === 'as-is' && revision === 9));
        return { revision: revision || 1, modelKind: model, model: [], discovery };
      },
      preview: async () => ({ candidate: { xml, discovery: {}, mode: 'proposed' }, previous: { xml } }),
      applyPreview: async () => ({ revision: 2, quality: {} }),
    }, actor, projectId: id, initialModel: 'to-be', origin: 'https://senda.example',
    messages: [{ role: 'user', content: 'Automate the check and keep the other rules.' }],
    emit: () => {}, saveStep: async () => {},
    review: async ({ candidate }) => {
      assert.equal(candidate.planningBaseline.revision, 3);
      assert.deepEqual(candidate.planningBaseline.confirmedClaims, discovery.claims);
      return { verdict: 'supported', issues: [] };
    },
    generate: async ({ tools }) => {
      const read = await tools.read_project.execute({ projectId: id, model: 'to-be' });
      assert.equal(read.planningBaseline.revision, 3);
      const saved = await tools.apply_revision.execute({ projectId: id, model: 'to-be', proposal: { expectedRevision: 1, summary: 'Automate check', operations: [{ op: 'retype', id: 'Task', kind: 'serviceTask' }] } });
      assert.equal(saved.model, 'to-be');
      assert.equal(saved.revision, 2);
      await tools.read_project.execute({ projectId: id, model: 'as-is', revision: 9 });
      return { text: 'The future check is automated. The current process is unchanged.', responseMessages: [], totalUsage: { inputTokens: 100, outputTokens: 20 } };
    },
  });
  assert.equal(baselineReads, 1, 'The fixed starting evidence is read once, never rebased onto revision 9');
  assert.equal(result.model, 'to-be');
});
test("agent tools cannot cross projects or create extra projects; operations use the authenticated actor", async () => {
  const owner = { userId: "owner" },
    id = "5a1ce263-893b-41d9-9d42-9c8171471085";
  let created = 0,
    read = 0,
    assigned;
  const projects = {
    create: async (a, input) => {
      assert.equal(a, owner);
      assert.equal(input.source.text, "Map the interview");
      assert.equal(input.source.kind, "transcript");
      created++;
      return { id };
    },
    preview: async () => ({ previous: { xml: '' }, candidate: { xml: '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs"><bpmn:process id="Process_Main"><bpmn:parallelGateway id="Gateway" /></bpmn:process></bpmn:definitions>' } }),
    read: async (a, p) => {
      assert.equal(a, owner);
      assert.equal(p, id);
      read++;
      return { revision: 1, schema: { internal: true }, elements: [] };
    },
  };
  const result = await runDeepSeek({
    apiKey: "not-a-real-key",
    projects,
    actor: owner,
    origin: "https://senda.example",
    messages: [{ role: "user", content: "Map the interview" }],
    emit: () => {},
    onProject: async (x) => {
      assigned = x;
    },
    saveStep: async () => {},
    generate: async (options) => {
      const bad = await options.tools.read_project.execute({
        projectId: "e7c0e8da-a7af-4a51-843c-113db426f62e",
        model: "as-is",
      });
      assert.equal(bad.error, "FORBIDDEN");
      assert.equal(read, 0);
      await options.tools.create_project.execute({
        name: "Test",
        purpose: "Discover",
        perspective: "Team",
      });
      assert.equal(assigned, id);
      const extra = await options.tools.create_project.execute({
        name: "Second",
        purpose: "Discover",
        perspective: "Team",
      });
      assert.equal(extra.error, "INVALID_REQUEST");
      assert.equal(created, 1);
      const forged = await options.tools.apply_revision.execute({ projectId: id, model: "as-is", proposal: { expectedRevision: 1, summary: "Invent evidence",
        sources: [{ id: "Forged", title: "Invented policy", kind: "answer", text: "The CEO approved every invoice." }],
      } });
      assert.equal(forged.error, "SOURCE_NOT_IN_MESSAGE");
      const current = await options.tools.read_project.execute({
        projectId: id,
        model: "as-is",
      });
      assert.equal(current.schema, undefined);
      assert.equal(read, 1);
      const tooDetailed = await options.tools.apply_revision.execute({ projectId: id, model: 'as-is', proposal: { expectedRevision: 1, summary: 'Detailed first draft', operations: [{ op: 'add', kind: 'parallelGateway', id: 'Gateway' }] } });
      assert.equal(tooDetailed.error, 'INITIAL_OVERVIEW', 'The initial overview scope is enforced before another model call or write');
      assert.throws(
        () =>
          options.prepareStep({
            messages: [
              { role: "user", content: "x".repeat(AGENT_LIMITS.requestBytes) },
            ],
          }),
        /context limit/,
      );
      const compacted = options.prepareStep({ stepNumber: 3, messages: [
        { role: 'user', content: 'Map the interview' },
        { role: 'assistant', content: [{ type: 'tool-call', toolName: 'apply_revision', toolCallId: 'large', input: { oversized: 'x'.repeat(AGENT_LIMITS.requestBytes) } }] },
        { role: 'tool', content: [{ type: 'tool-result', toolName: 'apply_revision', toolCallId: 'large', output: { type: 'json', value: { revision: 2 } } }] },
      ] });
      assert.equal(compacted.messages.length, 1, 'Even an oversized last group is removed as a whole, without a stranded call/result');
      assert.match(compacted.instructions, /operation receipts/);
      options.messages.push({ role: 'assistant', content: [{ type: 'tool-call', toolName: 'read_project', toolCallId: 'mutated', input: { oversized: 'x'.repeat(AGENT_LIMITS.requestBytes) } }] });
      options.messages.push({ role: 'tool', content: [{ type: 'tool-result', toolName: 'read_project', toolCallId: 'mutated', output: { type: 'json', value: {} } }] });
      assert.equal(options.prepareStep({ stepNumber: 4, messages: options.messages }).messages.length, 1, 'A consumer cannot mutate the protected original conversation prefix');
      const inferred = await options.tools.apply_revision.execute({
        projectId: id,
        model: "as-is",
        proposal: {
          expectedRevision: 1,
          summary: "Assume a sequence",
          claims: [
            {
              id: "C_Order",
              kind: "order",
              status: "inferred",
              statement: "Teams start together",
              rationale: "Guess",
              elementIds: ["Flow"],
              evidence: [
                { sourceId: "Interview", segmentId: "L1", quote: "unclear" },
              ],
            },
          ],
        },
      });
      assert.equal(inferred.error, "UNCONFIRMED_BEHAVIOR");
      assert.match(options.prepareStep({ messages: [{ role: "user", content: "Finish" }], stepNumber: AGENT_LIMITS.steps - 1 }).instructions, /State only what was actually saved/);
      assert.equal(options.prepareStep({ messages: [{ role: 'user', content: 'Finish' }], stepNumber: AGENT_LIMITS.steps - 1 }).toolChoice, 'none', 'The final step must produce a user-visible reply');
      assert.equal(options.tools.get_model_schema, undefined);
      for (const redundant of ["read_sources", "read_questions", "add_source"]) assert.equal(options.tools[redundant], undefined);
      const operationSchema = options.tools.apply_revision.inputSchema.jsonSchema;
      assert.equal(operationSchema.properties.proposal.properties.operations.items.$ref, "#/$defs/op");
      assert.ok(operationSchema.$defs.retype.properties.refAs);
      assert.equal(options.maxRetries, 0);
      assert.equal(options.toolCallConcurrency, 1);
      return {
        text: "Saved",
        responseMessages: [{ role: "assistant", content: "Saved" }],
        totalUsage: { inputTokens: 10, outputTokens: 2 },
      };
    },
  });
  assert.equal(result.projectId, id);
  assert.equal(result.messages.length, 1);
});

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { memoryD1 } from './fixtures/d1.js';
import { CALL_RESERVES } from '../src/cloudflare/agent-budget.js';
import { HostedAgent } from '../src/cloudflare/agent.js';
function fixtureAgent(env, projects, origin, options = {}) {
  let agent;
  agent = new HostedAgent(env, projects, origin, { ...options, pollMs: 1,
    dispatch: async params => { void agent.execute(params); },
  });
  return agent;
}


test('provider authentication failures survive reload and release unused budget; uncertain failures retain it', async () => {
  const db = memoryD1();
  for (const name of ['0004_hosted_agent.sql', '0006_agent_meter.sql', '0007_agent_workflow.sql', '0008_agent_billing_period.sql']) db.exec(readFileSync(new URL('../src/cloudflare/migrations/' + name, import.meta.url), 'utf8'));
  const actor = { userId: 'owner' }, email = 'owner@example.test';
  const origin = 'https://senda.example';
  const agent = fixtureAgent({ DB: db, DEEPSEEK_API_KEY: 'fixture', AGENT_ALLOWED_EMAILS: email }, {}, origin, {
    run: async () => { throw Object.assign(new Error('private provider diagnostics'), { statusCode: 401 }); },
  });
  const post = (path, body) => agent.handle(new Request(origin + path, { method: 'POST', body: JSON.stringify(body) }), actor, email);
  try {
    const chat = await (await post('/api/agent/chats', {})).json();
    const reply = await post(`/api/agent/chats/${chat.id}/turn`, { requestId: randomUUID(), text: 'Please map our process.' });
    const events = (await reply.text()).trim().split('\n').map(JSON.parse);
    assert.equal(events.at(-1).type, 'error');
    assert.doesNotMatch(events.at(-1).text, /private provider diagnostics/);
    const loaded = await (await agent.handle(new Request(origin + `/api/agent/chats/${chat.id}`), actor, email)).json();
    assert.equal(loaded.working, false);
    assert.equal(loaded.messages.length, 2);
    assert.match(loaded.messages[1].text, /operator needs to check/);
    assert.equal(db.prepare('SELECT cost_usd FROM senda_agent_runs').first().cost_usd, 0);
    agent.run = async () => { throw new Error('unknown transport outcome'); };
    const uncertain = await post(`/api/agent/chats/${chat.id}/turn`, { requestId: randomUUID(), text: 'Continue.' });
    await uncertain.text();
    assert.equal(db.prepare("SELECT cost_usd FROM senda_agent_runs WHERE cost_usd IS NULL").all().results.length, 1);
    await assert.rejects(agent.chat({ userId: 'another-owner' }, chat.id), { code: 'NOT_FOUND' });
  } finally { db.close(); }
});

test('paid turns reserve atomically within both monthly allowance and current entitlement, with no duplicate request execution', async () => {
  const db = memoryD1();
  for (const name of ['0004_hosted_agent.sql', '0005_billing.sql', '0006_agent_meter.sql', '0007_agent_workflow.sql', '0008_agent_billing_period.sql'])
    db.exec(readFileSync(new URL('../src/cloudflare/migrations/' + name, import.meta.url), 'utf8'));
  const actor = { userId: 'paid-owner' }, email = 'paid@example.test', origin = 'https://senda.example';
  const start = Math.floor(Date.now() / 1000) - 100, end = start + 10000;
  db.prepare('INSERT INTO senda_billing_subscriptions(context,id,owner,status,eligible,period_start,period_end,updated) VALUES(?,?,?,?,?,?,?,?)')
    .bind('sandbox', 'sub_fixture', actor.userId, 'active', 1, start, end, new Date().toISOString()).run();
  db.prepare('INSERT INTO senda_agent_runs(id,chat,owner,day,status,reserved_usd,cost_usd,created) VALUES(?,?,?,?,?,?,?,?)')
    .bind('prior', 'prior-chat', actor.userId, new Date().toISOString().slice(0,10), 'complete', 1, 1.46, new Date().toISOString()).run();
  const entitlement = { context: 'sandbox', subscriptionId: 'sub_fixture', periodStart: new Date(start * 1000).toISOString(), periodEnd: new Date(end * 1000).toISOString(), limitUsd: 1.5 };
  db.prepare('UPDATE senda_agent_runs SET billing_context=?,billing_subscription=?,billing_period_start=?,billing_period_end=?,meter_usd=cost_usd').bind(entitlement.context, entitlement.subscriptionId, entitlement.periodStart, entitlement.periodEnd).run();
  let called = 0;
  const agent = fixtureAgent({ DB: db, DEEPSEEK_API_KEY: 'fixture' }, {}, origin, {
    billing: { entitlement: async () => entitlement },
    run: async () => { called++; return { text: 'Saved reply', messages: [], usage: { inputTokens: 1000, outputTokens: 100 } }; },
  });
  const post = (path, data) => agent.handle(new Request(origin + path, { method: 'POST', body: JSON.stringify(data) }), actor, email);
  try {
    const chat = await (await post('/api/agent/chats', {})).json();
    await assert.rejects(post(`/api/agent/chats/${chat.id}/turn`, { requestId: randomUUID(), text: 'Continue.' }), { code: 'LIMIT' });
    assert.equal(called, 0, 'Monthly reservation rejects before provider contact even below the daily cap');
    assert.equal((await agent.chat(actor, chat.id)).lock_until, 0);
    entitlement.limitUsd = 3;
    db.prepare('UPDATE senda_billing_subscriptions SET eligible=0').run();
    await assert.rejects(post(`/api/agent/chats/${chat.id}/turn`, { requestId: randomUUID(), text: 'Continue.' }), { code: 'LIMIT' });
    assert.equal(called, 0, 'Atomic reservation rechecks entitlement after the earlier access read');
    db.prepare('UPDATE senda_billing_subscriptions SET eligible=1').run();
    const requestId = randomUUID();
    await (await post(`/api/agent/chats/${chat.id}/turn`, { requestId, text: 'Continue.' })).text();
    assert.equal(called, 1);
    await assert.rejects(post(`/api/agent/chats/${chat.id}/turn`, { requestId, text: 'Continue.' }), { code: 'CONFLICT' });
    assert.equal(called, 1, 'A repeated request never executes the provider again');
  } finally { db.close(); }
});

test('native provider tool notation cannot escape into the saved public reply', () => {
  const raw = '<｜｜DSML｜｜ invoke name="read_project"><｜｜DSML｜｜ parameter>private-internal-id</｜｜DSML｜｜ parameter>';
  const reply = agentReply(raw, 'project', 'to-be', 'https://senda.example');
  assert.doesNotMatch(reply, /DSML|private-internal-id|read_project/);
  assert.match(reply, /before I could finish/);
  assert.match(reply, /model=to-be/);
  assert.equal(agentReply('Saved your diagram.', 'project', 'as-is', 'https://senda.example'), 'Saved your diagram.');
});

test('a failed turn without saved progress records operational spend while using zero customer allowance', async () => {
  const db = memoryD1();
  for (const name of ['0004_hosted_agent.sql', '0006_agent_meter.sql', '0007_agent_workflow.sql', '0008_agent_billing_period.sql']) db.exec(readFileSync(new URL('../src/cloudflare/migrations/' + name, import.meta.url), 'utf8'));
  const actor = { userId: 'owner' }, email = 'owner@example.test', origin = 'https://senda.example';
  const agent = fixtureAgent({ DB: db, DEEPSEEK_API_KEY: 'fixture', AGENT_ALLOWED_EMAILS: email }, {}, origin, {
    run: async ({ reserveCall, settleCall }) => {
      await reserveCall('main');
      await settleCall({ inputTokens: 1000, outputTokens: 100 });
      await reserveCall('review');
      throw new Error('unknown review transport');
    },
  });
  const post = (path, body) => agent.handle(new Request(origin + path, { method: 'POST', body: JSON.stringify(body) }), actor, email);
  try {
    const chat = await (await post('/api/agent/chats', {})).json();
    const reply = await post(`/api/agent/chats/${chat.id}/turn`, { requestId: randomUUID(), text: 'Please map our process.' });
    assert.equal(JSON.parse((await reply.text()).trim()).type, 'error');
    const row = db.prepare('SELECT status,cost_usd,meter_usd FROM senda_agent_runs').first();
    assert.equal(row.status, 'failed');
    assert.equal(row.meter_usd, 0);
    assert.ok(Math.abs(row.cost_usd - (CALL_RESERVES.review + .00042)) < 1e-9);
  } finally { db.close(); }
});

test('successful replies without complete provider usage retain their conservative reservation', async () => {
  const db = memoryD1();
  for (const name of ['0004_hosted_agent.sql', '0006_agent_meter.sql', '0007_agent_workflow.sql', '0008_agent_billing_period.sql']) db.exec(readFileSync(new URL('../src/cloudflare/migrations/' + name, import.meta.url), 'utf8'));
  const actor = { userId: 'owner' }, email = 'owner@example.test', origin = 'https://senda.example';
  const agent = fixtureAgent({ DB: db, DEEPSEEK_API_KEY: 'fixture', AGENT_ALLOWED_EMAILS: email }, {}, origin, {
    run: async () => ({ text: 'Saved reply', messages: [], usage: { outputTokens: 20 } }),
  });
  const post = (path, body) => agent.handle(new Request(origin + path, { method: 'POST', body: JSON.stringify(body) }), actor, email);
  try {
    const chat = await (await post('/api/agent/chats', {})).json();
    const response = await post(`/api/agent/chats/${chat.id}/turn`, { requestId: randomUUID(), text: 'Map the process.' });
    assert.equal(JSON.parse((await response.text()).trim()).type, 'done');
    const run = db.prepare('SELECT status,cost_usd,reserved_usd,meter_usd FROM senda_agent_runs').first();
    assert.equal(run.status, 'complete');
    assert.equal(run.cost_usd, null);
    assert.equal(run.reserved_usd, CALL_RESERVES.main);
    assert.equal(run.meter_usd, 0, 'Unknown operational reservations are never charged to a customer allowance');
  } finally { db.close(); }
});

test('an incomplete turn keeps measured operational usage but consumes no customer allowance after reload', async () => {
  const db = memoryD1();
  for (const name of ['0004_hosted_agent.sql', '0006_agent_meter.sql', '0007_agent_workflow.sql', '0008_agent_billing_period.sql'])
    db.exec(readFileSync(new URL('../src/cloudflare/migrations/' + name, import.meta.url), 'utf8'));
  const actor = { userId: 'owner' }, email = 'owner@example.test', origin = 'https://senda.example';
  const agent = fixtureAgent({ DB: db, DEEPSEEK_API_KEY: 'fixture', AGENT_ALLOWED_EMAILS: email }, {}, origin, {
    run: async () => ({ text: 'The first change is saved; the second is unfinished.', model: 'to-be', incomplete: true, messages: [], usage: { inputTokens: 1000, outputTokens: 100 } }),
  });
  const post = (path, body) => agent.handle(new Request(origin + path, { method: 'POST', body: JSON.stringify(body) }), actor, email);
  try {
    const chat = await (await post('/api/agent/chats', {})).json();
    const response = await post(`/api/agent/chats/${chat.id}/turn`, { requestId: randomUUID(), text: 'Please revise the future process.' });
    assert.equal(JSON.parse((await response.text()).trim()).incomplete, true);
    const ledger = db.prepare('SELECT cost_usd,meter_usd FROM senda_agent_runs').first();
    assert.equal(ledger.cost_usd, .00042);
    assert.equal(ledger.meter_usd, 0);
    const saved = await (await agent.handle(new Request(origin + `/api/agent/chats/${chat.id}`), actor, email)).json();
    assert.equal(saved.messages[1].incomplete, true);
    assert.equal(saved.model, 'to-be');
  } finally { db.close(); }
});

test('a saved future-model conversation keeps its active model through prose-only turns and reloads', async () => {
  const db = memoryD1();
  for (const name of ['0004_hosted_agent.sql', '0006_agent_meter.sql', '0007_agent_workflow.sql', '0008_agent_billing_period.sql']) db.exec(readFileSync(new URL('../src/cloudflare/migrations/' + name, import.meta.url), 'utf8'));
  const actor = { userId: 'owner' }, email = 'owner@example.test', origin = 'https://senda.example', seen = [];
  const agent = fixtureAgent({ DB: db, DEEPSEEK_API_KEY: 'fixture', AGENT_ALLOWED_EMAILS: email }, {}, origin, {
    run: async options => {
      seen.push(options.initialModel);
      return { text: 'Here is the future process.', model: 'to-be', messages: [], usage: { inputTokens: 0, outputTokens: 0 } };
    },
  });
  const post = (path, body) => agent.handle(new Request(origin + path, { method: 'POST', body: JSON.stringify(body) }), actor, email);
  try {
    const chat = await (await post('/api/agent/chats', {})).json();
    for (const text of ['Plan the future process.', 'Explain who handles failures.'])
      await (await post(`/api/agent/chats/${chat.id}/turn`, { requestId: randomUUID(), text })).text();
    assert.deepEqual(seen, ['as-is', 'to-be']);
    const loaded = await (await agent.handle(new Request(origin + `/api/agent/chats/${chat.id}`), actor, email)).json();
    assert.equal(loaded.model, 'to-be');
  } finally { db.close(); }
});

test('disconnecting the response cannot cancel a queued job; duplicate delivery cannot execute it twice', async () => {
  const db = memoryD1();
  for (const name of ['0004_hosted_agent.sql', '0006_agent_meter.sql', '0007_agent_workflow.sql', '0008_agent_billing_period.sql'])
    db.exec(readFileSync(new URL('../src/cloudflare/migrations/' + name, import.meta.url), 'utf8'));
  const actor = { userId: 'owner' }, email = 'owner@example.test', origin = 'https://senda.example';
  let queued, calls = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const agent = new HostedAgent({ DB: db, DEEPSEEK_API_KEY: 'fixture', AGENT_ALLOWED_EMAILS: email }, {}, origin, {
    pollMs: 1, dispatch: async params => { queued = params; },
    run: async () => { calls++; await gate; return { text: 'Saved your process.', model: 'to-be', messages: [], usage: { inputTokens: 1000, outputTokens: 100 } }; },
  });
  const post = (path, body) => agent.handle(new Request(origin + path, { method: 'POST', body: JSON.stringify(body) }), actor, email);
  try {
    const chat = await (await post('/api/agent/chats', {})).json(), requestId = randomUUID();
    const response = await post(`/api/agent/chats/${chat.id}/turn`, { requestId, text: 'Map the interview.' });
    await response.body.cancel();
    const work = agent.execute(queued);
    while (!calls) await new Promise(resolve => setTimeout(resolve, 1));
    assert.deepEqual(await agent.execute(queued), { executed: false });
    await assert.rejects(post(`/api/agent/chats/${chat.id}/turn`, { requestId, text: 'Map the interview.' }), { code: 'CONFLICT' });
    release(); await work;
    const saved = await (await agent.handle(new Request(origin + `/api/agent/chats/${chat.id}`), actor, email)).json();
    assert.equal(calls, 1);
    assert.equal(saved.working, false);
    assert.equal(saved.messages[1].text, 'Saved your process.');
    assert.equal(saved.model, 'to-be');
    assert.equal(db.prepare('SELECT status FROM senda_agent_runs').first().status, 'complete');
  } finally { release(); db.close(); }
});

test('an expired job reports an interruption after reload and cannot later contact the provider', async () => {
  const db = memoryD1();
  for (const name of ['0004_hosted_agent.sql', '0006_agent_meter.sql', '0007_agent_workflow.sql', '0008_agent_billing_period.sql'])
    db.exec(readFileSync(new URL('../src/cloudflare/migrations/' + name, import.meta.url), 'utf8'));
  const actor = { userId: 'owner' }, email = 'owner@example.test', origin = 'https://senda.example';
  let queued, calls = 0;
  const agent = new HostedAgent({ DB: db, DEEPSEEK_API_KEY: 'fixture', AGENT_ALLOWED_EMAILS: email }, {}, origin, {
    pollMs: 1, dispatch: async params => { queued = params; }, run: async () => { calls++; },
  });
  const post = (path, body) => agent.handle(new Request(origin + path, { method: 'POST', body: JSON.stringify(body) }), actor, email);
  try {
    const chat = await (await post('/api/agent/chats', {})).json();
    const response = await post(`/api/agent/chats/${chat.id}/turn`, { requestId: randomUUID(), text: 'Map the interview.' });
    await response.body.cancel();
    db.prepare('UPDATE senda_agent_chats SET lock_until=?').bind(Date.now() - 1).run();
    const saved = await (await agent.handle(new Request(origin + `/api/agent/chats/${chat.id}`), actor, email)).json();
    assert.equal(saved.working, false);
    assert.equal(saved.messages[1].incomplete, true);
    assert.match(saved.messages[1].text, /interrupted/);
    assert.deepEqual(await agent.execute(queued), { executed: false });
    assert.equal(calls, 0);
    const ledger = db.prepare('SELECT status,cost_usd,meter_usd FROM senda_agent_runs').first();
    assert.deepEqual({ ...ledger }, { status: 'failed', cost_usd: 0, meter_usd: 0 });
  } finally { db.close(); }
});

test('removing hosted-agent access blocks new provider work while keeping the owner’s saved conversation readable', async () => {
  const db = memoryD1();
  for (const name of ['0004_hosted_agent.sql', '0006_agent_meter.sql', '0007_agent_workflow.sql', '0008_agent_billing_period.sql'])
    db.exec(readFileSync(new URL('../src/cloudflare/migrations/' + name, import.meta.url), 'utf8'));
  const actor = { userId: 'owner' }, email = 'owner@example.test', origin = 'https://senda.example';
  const env = { DB: db, DEEPSEEK_API_KEY: 'fixture', AGENT_ALLOWED_EMAILS: email };
  const agent = fixtureAgent(env, {}, origin, { run: async () => ({ text: 'Saved explanation.', messages: [], usage: { inputTokens: 0, outputTokens: 0 } }) });
  const post = (path, body) => agent.handle(new Request(origin + path, { method: 'POST', body: JSON.stringify(body) }), actor, email);
  try {
    const chat = await (await post('/api/agent/chats', {})).json();
    await (await post(`/api/agent/chats/${chat.id}/turn`, { requestId: randomUUID(), text: 'Explain this process.' })).text();
    env.AGENT_ALLOWED_EMAILS = '';
    const saved = await (await agent.handle(new Request(origin + `/api/agent/chats/${chat.id}`), actor, email)).json();
    assert.equal(saved.messages[1].text, 'Saved explanation.');
    await assert.rejects(post(`/api/agent/chats/${chat.id}/turn`, { requestId: randomUUID(), text: 'Another change.' }), { code: 'FORBIDDEN' });
    await assert.rejects(agent.handle(new Request(origin + `/api/agent/chats/${chat.id}`), { userId: 'other-owner' }, email), { code: 'NOT_FOUND' });
  } finally { db.close(); }
});
