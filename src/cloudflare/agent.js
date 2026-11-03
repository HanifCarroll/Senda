import { z } from "zod";
import { AGENT_MODEL_NAME } from "../server/agent/provider.js";
import { randomUUID } from "node:crypto";
import {
  AGENT_LIMITS,
  agentAllowed,
  runAgent,
  usageCost,
} from "../server/agent/run.js";
import { requireThat } from "../core/errors.js";
import { CallBudget, measuredUsage, reserveTurn, serviceLimits,MIN_TURN_USD } from './agent-budget.js';
import {trialStatus,trialMatches,claimTrial,bindTrialProject} from './agent-trial.js';
import { billingNow, emailListed } from '../server/billing/plan.js';
import { OperationalAlerts } from './operations.js';
import { hostedRunMachine, hostedRunFromFacts } from './agent-machines.js';
import { startProtocol, advanceProtocol } from '../server/agent/protocol-machines.js';
export { measuredUsage } from './agent-budget.js';

const Turn = z.strictObject({
  requestId: z.uuid(),
  text: z.string().trim().min(1).max(60000),
});
const TURN_LEASE_MS = 600000;
const ADMISSION_GRACE_MS = 30000;
export class HostedAgent {
  constructor(env, projects, origin, { run = runAgent, billing, dispatch, waitUntil, pollMs = 1000 } = {}) {
    Object.assign(this, { env, projects, origin, run, billing, dispatch, waitUntil, pollMs });
    this.db = env.DB;
    this.operations = new OperationalAlerts(env);
  }
  async chat(actor, id, { metadataOnly = false } = {}) {
    const row = await this.db
      .prepare(metadataOnly ? 'SELECT project FROM senda_agent_chats WHERE id=? AND owner=?' : 'SELECT * FROM senda_agent_chats WHERE id=? AND owner=?')
      .bind(z.uuid().parse(id), actor.userId)
      .first();
    requireThat(row, "NOT_FOUND", "This conversation is not available.");
    if (row.project) row.projectGeneration = (await this.projects.authorize(actor, row.project)).generation;
    return row;
  }
  async trialProjectRoom(actor) {
    const [projects, limit] = await Promise.all([
      this.projects.list(actor), this.projects.projectLimit(actor),
    ]);
    return projects.length < limit;
  }
  handle(request, actor, email) {
    const response = this.handleRequest(request, actor, email);
    if (request.method === 'POST' && /^\/api\/agent\/chats\/[^/]+\/turn$/.test(new URL(request.url).pathname))
      this.waitUntil?.(response.then(() => {}, () => {}));
    return response;
  }
  async handleRequest(request, actor, email) {
    const url = new URL(request.url), path = url.pathname;
    const operator = agentAllowed(this.env, email);
    const paidEmailAllowed = this.env.PAID_AGENT_ALLOWED_EMAILS === undefined || emailListed(this.env.PAID_AGENT_ALLOWED_EMAILS, email);
    let entitlement = !operator && paidEmailAllowed && this.env.OPENAI_API_KEY
      ? await this.billing?.entitlement(actor) : null;
    const trialEnabled = !operator && !entitlement && !!this.env.OPENAI_API_KEY && this.env.FREE_AGENT_TRIAL_ENABLED === '1' &&
      !(await this.billing?.reviewHold?.(actor.userId));
    const trial = trialEnabled ? await trialStatus(this.db, actor.userId) : null;
    let contextProject = url.searchParams.get('project') || null,
      contextChat = url.searchParams.get('chat') || null;
    if (path === '/api/agent/config' && contextChat)
      contextProject = (await this.chat(actor, contextChat)).project;
    else if (path === '/api/agent/config' && contextProject)
      await this.projects.authorize(actor, contextProject);
    const trialRoom = path !== '/api/agent/config' || !trial || trial.chatId || contextProject || await this.trialProjectRoom(actor);
    const trialAvailable = trial && trial.remainingUsd >= MIN_TURN_USD && trialRoom;
    const trialContextAllowed = !trial || (!contextProject && !contextChat) || trialMatches(trial, contextChat, contextProject);
    const available = !!(operator || entitlement || trialAvailable && trialContextAllowed) && !!(this.env.AGENT_WORKFLOW || this.dispatch);
    const accessMessage = trial && !trialContextAllowed
      ? 'Your free Luna trial is for one project. Continue your trial project, or choose Pro for other projects.'
      : trial && !trialRoom
        ? 'Your workspace is full. Open an existing project to start your free Luna trial there. Your trial has not been used.'
      : trial && !trialAvailable
        ? 'Your free Luna trial allowance is finished or reserved for a reply. Your project, evidence and downloads stay available. Choose Pro to continue with Luna, or use your connected agent.'
        : !available && !operator ? await this.billing?.unavailableMessage?.(actor) : null;
    if (path === "/api/agent/config")
      return Response.json({
        available,
        message: accessMessage || undefined,
        model: AGENT_MODEL_NAME,
        ...(trial ? { trial } : {}),
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
      if (trial && !trial.chatId && !input.projectId)
        requireThat(await this.trialProjectRoom(actor), 'PROJECT_LIMIT',
          'Your workspace is full. Open an existing project to start your free Luna trial there. Your trial has not been used.');
      if (trial)
        requireThat(trialMatches(trial, null, input.projectId), 'TRIAL_PROJECT',
          'Your free Luna trial is for one project. Continue that project, or choose Pro to use Luna on other projects.');
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
      day = new Date().toISOString().slice(0, 10),
      projectGeneration = row.projectGeneration ?? null;
    requireThat(!(await this.db.prepare("SELECT 1 FROM senda_agent_runs WHERE id=? AND owner=? AND chat=?")
      .bind(runId, actor.userId, row.id).first()), "CONFLICT", "This message was already received. Reload the conversation to check its saved reply.");
    const locked = await this.db
      .prepare(
        "UPDATE senda_agent_chats SET lock_id=?,lock_until=? WHERE id=? AND owner=? AND lock_until<? RETURNING *",
      )
      .bind(runId, now + TURN_LEASE_MS, row.id, actor.userId, now)
      .first();
    requireThat(
      locked,
      "CONFLICT",
      "A reply is already being prepared. Wait for it to finish.",
    );
    row = locked;
    let admission;
    const advanceAdmission = event => { admission = advanceProtocol(hostedRunMachine, admission, event); };
    try {
      admission = startProtocol(hostedRunMachine);
      advanceAdmission({ type: 'LOCKED' });
      if (row.project) await this.projects.authorize(actor,row.project,projectGeneration);
      if (trial) {
        if (!trial.chatId && !row.project)
          requireThat(await this.trialProjectRoom(actor), 'PROJECT_LIMIT',
            'Your workspace is full. Open an existing project to start your free Luna trial there. Your trial has not been used.');
        entitlement = await claimTrial(this.db, actor.userId, row);
      }
      await reserveTurn(this.db, { runId, chatId: row.id, owner: actor.userId, day, entitlement,
        nowMs: billingNow(this.env), limits: serviceLimits(this.env), lockId: runId });
      advanceAdmission({ type: 'ADMITTED' });
    } catch (error) {
      if (admission?.can({ type: 'DENIED' })) advanceAdmission({ type: 'DENIED' });
      await this.unlock(row.id, runId);
      await this.operations.observe();
      throw error;
    }
    const display = [...JSON.parse(row.display), { role: "user", text: input.text }];
    await this.db.prepare("UPDATE senda_agent_chats SET display=?,updated=? WHERE id=? AND lock_id=?")
      .bind(JSON.stringify(display), new Date().toISOString(), row.id, runId).run();
    const params = { runId, chatId: row.id, entitlement: entitlement || null, origin: this.origin, projectGeneration };
    advanceAdmission({ type: 'DISPATCH' });
    try {
      if (this.dispatch) await this.dispatch(params);
      else await this.env.AGENT_WORKFLOW.create({ id: runId, params });
      advanceAdmission({ type: 'QUEUED' });
    } catch {
      // A lost create response may still have queued the job. Never dispatch it
      // again or release its reservation while the outcome is unknown.
      advanceAdmission({ type: 'QUEUE_UNKNOWN' });
      if (this.env.AGENT_WORKFLOW) try {
        const instance = await this.env.AGENT_WORKFLOW.get(runId);
        if (await instance.status()) advanceAdmission({ type: 'QUEUED' });
      } catch {}
      if (admission.can({ type: 'INTERRUPT_UNSTARTED' })) {
        advanceAdmission({ type: 'INTERRUPT_UNSTARTED' });
        await this.interrupt(row.id, runId,
          'Senda could not confirm that this reply started. Your saved work is safe. Please try again.', { unstartedOnly: true });
      }
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
              const run = await db.prepare(`SELECT c.project,r.status,r.response,r.progress FROM senda_agent_chats c
                LEFT JOIN senda_agent_runs r ON r.id=? AND r.chat=c.id WHERE c.id=?`)
                .bind(runId, chatId).first();
              if (run?.project && run.project !== previousProject) {
                send({ type: 'project', projectId: run.project }); previousProject = run.project;
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
  runFacts(runId, chatId) {
    return this.db.prepare(`SELECT r.*,c.lock_id,c.lock_until FROM senda_agent_runs r
      LEFT JOIN senda_agent_chats c ON c.id=r.chat WHERE r.id=? AND r.chat=?`)
      .bind(runId, chatId).first();
  }
  async execute({ runId, chatId, entitlement = null, projectGeneration = null }) {
    const run = await this.runFacts(z.uuid().parse(runId), z.uuid().parse(chatId));
    let execution = hostedRunFromFacts(run, run);
    if (!execution.can({ type: 'CLAIM' })) return { executed: false };
    execution = advanceProtocol(hostedRunMachine, execution, { type: 'CLAIM' });
    // Workflow replays and duplicate deliveries cannot contact the provider twice.
    const claimed = await this.db.prepare(`UPDATE senda_agent_runs SET started=1 WHERE id=? AND status='running' AND started=0 AND
      EXISTS(SELECT 1 FROM senda_agent_chats WHERE id=? AND owner=? AND lock_id=? AND lock_until>?) RETURNING id`)
      .bind(runId, chatId, run.owner, runId, Date.now()).first();
    execution = advanceProtocol(hostedRunMachine, execution, { type: claimed ? 'CLAIMED' : 'LOST' });
    if (!execution.matches('started')) return { executed: false };
    const executionStarted=performance.now();
    console.info('Senda agent timing',{runId,phase:'queue',durationMs:Math.max(0,Date.now()-Date.parse(run.created)),status:'success'});
    const actor = { userId: run.owner, ...(projectGeneration === null ? {} : {projectGeneration}) }, controller = new AbortController();
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
      if (row.project) actor.projectGeneration ??= row.projectGeneration;
      display = JSON.parse(row.display);
      base = display.map(message => ({ role: message.role, content: message.text }));
      const result = await this.run({
        apiKey: this.env.OPENAI_API_KEY, projects: this.projects, actor,
        origin: this.origin, messages: base, projectId: row.project,
        initialModel: displayModel(display) || lastModel(JSON.parse(row.messages)),
        signal: controller.signal, emit,
        onTiming:event=>console.info('Senda agent timing',{runId,...event}),
        onProgress:()=>emit({type:'status',text:'A draft is saved. Finishing its checks…'}),
        reserveCall: async kind => {
          await this.chat(actor, chatId, { metadataOnly: true });
          return budget.reserve(kind);
        }, settleCall: usage => budget.settle(usage),
        failCall: (error, phase) => budget.failure(error, phase),
        onProject: async id => {
          if(entitlement?.kind==='trial')await bindTrialProject(this.db,run.owner,row.id,id,runId);
          else await this.db.prepare("UPDATE senda_agent_chats SET project=? WHERE id=? AND lock_id=?")
            .bind(id, row.id, runId).run();
          actor.projectGeneration = 0;
          await this.projects.authorize(actor,id);
        },
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
      const current = await this.runFacts(runId, chatId);
      execution = hostedRunFromFacts(current, current);
      if (!execution.can({ type: 'COMPLETE' })) return { executed: true };
      execution = advanceProtocol(hostedRunMachine, execution, { type: 'COMPLETE' });
      display.push({ role: 'assistant', text: result.text, model: result.model, incomplete: !!result.incomplete });
      const response = { type: 'done', text: result.text, projectId: result.projectId,
        model: result.model, incomplete: !!result.incomplete,
        usage: { inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens } };
      await this.db.batch([
        this.db.prepare("UPDATE senda_agent_chats SET messages=?,display=?,updated=? WHERE id=? AND lock_id=? AND EXISTS(SELECT 1 FROM senda_agent_runs WHERE id=? AND status='running' AND started=1)")
          .bind(JSON.stringify([...base, ...result.messages]), JSON.stringify(display), new Date().toISOString(), chatId, runId, runId),
        this.db.prepare("UPDATE senda_agent_runs SET status='complete',cost_usd=CASE WHEN ? THEN reserved_usd ELSE ? END,meter_usd=?,input_tokens=?,output_tokens=?,response=? WHERE id=? AND status='running' AND started=1 AND EXISTS(SELECT 1 FROM senda_agent_chats WHERE id=? AND lock_id=?)")
          .bind(Number(!budget.first), measuredUsage(result.usage) ? usageCost(result.usage) : null,
            !result.incomplete ? (!budget.first ? budget.customerUsd : measuredUsage(result.usage) ? usageCost(result.usage) : 0) : 0,
            result.usage?.inputTokens ?? null, result.usage?.outputTokens ?? null, JSON.stringify(response), runId, chatId, runId),
      ]);
    } catch (error) {
      await statusWrites.catch(() => {});
      await budget.failure(error);
      console.error('Senda agent stopped', { name: error.name, code: error.code, status: error.statusCode });
      const current = await this.runFacts(runId, chatId);
      execution = hostedRunFromFacts(current, current);
      if (!execution.can({ type: 'FAIL' })) return { executed: true };
      execution = advanceProtocol(hostedRunMachine, execution, { type: 'FAIL' });
      const failure = agentFailure(error);
      const cost = !budget.first ? null : failure.knownUsage && usageKnown ? usageCost(used) : null;
      const response = { type: 'error', text: failure.text };
      if (!display) display = JSON.parse((await this.db.prepare('SELECT display FROM senda_agent_chats WHERE id=?').bind(chatId).first())?.display || '[]');
      display.push({ role: 'assistant', text: failure.text, model: lastModel([...(base || []), ...pending], displayModel(display)), incomplete: true });
      await this.db.batch([
        this.db.prepare("UPDATE senda_agent_chats SET display=?,updated=? WHERE id=? AND lock_id=? AND EXISTS(SELECT 1 FROM senda_agent_runs WHERE id=? AND status='running' AND started=1)")
          .bind(JSON.stringify(display), new Date().toISOString(), chatId, runId, runId),
        this.db.prepare("UPDATE senda_agent_runs SET status='failed',cost_usd=CASE WHEN ? THEN reserved_usd ELSE ? END,meter_usd=0,input_tokens=?,output_tokens=?,response=? WHERE id=? AND status='running' AND started=1 AND EXISTS(SELECT 1 FROM senda_agent_chats WHERE id=? AND lock_id=?)")
          .bind(Number(!budget.first), cost, used.inputTokens, used.outputTokens, JSON.stringify(response), runId, chatId, runId),
      ]);
    } finally {
      clearTimeout(timeout);
      await this.unlock(chatId, runId);
      await this.operations.observe();
      console.info('Senda agent timing',{runId,phase:'turn',durationMs:performance.now()-executionStarted,status:'finished'});
    }
    return { executed: true };
  }
  async interrupt(chatId, runId, text, { unstartedOnly = false } = {}) {
    const run = await this.runFacts(runId, chatId);
    const phase = hostedRunFromFacts(run, run), event = { type: unstartedOnly ? 'INTERRUPT_UNSTARTED' : 'INTERRUPT' };
    if (!phase.can(event)) return;
    const row = await this.db.prepare('SELECT * FROM senda_agent_chats WHERE id=? AND lock_id=?').bind(chatId, runId).first();
    if (!row) return;
    const display = JSON.parse(row.display);
    display.push({ role: 'assistant', text, model: displayModel(display) || lastModel(JSON.parse(row.messages)), incomplete: true });
    await this.db.batch([
      this.db.prepare(`UPDATE senda_agent_runs SET status='failed',cost_usd=CASE WHEN started=0 THEN 0 ELSE reserved_usd END,meter_usd=0,response=? WHERE id=? AND status='running'${unstartedOnly ? ' AND started=0' : ''}`)
        .bind(JSON.stringify({ type: 'error', text }), runId),
      this.db.prepare(`UPDATE senda_agent_chats SET display=?,lock_id=NULL,lock_until=0,updated=? WHERE id=? AND lock_id=? AND
        EXISTS(SELECT 1 FROM senda_agent_runs WHERE id=? AND status='failed' AND response=?${unstartedOnly ? ' AND started=0' : ''})`)
        .bind(JSON.stringify(display), new Date().toISOString(), chatId, runId, runId, JSON.stringify({ type: 'error', text })),
    ]);
  }
  async recover(row) {
    if (row.lock_id && row.lock_until <= Date.now() + TURN_LEASE_MS - ADMISSION_GRACE_MS) {
      const display = [...JSON.parse(row.display), { role: 'assistant',
        text: 'The previous reply did not start. Send your message again.', incomplete: true,
        model: displayModel(JSON.parse(row.display)) || lastModel(JSON.parse(row.messages)) }];
      // A reservation appearing concurrently prevents recovery. Once recovered,
      // reserveTurn's lock check prevents the old admission from resuming later.
      const recovered = await this.db.prepare(`UPDATE senda_agent_chats SET display=?,lock_id=NULL,lock_until=0,updated=?
        WHERE id=? AND lock_id=? AND lock_until<=?
        AND NOT EXISTS(SELECT 1 FROM senda_agent_runs WHERE id=? AND chat=?) RETURNING *`)
        .bind(JSON.stringify(display), new Date().toISOString(), row.id, row.lock_id,
          Date.now() + TURN_LEASE_MS - ADMISSION_GRACE_MS, row.lock_id, row.id).first();
      if (recovered) return this.chat({ userId: row.owner }, row.id);
      row = await this.chat({ userId: row.owner }, row.id);
    }
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
  if (['LIMIT','PROJECT_DELETED','STALE_PROJECT'].includes(error.code)) return { text: error.message, knownUsage: true };
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
