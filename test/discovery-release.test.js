import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { Project, assess, exportBundle } from '../src/core/index.js';
import { parseModel, BUSINESS_TYPES, typeOf } from '../src/core/model.js';
import { contentHash } from '../src/core/store.js';

const fixture = name => readFile(new URL(`fixtures/${name}.bpmn`, import.meta.url), 'utf8');
const example = async name => JSON.parse(await readFile(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
const change = (p, extra = {}) => ({ expectedRevision: p.read().revision, summary: 'Synthetic regression change', ...extra });
async function setup(t, booking = false) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'process-scribe-release-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const p = await Project.create(path.join(dir, 'project'), { name: 'Synthetic review', purpose: 'Verify discovery behavior', perspective: 'Test participant', sources: [{ id: 'Source_Transcript', title: 'Synthetic transcript', kind: 'transcript', text: await readFile(new URL('../examples/transcript.txt', import.meta.url), 'utf8') }] });
  t.after(() => p.close());
  if (booking) { await p.apply(await example('01-discover')); await p.apply(await example('02-answer-and-model')); }
  return { p, dir };
}
async function approveFixture(p) {
  for (const aspect of ['semantic', 'behavioral', 'pragmatic'])
    await p.review({ expectedRevision: p.read().revision, aspect, outcome: 'approved', reviewer: 'Synthetic regression reviewer', notes: 'Fixture-only feedback; not approval of a real process.' });
}
async function supportFixture(p) {
  const elements = (await parseModel(p.read().xml)).elements.filter(e => e.$instanceOf?.('bpmn:FlowNode') || BUSINESS_TYPES.has(typeOf(e)));
  await p.apply(change(p, {
    context: { trigger: 'Synthetic trigger', outcomes: ['Synthetic outcome'] },
    sources: [{ id: 'Fixture', title: 'Synthetic BPMN fixture', kind: 'document', text: p.read().xml }],
    claims: elements.map((e, i) => ({ id: `Claim_${i}`, statement: `The synthetic fixture defines ${e.id}`, kind: 'activity', status: 'supported', elementIds: [e.id], evidence: [{ sourceId: 'Fixture', segmentId: `line-${p.read().xml.split('\n').findIndex(line => line.includes(`id="${e.id}"`)) + 1}`, quote: `id="${e.id}"` }] })),
  }));
}

test('conceptual conditions can finalize, while missing or yes/no-only conditions still block', async t => {
  const { p } = await setup(t);
  const xml = (await fixture('branch')).replace(/<bpmn:conditionExpression[\s\S]*?<\/bpmn:conditionExpression>/g, '');
  await p.import({ expectedRevision: 1, summary: 'Conceptual conditions', xml });
  assert.deepEqual((await p.validate()).completeness, []);
  await supportFixture(p); await approveFixture(p);
  assert.equal((await p.finalize(p.read().revision)).status, 'reviewed');
  const missing = await assess({ ...p.read(), xml: xml.replace('name="Approved"', 'name="yes"').replace('name="Changes requested"', '') });
  assert.equal(missing.completeness.filter(f => f.code === 'MISSING_CONDITION').length, 2);
});

test('intentional abstraction exempts only empty ordinary subprocess internals', async t => {
  const { p } = await setup(t);
  const xml = (await fixture('nested')).replace(/      <bpmn:startEvent id="InnerStart"[\s\S]*?    <\/bpmn:subProcess>/, '    </bpmn:subProcess>');
  await p.import({ expectedRevision: 1, summary: 'Overview with unspecified preparation', xml });
  assert.deepEqual((await p.validate()).completeness.map(f => f.code), ['MISSING_START', 'MISSING_END']);
  const abstraction = { id: 'Overview', elementId: 'Prepare', reason: 'The reader needs the preparation outcome, not its internal steps.', inputs: ['Accepted engagement'], outcomes: ['Prepared engagement'] };
  await p.apply(change(p, { abstractions: [abstraction] }));
  assert.deepEqual((await p.validate()).completeness, []);
  await supportFixture(p); await approveFixture(p);
  await p.finalize(p.read().revision);
  await assert.rejects(p.apply(change(p, { abstractions: [{ ...abstraction, id: 'Duplicate' }] })), { code: 'DUPLICATE_ABSTRACTION' });
  await assert.rejects(p.import({ expectedRevision: p.read().revision, summary: 'Details without removing abstraction', xml: await fixture('nested') }), { code: 'INVALID_ABSTRACTION' });
  await p.apply(change(p, { removeAbstractionIds: ['Overview'] }));
  assert.ok((await p.validate()).blockers.some(f => f.code === 'MISSING_START'));
});

test('compensation uses associations without hiding broken handlers or disconnected ordinary work', async t => {
  const { p } = await setup(t);
  const xml = await fixture('compensation');
  await p.import({ expectedRevision: 1, summary: 'Compensation fixture', xml });
  assert.deepEqual((await p.validate()).completeness, []);
  await supportFixture(p); await approveFixture(p);
  await p.finalize(p.read().revision);
  const broken = await assess({ ...p.read(), xml: xml.replace(/    <bpmn:association[^>]+\/>/, '') });
  assert.ok(broken.completeness.some(f => f.code === 'COMPENSATION_HANDLER'));
  assert.ok(broken.completeness.some(f => f.code === 'UNLINKED_COMPENSATION'));
  const extraFlow = xml.replace('</bpmn:process>', '<bpmn:sequenceFlow id="InvalidFlow" sourceRef="UndoReserve" targetRef="End" /></bpmn:process>');
  assert.ok((await assess({ ...p.read(), xml: extraFlow })).structural.findings.some(f => f.code === 'COMPENSATION_SEQUENCE'));
  const disconnected = xml.replace('</bpmn:process>', '<bpmn:task id="Forgotten" name="Check request" /></bpmn:process>');
  assert.ok((await assess({ ...p.read(), xml: disconnected })).completeness.some(f => f.code === 'NO_START_PATH' && f.elements.includes('Forgotten')));
});

test('walkthrough binding detects changes, rejects invented links, and can be refreshed without needless revisions', async t => {
  const { p, dir } = await setup(t, true);
  const proposal = await example('03-review-context');
  await p.apply(proposal);
  assert.equal((await p.validate()).walkthrough.status, 'current');
  const repeat = await p.apply(change(p, { walkthrough: proposal.walkthrough }));
  assert.equal(repeat.unchanged, true);
  await assert.rejects(p.apply(change(p, { walkthrough: { steps: [{ id: 'Bad', text: 'Invented link', elementIds: ['Missing'] }] } })), { code: 'DANGLING_EVIDENCE' });
  await p.apply(change(p, { context: { scopeNotes: 'Changed intended coverage' } }));
  assert.equal((await p.validate()).walkthrough.status, 'stale');
  assert.ok((await p.validate()).blockers.some(f => f.code === 'STALE_WALKTHROUGH'));
  const bundle = await exportBundle(p, path.join(dir, 'stale'));
  assert.match(await readFile(path.join(bundle.directory, 'review.html'), 'utf8'), /Previous walkthrough — out of date/);
  await p.apply(change(p, { walkthrough: proposal.walkthrough }));
  assert.equal((await p.validate()).walkthrough.status, 'current');
  await p.apply(change(p, { walkthrough: null }));
  assert.equal((await p.validate()).walkthrough.status, 'missing');
});

test('conflicting practice and policy remain separate, retain attribution, and require evidenced resolution', async t => {
  const { p, dir } = await setup(t);
  const sources = [
    { id: 'Interview', title: 'Synthetic clerk interview', kind: 'transcript', contributor: 'Clerk', collectedOn: '2026-10-27', period: 'Current booking practice', origin: 'Synthetic case', coverage: 'Scheduling only', text: 'I schedule before the deposit arrives.' },
    { id: 'Policy', title: 'Synthetic booking policy', kind: 'document', text: 'The deposit must arrive before scheduling.' },
  ];
  const claims = sources.map((s, i) => ({ id: `C_${s.id}`, statement: s.text, kind: 'order', status: 'supported', evidence: [{ sourceId: s.id, segmentId: 'line-1', quote: s.text, basis: i ? 'prescribed' : 'reported' }] }));
  const conflict = { id: 'OrderConflict', description: 'Policy and reported scheduling differ', claimIds: claims.map(c => c.id), status: 'open' };
  await p.apply(change(p, { sources, claims, conflicts: [conflict], stakeholders: [{ id: 'Clerk', role: 'Clerk', scope: 'Scheduling', status: 'consulted', sourceIds: ['Interview'] }] }));
  assert.ok((await p.validate()).blockers.some(f => f.code === 'CONFLICTING_EVIDENCE'));
  const before = p.read();
  await assert.rejects(p.apply(change(p, { conflicts: [{ ...conflict, status: 'resolved', resolution: 'Picked the policy' }] })));
  await assert.rejects(p.apply(change(p, { removeClaimIds: ['C_Policy'] })), { code: 'DANGLING_CLAIM' });
  assert.deepEqual(p.read(), before);
  await p.apply(change(p, { sources: [{ id: 'Clarification', title: 'Synthetic clarification', kind: 'answer', text: 'The interview described last year. Current practice follows the policy.' }], conflicts: [{ ...conflict, status: 'resolved', resolution: 'The accounts cover different periods; the diagram uses current practice.', evidence: [{ sourceId: 'Clarification', segmentId: 'line-1', quote: 'Current practice follows the policy.' }] }] }));
  assert.deepEqual((await p.validate()).openConflicts, []);
  const again = new Project(path.join(dir, 'project')); t.after(() => again.close());
  assert.equal(again.read().discovery.sources.find(s => s.id === 'Interview').contributor, 'Clerk');
  assert.equal(again.read().discovery.claims[1].evidence[0].basis, 'prescribed');
});

test('recorded cases require human feedback; revisions invalidate cases and overall reviews together', async t => {
  const { p } = await setup(t, true);
  await p.apply(await example('03-review-context'));
  await approveFixture(p);
  assert.ok((await p.validate()).blockers.some(f => f.code === 'SCENARIO_REVIEW_REQUIRED'));
  await p.reviewScenario({ expectedRevision: p.read().revision, scenarioId: 'Case_Booking', outcome: 'needs_changes', reviewer: 'Synthetic test reviewer', notes: 'Fixture feedback only.' });
  assert.equal((await p.validate()).readyToFinalize, false);
  await p.reviewScenario({ expectedRevision: p.read().revision, scenarioId: 'Case_Booking', outcome: 'confirmed', reviewer: 'Synthetic test reviewer', notes: 'Fixture feedback only.' });
  assert.equal((await p.validate()).walkthrough.status, 'current');
  await p.finalize(p.read().revision);
  const savedReviewRevision = p.read().revision;
  await p.apply(change(p, { operations: [{ op: 'set', id: 'Task_Deposit', values: { name: 'Receive deposit' } }] }));
  assert.equal((await p.validate()).scenarios[0].review, null);
  assert.equal((await p.validate()).reviews.semantic, null);
  assert.equal(p.read(savedReviewRevision).scenarioReviews.Case_Booking.outcome, 'confirmed');
  assert.equal((await p.validate()).walkthrough.status, 'stale');
});

test('legacy snapshots are read and exported without rewriting history; old profile feedback is not reused', async t => {
  const { p, dir } = await setup(t, true);
  const legacy = structuredClone(p.read());
  legacy.formatVersion = 1;
  delete legacy.discovery.context.profile;
  for (const key of ['abstractions', 'conflicts', 'stakeholders', 'scenarios']) delete legacy.discovery[key];
  delete legacy.scenarioReviews;
  legacy.reviews.semantic = { aspect: 'semantic', outcome: 'approved', reviewer: 'Legacy fixture', notes: 'Synthetic feedback', contentHash: contentHash(legacy) };
  p.store.append(p.read().revision, legacy, 'Synthetic legacy snapshot');
  const saved = p.read(), count = p.history().length;
  const again = new Project(path.join(dir, 'project')); t.after(() => again.close());
  assert.deepEqual(again.read(), saved);
  assert.equal((await again.validate()).reviews.semantic, null);
  await exportBundle(again, path.join(dir, 'legacy-export'));
  assert.equal(again.history().length, count);
  await again.apply(change(again, { context: { audience: 'Process participant' } }));
  assert.equal(again.read().formatVersion, 2);
  assert.deepEqual(again.read(saved.revision), saved);
});

test('answer excerpts are checked and shown in place, with readable model changes', async t => {
  const { p, dir } = await setup(t, true);
  const q = p.read().discovery.questions[0];
  await assert.rejects(p.apply(change(p, { questions: [{ ...q, answerEvidence: [{ sourceId: 'Source_Answer', segmentId: 'line-1', quote: 'An invented answer.' }] }] })), { code: 'INVALID_EVIDENCE' });
  await p.apply(change(p, { questions: [{ ...q, answerEvidence: [{ sourceId: 'Source_Answer', segmentId: 'line-1', quote: 'The deposit must arrive before scheduling.' }] }] }));
  const bundle = await exportBundle(p, path.join(dir, 'answers'));
  const html = await readFile(path.join(bundle.directory, 'review.html'), 'utf8');
  const questions = html.split('<section id="questions">')[1].split('</section>')[0];
  assert.match(questions, /The deposit must arrive before scheduling\./);
  assert.ok(!questions.includes('Booking is complete once the work is scheduled.'));
  assert.ok(!questions.includes('answered · resolved'));
  const diff = await p.diff(2, 3);
  assert.ok(diff.model.descriptions.some(d => d.includes('Collect deposit') && d.includes('Schedule work')));
});

test('all available subprocess diagram planes appear in the export', async t => {
  const { p, dir } = await setup(t);
  const plane = (root, nodes, edges) => `<bpmndi:BPMNDiagram id="Diagram_${root}"><bpmndi:BPMNPlane id="Plane_${root}" bpmnElement="${root}">${nodes.map((id, i) => `<bpmndi:BPMNShape id="Shape_${id}" bpmnElement="${id}"${id === 'Prepare' ? ' isExpanded="false"' : ''}><dc:Bounds x="${50 + i * 180}" y="80" width="${id.includes('Start') || id.includes('End') ? 36 : 100}" height="80" /></bpmndi:BPMNShape>`).join('')}${edges.map((id, i) => `<bpmndi:BPMNEdge id="Edge_${id}" bpmnElement="${id}"><di:waypoint x="${150 + i * 180}" y="120"/><di:waypoint x="${230 + i * 180}" y="120"/></bpmndi:BPMNEdge>`).join('')}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>`;
  let xml = (await fixture('nested')).replace('targetNamespace=', 'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" targetNamespace=');
  xml = xml.replace('</bpmn:definitions>', plane('nested', ['Start', 'Prepare', 'End'], ['F_1', 'F_2']) + plane('Prepare', ['InnerStart', 'Draft', 'InnerEnd'], ['InnerF1', 'InnerF2']) + '</bpmn:definitions>');
  await p.import({ expectedRevision: 1, summary: 'Synthetic overview and child diagram', xml });
  const bundle = await exportBundle(p, path.join(dir, 'hierarchy'));
  const diagrams = JSON.parse(await readFile(path.join(bundle.directory, 'diagrams.json'), 'utf8'));
  assert.equal(diagrams.length, 2);
  assert.deepEqual(diagrams.map(d => d.elementId), ['nested', 'Prepare']);
  assert.match(await readFile(path.join(bundle.directory, 'diagram-2.svg'), 'utf8'), /Draft/);
  assert.match(await readFile(path.join(bundle.directory, 'review.html'), 'utf8'), /diagram-2.svg/);
});

test('multi-instance markers and non-interrupting timer semantics survive revisions', async t => {
  const { p } = await setup(t);
  const xml = (await fixture('collaboration')).replace('<bpmn:task id="Book" name="Book engagement">', '<bpmn:task id="Book" name="Book engagement"><bpmn:multiInstanceLoopCharacteristics isSequential="false"><bpmn:loopCardinality xsi:type="bpmn:tFormalExpression">3</bpmn:loopCardinality></bpmn:multiInstanceLoopCharacteristics>');
  await p.import({ expectedRevision: 1, summary: 'Synthetic repeated booking work', xml });
  await p.apply(change(p, { operations: [{ op: 'set', id: 'Book', values: { name: 'Schedule each engagement' } }] }));
  const elements = (await parseModel(p.read().xml)).elements;
  assert.equal(elements.find(e => e.id === 'Book').loopCharacteristics.loopCardinality.body, '3');
  assert.equal(elements.find(e => e.id === 'Book').loopCharacteristics.isSequential, false);
  assert.equal(elements.find(e => e.id === 'Timer').cancelActivity, false);
  assert.deepEqual((await p.validate()).completeness, []);
});

test('scenario CLI records feedback and reports unknown IDs without appending', async t => {
  const { p, dir } = await setup(t, true);
  await p.apply(await example('03-review-context'));
  const cli = (...args) => spawnSync(process.execPath, ['bin/process-scribe.js', '--project', path.join(dir, 'project'), 'review-scenario', '--expected-revision', String(p.read().revision), '--outcome', 'confirmed', '--reviewer', 'Synthetic test reviewer', '--notes', 'Fixture-only feedback.', ...args], { encoding: 'utf8' });
  const missing = cli('--scenario', 'Missing');
  assert.equal(missing.status, 1);
  assert.equal(p.read().revision, 4);
  const good = cli('--scenario', 'Case_Booking');
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).review.outcome, 'confirmed');
  assert.equal(p.read().revision, 5);
});
