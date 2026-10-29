import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPlatformProxy } from "wrangler";
import { hash } from "../src/core/hash.js";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { BpmnModdle } from "bpmn-moddle";
const origin = process.env.SENDA_TEST_ORIGIN || "http://127.0.0.1:8795";
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(origin).hostname),
  "Live agent fixture must use local accounts.",
);
assert.equal(
  process.env.SENDA_TEST_LIVE_AGENT,
  "1",
  "Opt in explicitly: this test uses the configured DeepSeek account.",
);
const state = process.env.SENDA_TEST_STATE || "/tmp/senda-workspace.Jgc3oD";
const proxy = await getPlatformProxy({
  configPath: "wrangler.jsonc",
  persist: { path: path.join(state, "v3") },
});
const email = process.env.SENDA_TEST_EMAIL || "agent-journey@example.test";
assert.match(email, /^agent-[a-z0-9-]+@example\.test$/, "Use only isolated fictional test accounts.");
const artifacts = process.env.SENDA_AGENT_ARTIFACTS || "/tmp/senda-client-qa";
let cookie = "";
async function request(route, data) {
  return fetch(origin + route, {
    method: data ? "POST" : "GET",
    redirect: "manual",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(data ? { origin, "content-type": "application/json" } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
}
async function json(route, data) {
  const r = await request(route, data),
    j = await r.json();
  assert.ok(r.ok, JSON.stringify(j));
  return j;
}
try {
  await json("/api/auth/sign-in/magic-link", {
    email,
    name: "Agent journey",
    callbackURL: origin + "/app",
    errorCallbackURL: origin + "/sign-in",
  });
  const mail = await (
    await proxy.env.SNAPSHOTS.get(`test-outbox/${hash(email)}.json`)
  ).json();
  const link = new URL(mail.text.match(/http[^\s]+/)[0]);
  const scan = await fetch(link);
  assert.ok(scan.ok);
  const login = await request("/api/auth/magic-link/verify" + link.search);
  assert.equal(login.status, 302);
  cookie = login.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ");
  assert.equal((await json("/api/agent/config")).available, true);
  const prior = process.env.SENDA_AGENT_RESUME
    ? JSON.parse(await readFile(process.env.SENDA_AGENT_RESUME, 'utf8')) : null;
  if (prior) {
    assert.equal(prior.turns.length, 1, 'Resume only after the first completed provider turn.');
    assert.ok(!prior.resumedAfterFailure, 'Do not count a failed diagnostic journey as clean qualification.');
  }
  const { id } = prior ? { id: prior.chatId } : await json("/api/agent/chats", {});
  let projectId = prior?.projectId;
  const turns = [...(prior?.turns || [])];
  if (prior) {
    const saved = await json(`/api/agent/chats/${id}`);
    assert.equal(saved.projectId, projectId);
    assert.equal(saved.messages.length, 2, 'No failed or extra provider turn may be hidden by resuming the runner.');
    assert.equal(saved.working, false);
  }
  async function savedXml(model = "as-is") {
    const response = await request(`/api/projects/${projectId}/bpmn?model=${model}`);
    assert.ok(response.ok);
    const xml = await response.text();
    const parsed = await new BpmnModdle().fromXML(xml);
    assert.equal(parsed.warnings.length, 0);
    return { xml, elements: Object.values(parsed.elementsById) };
  }
  async function turn(text) {
    const started = Date.now(),
      r = await request(`/api/agent/chats/${id}/turn`, {
        requestId: randomUUID(),
        text,
      });
    assert.ok(r.ok, await (!r.ok ? r.text() : Promise.resolve("")));
    const reader = r.body.getReader(),
      decoder = new TextDecoder();
    let buf = "",
      final;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let n;
      while ((n = buf.indexOf("\n")) >= 0) {
        const event = JSON.parse(buf.slice(0, n));
        buf = buf.slice(n + 1);
        if (event.type === "status") console.log(event.text);
        if (event.projectId) projectId = event.projectId;
        if (event.type === "done") final = event;
        if (event.type === "error") throw new Error(event.text);
      }
    }
    assert.ok(final, "Agent completed the turn");
    turns.push({
      text,
      reply: final.text,
      usage: final.usage,
      ms: Date.now() - started,
      incomplete: !!final.incomplete,
    });
    console.log("Reply:", final.text);
    await mkdir(artifacts, { recursive: true });
    await writeFile(
      path.join(artifacts, "hosted-agent-journey.json"),
      JSON.stringify({ runnerResumed: !!prior, chatId: id, projectId, turns }, null, 2),
    );
    assert.equal(!!final.incomplete, false, 'No rejected diagram change may be hidden by a fluent final reply');
    assert.doesNotMatch(final.text, /DSML|<\/?(?:invoke|parameter)|turn ended before I could finish|reached this turn.s limit/i, "Agent completes the requested turn without protocol leakage or a continuation fallback");
    return final;
  }
  if (!prior) await turn(
    "I am mapping client onboarding at Cedar Studio. Could you turn these interview notes into a process in Senda and ask me about anything unclear?\nCoordinator: When a signed order arrives, I check the handover pack. If anything is missing I ask the client to correct it, wait for their reply, and check again. Once complete, Finance checks whether the client has approved credit terms. If they do, no deposit is needed. Otherwise Finance sends a deposit invoice and waits for payment. Delivery prepares the project plan and gets client approval. I am not sure whether Delivery waits for Finance before starting. Once both are ready, I set up the workspace, hold kickoff and send the handover pack to the delivery team. That finishes onboarding. If the client withdraws while we are waiting for their deposit, Finance tells me and I close onboarding as cancelled.",
  );
  assert.ok(projectId, "Agent creates project from transcript");
  let initial = await json(`/api/projects/${projectId}/read`);
  assert.ok(
    initial.model.filter(e => /(?:Task|SubProcess)$/.test(e.type)).length >= 3 &&
      initial.model.filter(e => e.type === 'bpmn:SequenceFlow').length >= 4,
    "Agent saved a visible overview with meaningful activities; opaque subprocesses are valid BPMN activities",
  );
  assert.ok(initial.discovery.sources.some(source => source.text === turns[0].text), "Original user transcript is preserved verbatim");
  const rootProcess = initial.model.find(e => e.type === "bpmn:Process");
  for (const planStep of initial.model.filter(e => /Task$/.test(e.type) && /prepare.*plan/i.test(e.name || "") && e.parent === rootProcess?.id)) {
    assert.ok(!initial.model.some(e => e.type === "bpmn:SequenceFlow" && e.target === planStep.id), "Unknown Delivery start must remain unconnected in the initial draft");
  }
  await turn(
    "Finance and Delivery start together as soon as the handover pack is complete. Workspace setup waits for financial clearance and an approved plan. Cancellation ends the whole onboarding case, including any unfinished Delivery work. Please update the diagram and save those answers.",
  );
  const clarified = await json(`/api/projects/${projectId}/read`);
  assert.ok(clarified.revision > initial.revision);
  const parallel = (await savedXml()).elements;
  assert.ok(parallel.some(e => e.$type === "bpmn:ParallelGateway" && e.outgoing?.length >= 2), "Confirmed parallel readiness uses an AND split");
  assert.ok(parallel.some(e => e.$type === "bpmn:ParallelGateway" && e.incoming?.length >= 2), "Both clearances meet at an AND join");
  const withdrawal = parallel.find(e => e.$type === 'bpmn:BoundaryEvent' && /withdraw/i.test(e.name || '') && /deposit|payment/i.test(e.attachedToRef?.name || ''));
  assert.ok(withdrawal, 'Withdrawal is caught during the deposit wait');
  const cancelled = new Set(), cancellationPaths = [withdrawal];
  while (cancellationPaths.length) {
    const node = cancellationPaths.pop();
    if (cancelled.has(node.id)) continue;
    cancelled.add(node.id);
    cancellationPaths.push(...(node.outgoing || []).map(flow => flow.targetRef));
  }
  assert.ok(parallel.some(e => cancelled.has(e.id) && e.$type === "bpmn:EndEvent" && e.$parent?.$type === "bpmn:Process" && e.eventDefinitions?.some(d => d.$type === "bpmn:TerminateEventDefinition")), "The actual withdrawal path reaches whole-case termination");
  await turn(
    "One more detail: if a client rejects the plan, Delivery revises it and asks again. We send a payment reminder after seven calendar days, but keep waiting until the client pays or withdraws. Please show those paths too.",
  );
  const baseline = await json(`/api/projects/${projectId}/read`);
  const detailed = (await savedXml()).elements;
  assert.ok(detailed.some(e => e.$type === "bpmn:BoundaryEvent" && e.cancelActivity === false && e.eventDefinitions?.some(d => d.$type === "bpmn:TimerEventDefinition" && d.timeDuration?.body === "P7D")), "Seven-day reminder keeps the deposit wait active");
  const reminder = detailed.find(e => e.$type === 'bpmn:BoundaryEvent' && e.eventDefinitions?.some(d => d.timeDuration?.body === 'P7D'));
  const reached = new Set(), pending = [reminder];
  while (pending.length) {
    const node = pending.pop();
    if (reached.has(node.id)) continue;
    reached.add(node.id);
    pending.push(...(node.outgoing || []).map(flow => flow.targetRef));
  }
  assert.ok(!reached.has(reminder.attachedToRef.id), 'A reminder must not create another token in the original payment wait');
  const reminderPath = detailed.filter(e => reached.has(e.id));
  assert.ok(reminderPath.some(e => e.$type === 'bpmn:EndEvent' && !e.eventDefinitions?.length), 'The reminder ends its own path while the original wait stays active');
  assert.ok(!reminderPath.some(e => e.$type === 'bpmn:ParallelGateway' || e.eventDefinitions?.some(d => d.$type === 'bpmn:TerminateEventDefinition')), 'The reminder must not release readiness or terminate the case');
  assert.ok(
    baseline.revision > clarified.revision,
    "Second clarification produces a saved revision",
  );
  await turn(
    "Now I want to plan a better future process. Keep the current process separate. In the future, have the system check the handover pack automatically. The coordinator only handles incomplete or uncertain packs. Keep the parallel Finance and Delivery work and the other rules we agreed. Please create the future process and show what changed.",
  );
  let models = await json(`/api/projects/${projectId}/models`);
  assert.ok(models.toBe);
  assert.equal(models.asIs.revision, baseline.revision);
  const firstFuture = await json(`/api/projects/${projectId}/read?model=to-be`);
  assert.ok((await savedXml("to-be")).elements.some(e => ["bpmn:ServiceTask", "bpmn:BusinessRuleTask"].includes(e.$type) && /pack|handover|complete|check/i.test(e.name || "")), "Future pack check is automated");
  await turn(
    "For that future process, please also automate workspace setup once both clearances are ready. If setup fails, the coordinator fixes the problem and retries before kickoff. Please revise the future diagram while keeping the current one as it is.",
  );
  models = await json(`/api/projects/${projectId}/models`);
  assert.equal(models.asIs.revision, baseline.revision);
  assert.ok(models.toBe.revision > firstFuture.revision);
  assert.ok((await savedXml("to-be")).elements.some(e => ["bpmn:ServiceTask", "bpmn:BusinessRuleTask"].includes(e.$type) && /workspace|setup|set.up/i.test(e.name || "")), "Later future workspace setup is automated");
  assert.deepEqual((await json(`/api/projects/${projectId}/read`)).model, baseline.model, "Future changes preserve the actual As-is diagram");
  for (const model of ["as-is", "to-be"]) {
    const review = await json(
      `/api/projects/${projectId}/review?model=${model}`,
    );
    assert.ok(review.views.length);
    const exported = await request(
      `/api/projects/${projectId}/bpmn?model=${model}`,
    );
    assert.ok(exported.ok);
    const parsed = await new BpmnModdle().fromXML(await exported.text());
    assert.equal(parsed.warnings.length, 0);
  }
  const stored = await json(`/api/agent/chats/${id}`);
  assert.equal(stored.messages.length, turns.length * 2);
  assert.equal(stored.projectId, projectId);
  console.log(
    JSON.stringify({
      success: true,
      projectId,
      chatId: id,
      asIs: models.asIs.revision,
      toBe: models.toBe.revision,
      turns: turns.length,
    }),
  );
} finally {
  await proxy.dispose();
}
