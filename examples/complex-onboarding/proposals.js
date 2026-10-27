// Authored discovery decisions for the synthetic interview. This is a replay fixture,
// not a transcript parser or an LLM evaluation. Evidence is quoted from the inputs.
import { readFile } from 'node:fs/promises';

export async function onboardingProposals() {
  const texts = Object.fromEntries(await Promise.all([
    ['Source_Transcript', 'transcript.txt'], ['Policy', 'historical-checklist.txt'],
    ['Round1', 'round-1.txt'], ['Round2', 'round-2.txt'], ['Round3', 'round-3.txt'],
  ].map(async ([id, file]) => [id, await readFile(new URL(file, import.meta.url), 'utf8')])));
  const ev = (sourceId, excerpt, basis = 'reported') => {
    const lines = texts[sourceId].split('\n');
    const index = lines.findIndex(line => line.includes(excerpt));
    if (index < 0) throw new Error(`Missing evidence in ${sourceId}: ${excerpt}`);
    return { sourceId, segmentId: `line-${index + 1}`, quote: excerpt, basis };
  };
  const source = (id, title, kind = 'answer') => ({ id, title, kind, text: texts[id], origin: 'Original synthetic workflow test', contributor: 'Fictional participants named in the source', collectedOn: '2026-10-27', period: kind === 'document' ? 'Historical test policy' : 'Fictional current practice', coverage: 'Scripted test input; not human validation' });
  const claims = new Map(), questions = new Map(), steps = new Map(), cases = new Map();
  let operations, changedClaims, changedQuestions;
  const begin = () => { operations = []; changedClaims = []; changedQuestions = []; };
  const add = (id, kind, name, container = 'Process_Main', extra = {}) => {
    operations.push({ op: 'add', id, kind, ...(name ? { name } : {}), ...(container ? { in: container } : {}), ...extra }); return id;
  };
  const flow = (id, source, target, name) => { operations.push({ op: 'connect', id, source, target, ...(name ? { name } : {}) }); return id; };
  const claim = (id, statement, kind, elementIds, evidence, status = 'supported') => {
    const value = { id, statement, kind, status, elementIds, evidence }; claims.set(id, value); changedClaims.push(value); return id;
  };
  const group = (id, statement, kind, evidence, build) => {
    const start = operations.length; build();
    return claim(id, statement, kind, operations.slice(start).filter(o => o.op === 'add' || o.op === 'connect').map(o => o.id), evidence);
  };
  const question = (id, text, why, claimIds = [], elementIds = []) => {
    const value = { id, question: text, why, claimIds, elementIds, blocking: true, status: 'open' };
    questions.set(id, value); changedQuestions.push(value);
  };
  const answer = (id, sourceId, excerpts) => {
    const value = { ...questions.get(id), status: 'answered', answerSourceId: sourceId, answerEvidence: excerpts.map(t => ev(sourceId, t)) };
    questions.set(id, value); changedQuestions.push(value);
  };
  const step = (id, text, elementIds, claimIds) => steps.set(id, { id, text, elementIds, claimIds });
  const scenario = (id, title, kind, given, expectedOutcome, elementIds, evidence) => cases.set(id, { id, title, kind, given, expectedOutcome, elementIds, evidence });
  const finish = (expectedRevision, summary, extra = {}) => ({ expectedRevision, summary, stage: 'control-flow', operations, claims: changedClaims, questions: changedQuestions, walkthrough: { steps: [...steps.values()] }, scenarios: [...cases.values()], ...extra });
  const proposals = [];

  begin();
  const roles = ev('Source_Transcript', 'They are internal roles in the same consultancy. I coordinate the work across them. The client is the outside participant, and our exchanges with them are real messages.');
  group('C_Participants', 'Brightline is one internal process; the external client is a black-box participant. Internal roles partition responsibility.', 'responsibility', [roles], () => {
    add('Brightline', 'participant', 'Brightline Studio', null, { process: 'Process_Main' });
    add('Client', 'participant', 'Client', null, { blackBox: true });
    add('Coordinator', 'lane', 'Onboarding coordinator');
    add('Delivery', 'lane', 'Delivery lead');
    add('Engineer', 'lane', 'Technical setup engineer');
  });
  const intakeEvidence = [ev('Source_Transcript', 'My case starts when Sales gives me a signed service order and the handover pack.'), ev('Source_Transcript', 'I check that pack before handing work to Finance or Delivery. If something is missing, I send a request back to the client contact and wait for the corrected pack. Then I check it again.'), ev('Source_Transcript', 'Once all required items are there, the intake part is complete.')];
  group('C_Intake', 'After the signed service order arrives, the coordinator checks the handover pack. Missing items lead to a request, a wait for the corrected pack and another check. A complete pack finishes intake.', 'order', intakeEvidence, () => {
    add('Start', 'startEvent', 'Signed order received', 'Process_Main', { lane: 'Coordinator' });
    add('Intake', 'subProcess', 'Check handover pack', 'Process_Main', { lane: 'Coordinator', collapsed: true });
    flow('F_StartIntake', 'Start', 'Intake');
    add('IntakeStart', 'startEvent', 'Pack received', 'Intake');
    add('IntakeMerge', 'exclusiveGateway', '', 'Intake');
    add('CheckPack', 'task', 'Check required items', 'Intake');
    add('PackDecision', 'exclusiveGateway', '', 'Intake');
    add('RequestItems', 'sendTask', 'Request missing items', 'Intake');
    add('WaitPack', 'receiveTask', 'Receive corrected pack', 'Intake');
    add('IntakeEnd', 'endEvent', 'Handover pack complete', 'Intake');
    flow('F_IntakeBegin', 'IntakeStart', 'IntakeMerge'); flow('F_IntakeCheck', 'IntakeMerge', 'CheckPack');
    flow('F_PackDecision', 'CheckPack', 'PackDecision'); flow('F_PackComplete', 'PackDecision', 'IntakeEnd', 'All required items present');
    flow('F_PackMissing', 'PackDecision', 'RequestItems', 'Required items missing'); flow('F_RequestWait', 'RequestItems', 'WaitPack'); flow('F_PackRepeat', 'WaitPack', 'IntakeMerge');
    flow('M_RequestItems', 'RequestItems', 'Client'); flow('M_CorrectedPack', 'Client', 'WaitPack');
  });
  group('C_ReadinessStage', 'The coordinator hands a complete pack to Finance and Delivery and coordinates their readiness work. Their ordering and detailed gates need clarification.', 'activity', [ev('Source_Transcript', 'I tell Finance and Delivery that the pack is ready. Finance deals with the deposit, and Delivery talks about dates and the plan.'), ev('Source_Transcript', 'I own the onboarding record and coordinate readiness.')], () => {
    add('Readiness', 'subProcess', 'Coordinate readiness', 'Process_Main', { lane: 'Coordinator', collapsed: true });
    flow('F_IntakeReady', 'Intake', 'Readiness');
  });
  group('C_LaterStages', 'The engineer checks workspace access; after access is verified Delivery holds the kickoff, then the coordinator sends the internal handover pack. The completion gate is unknown.', 'order', [ev('Source_Transcript', 'The engineer performs the workspace and access checks. Delivery holds the kickoff after access has been verified.'), ev('Source_Transcript', 'After the kickoff I send the handover pack to Client Success.')], () => {
    add('Workspace', 'subProcess', 'Verify workspace access', 'Process_Main', { lane: 'Engineer', collapsed: true });
    add('Kickoff', 'task', 'Confirm and hold kickoff', 'Process_Main', { lane: 'Delivery' });
    add('SendHandover', 'task', 'Send handover pack', 'Process_Main', { lane: 'Coordinator' });
    flow('F_WorkspaceKickoff', 'Workspace', 'Kickoff'); flow('F_KickoffHandover', 'Kickoff', 'SendHandover');
  });
  claim('C_Policy', 'The earlier written checklist requires a deposit from every client before scheduling; its applicability to current practice is disputed.', 'condition', [], [ev('Policy', 'Every client must pay a deposit before scheduling.', 'prescribed')], 'disputed');
  claim('C_Practice', 'Current practice may allow approved payment terms and provisional calendar holds; the precise rules are unresolved.', 'condition', [], [ev('Source_Transcript', 'We have repeat clients with payment terms, but just being a repeat client is not enough.'), ev('Source_Transcript', 'I sometimes pencil a kickoff into the calendar while payment is still outstanding.')], 'disputed');
  question('Q_Parallel', 'Can Finance and Delivery start together, and what must finish before setup starts?', 'This decides whether the diagram needs parallel branches and a join before setup.', [], ['Readiness', 'Workspace']);
  question('Q_Scheduling', 'Does a provisional calendar hold count as kickoff, and when is kickoff actually held?', 'A calendar hold should not accidentally bypass payment, plan approval or working access.', ['C_Practice'], ['Kickoff']);
  question('Q_Payment', 'Who can use credit terms instead of paying a deposit, and which rule replaces the old checklist?', 'We have conflicting accounts; a returning client alone may not qualify for the exception.', ['C_Policy', 'C_Practice'], ['Readiness']);
  question('Q_Waiting', 'When do the reminder and cutoff clocks start, and what happens on a withdrawal or cutoff?', 'A reminder must not cancel work; a cancellation must stop both readiness branches and handle any deposit.', [], ['Readiness']);
  question('Q_Plan', 'What happens when the client requests changes to the delivery plan?', 'Sending a plan or receiving a change request must not be mistaken for approval.', [], ['Readiness']);
  question('Q_Access', 'What happens when an access test fails, and what result allows kickoff?', 'The draft must not let a failed access check continue to kickoff.', [], ['Workspace']);
  question('Q_Completion', 'What must Client Success do before the coordinator closes onboarding?', 'Sending the handover email may not be the final business outcome.', [], ['SendHandover']);
  step('W_Intake', 'A signed order starts intake. The coordinator requests and rechecks missing items until the handover pack is complete.', ['Intake'], ['C_Intake']);
  step('W_Ready', 'Finance and Delivery both contribute to readiness. The draft leaves their ordering and completion gate unresolved.', ['Readiness'], ['C_ReadinessStage']);
  step('W_Workspace', 'The engineer verifies access before Delivery holds the kickoff. The failure path still needs an answer.', ['Workspace', 'Kickoff'], ['C_LaterStages']);
  step('W_Handover', 'After kickoff, the coordinator sends the handover pack. The diagram does not yet claim that sending it completes onboarding.', ['SendHandover'], ['C_LaterStages']);
  scenario('Case_MissingItems', 'Correct an incomplete handover pack twice', 'rework', 'The original pack and the first correction are each missing required items.', 'The coordinator requests corrections and rechecks twice; readiness starts only when the pack is complete.', ['CheckPack', 'RequestItems', 'WaitPack', 'IntakeEnd'], intakeEvidence);
  const conflict = { id: 'PaymentConflict', description: 'The historical deposit checklist and reported current payment practice disagree.', claimIds: ['C_Policy', 'C_Practice'], status: 'open' };
  const stakeholder = (id, role, scope, status = 'consulted', sourceIds = ['Source_Transcript']) => ({ id, role, scope, status, sourceIds, notes: 'Fictional role represented in a synthetic test; no real interview or approval.' });
  proposals.push(finish(1, 'Create an evidence-backed first draft; leave seven modeling questions open.', {
    layout: 'full', sources: [source('Policy', 'Earlier onboarding checklist (synthetic)', 'document')],
    context: { trigger: 'Signed service order and handover pack received from Sales', outcomes: ['Successful handover — precise completion gate still to clarify', 'Onboarding canceled — cancellation handling still to clarify'], purpose: 'Train a new coordinator on the current onboarding process using a synthetic interview.', perspective: 'Brightline Studio', audience: 'Onboarding coordinator and participating internal roles', owner: 'Onboarding coordinator', customer: 'External client', detailLevel: 'operational', scopeNotes: 'SYNTHETIC WORKFLOW TEST. One service order per case. Sales negotiation, project delivery, renewals, client internals, and post-setup cancellation are outside scope. Empty subprocesses are discovery gaps, not approved abstractions.' },
    conflicts: [conflict], stakeholders: [stakeholder('S_Coord', 'Onboarding coordinator', 'Intake, readiness coordination and closure'), stakeholder('S_Finance', 'Finance', 'Financial clearance and refunds'), stakeholder('S_Delivery', 'Delivery lead', 'Plan and kickoff'), stakeholder('S_Engineer', 'Technical setup engineer', 'Workspace and access'), stakeholder('S_Success', 'Client Success owner', 'Handover acceptance', 'not-consulted', [])],
    glossary: [{ term: 'Readiness', definition: 'The stage coordinating financial clearance and client plan agreement; its exact gate is clarified in round 1.' }, { term: 'Provisional hold', definition: 'A tentative calendar slot, not a confirmed or completed kickoff.' }, { term: 'Handover pack', definition: 'The case information transferred between the responsible roles; includes required contacts, access list and agreed scope at intake.' }],
  }));

  begin();
  const parallel = ev('Round1', 'Finance works on financial clearance and Delivery works on agreeing the delivery plan independently, in parallel. Neither branch waits for the other to start. Readiness completes only when financial clearance is recorded AND the plan is approved. Only then may the engineer start workspace setup.');
  group('C_Parallel', 'Readiness starts Finance and Delivery in parallel and joins both completed branches before workspace setup. The subprocess titles name each responsible role.', 'order', [parallel], () => {
    add('ReadyStart', 'startEvent', 'Handover pack complete', 'Readiness'); add('ReadySplit', 'parallelGateway', '', 'Readiness');
    add('FinanceWork', 'subProcess', 'Clear order — Finance', 'Readiness', { collapsed: true });
    add('PlanWork', 'subProcess', 'Agree plan — Delivery', 'Readiness', { collapsed: true });
    add('ReadyJoin', 'parallelGateway', '', 'Readiness'); add('ReadyEnd', 'endEvent', 'Finance cleared and plan approved', 'Readiness');
    flow('F_ReadyStart', 'ReadyStart', 'ReadySplit'); flow('F_StartFinance', 'ReadySplit', 'FinanceWork'); flow('F_StartPlan', 'ReadySplit', 'PlanWork');
    flow('F_FinanceJoin', 'FinanceWork', 'ReadyJoin'); flow('F_PlanJoin', 'PlanWork', 'ReadyJoin'); flow('F_ReadyEnd', 'ReadyJoin', 'ReadyEnd'); flow('F_ReadyWorkspace', 'Readiness', 'Workspace');
  });
  group('C_Deposit', 'For a client without approved credit terms, Finance issues an invoice, waits for received payment, records clearance and finishes. Eligibility at branch entry is still open.', 'order', [ev('Round1', 'For a new client without approved credit terms, the Finance branch begins by issuing the deposit invoice, waits for the deposit to arrive, records financial clearance, and ends with finance cleared.'), ev('Round1', 'The invoice and deposit receipt are exchanges with the external client.')], () => {
    add('FinanceStart', 'startEvent', 'Finance work started', 'FinanceWork'); add('Invoice', 'sendTask', 'Issue deposit invoice', 'FinanceWork');
    add('WaitDeposit', 'receiveTask', 'Receive deposit', 'FinanceWork'); add('Clearance', 'task', 'Record financial clearance', 'FinanceWork'); add('FinanceEnd', 'endEvent', 'Finance cleared', 'FinanceWork');
    flow('F_InvoiceWait', 'Invoice', 'WaitDeposit'); flow('F_DepositClearance', 'WaitDeposit', 'Clearance'); flow('F_ClearanceEnd', 'Clearance', 'FinanceEnd');
    flow('M_Invoice', 'Invoice', 'Client'); flow('M_Deposit', 'Client', 'WaitDeposit');
  });
  group('C_PlanApproval', 'Delivery prepares and sends the plan, waits for an explicit response and finishes only on approval; the changes-requested loop is still missing.', 'order', [ev('Round1', 'The Delivery branch begins by preparing the plan, sending it to the client approver and waiting for a plan response. An explicit approval completes the branch with plan approved.')], () => {
    add('PlanStart', 'startEvent', 'Delivery planning started', 'PlanWork'); add('PreparePlan', 'task', 'Prepare delivery plan', 'PlanWork'); add('PlanMerge', 'exclusiveGateway', '', 'PlanWork');
    add('SendPlan', 'sendTask', 'Send delivery plan', 'PlanWork'); add('WaitPlan', 'receiveTask', 'Receive plan response', 'PlanWork'); add('PlanDecision', 'exclusiveGateway', '', 'PlanWork'); add('PlanEnd', 'endEvent', 'Plan approved', 'PlanWork');
    flow('F_PlanStart', 'PlanStart', 'PreparePlan'); flow('F_PrepareMerge', 'PreparePlan', 'PlanMerge'); flow('F_MergeSend', 'PlanMerge', 'SendPlan'); flow('F_SendWait', 'SendPlan', 'WaitPlan'); flow('F_ResponseDecision', 'WaitPlan', 'PlanDecision'); flow('F_PlanApproved', 'PlanDecision', 'PlanEnd', 'Client explicitly approves');
    flow('M_SendPlan', 'SendPlan', 'Client'); flow('M_PlanResponse', 'Client', 'WaitPlan');
  });
  answer('Q_Parallel', 'Round1', [parallel.quote]);
  claim('C_ReadinessStage', 'The coordinator hands the complete pack to Finance and Delivery and coordinates their parallel readiness work. Both results are required before workspace setup.', 'activity', claims.get('C_ReadinessStage').elementIds, [...claims.get('C_ReadinessStage').evidence, parallel]);
  answer('Q_Scheduling', 'Round1', ['A provisional calendar hold is optional planning detail inside preparing the plan; it is not a committed kickoff and is not an extra prerequisite.', 'Delivery then confirms and holds the kickoff; Maya sends the handover pack after the kickoff.']);
  step('W_Ready', 'After intake, Finance and Delivery start independently. Setup waits until financial clearance AND explicit plan approval are both complete; either branch can finish first.', ['ReadySplit', 'ReadyJoin'], ['C_Parallel']);
  step('W_Workspace', 'Only after both readiness results does the engineer verify access. Delivery then confirms and holds the kickoff; a provisional calendar hold is not the kickoff.', ['Workspace', 'Kickoff'], ['C_Parallel', 'C_LaterStages']);
  scenario('Case_PlanFirst', 'Plan approval arrives before financial clearance', 'parallel', 'The plan is approved while financial clearance is outstanding.', 'The join waits; setup starts once Finance also completes, exactly once.', ['ReadySplit', 'ReadyJoin', 'Workspace'], [parallel]);
  scenario('Case_FinanceFirst', 'Financial clearance arrives before plan approval', 'parallel', 'Finance clears the order while Delivery is still waiting on the client.', 'Setup waits for explicit plan approval; sending a plan or holding a calendar slot is insufficient.', ['ReadyJoin', 'WaitPlan', 'Workspace'], [parallel]);
  proposals.push(finish(2, 'Clarify parallel readiness and the kickoff gate; keep payment eligibility and exception details open.', { sources: [source('Round1', 'Round 1: normal flow and parallel work (synthetic)')] }));

  begin();
  const reminder = ev('Round2', 'Send one payment reminder seven calendar days after the wait for the deposit begins, if payment is still outstanding then. It is a noninterrupting reminder: the same deposit wait stays active, and the Delivery work continues. It does not restart either clock and does not repeat.');
  group('C_Reminder', 'One noninterrupting seven-calendar-day reminder accompanies the still-active deposit wait. Its own branch ends after sending, without clearing Finance.', 'exception', [reminder, ev('Round2', 'Once the reminder has been sent, that reminder action finishes; financial clearance still depends on receiving the deposit. Send the reminder to the external client.')], () => {
    add('PaymentReminder', 'boundaryEvent:timer', '7 calendar days unpaid', null, { on: 'WaitDeposit', timer: 'P7D', nonInterrupting: true });
    add('SendReminder', 'sendTask', 'Send payment reminder', 'FinanceWork'); add('ReminderEnd', 'endEvent', 'Reminder sent', 'FinanceWork');
    flow('F_RemindSend', 'PaymentReminder', 'SendReminder'); flow('F_ReminderDone', 'SendReminder', 'ReminderEnd'); flow('M_Reminder', 'SendReminder', 'Client');
  });
  const cancellation = ev('Round2', 'The readiness deadline is fourteen calendar days from entry into readiness, after intake is complete. If readiness has not completed by then, interrupt the whole readiness stage, including any active Finance and Delivery work.');
  const withdrawal = ev('Round2', 'A client withdrawal message received while readiness is active has the same interrupting effect.');
  group('C_Interrupt', 'A fourteen-calendar-day readiness deadline or a client withdrawal interrupts the whole readiness subprocess, including both active branches, and proceeds to cancellation.', 'exception', [cancellation, withdrawal], () => {
    add('ReadinessDeadline', 'boundaryEvent:timer', '14 calendar days elapsed', null, { on: 'Readiness', timer: 'P14D' });
    add('ClientWithdrawal', 'boundaryEvent:message', 'Client withdrew', null, { on: 'Readiness', message: 'Client withdrawal' });
    add('CancelMerge', 'exclusiveGateway', '', 'Process_Main', { lane: 'Coordinator' });
    flow('F_Expired', 'ReadinessDeadline', 'CancelMerge'); flow('F_Withdrawn', 'ClientWithdrawal', 'CancelMerge'); flow('M_Withdrawal', 'Client', 'ClientWithdrawal');
  });
  const refund = ev('Round2', 'On either readiness deadline or withdrawal, check whether a deposit was received. If one was received, Finance refunds that deposit; if none was received, skip the refund. After that check or refund, Maya releases any provisional delivery slot, records the cancellation, and the case ends as onboarding canceled.');
  group('C_Cancel', 'Finance checks the deposit and refunds it only if received. The coordinator releases any hold, records cancellation and ends the case.', 'order', [refund], () => {
    add('Finance', 'lane', 'Finance'); add('CheckDeposit', 'task', 'Check received deposit', 'Process_Main', { lane: 'Finance' });
    add('RefundDecision', 'exclusiveGateway', '', 'Process_Main', { lane: 'Finance' }); add('RefundDeposit', 'task', 'Refund deposit', 'Process_Main', { lane: 'Finance' });
    add('RefundMerge', 'exclusiveGateway', '', 'Process_Main', { lane: 'Coordinator' }); add('ReleaseSlot', 'task', 'Release provisional slot', 'Process_Main', { lane: 'Coordinator' });
    add('RecordCancellation', 'task', 'Record cancellation', 'Process_Main', { lane: 'Coordinator' }); add('Canceled', 'endEvent', 'Onboarding canceled', 'Process_Main', { lane: 'Coordinator' });
    flow('F_CheckDeposit', 'CancelMerge', 'CheckDeposit'); flow('F_DepositDecision', 'CheckDeposit', 'RefundDecision');
    flow('F_RefundRequired', 'RefundDecision', 'RefundDeposit', 'Deposit received'); flow('F_NoRefund', 'RefundDecision', 'RefundMerge', 'No deposit received');
    flow('F_RefundDone', 'RefundDeposit', 'RefundMerge'); flow('F_ReleaseSlot', 'RefundMerge', 'ReleaseSlot'); flow('F_RecordCancel', 'ReleaseSlot', 'RecordCancellation'); flow('F_CancelEnd', 'RecordCancellation', 'Canceled');
  });
  answer('Q_Waiting', 'Round2', [reminder.quote, cancellation.quote, withdrawal.quote, refund.quote]);
  step('W_Waiting', 'An unpaid deposit gets one reminder after seven calendar days; payment waiting and plan work continue. Fourteen calendar days after readiness starts, or on a withdrawal during readiness, cancel both branches. Refund a received deposit, release any hold and record cancellation.', ['PaymentReminder', 'ReadinessDeadline', 'ClientWithdrawal', 'Canceled'], ['C_Reminder', 'C_Interrupt', 'C_Cancel']);
  scenario('Case_Reminder', 'Reminder while payment and plan approval are outstanding', 'exception', 'The deposit wait remains active seven calendar days after it starts.', 'Send one reminder without ending the deposit wait or stopping Delivery. Readiness still requires both results.', ['PaymentReminder', 'SendReminder', 'WaitDeposit', 'ReadyJoin'], [reminder]);
  scenario('Case_DeadlinePaid', 'Deadline after payment while plan changes remain unresolved', 'exception', 'Finance is cleared, Delivery is still active, and fourteen calendar days from readiness entry elapse.', 'Interrupt all readiness work, refund the received deposit and close as canceled; never start setup.', ['ReadinessDeadline', 'RefundDeposit', 'Canceled'], [cancellation, refund]);
  scenario('Case_WithdrawUnpaid', 'Withdrawal while both branches are still waiting', 'message', 'The client withdraws during readiness before any deposit is received.', 'Cancel both branches, skip refund, release the slot and record cancellation.', ['ClientWithdrawal', 'RefundDecision', 'Canceled'], [withdrawal, refund]);
  proposals.push(finish(3, 'Add reminder and cancellation paths; stop the entire readiness stage on deadline or withdrawal.', { sources: [source('Round2', 'Round 2: reminders, deadlines and withdrawal (synthetic)')], context: { outcomes: ['Successful handover — completion gate still to clarify', 'Onboarding canceled'], scopeNotes: 'SYNTHETIC WORKFLOW TEST. One order per case. Sales negotiation, delivery execution, renewals, client internals, and post-setup cancellation are outside scope. One full deposit; partial payments, disputes and refund failures are excluded. Timers use calendar days. Unfilled workspace details remain a discovery gap.' } }));

  begin();
  const credit = ev('Round3', 'At entry to the Finance branch, check whether this service order already has credit terms approved by Finance. If approved credit terms exist, record financial clearance without issuing or waiting for a deposit invoice. Otherwise issue the deposit invoice, wait for the deposit to arrive, then record financial clearance. Being a repeat client is not sufficient by itself; a repeat client without approved credit terms follows the deposit path.');
  group('C_Credit', 'Finance checks approved credit terms at entry. Approved terms bypass only the invoice/deposit wait, not financial recording or Delivery approval. All other orders require a deposit.', 'condition', [credit], () => {
    add('CheckCredit', 'task', 'Check approved credit terms', 'FinanceWork'); add('CreditDecision', 'exclusiveGateway', '', 'FinanceWork');
    add('FinanceMerge', 'exclusiveGateway', '', 'FinanceWork');
    operations.push({ op: 'set', id: 'F_DepositClearance', values: { target: 'FinanceMerge' } });
    flow('F_FinanceCheck', 'FinanceStart', 'CheckCredit'); flow('F_CreditDecision', 'CheckCredit', 'CreditDecision');
    flow('F_CreditApproved', 'CreditDecision', 'FinanceMerge', 'Finance-approved credit terms'); flow('F_DepositRequired', 'CreditDecision', 'Invoice', 'No approved credit terms'); flow('F_MergeClearance', 'FinanceMerge', 'Clearance');
  });
  const policyResolution = ev('Round3', 'Its statement that every client must pay a deposit before scheduling describes the earlier new-client-only policy, not today\'s complete rule. The current practice is the approved-credit-terms exception above. A tentative calendar hold is allowed during preparing the plan, but the confirmed kickoff is held only after both readiness branches and verified access.');
  claim('C_Policy', 'The historical checklist described the earlier new-client-only policy, not the current full rule. It remains documentary evidence, not a current routing condition.', 'condition', [], [ev('Policy', 'Every client must pay a deposit before scheduling.', 'prescribed'), policyResolution]);
  claim('C_Practice', 'Current financial clearance allows Finance-approved credit terms. Tentative holds can occur during planning; actual kickoff follows both readiness results and verified access.', 'condition', ['CheckCredit', 'Kickoff'], [credit, policyResolution]);
  const revision = ev('Round3', 'After a client plan response, either the plan is explicitly approved or changes are requested. If changes are requested, Delivery revises the plan, sends the revised version to the client, and waits for another response. That cycle can repeat. Only an explicit approval ends the Delivery branch. Silence stays at the receive-response task.');
  group('C_PlanRevision', 'A changes-requested response sends Delivery through revise, resend and wait again. Only approval completes the branch; silence remains a wait.', 'order', [revision], () => {
    add('RevisePlan', 'task', 'Revise delivery plan', 'PlanWork'); flow('F_ChangesRequested', 'PlanDecision', 'RevisePlan', 'Client requests changes'); flow('F_PlanResend', 'RevisePlan', 'PlanMerge');
  });
  claim('C_PlanApproval', 'Delivery prepares and sends the plan, waits for a response, and completes only after explicit approval. Changes and resending are modeled in the revision loop.', 'order', claims.get('C_PlanApproval').elementIds, [ev('Round1', 'The Delivery branch begins by preparing the plan, sending it to the client approver and waiting for a plan response. An explicit approval completes the branch with plan approved.'), revision]);
  const access = ev('Round3', 'The engineer creates the workspace, tests access for all named users, and checks the result. If any access test fails, the engineer corrects the access configuration and repeats the tests for all named users. That can repeat until all pass. Only all tests passing produces access verified and allows the kickoff.');
  group('C_Access', 'The engineer creates the workspace and tests all named users. Any failure loops through configuration correction and retesting; all passing completes setup.', 'order', [access], () => {
    add('WorkspaceStart', 'startEvent', 'Readiness complete', 'Workspace'); add('CreateWorkspace', 'task', 'Create workspace and accounts', 'Workspace'); add('AccessMerge', 'exclusiveGateway', '', 'Workspace');
    add('TestAccess', 'task', 'Test all named users\' access', 'Workspace'); add('AccessDecision', 'exclusiveGateway', '', 'Workspace'); add('CorrectAccess', 'task', 'Correct access configuration', 'Workspace'); add('WorkspaceEnd', 'endEvent', 'Access verified', 'Workspace');
    flow('F_WorkspaceStart', 'WorkspaceStart', 'CreateWorkspace'); flow('F_CreateAccess', 'CreateWorkspace', 'AccessMerge'); flow('F_AccessTest', 'AccessMerge', 'TestAccess'); flow('F_AccessDecision', 'TestAccess', 'AccessDecision');
    flow('F_AccessPassed', 'AccessDecision', 'WorkspaceEnd', 'All named users pass'); flow('F_AccessFailed', 'AccessDecision', 'CorrectAccess', 'Any named user fails'); flow('F_Retest', 'CorrectAccess', 'AccessMerge');
  });
  const completion = ev('Round3', 'After Delivery holds the kickoff, Maya sends the internal handover pack. Client Success reviews it and acknowledges acceptance; until acceptance the task stays open. Then Maya closes the onboarding record. The successful outcome is onboarding handed over, not merely handover email sent.');
  claim('C_Deposit', 'For an order without approved credit terms, Finance issues an invoice, waits for the received deposit, then records financial clearance. Orders with approved terms take the separate clearance route.', 'order', claims.get('C_Deposit').elementIds, [...claims.get('C_Deposit').evidence, credit]);
  claim('C_LaterStages', 'The engineer verifies workspace access before Delivery holds the kickoff. The coordinator then sends the handover pack; Client Success acceptance and record closure complete onboarding.', 'order', claims.get('C_LaterStages').elementIds, [...claims.get('C_LaterStages').evidence, access, completion]);
  group('C_Completion', 'Client Success acknowledges handover after kickoff and the handover pack. The coordinator then closes the record, completing onboarding.', 'order', [completion], () => {
    add('ClientSuccess', 'lane', 'Client Success'); add('AcceptHandover', 'task', 'Review and accept handover', 'Process_Main', { lane: 'ClientSuccess' });
    add('CloseRecord', 'task', 'Close onboarding record', 'Process_Main', { lane: 'Coordinator' }); add('HandedOver', 'endEvent', 'Onboarding handed over', 'Process_Main', { lane: 'Coordinator' });
    flow('F_HandoverAccept', 'SendHandover', 'AcceptHandover'); flow('F_AcceptClose', 'AcceptHandover', 'CloseRecord'); flow('F_CloseEnd', 'CloseRecord', 'HandedOver');
  });
  answer('Q_Payment', 'Round3', [credit.quote, policyResolution.quote]); answer('Q_Plan', 'Round3', [revision.quote]); answer('Q_Access', 'Round3', [access.quote]); answer('Q_Completion', 'Round3', [completion.quote]);
  step('W_Ready', 'Finance and Delivery start in parallel. Finance checks approved credit terms: approved terms skip the deposit; all other orders wait for payment. Both routes record clearance. Delivery revises and resends requested changes until the client explicitly approves. Setup waits for both branches.', ['CheckCredit', 'PlanDecision', 'ReadyJoin'], ['C_Credit', 'C_PlanRevision', 'C_Parallel']);
  step('W_Workspace', 'The engineer creates the workspace and tests access for all named users. Any failure triggers correction and a full retest. Only verified access permits Delivery to confirm and hold the kickoff.', ['Workspace', 'Kickoff'], ['C_Access', 'C_LaterStages']);
  step('W_Handover', 'After kickoff the coordinator sends the internal handover pack. Client Success must accept it before the coordinator closes the onboarding record. That closure completes the successful case.', ['SendHandover', 'AcceptHandover', 'CloseRecord', 'HandedOver'], ['C_Completion']);
  scenario('Case_Credit', 'Returning client with Finance-approved credit terms', 'alternative', 'The order has approved credit terms, and the plan is subsequently approved.', 'Record clearance without invoice or deposit wait. Still wait for the Delivery result before setup.', ['CheckCredit', 'CreditDecision', 'Clearance', 'ReadyJoin'], [credit]);
  scenario('Case_NoCredit', 'Returning client without approved credit terms', 'alternative', 'The client has worked with Brightline before but this order has no approved credit terms.', 'Issue the invoice and wait for the deposit; client history alone never bypasses Finance.', ['CreditDecision', 'Invoice', 'WaitDeposit'], [credit]);
  scenario('Case_Rework', 'Two plan revisions before approval', 'rework', 'The client requests changes twice, then approves, before readiness expires.', 'Revise, resend and wait on each cycle. Complete Delivery once and join Finance only after explicit approval.', ['WaitPlan', 'PlanDecision', 'RevisePlan', 'PlanEnd'], [revision]);
  scenario('Case_Access', 'One named user fails access testing', 'rework', 'Readiness is complete, but at least one named user fails the access test.', 'Correct configuration and retest all named users. No kickoff until every test passes.', ['TestAccess', 'CorrectAccess', 'WorkspaceEnd', 'Kickoff'], [access]);
  scenario('Case_Normal', 'New client through accepted handover', 'normal', 'Complete intake, no approved credit terms, deposit received, plan approved and all access tests pass.', 'Hold kickoff, send handover, wait for Client Success acceptance, close the record and end as handed over.', ['Start', 'ReadyJoin', 'WorkspaceEnd', 'Kickoff', 'AcceptHandover', 'HandedOver'], [parallel, credit, access, completion]);
  scenario('Case_Acceptance', 'Handover email sent but acceptance still outstanding', 'normal', 'Kickoff is complete and the coordinator has sent the handover pack.', 'The record stays open until Client Success accepts; sending the pack is not completion.', ['SendHandover', 'AcceptHandover', 'CloseRecord'], [completion]);
  proposals.push(finish(4, 'Resolve credit terms, add plan and access rework, and require Client Success acceptance before closure.', {
    stage: 'quality-review', layout: 'full', sources: [source('Round3', 'Round 3: variants, rework and completion (synthetic)')],
    context: { outcomes: ['Onboarding handed over', 'Onboarding canceled'], scopeNotes: 'SYNTHETIC WORKFLOW TEST. One order per case. Sales negotiation, delivery execution, renewals, client internals and post-setup cancellation are outside scope. One full deposit; partial payments, disputes and refund failures are excluded. Timers use calendar days. All six model views have explicit internal behavior. Subprocess details name the responsible role because the current editor does not support nested lanes. Acceptance includes any handover corrections; no separate rejection path is asserted.' },
    conflicts: [{ ...conflict, status: 'resolved', resolution: 'The historical checklist is narrower than current practice. Finance-approved credit terms provide the current deposit exception. Provisional calendar holds do not count as kickoff. Both readiness results and verified access still precede kickoff.', evidence: [credit, policyResolution] }],
    stakeholders: [stakeholder('S_Coord', 'Onboarding coordinator', 'Intake, readiness coordination and closure', 'consulted', ['Source_Transcript', 'Round1', 'Round2', 'Round3']), stakeholder('S_Finance', 'Finance', 'Financial clearance and refunds', 'consulted', ['Source_Transcript', 'Round1', 'Round2', 'Round3']), stakeholder('S_Delivery', 'Delivery lead', 'Plan and kickoff', 'consulted', ['Source_Transcript', 'Round1', 'Round2', 'Round3']), stakeholder('S_Engineer', 'Technical setup engineer', 'Workspace and access', 'consulted', ['Source_Transcript', 'Round1', 'Round3']), stakeholder('S_Success', 'Client Success owner', 'Handover acceptance', 'consulted', ['Round3'])],
    glossary: [{ term: 'Readiness', definition: 'Parallel Finance clearance and Delivery plan approval, both required before technical setup.' }, { term: 'Provisional hold', definition: 'A tentative calendar slot within plan preparation; it is not a confirmed or completed kickoff.' }, { term: 'Approved credit terms', definition: 'Finance approval for this order to proceed without a deposit; repeat-client status alone does not qualify.' }, { term: 'Handover pack', definition: 'The information passed to the next responsible role; the final handover requires Client Success acceptance.' }],
  }));
  return { proposals, texts };
}
