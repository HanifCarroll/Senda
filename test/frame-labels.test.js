import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BpmnModdle } from 'bpmn-moddle';
import { diagramViews } from '../src/core/diagram-views.js';
import { textWidth } from '../src/core/diagram-text.js';

const definitions = body => `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:frame-labels">${body}</bpmn:definitions>`;
const names = {
  Pool: 'Customer success and implementation services department for the northern region',
  Short: 'Regional technical implementation and integration engineering specialist',
  Other: 'Lead',
  Outside: 'An external logistics and customs clearance partner with a very long registered company name indeed',
};
const xml = definitions(`<bpmn:collaboration id="C"><bpmn:participant id="Pool" name="${names.Pool}" processRef="P"/><bpmn:participant id="Outside" name="${names.Outside}"/><bpmn:messageFlow id="M" sourceRef="A" targetRef="Outside"/></bpmn:collaboration>
<bpmn:process id="P"><bpmn:laneSet id="Lanes"><bpmn:lane id="Short" name="${names.Short}"><bpmn:flowNodeRef>A</bpmn:flowNodeRef></bpmn:lane><bpmn:lane id="Other" name="${names.Other}"><bpmn:flowNodeRef>B</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>
<bpmn:task id="A" name="Send"/><bpmn:task id="B" name="File"/><bpmn:sequenceFlow id="F" sourceRef="A" targetRef="B"/></bpmn:process>`);

// What the SVG draws: each name's lines, turned a quarter where the title strip runs up the frame.
function drawn(svg, id) {
  const group = svg.match(new RegExp(`<g data-id="${id}">([\\s\\S]*?)</g>`))[1];
  const [x, y, width, height] = ['x', 'y', 'width', 'height'].map(key => Number(group.match(new RegExp(`<rect[^>]* ${key}="([-\\d.]+)"`))[1]));
  const text = group.match(/<text\b([^>]*)>([\s\S]*?)<\/text>/), turned = /rotate\(-90/.test(text[1]);
  const lines = [...text[2].matchAll(/<tspan x="([-\d.]+)" y="([-\d.]+)">([^<]*)<\/tspan>/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]), text: m[3] }));
  const [cx, cy] = turned ? text[1].match(/rotate\(-90 ([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number) : [];
  // Generous glyph boxes: a tenth wider than the measured width, for a substituted font.
  const boxes = lines.map(line => {
    const half = textWidth(line.text) * 1.1 / 2, box = { left: line.x - half, right: line.x + half, top: line.y - 11, bottom: line.y + 3.4 };
    return turned ? { left: cx + (box.top - cy), right: cx + (box.bottom - cy), top: cy - (box.right - cx), bottom: cy - (box.left - cx) } : box;
  });
  return { frame: { left: x, top: y, right: x + width, bottom: y + height }, boxes, text: lines.map(l => l.text).join(' ') };
}

test('a pool or lane name longer than its frame wraps or grows the frame and never leaves it', async () => {
  const result = await diagramViews(xml), view = result.diagrams[0];
  const frames = Object.fromEntries(Object.keys(names).map(id => [id, drawn(view.svg, id)]));
  for (const [id, { frame, boxes, text }] of Object.entries(frames)) {
    assert.equal(text.replaceAll(' ', ''), names[id].replaceAll(' ', ''), `${id}: the whole name is drawn`);
    assert.ok(boxes.length > 1 || id === 'Other', `${id}: a long name takes more than one line`);
    for (const box of boxes) assert.ok(box.left >= frame.left && box.right <= frame.right && box.top >= frame.top && box.bottom <= frame.bottom, `${id}: ${JSON.stringify(box)} stays inside ${JSON.stringify(frame)}`);
  }
  for (const id of ['Pool', 'Short', 'Other']) for (const box of frames[id].boxes) assert.ok(box.right <= frames[id].frame.left + 30, `${id}: the name stays in its 30px title strip`);
  // Lanes still tile their pool: none runs over the next, and together they fill it.
  const { Pool, Short, Other } = frames;
  const [upper, lower] = [Short, Other].sort((a, b) => a.frame.top - b.frame.top);
  assert.equal(upper.frame.top, Pool.frame.top);
  assert.equal(upper.frame.bottom, lower.frame.top);
  assert.equal(lower.frame.bottom, Pool.frame.bottom);
  // The exported file carries the same frames, and nothing but the drawing changed.
  const moddle = new BpmnModdle(), exported = (await moddle.fromXML(result.bpmnXml)).rootElement;
  for (const shape of exported.diagrams[0].plane.planeElement.filter(s => frames[s.bpmnElement.id])) {
    const f = frames[shape.bpmnElement.id].frame, b = shape.bounds;
    assert.deepEqual([b.x, b.y, b.x + b.width, b.y + b.height], [f.left, f.top, f.right, f.bottom]);
  }
  const canonical = async value => { const d = (await moddle.fromXML(value)).rootElement; d.diagrams = []; return (await moddle.toXML(d, { format: true })).xml; };
  assert.equal(await canonical(result.bpmnXml), await canonical(xml));
  assert.deepEqual(view.layoutProblems.filter(p => ['outsideLane', 'outsidePool', 'frameOverlap', 'laneGap'].includes(p.kind)), []);
});

// Names other editors save: hard line breaks, no spaces at all, and scripts the font metrics don't list.
const awkward = {
  Pool: 'Operations\nNorth region\nSupport',
  Short: 'Billing\nCollections\nDisputes',
  Other: 'CustomerRelationshipManagementAndRenewalsDepartmentNorthernRegionOperations',
  Japanese: '顧客関係管理および契約更新を担当する北部地域の業務部門',
  Arabic: 'قسم إدارة علاقات العملاء وتجديد العقود في المنطقة الشمالية',
  Outside: 'External\nlogistics\npartner',
};
const attribute = value => value.replaceAll('\n', '&#10;');
const awkwardXml = definitions(`<bpmn:collaboration id="C"><bpmn:participant id="Pool" name="${attribute(awkward.Pool)}" processRef="P"/><bpmn:participant id="Outside" name="${attribute(awkward.Outside)}"/><bpmn:messageFlow id="M" sourceRef="A" targetRef="Outside"/></bpmn:collaboration>
<bpmn:process id="P"><bpmn:laneSet id="Lanes">${['Short', 'Other', 'Japanese', 'Arabic'].map((id, i) => `<bpmn:lane id="${id}" name="${attribute(awkward[id])}"><bpmn:flowNodeRef>${i ? 'T' + i : 'A'}</bpmn:flowNodeRef></bpmn:lane>`).join('')}</bpmn:laneSet>
${['A', 'T1', 'T2', 'T3'].map(id => `<bpmn:task id="${id}" name="Step"/>`).join('')}</bpmn:process>`);

test('pool and lane names with line breaks, no spaces or another script render inside their frames and export unchanged', { timeout: 20000 }, async () => {
  const result = await diagramViews(awkwardXml), view = result.diagrams[0];
  for (const id of Object.keys(awkward)) {
    const { frame, boxes, text } = drawn(view.svg, id);
    assert.equal(text.replaceAll(' ', ''), awkward[id].replace(/\s/g, ''), `${id}: the whole name is drawn, its line breaks as spaces`);
    assert.ok(id === 'Outside' || boxes.length <= 2, `${id}: the title strip holds two lines`);
    for (const box of boxes) assert.ok(box.left >= frame.left && box.right <= frame.right && box.top >= frame.top && box.bottom <= frame.bottom, `${id}: ${JSON.stringify(box)} stays inside ${JSON.stringify(frame)}`);
  }
  const exported = (await new BpmnModdle().fromXML(result.bpmnXml)).rootElement;
  const named = new Map(exported.diagrams[0].plane.planeElement.map(shape => [shape.bpmnElement.id, shape.bpmnElement.name]));
  for (const [id, name] of Object.entries(awkward)) assert.equal(named.get(id), name, `${id}: the exported name keeps its line breaks`);
});

test('a name too long for the tallest lane ends in an ellipsis instead of growing the lane without limit', { timeout: 20000 }, async () => {
  const name = Array.from({ length: 400 }, (_, i) => 'word' + i).join(' ');
  const view = (await diagramViews(definitions(`<bpmn:process id="P"><bpmn:laneSet id="Lanes"><bpmn:lane id="Short" name="${name}"><bpmn:flowNodeRef>A</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet><bpmn:task id="A" name="Step"/></bpmn:process>`))).diagrams[0];
  const { frame, boxes, text } = drawn(view.svg, 'Short');
  assert.equal(boxes.length, 2);
  assert.ok(text.endsWith('…') && name.startsWith(text.slice(0, -1)));
  assert.ok(frame.bottom - frame.top <= 600);
  for (const box of boxes) assert.ok(box.top >= frame.top && box.bottom <= frame.bottom && box.right <= frame.left + 30);
});

test('the lines an event, gateway or flow label is drawn with stay clear of every connection', async () => {
  const view = (await diagramViews(await readFile(new URL('./fixtures/synthetic-invoice-dense.bpmn', import.meta.url), 'utf8'))).diagrams[0];
  const edges = (await new BpmnModdle().fromXML(view.bpmnXml)).rootElement.diagrams[0].plane.planeElement.filter(e => e.waypoint?.length >= 2);
  const labels = [...view.svg.matchAll(/<text data-label="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g)];
  assert.ok(labels.length > 20, 'Exercise a dense view');
  for (const [, id, text] of labels) for (const [, x, y, line] of text.matchAll(/<tspan x="([-\d.]+)" y="([-\d.]+)">([^<]*)<\/tspan>/g)) {
    // An 11px line as the renderer measures it, less a pixel of side bearing.
    const half = textWidth(line) * 11 / 12 / 2 - 1, box = { left: x - half, right: +x + half, top: y - 9, bottom: +y + 2 };
    for (const edge of edges) for (let i = 1; i < edge.waypoint.length; i++) {
      const a = edge.waypoint[i - 1], b = edge.waypoint[i];
      const crosses = Math.max(a.x, b.x) > box.left && Math.min(a.x, b.x) < box.right && Math.max(a.y, b.y) > box.top && Math.min(a.y, b.y) < box.bottom;
      assert.ok(!crosses, `${id}: "${line}" is crossed by ${edge.bpmnElement.id}`);
    }
  }
});
