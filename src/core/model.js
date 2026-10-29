import { BpmnModdle } from 'bpmn-moddle';
import { newXml, applyToXml, parseOps, layoutXml, validateXml, metricsXml, OPS_SCHEMA } from '@miragon/bpmn-cli';
import { requireThat } from './errors.js';

export { OPS_SCHEMA, validateXml, metricsXml };
export const BUSINESS_TYPES = new Set(['Task','UserTask','ServiceTask','ManualTask','ScriptTask','SendTask','ReceiveTask','BusinessRuleTask','CallActivity','SubProcess','StartEvent','EndEvent','IntermediateCatchEvent','IntermediateThrowEvent','BoundaryEvent','ExclusiveGateway','ParallelGateway','InclusiveGateway','EventBasedGateway','ComplexGateway','Participant','Lane','SequenceFlow','MessageFlow','DataObjectReference','DataStoreReference']);
export const typeOf = (el) => el.$type?.replace('bpmn:', '') || '';
export function collect(definitions) {
  const result = [], seen = new Set();
  function visit(node) {
    if (!node || seen.has(node)) return;
    seen.add(node);
    if (node.id && node.$type?.startsWith('bpmn:')) result.push(node);
    for (const prop of node.$descriptor?.properties || []) {
      if (prop.isReference || prop.isAttr || prop.type === 'String') continue;
      const child = node[prop.name];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
    }
  }
  visit(definitions);
  return result;
}
export async function parseModel(xml) {
  const p = await new BpmnModdle().fromXML(xml);
  return { ...p, elements: collect(p.rootElement) };
}
// Agent reads need the control-flow semantics, not the diagram's coordinates.
export async function describeModel(xml) {
  const { elements } = await parseModel(xml);
  return elements.map(e => ({
    id: e.id, type: e.$type, name: e.name, parent: e.$parent?.id,
    source: e.sourceRef?.id, target: e.targetRef?.id,
    condition: e.conditionExpression?.body, default: e.default?.id,
    attachedTo: e.attachedToRef?.id, cancelActivity: e.cancelActivity,
    triggeredByEvent: e.triggeredByEvent,
    flowNodes: e.flowNodeRef?.map(n => n.id),
    process: e.processRef?.id,
    errorCode: e.errorCode, escalationCode: e.escalationCode,
    definitions: e.eventDefinitions?.map(d => ({
      type: d.$type, duration: d.timeDuration?.body, date: d.timeDate?.body,
      cycle: d.timeCycle?.body, message: d.messageRef?.name,
      messageId: d.messageRef?.id, error: d.errorRef?.id,
      signal: d.signalRef?.id, escalation: d.escalationRef?.id,
      condition: d.condition?.body,
    })),
  }));
}
export async function createModel(name) {
  return (await newXml({ processId: 'Process_Main', processName: name, platform: 'none', target: 'none', executable: false })).xml;
}
export async function editModel(xml, operations, layout = 'incremental') {
  if (!operations.length) return { xml, aliases: {}, report: null };
  const ops = parseOps(operations);
  const result = await applyToXml(xml, ops, { platform: 'none', layout, keepFlowIds: true });
  return { xml: result.xml, aliases: result.result.aliases || {}, report: result.result };
}
export async function prepareImport(xml) {
  const parsed = await parseModel(xml);
  requireThat(parsed.warnings.length === 0, 'LOSSY_IMPORT', 'Import warnings must be resolved before saving.', { warnings: parsed.warnings.map(w => w.message) });
  const check = await validateXml(xml, { platform: 'none' });
  requireThat(check.ok, 'INVALID_MODEL', 'The imported model failed structural validation.', { errors: check.errors });
  if (!parsed.rootElement.diagrams?.length) return (await layoutXml(xml, { platform: 'none' })).xml;
  return xml;
}
function signature(e) {
  function plain(node) {
    if (!node || typeof node !== 'object') return node;
    const value = { type: node.$type, attrs: node.$attrs };
    for (const property of node.$descriptor?.properties || []) {
      const child = node[property.name];
      if (child === undefined) continue;
      const serialize = item => property.isReference ? item?.id : plain(item);
      value[property.name] = Array.isArray(child) ? child.map(serialize) : serialize(child);
    }
    return value;
  }
  return JSON.stringify({ parent: e.$parent?.id, ...plain(e) });
}
export async function modelChanges(before, after) {
  const oldElements = (await parseModel(before)).elements, newElements = (await parseModel(after)).elements;
  const a = new Map(oldElements.map(e => [e.id, signature(e)]));
  const b = new Map(newElements.map(e => [e.id, signature(e)]));
  const changes = {
    created: [...b.keys()].filter(id => !a.has(id)),
    removed: [...a.keys()].filter(id => !b.has(id)),
    changed: [...b.keys()].filter(id => a.has(id) && a.get(id) !== b.get(id)),
    xmlChanged: before !== after,
  };
  const label = e => e?.name || `unnamed ${typeOf(e || {}).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase() || 'element'}`;
  const describe = e => ['SequenceFlow', 'MessageFlow'].includes(typeOf(e))
    ? `${typeOf(e) === 'MessageFlow' ? 'message' : 'connection'} from “${label(e.sourceRef)}” to “${label(e.targetRef)}”${e.name || e.conditionExpression?.body ? ` when ${e.name || e.conditionExpression.body}` : ''}`
    : `“${label(e)}”`;
  const descriptions = [];
  for (const [key, prefix, elements] of [['created', 'Added', newElements], ['removed', 'Removed', oldElements]])
    for (const id of changes[key]) {
      const e = elements.find(e => e.id === id);
      if (BUSINESS_TYPES.has(typeOf(e)) || e.$instanceOf?.('bpmn:FlowNode')) descriptions.push(`${prefix} ${describe(e)}.`);
    }
  for (const id of changes.changed) {
    const previous = oldElements.find(e => e.id === id), next = newElements.find(e => e.id === id);
    if (!BUSINESS_TYPES.has(typeOf(next)) && !next.$instanceOf?.('bpmn:FlowNode')) continue;
    if (['SequenceFlow', 'MessageFlow'].includes(typeOf(next))) descriptions.push(`Changed ${describe(previous)} to ${describe(next)}.`);
    else if (previous.name !== next.name) descriptions.push(`Renamed “${label(previous)}” to “${label(next)}”.`);
    else descriptions.push(`Updated the details of “${label(next)}”.`);
  }
  return { ...changes, descriptions };
}
