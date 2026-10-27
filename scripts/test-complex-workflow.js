import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onboardingProposals } from '../examples/complex-onboarding/proposals.js';
import { parseModel } from '../src/model.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await mkdir(path.join(root, 'output'), { recursive: true });
const directory = await mkdtemp(path.join(root, 'output', 'complex-onboarding-'));
const project = path.join(directory, 'project');
const inputs = path.join(directory, 'inputs');
await mkdir(inputs);
const { proposals, texts } = await onboardingProposals();
for (const [id, text] of Object.entries(texts)) await writeFile(path.join(inputs, `${id}.txt`), text);
const cli = (args, expectedExit = 0) => {
  const result = spawnSync(process.execPath, [path.join(root, 'bin/process-scribe.js'), '--project', project, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
  assert.equal(result.status, expectedExit, `CLI ${args[0]}: ${result.stderr || result.stdout}`);
  return JSON.parse(expectedExit === 1 ? result.stderr.trim().split('\n').at(-1) : result.stdout);
};
const persist = (name, data) => writeFile(path.join(directory, name), JSON.stringify(data, null, 2));
console.log(`Workflow output: ${directory}`);
const initial = cli(['init', '--name', 'Brightline client onboarding — synthetic test', '--purpose', 'Test transcript discovery and three clarification rounds', '--perspective', 'Brightline Studio', '--transcript', path.join(inputs, 'Source_Transcript.txt')]);
assert.equal(initial.revision, 1);
const rounds = [], snapshots = [];
for (const [index, proposal] of proposals.entries()) {
  const name = ['00-initial-draft', '01-parallel-readiness', '02-cancellations', '03-variants-and-handover'][index];
  const file = path.join(inputs, `${name}.json`);
  await writeFile(file, JSON.stringify(proposal, null, 2));
  const result = cli(['apply', '--file', file]);
  await persist(`${name}-apply.json`, result);
  const snapshot = cli(['inspect']);
  const quality = cli(['validate']);
  assert.equal(snapshot.revision, index + 2);
  assert.equal(quality.structural.passed, true);
  assert.equal(quality.walkthrough.status, 'current');
  assert.equal(snapshot.status, 'draft');
  assert.deepEqual(snapshot.reviews, {});
  assert.deepEqual(snapshot.scenarioReviews, {});
  assert.equal(quality.evidence.unresolvedQuestions.length, [7, 5, 4, 0][index]);
  assert.equal(snapshot.discovery.sources.length, index + 2);
  // A separate CLI process reopens the database for inspect, validate, diff and export.
  const bundle = cli(['export', '--out', path.join(directory, name)]);
  const diagrams = JSON.parse(await readFile(path.join(bundle.directory, 'diagrams.json'), 'utf8'));
  const diff = cli(['diff', '--from', String(proposal.expectedRevision)]);
  await persist(`${name}-diff.json`, diff);
  assert.deepEqual(diff.model.removed, [], 'Clarification should preserve existing element identities in this fixture.');
  const record = { round: index, name, revision: snapshot.revision, modelElements: snapshot.model.length, diagrams: diagrams.length, questions: quality.evidence.unresolvedQuestions.length, incompletePaths: quality.completeness.length, uncoveredElements: quality.evidence.uncoveredElements.length, uncertainClaims: quality.evidence.uncertainClaims.length, conflicts: quality.openConflicts.length, readability: quality.readability.findings, review: path.join(bundle.directory, 'review.html') };
  rounds.push(record); snapshots.push(snapshot);
  console.log(JSON.stringify({ round: index, revision: record.revision, questions: record.questions, incompletePaths: record.incompletePaths, diagrams: record.diagrams, review: record.review }));
}

const finalDirectory = path.join(directory, rounds.at(-1).name);
const final = snapshots.at(-1);
const quality = JSON.parse(await readFile(path.join(finalDirectory, 'quality.json'), 'utf8'));
assert.deepEqual(quality.completeness, []);
assert.deepEqual(quality.evidence.uncoveredElements, []);
assert.deepEqual(quality.evidence.uncertainClaims, []);
assert.deepEqual(quality.openConflicts, []);
assert.equal(quality.readyToFinalize, false);
assert.equal(quality.behavioral.provedSound, false);
assert.ok(quality.blockers.every(b => ['REVIEW_REQUIRED', 'SCENARIO_REVIEW_REQUIRED'].includes(b.code)));
assert.equal(final.discovery.scenarios.length, 12);
assert.equal(final.discovery.sources.find(s => s.id === 'Source_Transcript').text, texts.Source_Transcript);
for (const snapshot of snapshots.slice(0, -1)) {
  const oldIds = snapshot.model.map(e => e.id);
  assert.ok(oldIds.every(id => final.model.some(e => e.id === id)));
}
const { elements } = await parseModel(await readFile(path.join(finalDirectory, 'model.bpmn'), 'utf8'));
const byId = new Map(elements.map(e => [e.id, e]));
const edges = elements.filter(e => e.$type === 'bpmn:SequenceFlow');
const findings = [];
const check = (name, verify) => { verify(); findings.push({ name, result: 'passed' }); };
const pathExists = (...ids) => {
  for (let i = 1; i < ids.length; i++) assert.ok(edges.some(f => f.sourceRef.id === ids[i - 1] && f.targetRef.id === ids[i]), `Missing sequence ${ids[i - 1]} -> ${ids[i]}`);
};
check('Incomplete packs loop back to the actual check', () => {
  pathExists('CheckPack', 'PackDecision', 'RequestItems', 'WaitPack', 'IntakeMerge', 'CheckPack');
  assert.equal(byId.get('F_PackComplete').name, 'All required items present');
});
check('Finance and Delivery split and join in the same readiness scope', () => {
  assert.equal(byId.get('ReadySplit').$type, 'bpmn:ParallelGateway');
  assert.equal(byId.get('ReadyJoin').$type, 'bpmn:ParallelGateway');
  pathExists('ReadyStart', 'ReadySplit', 'FinanceWork', 'ReadyJoin', 'ReadyEnd');
  pathExists('ReadySplit', 'PlanWork', 'ReadyJoin');
  assert.deepEqual(edges.filter(f => f.targetRef.id === 'Workspace').map(f => f.sourceRef.id), ['Readiness']);
});
check('Credit terms bypass the deposit but still record financial clearance', () => {
  pathExists('FinanceStart', 'CheckCredit', 'CreditDecision', 'FinanceMerge', 'Clearance', 'FinanceEnd');
  pathExists('CreditDecision', 'Invoice', 'WaitDeposit', 'FinanceMerge');
  assert.equal(byId.get('F_CreditApproved').name, 'Finance-approved credit terms');
  assert.equal(byId.get('F_DepositRequired').name, 'No approved credit terms');
});
check('The payment reminder is a one-off noninterrupting timer on the deposit wait', () => {
  const event = byId.get('PaymentReminder');
  assert.equal(event.attachedToRef.id, 'WaitDeposit');
  assert.equal(event.cancelActivity, false);
  assert.equal(event.eventDefinitions[0].timeDuration.body, 'P7D');
  assert.equal(event.eventDefinitions[0].timeCycle, undefined);
  pathExists('PaymentReminder', 'SendReminder', 'ReminderEnd');
  assert.equal(byId.get('ReminderEnd').eventDefinitions?.length || 0, 0, 'A reminder must not terminate the finance scope.');
});
check('Deadline and withdrawal interrupt the enclosing readiness scope, not one parallel branch', () => {
  const deadline = byId.get('ReadinessDeadline'), withdrawal = byId.get('ClientWithdrawal');
  assert.equal(deadline.attachedToRef.id, 'Readiness'); assert.equal(deadline.cancelActivity, true);
  assert.equal(deadline.eventDefinitions[0].timeDuration.body, 'P14D');
  assert.equal(withdrawal.attachedToRef.id, 'Readiness'); assert.equal(withdrawal.cancelActivity, true);
  assert.equal(withdrawal.eventDefinitions[0].$type, 'bpmn:MessageEventDefinition');
  pathExists('ReadinessDeadline', 'CancelMerge', 'CheckDeposit'); pathExists('ClientWithdrawal', 'CancelMerge');
});
check('Cancellation refunds only a received deposit and reaches its own outcome', () => {
  pathExists('CheckDeposit', 'RefundDecision', 'RefundDeposit', 'RefundMerge', 'ReleaseSlot', 'RecordCancellation', 'Canceled');
  pathExists('RefundDecision', 'RefundMerge');
  assert.equal(byId.get('F_RefundRequired').name, 'Deposit received');
  assert.equal(byId.get('F_NoRefund').name, 'No deposit received');
});
check('Requested plan changes rejoin sending, and silence remains at the receive task', () => {
  pathExists('SendPlan', 'WaitPlan', 'PlanDecision', 'RevisePlan', 'PlanMerge', 'SendPlan');
  assert.equal(byId.get('WaitPlan').$type, 'bpmn:ReceiveTask');
  assert.equal(byId.get('F_PlanApproved').name, 'Client explicitly approves');
});
check('Access failures force correction and a full retest before successful completion', () => {
  pathExists('TestAccess', 'AccessDecision', 'CorrectAccess', 'AccessMerge', 'TestAccess');
  assert.equal(byId.get('F_AccessPassed').name, 'All named users pass');
  assert.equal(byId.get('F_AccessFailed').name, 'Any named user fails');
});
check('Handover requires Client Success acceptance before record closure', () => {
  pathExists('Workspace', 'Kickoff', 'SendHandover', 'AcceptHandover', 'CloseRecord', 'HandedOver');
  assert.deepEqual(byId.get('ClientSuccess').flowNodeRef.map(n => n.id), ['AcceptHandover']);
});
check('Client is a black box; internal role handoffs remain sequence flows', () => {
  assert.equal(byId.get('Client').processRef, undefined);
  for (const message of elements.filter(e => e.$type === 'bpmn:MessageFlow'))
    assert.ok(message.sourceRef.id === 'Client' || message.targetRef.id === 'Client');
});
check('All answers select source excerpts and preserve the historical policy conflict resolution', () => {
  for (const q of final.discovery.questions) { assert.equal(q.status, 'answered'); assert.ok(q.answerEvidence.length); }
  assert.equal(final.discovery.conflicts[0].status, 'resolved');
  assert.equal(final.discovery.sources.find(s => s.id === 'Policy').text, texts.Policy);
});

// Negative replay checks: the stored project must remain byte-for-byte unchanged.
const before = cli(['inspect']);
const staleFile = path.join(inputs, 'rejected-stale-update.json');
await writeFile(staleFile, JSON.stringify({ expectedRevision: 2, summary: 'Reject a stale edit from an earlier clarification', operations: [{ op: 'set', id: 'Kickoff', values: { name: 'Should not be saved' } }] }));
assert.equal(cli(['apply', '--file', staleFile], 1).error.code, 'STALE_REVISION');
assert.deepEqual(cli(['inspect']), before);
const invalidFile = path.join(inputs, 'rejected-invalid-batch.json');
await writeFile(invalidFile, JSON.stringify({ expectedRevision: final.revision, summary: 'Reject a partially valid batch atomically', operations: [{ op: 'set', id: 'Kickoff', values: { name: 'Should not be saved' } }, { op: 'connect', source: 'Kickoff', target: 'MissingNode' }] }));
assert.ok(cli(['apply', '--file', invalidFile], 1).error);
assert.deepEqual(cli(['inspect']), before);
findings.push({ name: 'Stale revisions and a partially invalid batch leave the saved model unchanged', result: 'passed' });

const finalViews = JSON.parse(await readFile(path.join(finalDirectory, 'diagrams.json'), 'utf8'));
assert.equal(finalViews.length, 6);
assert.deepEqual(quality.rendering.missingMessageIds, []);
const drawnMessages = new Set();
for (const view of finalViews) {
  assert.equal(view.layoutCounts.missing, 0);
  const svg = await readFile(path.join(finalDirectory, view.file), 'utf8');
  for (const id of view.messageIds) { assert.ok(svg.includes(`data-id="${id}"`)); drawnMessages.add(id); }
}
assert.deepEqual([...drawnMessages].sort(), elements.filter(e => e.$type === 'bpmn:MessageFlow').map(e => e.id).sort());
assert.deepEqual(cli(['inspect']), before, 'Rendering must not create a model revision or alter evidence.');
await persist('drawing-coverage.json', quality.rendering);
findings.push({ name: 'All eight message flows are drawn across six small context views without altering the saved project', result: 'passed' });
await persist('results.json', { directory, project, rounds, checks: findings, scenarioCount: final.discovery.scenarios.length, rendering: quality.rendering, note: 'Deterministic CLI replay of agent-authored synthetic discovery decisions. Checks inspect graph structure, BPMN event attributes, evidence and persistence; they are not BPMN execution, an independent LLM benchmark, or human process-owner approval.' });
const table = rounds.map(r => `| ${r.round} | ${r.revision} | ${r.questions} | ${r.incompletePaths} | ${r.uncertainClaims} | ${r.conflicts} | ${r.diagrams} |`).join('\n');
const report = `# Complex onboarding workflow test\n\nOriginal synthetic interview and three scripted clarification rounds. No real client data or human approvals. The fixture decisions were authored while applying the Process Scribe skill; the replay is deterministic, not an independent test of another LLM.\n\n## Saved versions\n\n${rounds.map(r => `- [Round ${r.round}: ${r.name}](./${r.name}/review.html) — revision ${r.revision}`).join('\n')}\n\n| Round | Revision | Open questions | Completeness findings | Uncertain claims | Open conflicts | Diagram views |\n| --- | --- | --- | --- | --- | --- | --- |\n${table}\n\nThe initial drafts intentionally expose missing information. The final draft has no structural or completeness findings, no uncovered business elements, no uncertain claims, and all seven questions answered. All sources and earlier element IDs survive. Twelve case scenarios remain available for human walkthrough.\n\n## Verified against the saved BPMN\n\n${findings.map(f => `- Passed: ${f.name}.`).join('\n')}\n\nEvery command opens the project in a separate process, exercising persistence between rounds. Each round saves its proposal, validation, changes, BPMN, SVGs and review page. The actual answers use selected passages from immutable sources.\n\n## Findings and limits\n\n**All eight message flows are visible across six small context views.** Each message is drawn next to its actual local task, with the outside participant shown for context. The interactive review supports subprocess navigation, zoom/pan, search, message jumps and evidence inspection. Parent diagrams link to nested exchanges. The saved BPMN and evidence remain unchanged by rendering. See [drawing coverage](./drawing-coverage.json). Layout crossings and line-label advisories still need visual assessment.\n\n**Miragon cannot create lanes inside subprocesses.** The overview uses internal role lanes; the readiness detail names Finance and Delivery explicitly in subprocess titles, with responsibility evidence and a written walkthrough. The client remains a black-box participant.\n\nThese are graph, event-property and application checks, not a general token simulation or proof of soundness. No semantic, behavioral or clarity approvals were entered. The final model deliberately remains a draft awaiting genuine human feedback. BPMN timer races and external bank/client behavior are outside this test's execution coverage. Browser screenshots and interaction evidence are kept outside the source checkout.\n\n## Reproduce\n\nRun \`npm run test:workflow\` from the checkout with Node 24. Each run creates a new ignored output directory and preserves earlier runs. Inspect the [final BPMN](./${rounds.at(-1).name}/model.bpmn), [original interview](./inputs/Source_Transcript.txt), [machine-readable results](./results.json), and proposal files in \`inputs/\`.\n`;
await writeFile(path.join(directory, 'REPORT.md'), report);
console.log(`Passed ${findings.length} workflow checks. Report: ${path.join(directory, 'REPORT.md')}`);
