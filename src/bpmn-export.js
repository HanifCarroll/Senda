import { BpmnModdle } from 'bpmn-moddle';
import { collect } from './model.js';

/** Transfer presentation only onto a fresh parse of the complete saved model.
 * Projected processes, participants and rewritten message endpoints must never
 * replace the authoritative BPMN semantics in the whole-model export.
 */
export async function portableBpmn(xml, layouts) {
  if (!layouts.length) return xml;
  const moddle = new BpmnModdle(), { rootElement: definitions, elementsById } = await moddle.fromXML(xml);
  const semantic = new Map(collect(definitions).map(e => [e.id, e]));
  const used = new Set(Object.keys(elementsById));
  const allocate = preferred => {
    let id = preferred, n = 1;
    while (used.has(id)) id = `${preferred}_${n++}`;
    used.add(id); return id;
  };
  definitions.diagrams = [];
  for (const layout of layouts) {
    const { rootElement: projection } = await new BpmnModdle().fromXML(layout.xml);
    const source = projection.diagrams[0], scope = semantic.get(layout.elementId);
    const detail = scope.$instanceOf('bpmn:SubProcess');
    const items = source.plane.planeElement || [];
    const eligible = items.filter(e => semantic.has(e.bpmnElement?.id)
      && (!detail || !e.bpmnElement.$instanceOf('bpmn:Participant'))
      && (!detail || !e.bpmnElement.$instanceOf('bpmn:MessageFlow')));
    const copies = new Map();
    function copy(node) {
      if (!node || typeof node !== 'object') return node;
      if (node.$type?.startsWith('bpmn:')) return semantic.get(node.id);
      if (copies.has(node)) return copies.get(node);
      const result = moddle.create(node.$type, { ...node.$attrs }); copies.set(node, result);
      for (const prop of node.$descriptor.properties) {
        if (prop.isVirtual || prop.isReadOnly) continue;
        const value = node[prop.name];
        if (value === undefined) continue;
        // Dock references are optional and some projected endpoints do not
        // belong to the standard subprocess plane. Geometry is sufficient.
        if (['sourceElement', 'targetElement'].includes(prop.name)) continue;
        const clone = child => {
          const next = copy(child);
          if (!prop.isReference && next && typeof next === 'object') next.$parent = result;
          return next;
        };
        result.set(prop.name, prop.name === 'id' ? allocate(value) : Array.isArray(value) ? value.map(clone) : clone(value));
      }
      return result;
    }
    const plane = moddle.create('bpmndi:BPMNPlane', { id: allocate(`ExportPlane_${scope.id}`), bpmnElement: scope, planeElement: eligible.map(copy) });
    for (const item of plane.planeElement) item.$parent = plane;
    const diagram = moddle.create('bpmndi:BPMNDiagram', { id: allocate(`ExportDiagram_${scope.id}`), name: scope.name || layout.title, plane, labelStyle: (source.labelStyle || []).map(copy) });
    plane.$parent = diagram; diagram.$parent = definitions;
    definitions.diagrams.push(diagram);
  }
  return (await moddle.toXML(definitions, { format: true })).xml;
}

/** Standalone scoped artifact: retains the review's outside-party context.
 * It is explicitly documented as a view, never the complete process model.
 */
export async function standaloneBpmn(xml, { elementId, title, detail, messages }) {
  const moddle = new BpmnModdle(), { rootElement: definitions } = await moddle.fromXML(xml);
  const addNote = (element, text) => {
    const note = moddle.create('bpmn:Documentation', { text }); note.$parent = element;
    element.documentation = [...(element.documentation || []), note];
  };
  for (const root of definitions.rootElements.filter(e => e.$instanceOf('bpmn:Process') || e.$instanceOf('bpmn:Collaboration'))) {
    if (root.$instanceOf('bpmn:Process')) root.isExecutable = false;
    addNote(root, `Senda standalone review view: ${title} (${elementId}). ${detail ? 'This file contains only this subprocess, promoted to a non-executable process, with outside participants for context. ' : 'This file contains only the visible overview; nested contents are omitted. '}Use model.bpmn for the complete process and original message endpoints.`);
  }
  const byId = new Map(collect(definitions).map(e => [e.id, e]));
  for (const message of messages) if (byId.has(message.id)) addNote(byId.get(message.id), `Original message endpoints in model.bpmn: ${message.sourceRef.id} -> ${message.targetRef.id}. The standalone view may represent an outside endpoint by its participant.`);
  return (await moddle.toXML(definitions, { format: true })).xml;
}
