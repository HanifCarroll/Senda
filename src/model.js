import { BpmnModdle } from 'bpmn-moddle';
import { newXml, applyToXml, parseOps, layoutXml, validateXml, renderSvg, metricsXml, viewXml, OPS_SCHEMA } from '@miragon/bpmn-cli';
import { requireThat } from './errors.js';

export { OPS_SCHEMA, validateXml, metricsXml, viewXml };
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
export async function diagramSvg(xml) {
  const r = await renderSvg(xml);
  return r.images?.[0]?.svg || r.svg || null;
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
  const a = new Map((await parseModel(before)).elements.map(e => [e.id, signature(e)]));
  const b = new Map((await parseModel(after)).elements.map(e => [e.id, signature(e)]));
  return {
    created: [...b.keys()].filter(id => !a.has(id)),
    removed: [...a.keys()].filter(id => !b.has(id)),
    changed: [...b.keys()].filter(id => a.has(id) && a.get(id) !== b.get(id)),
    xmlChanged: before !== after,
  };
}
