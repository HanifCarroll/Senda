import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { Project, exportBundle } from '../src/index.js';
import { parseModel } from '../src/model.js';

const fixture = name => readFile(new URL(`fixtures/${name}.bpmn`, import.meta.url), 'utf8');
const example = async name => JSON.parse(await readFile(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
async function setup(t, modeled = false) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'process-scribe-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const p = await Project.create(path.join(dir, 'project'), { name: 'Booking', purpose: 'Document booking', perspective: 'Freelancer', sources: [{ id: 'Source_Transcript', title: 'Synthetic interview', kind: 'transcript', text: await readFile(new URL('../examples/transcript.txt', import.meta.url), 'utf8') }] });
  t.after(() => p.close());
  if (modeled) { await p.apply(await example('01-discover')); await p.apply(await example('02-answer-and-model')); }
  return { p, dir };
}
const proposal = (p, extra = {}) => ({ expectedRevision: p.read().revision, summary: 'Test change', ...extra });

test('ambiguity remains unmodeled until the answer; all evidence survives reopening', async t => {
  const { p, dir } = await setup(t);
  await p.apply(await example('01-discover'));
  assert.equal((await p.inspect()).model.filter(e => e.type === 'bpmn:SequenceFlow').length, 0);
  assert.equal(p.read().discovery.claims.find(c => c.id === 'C_Order').status, 'unknown');
  assert.ok((await p.validate()).blockers.some(b => b.code === 'UNCERTAIN_CLAIMS'));
  assert.ok((await p.validate()).blockers.some(b => b.code === 'OPEN_QUESTIONS'));
  await p.apply(await example('02-answer-and-model'));
  const again = new Project(path.join(dir, 'project')); t.after(() => again.close());
  const q = await again.validate();
  assert.equal(again.read().revision, 3);
  assert.deepEqual(q.evidence.uncoveredElements, []);
  assert.deepEqual(q.evidence.uncertainClaims, []);
  assert.deepEqual(q.evidence.unresolvedQuestions, []);
  assert.deepEqual(q.completeness, []);
  assert.equal(q.structural.passed, true);
  assert.equal(q.behavioral.provedSound, false);
  assert.equal(q.readyToFinalize, false);
  assert.equal(again.read().discovery.claims.find(c => c.id === 'C_Reminders').state, 'proposed');
  assert.ok(!(await again.inspect()).model.some(e => /reminder/i.test(e.name || '')));
});

test('bad quote and failed operation batches leave model and metadata unchanged', async t => {
  const { p } = await setup(t, true);
  const original = p.read();
  await assert.rejects(p.apply(proposal(p, { claims: [{ ...original.discovery.claims[0], evidence: [{ sourceId: 'Source_Transcript', segmentId: 'line-1', quote: 'invented statement' }] }], operations: [{ op: 'set', id: 'Task_Deposit', values: { name: 'Changed name' } }] })), { code: 'INVALID_EVIDENCE' });
  await assert.rejects(p.apply(proposal(p, { context: { scopeNotes: 'Must not save' }, operations: [{ op: 'set', id: 'Task_Deposit', values: { name: 'Changed name' } }, { op: 'connect', source: 'Task_Deposit', target: 'Missing' }] })));
  assert.deepEqual(p.read(), original);
  assert.equal(p.history().length, 3);
});

test('stale writers cannot append over a newer revision', async t => {
  const { p, dir } = await setup(t);
  const second = new Project(path.join(dir, 'project')); t.after(() => second.close());
  const stale = proposal(second, { context: { scopeNotes: 'Stale edit' } });
  await p.apply(proposal(p, { context: { scopeNotes: 'Fresh edit' } }));
  await assert.rejects(second.apply(stale), { code: 'STALE_REVISION' });
  // Also exercise the compare-and-swap inside the write transaction itself.
  assert.throws(() => second.store.append(1, second.read(), 'stale direct append'), { code: 'STALE_REVISION' });
  assert.equal(second.read().discovery.context.scopeNotes, 'Fresh edit');
});

test('sources are immutable, proposed behavior cannot enter a current diagram, and deleted elements cannot retain claims', async t => {
  const { p } = await setup(t, true);
  await assert.rejects(p.apply(proposal(p, { sources: [{ id: 'Source_Transcript', title: 'Replacement', kind: 'transcript', text: 'Changed' }] })), { code: 'IMMUTABLE_SOURCE' });
  await assert.rejects(p.apply(proposal(p, { claims: [{ ...p.read().discovery.claims.find(c => c.id === 'C_Reminders'), elementIds: ['Task_Deposit'] }] })), { code: 'MIXED_PROCESS_STATE' });
  await assert.rejects(p.apply(proposal(p, { operations: [{ op: 'remove', ids: ['Task_Deposit'] }] })), { code: 'DANGLING_EVIDENCE' });
  assert.equal(p.read().revision, 3);
});

test('reviews bind to exact content, finalization is gated, and later edits invalidate all reviews', async t => {
  const { p } = await setup(t, true);
  await assert.rejects(p.finalize(3), { code: 'REVIEW_INCOMPLETE' });
  for (const aspect of ['semantic','behavioral','pragmatic']) await p.review({ expectedRevision: p.read().revision, aspect, outcome: 'approved', reviewer: 'Synthetic test reviewer', notes: 'Synthetic fixture approval for testing only.' });
  assert.equal((await p.validate()).readyToFinalize, true);
  await p.finalize(p.read().revision);
  assert.equal(p.read().status, 'reviewed');
  const before = p.read().revision;
  const result = await p.apply(proposal(p));
  assert.equal(result.unchanged, true);
  assert.equal(p.read().revision, before);
  assert.equal(p.read().status, 'reviewed');
  await p.apply(proposal(p, { context: { scopeNotes: 'New scope requires review' } }));
  assert.equal(p.read().status, 'draft');
  assert.deepEqual(p.read().reviews, {});
  assert.equal((await p.validate()).readyToFinalize, false);
});

test('import rejects duplicate IDs and unresolved references without storing them', async t => {
  const { p } = await setup(t);
  for (const name of ['duplicate','dangling']) await assert.rejects(p.import({ expectedRevision: 1, summary: 'Bad import', xml: await fixture(name) }));
  assert.equal(p.read().revision, 1);
});

test('book-based gateway convention and deadlock check differ from native Miragon warnings', async t => {
  const { p } = await setup(t);
  await p.import({ expectedRevision: 1, summary: 'Known negative behavior fixture', xml: await fixture('deadlock') });
  const q = await p.validate();
  assert.equal(q.structural.passed, true);
  assert.ok(q.behavioral.findings.some(f => f.code === 'XOR_TO_AND_JOIN'));
  assert.ok(q.overriddenAdvisories.some(f => f.code === 'W_GATEWAY_NAME'));
  assert.ok(!q.readability.findings.some(f => f.code === 'GATEWAY_LABEL_CONVENTION'));
  await assert.rejects(p.finalize(2), { code: 'REVIEW_INCOMPLETE' });
});

test('valid simple, parallel, loop, subprocess and collaboration fixtures retain their structure', async t => {
  for (const name of ['simple','parallel','branch','nested','collaboration']) {
    const { p } = await setup(t);
    await p.import({ expectedRevision: 1, summary: 'Synthetic valid flow', xml: await fixture(name) });
    const q = await p.validate();
    assert.deepEqual(q.behavioral.findings, []);
    assert.deepEqual(q.completeness, []);
    assert.equal(q.structural.passed, true);
    if (name === 'collaboration') {
      const elements = (await parseModel(p.read().xml)).elements;
      assert.equal(elements.find(e => e.id === 'Timer').cancelActivity, false);
      assert.equal(elements.find(e => e.id === 'Timer').eventDefinitions[0].timeDuration.body, 'P7D');
      assert.equal(elements.filter(e => e.$type === 'bpmn:MessageFlow').length, 2);
    }
  }
});

test('generic extension elements and attributes survive a modeled edit', async t => {
  const { p } = await setup(t);
  await p.import({ expectedRevision: 1, summary: 'Synthetic extension fixture', xml: await fixture('evidence') });
  await p.apply(proposal(p, { operations: [{ op: 'set', id: 'Prepare', values: { name: 'Draft proposal' } }] }));
  const xml = p.read().xml;
  assert.match(xml, /transcript:segment-4/);
  assert.match(xml, /camunda:assignee="designer"/);
  assert.match(xml, /Draft proposal/);
});

test('parallel split to exclusive merge is reported without claiming general soundness', async t => {
  const { p } = await setup(t);
  const xml = (await fixture('parallel')).replace(/parallelGateway id="Join"/, 'exclusiveGateway id="Join"').replace(/(<bpmn:exclusiveGateway id="Join"[\s\S]*?)<\/bpmn:parallelGateway>/, '$1</bpmn:exclusiveGateway>');
  await p.import({ expectedRevision: 1, summary: 'Missing synchronization fixture', xml });
  const quality = await p.validate();
  assert.ok(quality.behavioral.findings.some(f => f.code === 'AND_TO_XOR_MERGE'));
  assert.ok(!quality.blockers.some(f => f.code === 'AND_TO_XOR_MERGE'), 'Repeated continuation can be intended; it requires judgment, not an automatic rejection.');
});

test('size guidance counts nodes per scope and remains advisory', async t => {
  const { p } = await setup(t);
  const operations = [{ op: 'add', kind: 'start', id: 'Start', name: 'Request received' }];
  let previous = 'Start';
  for (let i = 0; i < 29; i++) {
    const id = `Task_${i}`;
    operations.push({ op: 'add', kind: 'task', id, name: `Perform activity ${i}`, after: previous });
    previous = id;
  }
  operations.push({ op: 'add', kind: 'end', id: 'End', name: 'Request completed', after: previous });
  await p.apply(proposal(p, { operations }));
  const q = await p.validate();
  assert.ok(q.readability.findings.some(f => f.code === 'CONSIDER_DECOMPOSITION'));
  assert.ok(!q.blockers.some(f => f.code === 'CONSIDER_DECOMPOSITION'));
  assert.equal(q.structural.passed, true);
});

test('export is self-contained, escapes source markup and refuses to overwrite prior output', async t => {
  const { p, dir } = await setup(t, true);
  await p.apply(proposal(p, { sources: [{ id: 'Source_Untrusted', title: '<script>bad()</script>', kind: 'document', text: '<img src=x onerror=bad()> & "test"' }] }));
  const bundle = await exportBundle(p, path.join(dir, 'review'));
  const html = await readFile(path.join(bundle.directory, 'review.html'), 'utf8');
  assert.ok(html.includes('data:image/svg+xml;base64,'));
  assert.ok(html.includes('&lt;img src=x onerror=bad()&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('Content-Security-Policy'));
  assert.equal(await readFile(path.join(bundle.directory, 'model.bpmn'), 'utf8'), p.read().xml);
  await assert.rejects(exportBundle(p, bundle.directory), { code: 'EXPORT_EXISTS' });
  assert.equal(await readFile(path.join(bundle.directory, 'review.html'), 'utf8'), html);
});

test('CLI works across separate processes and returns structured stale-revision errors', async t => {
  const { dir } = await setup(t);
  const projectDir = path.join(dir, 'cli');
  const cli = (...args) => spawnSync(process.execPath, ['bin/process-scribe.js', '--project', projectDir, ...args], { encoding: 'utf8' });
  const init = cli('init', '--name', 'CLI example', '--purpose', 'Test persistence', '--perspective', 'Freelancer', '--transcript', 'examples/transcript.txt');
  assert.equal(init.status, 0, init.stderr);
  assert.equal(JSON.parse(init.stdout).revision, 1);
  assert.equal(cli('apply', '--file', 'examples/01-discover.json').status, 0);
  assert.equal(JSON.parse(cli('inspect').stdout).revision, 2);
  const stale = cli('apply', '--file', 'examples/01-discover.json');
  assert.equal(stale.status, 1);
  assert.ok(stale.stderr.includes('STALE_REVISION'));
  const schemaResult = cli('schema');
  assert.equal(schemaResult.status, 0, schemaResult.stderr);
  assert.ok(JSON.parse(schemaResult.stdout).proposal.properties.expectedRevision);
});

test('revision storage rejects accidental updates and project reinitialization', async t => {
  const { p, dir } = await setup(t);
  assert.throws(() => p.store.db.exec("UPDATE revisions SET summary='changed'"), /immutable/);
  await assert.rejects(Project.create(path.join(dir, 'project'), { name: 'Overwrite', purpose: 'Bad', perspective: 'Test' }), { code: 'PROJECT_EXISTS' });
  assert.equal(p.read().name, 'Booking');
});
