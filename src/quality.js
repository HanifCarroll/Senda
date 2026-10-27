import { BUSINESS_TYPES, parseModel, typeOf, validateXml, metricsXml } from './model.js';
import { currentReview, currentWalkthrough } from './review-state.js';
import { QUALITY_PROFILE } from './schema.js';

const issue = (code, message, elements = []) => ({ code, message, elements });
const isType = (e, type) => e?.$instanceOf?.(`bpmn:${type}`);
const scopeOf = e => {
  let p = e?.$parent;
  while (p && !isType(p, 'Process') && !isType(p, 'SubProcess')) p = p.$parent;
  return p;
};
const rootProcess = e => {
  let p = e;
  while (p && !isType(p, 'Process')) p = p.$parent;
  return p?.id;
};

function reachable(roots, links) {
  const seen = new Set(), queue = [...roots];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(links.get(id) || []));
  }
  return seen;
}

// A deliberately narrow pattern check. It is not a general BPMN soundness algorithm.
function behaviorPatterns(nodes, flows) {
  const findings = [];
  const outgoing = n => flows.filter(f => f.sourceRef === n);
  const incoming = n => flows.filter(f => f.targetRef === n);
  for (const split of nodes.filter(n => ['ExclusiveGateway', 'ParallelGateway'].includes(typeOf(n)) && outgoing(n).length > 1 && incoming(n).length === 1)) {
    const branches = outgoing(split).map(first => {
      let f = first;
      const visited = new Set();
      while (f?.targetRef && !visited.has(f.targetRef.id)) {
        const node = f.targetRef;
        visited.add(node.id);
        if (isType(node, 'Gateway')) return { join: node, last: f, path: visited };
        if (!isType(node, 'Task') || node.loopCharacteristics || incoming(node).length !== 1 || outgoing(node).length !== 1 || nodes.some(n => n.attachedToRef === node)) return null;
        f = outgoing(node)[0];
      }
      return null;
    });
    const join = branches[0]?.join;
    if (!join || branches.some(b => !b || b.join !== join) || incoming(join).length !== branches.length || new Set(branches.map(b => b.last.id)).size !== branches.length) continue;
    if (typeOf(split) === 'ExclusiveGateway' && typeOf(join) === 'ParallelGateway')
      findings.push({ ...issue('XOR_TO_AND_JOIN', 'Exclusive branches converge at a parallel join. With one activation, a branch supplies no token and the join cannot complete.', [split.id, join.id]), blocking: true });
    if (typeOf(split) === 'ParallelGateway' && typeOf(join) === 'ExclusiveGateway')
      findings.push({ ...issue('AND_TO_XOR_MERGE', 'Parallel branches converge at an exclusive merge. It passes each token onward without synchronizing, so later work can execute more than once. Confirm whether this is intended during behavioral review.', [split.id, join.id]), blocking: false });
  }
  return findings;
}

export async function assess(snapshot) {
  const backend = await validateXml(snapshot.xml, { platform: 'none' });
  const parsed = await parseModel(snapshot.xml);
  const elements = parsed.elements;
  const nodes = elements.filter(e => isType(e, 'FlowNode'));
  const flows = elements.filter(e => typeOf(e) === 'SequenceFlow');
  const structural = [...backend.errors.map(e => issue(e.code, e.message, e.element ? [e.element] : []))];
  structural.push(...parsed.warnings.map(w => issue('PARSE_WARNING', w.message)));
  const completeness = [], readability = [];
  const inFlows = n => flows.filter(f => f.targetRef === n);
  const outFlows = n => flows.filter(f => f.sourceRef === n);
  const scopes = elements.filter(e => ['Process', 'SubProcess', 'Transaction', 'AdHocSubProcess'].includes(typeOf(e)));
  for (const f of flows) {
    if (!f.sourceRef || !f.targetRef) structural.push(issue('MISSING_ENDPOINT', 'Sequence flow has a missing endpoint.', [f.id]));
    else if (scopeOf(f.sourceRef) !== scopeOf(f.targetRef)) structural.push(issue('CROSS_SCOPE_SEQUENCE', 'Sequence flow must stay within one process or subprocess scope.', [f.id]));
  }
  for (const f of elements.filter(e => typeOf(e) === 'MessageFlow')) {
    const processFor = e => typeOf(e) === 'Participant' ? (e.processRef?.id || e.id) : rootProcess(e);
    if (!f.sourceRef || !f.targetRef || processFor(f.sourceRef) === processFor(f.targetRef)) structural.push(issue('INVALID_MESSAGE_FLOW', 'Message flow must connect different participants.', [f.id]));
  }
  const compensationEvents = nodes.filter(n => typeOf(n) === 'BoundaryEvent' && n.eventDefinitions?.some(e => typeOf(e) === 'CompensateEventDefinition'));
  const compensationHandlers = nodes.filter(n => n.isForCompensation);
  const associations = elements.filter(e => typeOf(e) === 'Association');
  for (const event of compensationEvents) {
    const links = associations.filter(a => a.sourceRef === event);
    if (inFlows(event).length || outFlows(event).length)
      structural.push(issue('COMPENSATION_SEQUENCE', 'A compensation boundary event connects to its handler through an association, not ordinary sequence flow.', [event.id]));
    if (!event.attachedToRef || scopeOf(event.attachedToRef) !== scopeOf(event))
      structural.push(issue('COMPENSATION_ATTACHMENT', 'Attach the compensation event to an activity in the same scope.', [event.id]));
    if (links.length !== 1 || !isType(links[0]?.targetRef, 'Activity') || !links[0]?.targetRef?.isForCompensation || scopeOf(links[0]?.targetRef) !== scopeOf(event))
      completeness.push(issue('COMPENSATION_HANDLER', 'Connect the compensation event to one compensation activity in the same scope.', [event.id]));
  }
  for (const handler of compensationHandlers) {
    if (inFlows(handler).length || outFlows(handler).length)
      structural.push(issue('COMPENSATION_SEQUENCE', 'A compensation activity must stay outside the ordinary sequence flow.', [handler.id]));
    if (!associations.some(a => a.targetRef === handler && compensationEvents.includes(a.sourceRef)))
      completeness.push(issue('UNLINKED_COMPENSATION', 'Connect this compensation activity to the event that invokes it.', [handler.id]));
  }
  const specialNodes = new Set([...compensationEvents, ...compensationHandlers]);
  for (const scope of scopes) {
    const local = nodes.filter(n => scopeOf(n) === scope && !specialNodes.has(n) && !n.triggeredByEvent);
    if (scope.triggeredByEvent || isType(scope, 'AdHocSubProcess')) {
      completeness.push(issue('SPECIAL_SCOPE_REVIEW', 'This finalization profile does not yet support event or ad hoc subprocess validation. Keep this model as a draft until that support is added.', [scope.id]));
      continue;
    }
    if (typeOf(scope) === 'SubProcess' && !scope.flowElements?.length && snapshot.discovery.abstractions?.some(a => a.elementId === scope.id)) continue;
    const starts = local.filter(n => typeOf(n) === 'StartEvent');
    const ends = local.filter(n => typeOf(n) === 'EndEvent');
    if (!starts.length) completeness.push(issue('MISSING_START', 'This modeling profile expects an explicit event for each trigger.', [scope.id]));
    if (!ends.length) completeness.push(issue('MISSING_END', 'This modeling profile expects an explicit event for each outcome.', [scope.id]));
    const forward = new Map(local.map(n => [n.id, outFlows(n).map(f => f.targetRef?.id)]));
    const backward = new Map(local.map(n => [n.id, inFlows(n).map(f => f.sourceRef?.id)]));
    // Boundary events are reachable through the activity they attach to, not through sequence flow.
    for (const n of local.filter(n => n.attachedToRef)) forward.get(n.attachedToRef.id)?.push(n.id);
    const fromStart = reachable(starts.map(n => n.id), forward);
    const toEnd = reachable(ends.map(n => n.id), backward);
    for (const node of local) {
      if (!fromStart.has(node.id)) completeness.push(issue('NO_START_PATH', 'Element is not reachable from an explicit start in this scope.', [node.id]));
      if (!toEnd.has(node.id)) completeness.push(issue('NO_END_PATH', 'Element has no sequence-flow path to an explicit end in this scope.', [node.id]));
    }
    const size = nodes.filter(n => scopeOf(n) === scope).length;
    if (size > 30) readability.push(issue('CONSIDER_DECOMPOSITION', `This scope contains ${size} activities, events and gateways; consider meaningful subprocesses. The book suggests roughly 30 flow objects per level, not a validity limit.`, [scope.id]));
  }
  for (const n of nodes) {
    const incoming = inFlows(n), outgoing = outFlows(n);
    if (typeOf(n) === 'StartEvent' && incoming.length) structural.push(issue('START_HAS_INCOMING', 'A start event cannot have incoming sequence flows.', [n.id]));
    if (typeOf(n) === 'EndEvent' && outgoing.length) structural.push(issue('END_HAS_OUTGOING', 'An end event cannot have outgoing sequence flows.', [n.id]));
    if (!isType(n, 'Gateway') && !n.name?.trim()) readability.push(issue('MISSING_LABEL', 'Give the activity or event a meaningful business label.', [n.id]));
    if (Math.max(incoming.length, outgoing.length) > 4) readability.push(issue('HIGH_ROUTING_DEGREE', 'More than four flows meet here. Review legibility; four is an application heuristic, not a BPMN rule.', [n.id]));
    if (isType(n, 'Gateway') && incoming.length > 1 && outgoing.length > 1) readability.push(issue('MIXED_GATEWAY_ROLE', 'Consider separate joining and splitting gateways if that makes the same behavior clearer.', [n.id]));
    if (typeOf(n) === 'InclusiveGateway') readability.push(issue('INCLUSIVE_ROUTING', 'Check whether simpler routing can express exactly the same behavior.', [n.id]));
    if (['ExclusiveGateway', 'InclusiveGateway'].includes(typeOf(n)) && outgoing.length > 1) {
      if (n.name?.trim()) readability.push(issue('GATEWAY_LABEL_CONVENTION', 'The selected book-based convention puts the decision in explicit outgoing conditions and normally leaves the split gateway unlabeled.', [n.id]));
      for (const f of outgoing) {
        if (!f.name?.trim() || /^(yes|no|true|false)$/i.test(f.name.trim())) readability.push(issue('BRANCH_LABEL', 'Use an explicit business condition on the outgoing branch, rather than a generic yes/no label.', [f.id]));
        const businessCondition = f.name?.trim() && !/^(yes|no|true|false)$/i.test(f.name.trim());
        if (!businessCondition && !f.conditionExpression?.body?.trim() && n.default !== f) completeness.push(issue('MISSING_CONDITION', 'Describe when this branch is taken, or designate it as the default branch.', [f.id]));
      }
    }
  }
  let layout;
  try {
    layout = await metricsXml(snapshot.xml);
    for (const key of ['crossings','overlaps','frameIntrusion','through','detachedEdge','missing','labelClash','labelOnLine','outsideLane','outsidePool','outsideSub','labelOutsideFrame']) {
      if (layout.counts?.[key]) readability.push(issue(`LAYOUT_${key.toUpperCase()}`, `Layout metric ${key}: ${layout.counts[key]}. Inspect the diagram before approving readability.`));
    }
  } catch (error) { readability.push(issue('LAYOUT_UNAVAILABLE', `Layout metrics could not be computed: ${error.message}`)); }
  const coverage = new Set(snapshot.discovery.claims.filter(c => c.state === snapshot.mode && c.status === 'supported').flatMap(c => c.elementIds));
  const uncovered = elements.filter(e => (isType(e, 'FlowNode') || BUSINESS_TYPES.has(typeOf(e))) && !coverage.has(e.id)).map(e => e.id);
  const uncertain = snapshot.discovery.claims.filter(c => c.state === snapshot.mode && c.status !== 'supported').map(c => c.id);
  const unresolved = snapshot.discovery.questions.filter(q => q.blocking && q.status !== 'answered').map(q => q.id);
  const reviews = Object.fromEntries(['semantic','behavioral','pragmatic'].map(aspect => [aspect, currentReview(snapshot, snapshot.reviews[aspect])]));
  const scenarios = (snapshot.discovery.scenarios || []).map(s => ({ id: s.id, title: s.title, review: currentReview(snapshot, snapshot.scenarioReviews?.[s.id]) }));
  const conflicts = (snapshot.discovery.conflicts || []).filter(c => c.status === 'open' && c.claimIds.some(id => snapshot.discovery.claims.some(claim => claim.id === id && claim.state === snapshot.mode)));
  const walkthrough = { status: snapshot.discovery.walkthrough ? (currentWalkthrough(snapshot) ? 'current' : 'stale') : 'missing' };
  const behavior = behaviorPatterns(nodes, flows);
  const blockers = [...structural, ...completeness, ...behavior.filter(f => f.blocking)];
  if (!nodes.length) blockers.push(issue('EMPTY_MODEL', 'The model contains no process behavior.'));
  if (!snapshot.discovery.context.trigger.trim() || !snapshot.discovery.context.outcomes.length) blockers.push(issue('BOUNDARIES_INCOMPLETE', 'Record the process trigger and outcomes.'));
  if (uncovered.length) blockers.push(issue('UNCOVERED_ELEMENTS', 'Some business elements or flows have no supported evidence claim.', uncovered));
  if (uncertain.length) blockers.push(issue('UNCERTAIN_CLAIMS', 'Resolve or remove in-scope uncertain claims before finalization.', uncertain));
  if (unresolved.length) blockers.push(issue('OPEN_QUESTIONS', 'Resolve blocking questions before finalization.', unresolved));
  if (conflicts.length) blockers.push(issue('CONFLICTING_EVIDENCE', 'Resolve the recorded disagreements about this process before finalization.', conflicts.map(c => c.id)));
  if (walkthrough.status === 'stale') blockers.push(issue('STALE_WALKTHROUGH', 'Refresh or remove the written walkthrough after the discovery or model changes.'));
  for (const scenario of scenarios) if (scenario.review?.outcome !== 'confirmed')
    blockers.push(issue('SCENARIO_REVIEW_REQUIRED', `Walk through “${scenario.title}” with a knowledgeable person and record the result.`, [scenario.id]));
  for (const [aspect, review] of Object.entries(reviews)) if (review?.outcome !== 'approved') blockers.push(issue('REVIEW_REQUIRED', `${aspect} review requires explicit human approval of this content.`));
  return {
    profile: QUALITY_PROFILE, revision: snapshot.revision,
    structural: { passed: structural.length === 0, findings: structural, scope: 'Miragon checks, parser warnings and selected reference/flow rules; not comprehensive BPMN XSD conformance.' },
    behavioral: { provedSound: false, findings: behavior, scope: 'Two simple split/join mismatch patterns only. Loops, events, conditions, messages and general soundness need further analysis.' },
    completeness, evidence: { uncoveredElements: uncovered, uncertainClaims: uncertain, unresolvedQuestions: unresolved, scope: 'Quote existence and links are checked; factual entailment requires human validation.' },
    readability: { findings: readability, layoutCounts: layout?.counts || null, manual: ['Verb-object activity labels; object-state event labels', 'Shared vocabulary and suitable level of detail', 'One start per trigger and one end per outcome', 'Structured flow where feasible; understandable exceptions', 'Readable direction, labels and handoffs at normal viewing size'] },
    backendWarnings: backend.warnings,
    overriddenAdvisories: backend.warnings.filter(w => w.code === 'W_GATEWAY_NAME').map(w => ({ ...w, reason: 'The book-based convention favors explicit branch conditions and unlabeled split gateways.' })),
    reviews, scenarios, walkthrough, openConflicts: conflicts.map(c => c.id), readyToFinalize: blockers.length === 0, blockers,
  };
}
