import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  AGENT_LIMITS,
  agentAllowed,
  runDeepSeek,
  usageCost,
} from "../server/agent/deepseek.js";
import { requireThat } from "../core/errors.js";
import { CallBudget, measuredUsage, reserveTurn, serviceLimits } from './agent-budget.js';
import { billingNow, emailListed } from '../server/billing/plan.js';
import { OperationalAlerts } from './operations.js';
export { measuredUsage } from './agent-budget.js';

const Turn = z.strictObject({
  requestId: z.uuid(),
  text: z.string().trim().min(1).max(60000),
});
export class HostedAgent {
  constructor(env, projects, origin, { run = runDeepSeek, billing, dispatch, pollMs = 1000 } = {}) {
    Object.assign(this, { env, projects, origin, run, billing, dispatch, pollMs });
    this.db = env.DB;
    this.operations = new OperationalAlerts(env);
  }
  async chat(actor, id) {
    const row = await this.db
      .prepare("SELECT * FROM senda_agent_chats WHERE id=? AND owner=?")
      .bind(z.uuid().parse(id), actor.userId)
      .first();
    requireThat(row, "NOT_FOUND", "This conversation is not available.");
    if (row.project) await this.projects.authorize(actor, row.project);
    return row;
  }
  async handle(request, actor, email) {
    const path = new URL(request.url).pathname;
    const operator = agentAllowed(this.env, email);
    const paidEmailAllowed = this.env.PAID_AGENT_ALLOWED_EMAILS === undefined || emailListed(this.env.PAID_AGENT_ALLOWED_EMAILS, email);
    const entitlement = !operator && paidEmailAllowed && this.env.DEEPSEEK_API_KEY
      ? await this.billing?.entitlement(actor) : null;
    const available = (operator || !!entitlement) && !!(this.env.AGENT_WORKFLOW || this.dispatch);
    const accessMessage = !available && !operator ? await this.billing?.unavailableMessage?.(actor) : null;
    if (path === "/api/agent/config")
      return Response.json({
        available,
        message: accessMessage || undefined,
        model: "DeepSeek Flash",
      });
    const read = /^\/api\/agent\/chats\/([^/]+)$/.exec(path);
    if (request.method === 'GET' && read) {
      const row = await this.recover(await this.chat(actor, read[1]));
      return Response.json({ id: row.id, projectId: row.project,
        messages: JSON.parse(row.display),
        model: displayModel(JSON.parse(row.display)) || lastModel(JSON.parse(row.messages)),
        working: row.lock_until > Date.now(),
      });
    }
    requireThat(
      available,
      "FORBIDDEN",
      accessMessage || "The Senda agent is not enabled for this account yet.",
    );
    if (path === "/api/agent/chats" && request.method === "POST") {
      const input = z
        .strictObject({
          projectId: z.uuid().optional(),
          newConversation: z.boolean().default(false),
        })
        .parse(await request.json());
      if (input.projectId)
        await this.projects.authorize(actor, input.projectId);
      if (input.projectId && !input.newConversation) {
        const prior = await this.db
          .prepare(
            "SELECT id FROM senda_agent_chats WHERE owner=? AND project=? ORDER BY updated DESC LIMIT 1",
          )
          .bind(actor.userId, input.projectId)
          .first();
        if (prior) return Response.json(prior);
      }
      const id = randomUUID(),
        now = new Date().toISOString();
      await this.db
        .prepare(
          "INSERT INTO senda_agent_chats(id,owner,project,created,updated) VALUES(?,?,?,?,?)",
        )
        .bind(id, actor.userId, input.projectId || null, now, now)
        .run();
      return Response.json({ id }, { status: 201 });
    }
    const match = /^\/api\/agent\/chats\/([^/]+)(\/turn)?$/.exec(path);
    requireThat(match, "NOT_FOUND", "This conversation is not available.");
    let row = await this.recover(await this.chat(actor, match[1]));
    requireThat(
      request.method === "POST" && match[2],
      "INVALID_REQUEST",
      "Choose a conversation and send a message.",
    );
    const input = Turn.parse(await request.json()),
      runId = input.requestId,
      now = Date.now(),
      day = new Date().toISOString().slice(0, 10);
    requireThat(!(await this.db.prepare("SELECT 1 FROM senda_agent_runs WHERE id=? AND owner=? AND chat=?")
      .bind(runId, actor.userId, row.id).first()), "CONFLICT", "This message was already received. Reload the conversation to check its saved reply.");
    const locked = await this.db
      .prepare(
        "UPDATE senda_agent_chats SET lock_id=?,lock_until=? WHERE id=? AND owner=? AND lock_until<? RETURNING *",
      )
      .bind(runId, now + 600000, row.id, actor.userId, now)
      .first();
    requireThat(
      locked,
      "CONFLICT",
      "A reply is already being prepared. Wait for it to finish.",
    );
    row = locked;
    try {
      await reserveTurn(this.db, { runId, chatId: row.id, owner: actor.userId, day, entitlement,
        nowMs: billingNow(this.env), limits: serviceLimits(this.env) });
    } catch (error) {
      await this.operations.observe();
      await this.unlock(row.id, runId);
      throw error;
    }
    const display = [...JSON.parse(row.display), { role: "user", text: input.text }];
    await this.db.prepare("UPDATE senda_agent_chats SET display=?,updated=? WHERE id=? AND lock_id=?")
      .bind(JSON.stringify(display), new Date().toISOString(), row.id, runId).run();
    const params = { runId, chatId: row.id, entitlement: entitlement || null, origin: this.origin };
    try {
      if (this.dispatch) await this.dispatch(params);
      else await this.env.AGENT_WORKFLOW.create({ id: runId, params });
    } catch {
      // A lost create response may still have queued the job. Never dispatch it
      // again or release its reservation while the outcome is unknown.
      let known = false;
      if (this.env.AGENT_WORKFLOW) try {
        const instance = await this.env.AGENT_WORKFLOW.get(runId);
        known = !!(await instance.status());
      } catch {}
      if (!known) await this.interrupt(row.id, runId,
        'Senda could not confirm that this reply started. Your saved work is safe. Please try again.', { unstartedOnly: true });
    }
    await this.operations.observe();
    return this.observe(request, row.id, runId);
  }
  async observe(request, chatId, runId) {
    const encoder = new TextEncoder(), db = this.db, delay = this.pollMs;
    let stopped = false;
    const stream = new ReadableStream({
      start: controller => {
        const send = event => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        void (async () => {
          let previousStatus, previousProject;
          try {
            while (!stopped && !request.signal.aborted) {
              const run = await db.prepare('SELECT status,response,progress FROM senda_agent_runs WHERE id=? AND chat=?')
                .bind(runId, chatId).first();
              const chat = await db.prepare('SELECT project FROM senda_agent_chats WHERE id=?').bind(chatId).first();
              if (chat?.project && chat.project !== previousProject) {
                send({ type: 'project', projectId: chat.project }); previousProject = chat.project;
              }
              if (run?.response) { send(JSON.parse(run.response)); break; }
              if (!run || run.status !== 'running') { send({ type: 'error', text: 'This reply was interrupted. Reload to see the saved progress.' }); break; }
              if (run.progress && run.progress !== previousStatus) {
                send({ type: 'status', text: run.progress }); previousStatus = run.progress;
              }
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          } catch {
            if (!stopped && !request.signal.aborted) try { send({ type: 'error', text: 'The connection paused. Reload the conversation to see the saved reply.' }); } catch {}
          } finally {
            if (!stopped) try { controller.close(); } catch {}
          }
        })();
      },
      cancel() { stopped = true; },
    });
    return new Response(stream, { headers: {
      'content-type': 'application/x-ndjson', 'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    } });
  }
  async execute({ runId, chatId, entitlement = null }) {
    const run = await this.db.prepare("SELECT * FROM senda_agent_runs WHERE id=? AND chat=? AND status='running'")
      .bind(z.uuid().parse(runId), z.uuid().parse(chatId)).first();
    if (!run) return { executed: false };
    // Workflow replays and duplicate deliveries cannot contact the provider twice.
    const claimed = await this.db.prepare(`UPDATE senda_agent_runs SET started=1 WHERE id=? AND status='running' AND started=0 AND
      EXISTS(SELECT 1 FROM senda_agent_chats WHERE id=? AND owner=? AND lock_id=? AND lock_until>?) RETURNING id`)
      .bind(runId, chatId, run.owner, runId, Date.now()).first();
    if (!claimed) return { executed: false };
    const actor = { userId: run.owner }, controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 540000);
    let statusWrites = Promise.resolve();
    const emit = event => {
      if (event.type === 'status') statusWrites = statusWrites.then(() =>
        this.db.prepare("UPDATE senda_agent_runs SET progress=? WHERE id=? AND status='running'")
          .bind(event.text, runId).run());
    };
    const budget = new CallBudget(this.db, { runId, owner: run.owner, day: run.day, entitlement,
      now: () => billingNow(this.env), limits: serviceLimits(this.env),
      onExceeded: () => this.operations.notify(`reservation-${runId}`, 'reservation review', 'A measured model call exceeded its conservative reservation. The customer charge was capped; review the operational rate card before continuing.'),
    });
    const pending = [], used = { inputTokens: 0, outputTokens: 0 };
    let usageKnown = true, row, display, base;
    try {
      row = await this.chat(actor, chatId);
      display = JSON.parse(row.display);
      base = display.map(message => ({ role: message.role, content: message.text }));
      const result = await this.run({
        apiKey: this.env.DEEPSEEK_API_KEY, projects: this.projects, actor,
        origin: this.origin, messages: base, projectId: row.project,
        initialModel: displayModel(display) || lastModel(JSON.parse(row.messages)),
        signal: controller.signal, emit,
        reserveCall: kind => budget.reserve(kind), settleCall: usage => budget.settle(usage),
        failCall: error => budget.failure(error),
        onProject: id => this.db.prepare("UPDATE senda_agent_chats SET project=? WHERE id=? AND lock_id=?")
          .bind(id, row.id, runId).run(),
        saveStep: async step => {
          console.info('Senda model step', { finishReason: step.finishReason,
            inputTokens: step.usage?.inputTokens, outputTokens: step.usage?.outputTokens,
            reasoningTokens: step.usage?.outputTokenDetails?.reasoningTokens });
          usageKnown = usageKnown && measuredUsage(step.usage);
          used.inputTokens += step.usage?.inputTokens || 0;
          used.outputTokens += step.usage?.outputTokens || 0;
          pending.push(...step.response.messages);
          await this.db.prepare("UPDATE senda_agent_chats SET messages=? WHERE id=? AND lock_id=?")
            .bind(JSON.stringify([...base, ...pending]), row.id, runId).run();
        },
      });
      await statusWrites;
      display.push({ role: 'assistant', text: result.text, model: result.model, incomplete: !!result.incomplete });
      const response = { type: 'done', text: result.text, projectId: result.projectId,
        model: result.model, incomplete: !!result.incomplete,
        usage: { inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens } };
      await this.db.batch([
        this.db.prepare("UPDATE senda_agent_chats SET messages=?,display=?,updated=? WHERE id=? AND lock_id=?")
          .bind(JSON.stringify([...base, ...result.messages]), JSON.stringify(display), new Date().toISOString(), chatId, runId),
        this.db.prepare("UPDATE senda_agent_runs SET status='complete',cost_usd=CASE WHEN ? THEN reserved_usd ELSE ? END,meter_usd=?,input_tokens=?,output_tokens=?,response=? WHERE id=?")
          .bind(Number(!budget.first), measuredUsage(result.usage) ? usageCost(result.usage) : null,
            !result.incomplete ? (!budget.first ? budget.customerUsd : measuredUsage(result.usage) ? usageCost(result.usage) : 0) : 0,
            result.usage?.inputTokens ?? null, result.usage?.outputTokens ?? null, JSON.stringify(response), runId),
      ]);
    } catch (error) {
      await statusWrites.catch(() => {});
      await budget.failure(error);
      console.error('Senda agent stopped', { name: error.name, code: error.code, status: error.statusCode });
      const failure = agentFailure(error);
      const cost = !budget.first ? null : failure.knownUsage && usageKnown ? usageCost(used) : null;
      const response = { type: 'error', text: failure.text };
      if (!display) display = JSON.parse((await this.db.prepare('SELECT display FROM senda_agent_chats WHERE id=?').bind(chatId).first())?.display || '[]');
      display.push({ role: 'assistant', text: failure.text, model: lastModel([...(base || []), ...pending], displayModel(display)), incomplete: true });
      await this.db.batch([
        this.db.prepare("UPDATE senda_agent_runs SET status='failed',cost_usd=CASE WHEN ? THEN reserved_usd ELSE ? END,meter_usd=0,input_tokens=?,output_tokens=?,response=? WHERE id=?")
          .bind(Number(!budget.first), cost, used.inputTokens, used.outputTokens, JSON.stringify(response), runId),
        this.db.prepare('UPDATE senda_agent_chats SET display=?,updated=? WHERE id=? AND lock_id=?')
          .bind(JSON.stringify(display), new Date().toISOString(), chatId, runId),
      ]);
    } finally {
      clearTimeout(timeout);
      await this.unlock(chatId, runId);
      await this.operations.observe();
    }
    return { executed: true };
  }
  async interrupt(chatId, runId, text, { unstartedOnly = false } = {}) {
    const run = await this.db.prepare("SELECT * FROM senda_agent_runs WHERE id=? AND chat=? AND status='running'")
      .bind(runId, chatId).first();
    if (!run || (unstartedOnly && run.started)) return;
    const row = await this.db.prepare('SELECT * FROM senda_agent_chats WHERE id=? AND lock_id=?').bind(chatId, runId).first();
    if (!row) return;
    const display = JSON.parse(row.display);
    display.push({ role: 'assistant', text, model: displayModel(display) || lastModel(JSON.parse(row.messages)), incomplete: true });
    await this.db.batch([
      this.db.prepare(`UPDATE senda_agent_runs SET status='failed',cost_usd=CASE WHEN started=0 THEN 0 ELSE reserved_usd END,meter_usd=0,response=? WHERE id=? AND status='running'${unstartedOnly ? ' AND started=0' : ''}`)
        .bind(JSON.stringify({ type: 'error', text }), runId),
      this.db.prepare(`UPDATE senda_agent_chats SET display=?,lock_id=NULL,lock_until=0,updated=? WHERE id=? AND lock_id=? AND
        EXISTS(SELECT 1 FROM senda_agent_runs WHERE id=? AND status='failed'${unstartedOnly ? ' AND started=0' : ''})`)
        .bind(JSON.stringify(display), new Date().toISOString(), chatId, runId, runId),
    ]);
  }
  async recover(row) {
    if (row.lock_id && row.lock_until <= Date.now()) {
      await this.interrupt(row.id, row.lock_id, 'The previous reply was interrupted. Your saved revisions are safe. Send a message to continue.');
      return this.chat({ userId: row.owner }, row.id);
    }
    return row;
  }

  unlock(id, run) {
    return this.db
      .prepare(
        "UPDATE senda_agent_chats SET lock_id=NULL,lock_until=0 WHERE id=? AND lock_id=?",
      )
      .bind(id, run)
      .run();
  }
}

function lastModel(messages, fallback = "as-is") {
  for (const message of messages.slice().reverse()) {
    if (message.role !== "tool") continue;
    for (const item of message.content.slice().reverse()) {
      const value = item.output?.value;
      if (["as-is", "to-be"].includes(value?.modelKind || value?.model))
        return value.modelKind || value.model;
    }
  }
  return fallback;
}
function displayModel(messages) {
  return messages.findLast(message => message.role === "assistant" && ["as-is", "to-be"].includes(message.model))?.model;
}

export function agentFailure(error) {
  if (error.code === "LIMIT") return { text: error.message, knownUsage: true };
  if ([401, 403].includes(error.statusCode)) return {
    text: "Senda could not connect to its AI service. The operator needs to check the connection. Your saved work is safe.",
    // Authentication rejection incurs no provider usage for the failed call.
    knownUsage: true,
  };
  if (error.statusCode === 402) return {
    text: 'The Senda agent is temporarily unavailable. Your saved work is safe. Please try again later.', knownUsage: true,
  };
  return {
    text: "The agent stopped before finishing. Your saved revisions are safe. Ask it to continue from the saved progress.",
    knownUsage: false,
  };
}
