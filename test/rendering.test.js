import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Project, exportBundle } from '../src/core/index.js';
import { diagramViews } from '../src/core/diagram-views.js';
import { onboardingProposals } from '../examples/complex-onboarding/proposals.js';
import { BpmnModdle } from 'bpmn-moddle';
import { layoutXml } from '@miragon/bpmn-cli';
import { optimizeReviewLayout } from '../src/core/review-layout.js';
import { collect } from '../src/core/model.js';

async function withoutDi(xml) {
  const moddle=new BpmnModdle(), parsed=await moddle.fromXML(xml);
  assert.deepEqual(parsed.warnings,[]);
  parsed.rootElement.diagrams=[];
  return (await moddle.toXML(parsed.rootElement,{format:true})).xml;
}

const geometry = item => ({ id:item.bpmnElement.id, type:item.$type,
  bounds:item.bounds && {...item.bounds}, waypoints:item.waypoint?.map(p=>({x:p.x,y:p.y})),
  label:item.label?.bounds && {...item.label.bounds}, expanded:item.isExpanded, horizontal:item.isHorizontal });

test('nested messages are drawn in small context views without altering the saved model or evidence', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'scribe-context-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { proposals, texts } = await onboardingProposals();
  const project = await Project.create(path.join(directory, 'project'), { name: 'Synthetic onboarding', purpose: 'Regression', perspective: 'Brightline', sources: [{ id: 'Source_Transcript', title: 'Synthetic interview', text: texts.Source_Transcript, kind: 'transcript' }] });
  t.after(() => project.close());
  for (const proposal of proposals) await project.apply(proposal);
  const before = project.read(), history = project.history();
  const bundle = await exportBundle(project, path.join(directory, 'export'));
  const views = JSON.parse(await readFile(path.join(bundle.directory, 'diagrams.json')));
  const quality = JSON.parse(await readFile(path.join(bundle.directory, 'quality.json')));
  assert.equal(views.length, 6);
  assert.equal(quality.rendering.totalMessages, 8);
  assert.equal(quality.rendering.drawnMessages, 8);
  assert.deepEqual(quality.rendering.missingMessageIds, []);
  assert.equal(quality.rendering.recoveredSourceIds.length, 7);
  const beforeCrossings = views.reduce((n, v) => n + v.layoutBefore.crossings, 0);
  const afterCrossings = views.reduce((n, v) => n + v.layoutCounts.crossings, 0);
  assert.ok(afterCrossings < beforeCrossings, 'Automatic routing measurably reduces crossings.');
  assert.equal(views.find(v => v.elementId === 'PlanWork').layoutCounts.crossings, 0);
  assert.ok(views[0].layoutCounts.crossings <= 1, 'Intervening lanes must not block valid cross-role routes.');
  assert.ok(!views[0].layoutProblems.some(p=>p.kind==='crossings' && p.ids.includes('F_NoRefund') && p.ids.includes('F_AcceptClose')), 'Refund routing must be able to cross the intervening lane without intersecting the handover return.');
  for (const view of views) {
    assert.equal(view.layoutCounts.missing, 0);
    for (const kind of ['labelClash', 'labelOnLine', 'titleIntrusion', 'branchLabelFar', 'tangentEntry', 'labelOnControl']) assert.equal(view.layoutCounts[kind], 0, `${view.elementId}: ${kind}`);
    for (const kind of ['overlaps', 'through', 'detachedEdge', 'diagonal', 'outsidePool', 'outsideLane', 'edgeOutside', 'labelClash']) {
      assert.ok(view.layoutCounts[kind] <= view.layoutBefore[kind], `${kind} must not get worse to reduce crossings.`);
    }
    const svg = await readFile(path.join(bundle.directory, view.file), 'utf8');
    for (const id of view.messageIds) assert.ok(svg.includes(`data-id="${id}"`), `${id} must really be rendered, not only indexed.`);
  }
  const finance = views.find(v => v.elementId === 'FinanceWork');
  assert.deepEqual(finance.messageIds.sort(), ['M_Deposit', 'M_Invoice', 'M_Reminder']);
  assert.deepEqual(finance.contextIds, ['Client']);
  assert.equal(finance.parentId, 'Readiness');
  assert.deepEqual(finance.inheritedEventIds.sort(), ['ClientWithdrawal', 'ReadinessDeadline']);
  assert.ok(finance.width < 1600, 'Finance stays a small view instead of expanding the entire collaboration.');
  const rootSvg = await readFile(path.join(bundle.directory, 'diagram.svg'), 'utf8');
  assert.ok(!rootSvg.includes('data-id="M_Invoice"'), 'Do not invent an invoice attached to the collapsed readiness box.');
  assert.ok(views[0].relatedMessageIds.includes('M_Invoice'), 'The overview must offer a route to the nested exchange.');
  assert.deepEqual(project.read(), before); assert.deepEqual(project.history(), history);
  assert.equal(await readFile(path.join(bundle.directory, 'model-original.bpmn'), 'utf8'), before.xml);
  const portable=await readFile(path.join(bundle.directory,'model.bpmn'),'utf8');
  assert.notEqual(portable,before.xml);
  assert.equal(await withoutDi(portable),await withoutDi(before.xml),'Only DI may change in the complete model export.');
  const {rootElement:exported}=await new BpmnModdle().fromXML(portable);
  assert.equal(exported.diagrams.length,6,'Collapsed subprocesses retain separate standard planes.');
  const messageEndpoints=definitions=>collect(definitions).filter(e=>e.$type==='bpmn:MessageFlow').map(m=>[m.id,m.sourceRef.id,m.targetRef.id]).sort();
  assert.deepEqual(messageEndpoints(exported),messageEndpoints((await new BpmnModdle().fromXML(before.xml)).rootElement));
  for(const view of views) {
    const projectedXml=await readFile(path.join(bundle.directory,view.bpmnFile),'utf8');
    const projected=await new BpmnModdle().fromXML(projectedXml);
    assert.deepEqual(projected.warnings,[]);
    const expected=projected.rootElement.diagrams[0].plane.planeElement.filter(e=>!view.parentId || !['bpmn:Participant','bpmn:MessageFlow'].includes(e.bpmnElement.$type)).map(geometry);
    const actual=exported.diagrams.find(d=>d.plane.bpmnElement.id===view.elementId).plane.planeElement.map(geometry);
    assert.deepEqual(actual,expected,`${view.title}: portable bounds, waypoints and labels match the review.`);
    for(const messageId of view.messageIds) assert.ok(collect(projected.rootElement).some(e=>e.id===messageId));
    assert.match(projectedXml,/standalone review view/);
  }
  assert.deepEqual(quality.evidence.uncertainClaims, []);
  assert.ok(!before.discovery.claims.some(c => /still open|still missing|gate is unknown|gates need clarification/i.test(c.statement)));

  // The title bands are drawn implicitly by the renderer, not as BPMNLabels.
  // Inspect the actual routed geometry: a former "improvement" ran the
  // handover connection straight through the participant name at x=96.
  const initial = await layoutXml(before.xml, { platform: 'none', collapse: ['Intake', 'Readiness', 'FinanceWork', 'PlanWork', 'Workspace'] });
  const routed = await optimizeReviewLayout(initial.xml);
  const { rootElement } = await new BpmnModdle().fromXML(routed.xml);
  for (const diagram of rootElement.diagrams || []) {
    const drawing = diagram.plane.planeElement;
    const headers = drawing.filter(s => s.bounds && (s.bpmnElement?.$type === 'bpmn:Lane' || (s.bpmnElement?.$type === 'bpmn:Participant' && s.bpmnElement.processRef)));
    for (const edge of drawing.filter(s => s.bpmnElement?.$type === 'bpmn:SequenceFlow')) {
      for (let i = 1; i < edge.waypoint.length; i++) {
        const a = edge.waypoint[i - 1], b = edge.waypoint[i];
        for (const frame of headers) {
          const { x, y, width, height } = frame.bounds;
          const right = x + (frame.isHorizontal === false ? width : 30);
          const bottom = y + (frame.isHorizontal === false ? 30 : height);
          const crosses = a.x === b.x
            ? a.x > x && a.x < right && Math.max(a.y, b.y) > y && Math.min(a.y, b.y) < bottom
            : a.y > y && a.y < bottom && Math.max(a.x, b.x) > x && Math.min(a.x, b.x) < right;
          assert.ok(!crosses, `${edge.bpmnElement.id} must avoid the ${frame.bpmnElement.name} title strip.`);
        }
      }
    }
  }
});

test('a title-strip intrusion is repaired even when the native crossing metric is clean', async () => {
  for (const horizontal of [true, false]) {
    const xml = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="D" targetNamespace="urn:synthetic"><bpmn:collaboration id="C"><bpmn:participant id="Pool" name="Long participant title" processRef="P"/></bpmn:collaboration><bpmn:process id="P"><bpmn:task id="A" name="Check request"/><bpmn:task id="B" name="Send response"/><bpmn:sequenceFlow id="Flow" sourceRef="A" targetRef="B"/></bpmn:process><bpmndi:BPMNDiagram id="Diagram"><bpmndi:BPMNPlane id="Plane" bpmnElement="C"><bpmndi:BPMNShape id="PoolDI" bpmnElement="Pool" isHorizontal="${horizontal}"><dc:Bounds x="20" y="20" width="600" height="300"/></bpmndi:BPMNShape><bpmndi:BPMNShape id="ADI" bpmnElement="A"><dc:Bounds x="100" y="100" width="100" height="80"/></bpmndi:BPMNShape><bpmndi:BPMNShape id="BDI" bpmnElement="B"><dc:Bounds x="400" y="100" width="100" height="80"/></bpmndi:BPMNShape><bpmndi:BPMNEdge id="FlowDI" bpmnElement="Flow">${[[200,140],[250,140],[250,250],[35,250],[35,40],[350,40],[350,140],[400,140]].map(([x,y])=>`<di:waypoint x="${x}" y="${y}"/>`).join('')}</bpmndi:BPMNEdge></bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>`;
    const result=await optimizeReviewLayout(xml);
    assert.equal(result.before.crossings,0);
    assert.ok(result.before.titleIntrusion>0);
    assert.equal(result.after.titleIntrusion,0);
    assert.equal(result.after.labelOnLine,0);
    const {rootElement}=await new BpmnModdle().fromXML(result.xml);
    const flow=rootElement.rootElements.find(e=>e.id==='P').flowElements.find(e=>e.id==='Flow');
    assert.equal(flow.sourceRef.id,'A'); assert.equal(flow.targetRef.id,'B');
  }
});

test('portable layout retains extension data and original semantics across supported BPMN constructs', async () => {
  for (const name of ['evidence', 'nested', 'collaboration', 'compensation']) {
    const xml=await readFile(new URL(`fixtures/${name}.bpmn`,import.meta.url),'utf8');
    const rendered=await diagramViews(xml);
    assert.equal(await withoutDi(rendered.bpmnXml),await withoutDi(xml),`${name}: no semantic or extension changes`);
  }
});

test('a message between two nested scopes appears at both ends with exact original endpoints available', async () => {
  const process = (id, task, kind) => `<bpmn:process id="${id}"><bpmn:startEvent id="${id}Start"/><bpmn:subProcess id="${id}Detail" name="${id} work"><bpmn:startEvent id="${id}InnerStart"/><bpmn:${kind} id="${task}" name="${task}"/><bpmn:endEvent id="${id}InnerEnd"/><bpmn:sequenceFlow id="${id}I1" sourceRef="${id}InnerStart" targetRef="${task}"/><bpmn:sequenceFlow id="${id}I2" sourceRef="${task}" targetRef="${id}InnerEnd"/></bpmn:subProcess><bpmn:endEvent id="${id}End"/><bpmn:sequenceFlow id="${id}F1" sourceRef="${id}Start" targetRef="${id}Detail"/><bpmn:sequenceFlow id="${id}F2" sourceRef="${id}Detail" targetRef="${id}End"/></bpmn:process>`;
  const xml = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions" targetNamespace="urn:synthetic"><bpmn:collaboration id="Collaboration"><bpmn:participant id="PoolA" name="Sender organization" processRef="A"/><bpmn:participant id="PoolB" name="Receiver organization" processRef="B"/><bpmn:messageFlow id="Exchange" sourceRef="SendOrder" targetRef="ReceiveOrder" name="Order"/></bpmn:collaboration>${process('A', 'SendOrder', 'sendTask')}${process('B', 'ReceiveOrder', 'receiveTask')}</bpmn:definitions>`;
  const { diagrams, rendering } = await diagramViews(xml);
  assert.equal(rendering.totalMessages, 1); assert.equal(rendering.drawnMessages, 1);
  assert.deepEqual(diagrams[0].messageIds, []);
  for (const [scope, context, local] of [['ADetail', 'PoolB', 'SendOrder'], ['BDetail', 'PoolA', 'ReceiveOrder']]) {
    const view = diagrams.find(v => v.elementId === scope);
    assert.deepEqual(view.messageIds, ['Exchange']); assert.deepEqual(view.contextIds, [context]);
    assert.ok(view.svg.includes(`data-id="${local}"`)); assert.ok(view.svg.includes('data-id="Exchange"'));
    assert.equal(view.layoutCounts.missing, 0);
  }
  assert.ok(xml.includes('sourceRef="SendOrder" targetRef="ReceiveOrder"'));
});

test('empty subprocess details are not exported as blank interactive destinations', async () => {
  const xml = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:synthetic"><bpmn:process id="P"><bpmn:subProcess id="Unknown" name="Still to discover"/></bpmn:process></bpmn:definitions>`;
  const { diagrams } = await diagramViews(xml);
  assert.equal(diagrams.length, 1); assert.deepEqual(diagrams[0].childIds, []);
  assert.ok(diagrams[0].elementIds.includes('Unknown'));
});

test('messages between black-box participants are drawn even without internal tasks', async () => {
  const xml = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:synthetic"><bpmn:collaboration id="Exchange"><bpmn:participant id="Sender" name="Sender"/><bpmn:participant id="Receiver" name="Receiver"/><bpmn:messageFlow id="Message" name="Request" sourceRef="Sender" targetRef="Receiver"/></bpmn:collaboration></bpmn:definitions>`;
  const { diagrams, rendering } = await diagramViews(xml);
  assert.equal(diagrams.length, 1); assert.equal(rendering.drawnMessages, 1);
  assert.ok(diagrams[0].svg.includes('data-id="Message"'));
  assert.deepEqual(rendering.missingMessageIds, []);
});

test('offline viewer data cannot close its script and only the exact trusted script is authorized', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'scribe-viewer-escaping-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const project = await Project.create(path.join(directory, 'project'), { name: 'Synthetic escaping test', purpose: 'Escape untrusted labels', perspective: 'Test' });
  t.after(() => project.close());
  const hostile = '</script><script>globalThis.injected=true</script><img src="https://invalid.example/" onerror="bad()">';
  await project.apply({ expectedRevision: 1, summary: 'Untrusted label fixture', operations: [{ op: 'add', id: 'Task', kind: 'task', name: hostile, in: 'Process_Main' }], sources: [{ id: 'Untrusted', title: hostile, kind: 'document', text: hostile }] });
  const bundle = await exportBundle(project, path.join(directory, 'export'));
  const html = await readFile(path.join(bundle.directory, 'review.html'), 'utf8');
  const scripts = [...html.matchAll(/<script type="text\/javascript">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.ok(!scripts[0][1].includes('</script>'));
  const hash = createHash('sha256').update(scripts[0][1]).digest('base64');
  assert.ok(html.includes(`script-src 'sha256-${hash}'`));
  assert.ok(!html.includes('<script>globalThis.injected=true'));
  assert.ok(!html.includes('<img src="https://invalid.example/"'));
  assert.ok(html.includes('Static diagrams and full-size downloads'));
  assert.ok(html.includes('data:image/svg+xml;base64,'));
});
