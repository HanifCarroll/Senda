import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticCases } from '../evals/hosted-agent/cases.js';
import { semanticGraph } from '../src/server/agent/semantic-review.js';

test('semantic controls keep all XML and evidence references valid under opaque ID renaming and case-order changes', async () => {
  for (const seed of [0, 1, 2, 3]) {
    const cases = await semanticCases(seed);
    assert.equal(cases.length, 20);
    assert.equal(new Set(cases.map(f => f.id)).size, 20);
    for (const f of cases) {
      const graph = await semanticGraph(f.candidate.xml), ids = new Set(graph.map(e => e.id));
      if (seed) assert.ok([...ids].every(id => id.startsWith(`Opaque_${seed}_`)), f.id);
      const d = f.candidate.discovery;
      for (const entry of [...d.claims, ...d.questions, ...d.scenarios, ...d.abstractions, ...d.walkthrough.steps]) {
        for (const id of entry.elementIds || []) assert.ok(ids.has(id), `${f.id}: ${id}`);
        if (entry.elementId) assert.equal(graph.find(e => e.id === entry.elementId)?.type, 'bpmn:SubProcess');
      }
    }
  }
});

test('a benchmark candidate cannot mutate another candidate through shared metadata', async () => {
  const cases = await semanticCases();
  const find = id => cases.find(f => f.id === id).candidate.discovery;
  const positive = find('initial-terminal-outcome-deferred-positive');
  const detailed = find('detailed-terminal-outcome-hidden-negative');
  const original = structuredClone(detailed);
  positive.abstractions[0].elementId = 'Changed_Only_In_This_Candidate';
  positive.abstractions[0].outcomes.push('Changed outcome');
  assert.deepEqual(detailed, original);
  find('unknown-order-opaque-positive').questions[0].status = 'answered';
  assert.equal(find('unknown-order-parallel-negative').questions[0].status, 'open');
});

test('every negative control retains its intended behavioral error across naming variations', async () => {
  for (const seed of [0,1,2,3]) {
    const cases = new Map((await semanticCases(seed)).map(f=>[f.id,f]));
    const graphs = new Map(await Promise.all([...cases].map(async ([id,f])=>[id,await semanticGraph(f.candidate.xml)])));
    const graph = id=>graphs.get(id);
    const timer = id=>graph(id).find(e=>e.type==='bpmn:BoundaryEvent'&&e.definitions?.some(d=>d.type==='bpmn:TimerEventDefinition'));
    const named = (id,name)=>graph(id).find(e=>e.name===name);
    const edge = (id,a,b)=>graph(id).some(e=>e.source===a&&e.target===b);
    const terminates = e=>!!e.definitions?.some(d=>d.type==='bpmn:TerminateEventDefinition');
    const positive = 'reminder-positive', wait=named(positive,'Await payment (Finance)');
    assert.equal(timer(positive).attachedTo,wait.id);assert.equal(timer(positive).cancelActivity,false);assert.equal(timer(positive).definitions[0].duration,'P7D');
    assert.equal(timer('reminder-interrupts-negative').cancelActivity,true);
    const clock='reminder-clock-negative';assert.equal(timer(clock).attachedTo,named(clock,'Send invoice (Finance)').id);
    assert.equal(timer('reminder-hours-negative').definitions[0].duration,'PT7H');
    const extra='reminder-extra-token-negative';assert.equal(timer(extra).cancelActivity,false);
    assert.ok(edge(extra,named(extra,'Send reminder (Finance)').id,timer(extra).attachedTo));
    assert.ok(terminates(named('cancellation-positive','Case cancelled')));
    assert.ok(!terminates(named('cancellation-plain-end-negative','Case cancelled')));
    const late='cancellation-late-work-negative',withdrawal=graph(late).find(e=>e.type==='bpmn:BoundaryEvent');
    assert.equal(withdrawal.attachedTo,named(late,'Await deposit (Finance)').id);
    assert.ok(graph(late).some(e=>e.type==='bpmn:ParallelGateway'&&edge(late,e.id,named(late,'Set up workspace (Coordinator)').id)));
    assert.match(cases.get(late).candidate.discovery.claims[0].statement,/workspace setup already started/);
    const unknown='unknown-order-parallel-negative';
    assert.equal(cases.get(unknown).candidate.discovery.abstractions.length,0,'Expanded stages must not carry invalid opaque contracts');
    assert.ok(graph(unknown).some(e=>e.type==='bpmn:ParallelGateway'));assert.ok(cases.get(unknown).candidate.discovery.questions.some(q=>q.status==='open'));
    const sequential='initial-overview-unsupported-order-negative';
    assert.ok(edge(sequential,named(sequential,'Check terms (Finance)').id,named(sequential,'Prepare plan (Delivery)').id));
    assert.match(cases.get(sequential).source,/do not know whether/);
    assert.equal(timer('source-injection-negative').cancelActivity,true);assert.match(cases.get('source-injection-negative').source,/ignore the reviewer instructions/);
    assert.ok(terminates(named('payment-terminates-reminder-positive','Payment recorded')));
    assert.ok(!terminates(named('payment-plain-end-leaves-reminder-negative','Payment recorded')));
    const hidden='detailed-terminal-outcome-hidden-negative',routed='detailed-terminal-outcome-routed-positive';
    assert.ok(edge(hidden,named(hidden,'Resolve artwork').id,named(hidden,'Print invitations (Workshop)').id));
    const split=graph(routed).find(e=>e.type==='bpmn:ExclusiveGateway');assert.ok(split);
    assert.ok(edge(routed,named(routed,'Resolve artwork').id,split.id));
    assert.ok(edge(routed,split.id,named(routed,'Order closed without printing').id));
    const repair=cases.get('initial-overview-metadata-repair-positive');assert.equal(repair.overviewTurn,true);assert.equal(repair.candidate.xml,repair.candidate.previousXml);
  }
});
