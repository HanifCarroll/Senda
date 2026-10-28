import { BpmnModdle } from 'bpmn-moddle';
import { renderSvg, metricsXml } from '@miragon/bpmn-cli';
import { collect, typeOf } from './model.js';
import { layoutReviewProjection } from './review-layout.js';
import { portableBpmn, standaloneBpmn } from './bpmn-export.js';

const is = (element, type) => element?.$instanceOf?.(`bpmn:${type}`);
const escapeAttribute = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const processOf = element => {
  for (let current = element; current; current = current.$parent) if (is(current, 'Process')) return current;
};
const within = (element, scope) => {
  for (let current = element; current; current = current.$parent) if (current === scope) return true;
  return false;
};

const layoutAdvice = {
  crossings: 'Connections cross. Follow each route through the intersection.',
  overlaps: 'Shapes overlap. Their boundaries must remain distinguishable.',
  through: 'A connection passes through an unrelated shape.',
  missing: 'A model element has no drawing.',
  labelClash: 'Labels overlap. Check their full wording at 100%.',
  labelOnLine: 'A label touches a connection.',
  titleIntrusion: 'A connection or label enters a pool or lane title strip.',
  branchLabelFar: 'A branch condition is far from its decision. Check which path it describes.',
  longDetour: 'A connection takes a long route with several bends. Check that it is easy to follow.',
  tangentEntry: 'A connection runs along its endpoint border. Check that its arrow clearly enters the shape.',
  labelOnControl: 'A label occupies the usual subprocess navigation-button area in external editors.',
};

/** Read-only view projections. No projected XML is persisted or exported as the model.
 * A detail view keeps the original local nodes/flows. Message endpoints outside it
 * are represented by their participant, with the exact endpoints retained in the
 * viewer's original-model index. Parent views link to descendants instead of
 * inventing message flows attached to collapsed subprocess boxes.
 */
export async function diagramViews(xml) {
  const parsed = await new BpmnModdle().fromXML(xml);
  const original = collect(parsed.rootElement);
  if (!original.some(e => is(e, 'FlowNode') || is(e, 'Participant'))) return { diagrams: [], bpmnXml: xml, rendering: { totalMessages: 0, drawnMessages: 0, missingMessageIds: [], sourceMissingIds: [], recoveredSourceIds: [], views: [] } };
  const collaborations = original.filter(e => is(e, 'Collaboration'));
  const participants = original.filter(e => is(e, 'Participant'));
  const processes = original.filter(e => is(e, 'Process'));
  const subprocesses = original.filter(e => is(e, 'SubProcess') && e.flowElements?.some(n => is(n, 'FlowNode')));
  const overviewFor = process => collaborations.find(c => c.participants?.some(p => p.processRef === process)) || process;
  const overviewRoots = [...collaborations, ...processes.filter(p => !participants.some(participant => participant.processRef === p))];
  const specs = [...overviewRoots.map(root => ({ root, parentId: null })), ...subprocesses.map(root => ({ root, parentId: is(root.$parent, 'SubProcess') ? root.$parent.id : overviewFor(processOf(root))?.id }))];
  const originalMessages = original.filter(e => is(e, 'MessageFlow'));
  const allIds = new Set(original.map(e => e.id));
  const allocate = prefix => { let id = prefix, n = 1; while (allIds.has(id)) id = `${prefix}_${n++}`; allIds.add(id); return id; };
  const diagrams = [], layouts = [];

  for (const { root, parentId } of specs) {
    // Reparse per projection so detaching children cannot change another view,
    // the original element index, or the immutable saved XML.
    const moddle = new BpmnModdle();
    const { rootElement: definitions } = await moddle.fromXML(xml);
    const elements = collect(definitions), byId = new Map(elements.map(e => [e.id, e]));
    const scope = byId.get(root.id);
    const detail = is(scope, 'SubProcess');
    const contextIds = [];
    let visible, retainedMessages;
    const pruneChildren = container => {
      for (const child of container.flowElements || []) if (is(child, 'SubProcess')) {
        child.flowElements = []; child.artifacts = []; child.laneSets = [];
      }
    };
    if (detail) {
      const local = [...(scope.flowElements || []), ...(scope.artifacts || [])];
      const localIds = new Set(local.map(e => e.id));
      const owningProcess = processOf(scope);
      const owner = elements.find(e => is(e, 'Participant') && e.processRef === owningProcess);
      const process = moddle.create('bpmn:Process', { id: allocate('Review_Process'), name: scope.name, isExecutable: false, flowElements: scope.flowElements, artifacts: scope.artifacts, laneSets: scope.laneSets });
      for (const element of [...local, ...(scope.laneSets || [])]) element.$parent = process;
      pruneChildren(process);
      const pool = moddle.create('bpmn:Participant', { id: allocate('Review_Participant'), name: owner?.name || scope.name || 'Process detail', processRef: process });
      const others = new Map();
      const counterpart = endpoint => {
        const participant = is(endpoint, 'Participant') ? endpoint : elements.find(e => is(e, 'Participant') && e.processRef === processOf(endpoint));
        if (!participant) throw new Error(`No participant represents message endpoint ${endpoint?.id || '(missing)'}.`);
        if (!others.has(participant.id)) {
          const context = moddle.create('bpmn:Participant', { id: participant.id, name: participant.name || 'Other participant' });
          others.set(participant.id, context); contextIds.push(participant.id);
        }
        return others.get(participant.id);
      };
      retainedMessages = elements.filter(e => is(e, 'MessageFlow') && (localIds.has(e.sourceRef?.id) || localIds.has(e.targetRef?.id)));
      for (const message of retainedMessages) {
        if (!localIds.has(message.sourceRef?.id)) message.sourceRef = counterpart(message.sourceRef);
        if (!localIds.has(message.targetRef?.id)) message.targetRef = counterpart(message.targetRef);
      }
      const collaboration = moddle.create('bpmn:Collaboration', { id: allocate('Review_Collaboration'), participants: [pool, ...others.values()], messageFlows: retainedMessages });
      for (const element of [...collaboration.participants, ...retainedMessages]) element.$parent = collaboration;
      definitions.rootElements = [...definitions.rootElements.filter(e => !is(e, 'Process') && !is(e, 'Collaboration')), collaboration, process];
      visible = [...local, ...others.values()];
    } else {
      const pools = is(scope, 'Collaboration') ? scope.participants || [] : [];
      const localProcesses = is(scope, 'Process') ? [scope] : pools.map(p => p.processRef).filter(Boolean);
      visible = [...pools, ...localProcesses.flatMap(p => [...(p.flowElements || []), ...(p.artifacts || [])])];
      const visibleIds = new Set(visible.map(e => e.id));
      retainedMessages = (scope.messageFlows || []).filter(m => visibleIds.has(m.sourceRef?.id) && visibleIds.has(m.targetRef?.id));
      if (is(scope, 'Collaboration')) scope.messageFlows = retainedMessages;
      localProcesses.forEach(pruneChildren);
      definitions.rootElements = [...definitions.rootElements.filter(e => !is(e, 'Process') && !is(e, 'Collaboration')), ...(is(scope, 'Collaboration') ? [scope] : []), ...localProcesses];
    }
    for (const element of definitions.rootElements) element.$parent = definitions;
    definitions.diagrams = [];
    const projection = (await moddle.toXML(definitions, { format: true })).xml;
    const collapsed = visible.filter(e => is(e, 'SubProcess')).map(e => e.id);
    const optimized = await layoutReviewProjection(projection, collapsed);
    layouts.push({ elementId: root.id, title: root.name, xml: optimized.xml });
    const rendered = await renderSvg(optimized.xml);
    const drawn = id => rendered.svg.includes(`data-id="${escapeAttribute(id)}"`);
    const elementIds = original.filter(e => drawn(e.id)).map(e => e.id);
    const childIds = specs.filter(s => s.parentId === root.id).map(s => s.root.id);
    const enclosing = [];
    for (let at = root; is(at, 'SubProcess'); at = at.$parent) enclosing.push(at);
    const inheritedEventIds = original.filter(e => is(e, 'BoundaryEvent') && enclosing.includes(e.attachedToRef)).map(e => e.id);
    const relevantMessages = originalMessages.filter(m => detail
      ? within(m.sourceRef, root) || within(m.targetRef, root)
      : is(root, 'Collaboration') ? m.$parent === root : within(m.sourceRef, root) || within(m.targetRef, root));
    diagrams.push({
      elementId: root.id, title: root.name || (detail ? 'Process detail' : 'Process overview'), parentId, childIds,
      file: diagrams.length ? `diagram-${diagrams.length + 1}.svg` : 'diagram.svg',
      bpmnFile: `view-${diagrams.length + 1}.bpmn`,
      bpmnXml: await standaloneBpmn(optimized.xml, { elementId: root.id, title: root.name || 'Process overview', detail, messages: originalMessages.filter(m => retainedMessages.some(r => r.id === m.id)) }),
      svg: rendered.svg, width: rendered.width, height: rendered.height, notes: rendered.notes,
      elementIds, contextIds, inheritedEventIds, messageIds: retainedMessages.filter(m => drawn(m.id)).map(m => m.id),
      relatedMessageIds: relevantMessages.map(m => m.id), layoutCounts: optimized.after, layoutBefore: optimized.before, layoutProblems: optimized.problems,
      readabilityFindings: Object.entries(layoutAdvice).filter(([kind])=>optimized.after[kind]).map(([code,message])=>({code,message,count:optimized.after[code],elementIds:[...new Set(optimized.problems.filter(p=>p.kind===code).flatMap(p=>p.ids))]})),
    });
  }
  const drawnIds = new Set(diagrams.flatMap(d => d.elementIds));
  const sourceMetrics = await metricsXml(xml);
  const sourceMissingIds = [...new Set(sourceMetrics.problems.filter(p => p.kind === 'missing').flatMap(p => p.ids))];
  const missingMessageIds = originalMessages.filter(m => !drawnIds.has(m.id)).map(m => m.id);
  return { diagrams, bpmnXml: await portableBpmn(xml, layouts), rendering: {
    mode: 'scoped-context-views', totalMessages: originalMessages.length, drawnMessages: originalMessages.length - missingMessageIds.length,
    missingMessageIds, sourceMissingIds, recoveredSourceIds: sourceMissingIds.filter(id => drawnIds.has(id)),
    portable: { mode: 'complete-model-with-review-di', contextViews: 'view-*.bpmn', note: 'The complete model preserves original semantics. Standard subprocess planes omit outside-participant context; standalone view files reproduce that context and document original endpoints. Editor fonts and subprocess support may differ.' },
    views: diagrams.map(d => ({ elementId: d.elementId, messageIds: d.messageIds, layoutCounts: d.layoutCounts, readabilityFindings:d.readabilityFindings })),
  } };
}
