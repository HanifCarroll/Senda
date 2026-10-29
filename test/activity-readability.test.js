import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BpmnModdle } from 'bpmn-moddle';
import { layoutXml } from '@miragon/bpmn-cli';
import { diagramViews } from '../src/core/diagram-views.js';
import { activityAtlas, activityNames, threeBoundaryTimers, markedBoundaryTimers } from './fixtures/diagram-readability.js';

const attr = (tag, key) => tag.match(new RegExp(`(?:^|\\s)${key}="([^"]*)"`))?.[1];
const decode = value => value.replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&amp;','&');
function group(svg,id) {
  const start=svg.indexOf(`<g data-id="${id}">`);
  assert.ok(start>=0,`${id}: documented complete data-id group exists`);
  let depth=0;
  for (const token of svg.slice(start).matchAll(/<\/?g\b[^>]*>/g)) {
    depth += token[0].startsWith('</') ? -1 : 1;
    if(!depth) return svg.slice(start,start+token.index+token[0].length);
  }
  assert.fail(`${id}: unbalanced SVG group`);
}
async function parsed(xml) {
  const m=new BpmnModdle(),result=await m.fromXML(xml); assert.deepEqual(result.warnings,[]); return result.rootElement;
}
async function semantics(xml) {const m=new BpmnModdle(),d=await parsed(xml);d.diagrams=[];return(await m.toXML(d,{format:true})).xml;}
const drawing = d => d.diagrams[0].plane.planeElement;
const intersects=(a,b)=>a.x<b.x+b.width && a.x+a.width>b.x && a.y<b.y+b.height && a.y+a.height>b.y;

test('real review SVG and BPMN exports reserve room for complete activity text, glyphs and markers', async()=>{
  const xml=activityAtlas(), result=await diagramViews(xml), view=result.diagrams[0], d=await parsed(view.bpmnXml);
  assert.equal(await semantics(result.bpmnXml),await semantics(xml));
  const portable=drawing(await parsed(result.bpmnXml));
  for(const shape of drawing(d).filter(s=>s.bounds && s.bpmnElement.$instanceOf('bpmn:Activity'))) {
    const id=shape.bpmnElement.id,b=shape.bounds,svg=group(view.svg,id),text=svg.match(/<text\b[^>]*>[\s\S]*?<\/text>/)?.[0];
    const spans=[...text.matchAll(/<tspan\b([^>]*)>([\s\S]*?)<\/tspan>/g)];
    assert.ok(spans.length,`${id}: full name is drawn`);
    assert.equal(spans.map(s=>decode(s[2])).join('').replaceAll(/\s/g,''),activityNames[id].replaceAll(/\s/g,''),`${id}: no dropped wording`);
    const ys=spans.map(s=>Number(attr(s[1],'y'))),top=Math.min(...ys)-12,bottom=Math.max(...ys)+2.4;
    assert.ok(top>=b.y+36-.01,`${id}: text starts ${top-b.y}px below top; reserve 36px for glyph and step badge`);
    assert.ok(bottom<=b.y+b.height-30+.01,`${id}: text clears bottom marker band`);
    assert.match(text,/font-size="12"/);
    const icon=svg.match(/<g\b[^>]*transform="translate\(([-\d.]+)[ ,]+([-\d.]+)\)"/);
    if(['User','Send','Receive','Manual','Service','Script','Rule','Loop'].includes(id)) {
      assert.ok(icon,`${id}: typed task icon remains visible`);
      assert.ok(Number(icon[1])>=b.x+8 && Number(icon[2])>=b.y+8,`${id}: icon stays at least 8px inside border`);
    }
    assert.deepEqual({...portable.find(s=>s.bpmnElement.id===id).bounds},{...b},`${id}: whole-model and standalone DI agree`);
  }
  const markers={Loop:['loop'],Sequential:['sequential'],Parallel:['parallel'],Call:['collapsed'],Collapsed:['collapsed'],Transaction:['collapsed'],EventSub:['collapsed'],AdHoc:['parallel','collapsed','compensation','ad-hoc']};
  for(const [id,expected] of Object.entries(markers)) {
    const svg=group(view.svg,id),shape=drawing(d).find(s=>s.bpmnElement.id===id),b=shape.bounds;
    assert.deepEqual([...svg.matchAll(/data-activity-marker="([^"]+)"/g)].map(m=>m[1]),expected,`${id}: all BPMN markers remain distinct`);
    for(const marker of svg.matchAll(/<g data-activity-marker="[^"]+" transform="translate\(([-\d.]+) ([-\d.]+)\)"/g)) {
      assert.ok(Number(marker[1])>=b.x+8 && Number(marker[1])+14<=b.x+b.width-8,`${id}: marker clears side borders`);
      assert.ok(Number(marker[2])+14<=b.y+b.height-8,`${id}: marker clears bottom border`);
    }
  }
  assert.match(group(view.svg,'Call'),/stroke-width="5"/,'Call activity keeps its thick border');
  assert.equal([...group(view.svg,'Transaction').matchAll(/<rect\b/g)].length,3,'Transaction keeps double border and collapsed marker');
  assert.match(group(view.svg,'EventSub'),/stroke-dasharray="1 4"/,'Event subprocess keeps its dotted border');
  for(const kind of ['activityLabelBorder','activityLabelIcon','activityLabelMarker','activityLabelBoundary']) assert.equal(view.layoutCounts[kind],0,kind);
  assert.ok(view.layoutBefore.activityLabelIcon>0,'Original native layout defects remain visible in before metrics');
});

test('three boundary timers have spaced docking and nearby labels clear of the host and each other',async()=>{
  const xml=threeBoundaryTimers(),result=await diagramViews(xml),view=result.diagrams[0],items=drawing(await parsed(view.bpmnXml));
  assert.equal(await semantics(result.bpmnXml),await semantics(xml));
  const host=items.find(s=>s.bpmnElement.id==='Receive').bounds;
  const timers=items.filter(s=>s.bpmnElement.$type==='bpmn:BoundaryEvent').sort((a,b)=>a.bounds.x-b.bounds.x);
  const labels=timers.map(t=>t.label.bounds);
  const native=drawing(await parsed((await layoutXml(xml,{platform:'none'})).xml));
  assert.deepEqual(timers.map(t=>t.bpmnElement.id),native.filter(s=>s.bpmnElement.$type==='bpmn:BoundaryEvent').sort((a,b)=>a.bounds.x-b.bounds.x).map(t=>t.bpmnElement.id),'Boundary sibling order stays intact');
  for(const edge of items.filter(s=>s.waypoint?.length>=2)) for(const [ref,index] of [['sourceRef',0],['targetRef',edge.waypoint.length-1]]) {
    const shape=items.find(s=>s.bounds&&s.bpmnElement===edge.bpmnElement[ref]);
    if(!shape?.bpmnElement.$instanceOf('bpmn:Activity')) continue;
    const b=shape.bounds,p=edge.waypoint[index];
    assert.ok(Math.min(Math.abs(p.x-b.x),Math.abs(p.x-b.x-b.width),Math.abs(p.y-b.y),Math.abs(p.y-b.y-b.height))<.01,`${edge.bpmnElement.id}: endpoint docks to resized activity border`);
  }
  for(let i=0;i<timers.length;i++) {
    const t=timers[i],b=t.bounds,label=labels[i];
    assert.equal(t.bpmnElement.attachedToRef.id,'Receive');
    assert.ok(Math.abs(b.y+b.height/2-host.y-host.height)<.01,'Timer remains docked to the same bottom side');
    assert.ok(!intersects(label,host),'Timer label clears the enlarged host');
    assert.ok(label.y>=b.y+b.height+8,'Timer label has a real gutter below its event');
    assert.ok(label.y-b.y-b.height<=90,'Timer label stays close to its owner');
    if(i) assert.ok(b.x-timers[i-1].bounds.x>=56,'Timer glyphs have at least 20px between envelopes');
    for(let j=0;j<i;j++) assert.ok(!intersects(label,labels[j]),'Timer labels do not overlap');
  }
  for(const kind of ['overlaps','through','detachedEdge','outsideLane','outsidePool','labelClash','labelOnLine','activityLabelBoundary']) assert.equal(view.layoutCounts[kind],0,kind);
});

test('activity presentation keeps DI border, fill and label colors through review and export',async()=>{
  const xml=`<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0" xmlns:color="http://www.omg.org/spec/BPMN/non-normative/color/1.0" id="D" targetNamespace="urn:synthetic-colors"><bpmn:process id="P"><bpmn:userTask id="Colored" name="Review complete client information"/></bpmn:process><bpmndi:BPMNDiagram id="DI"><bpmndi:BPMNPlane id="Plane" bpmnElement="P"><bpmndi:BPMNShape id="ColoredDI" bpmnElement="Colored" bioc:fill="#eef7ee" bioc:stroke="#124512"><dc:Bounds x="80" y="80" width="100" height="80"/><bpmndi:BPMNLabel color:color="#543210"/></bpmndi:BPMNShape></bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>`;
  const result=await diagramViews(xml),view=result.diagrams[0],svg=group(view.svg,'Colored');
  assert.match(svg,/fill="#eef7ee"/);assert.match(svg,/stroke="#124512"/);assert.match(svg,/<text[^>]*fill="#543210"/);
  const shape=drawing(await parsed(result.bpmnXml)).find(s=>s.bpmnElement.id==='Colored');
  assert.equal(shape.get('bioc:fill'),'#eef7ee');assert.equal(shape.get('bioc:stroke'),'#124512');assert.equal(shape.label.get('color:color'),'#543210');
  assert.equal(await semantics(result.bpmnXml),await semantics(xml));
});


test('dense invoice external labels clear activities and gateways in the real review export',async()=>{
  const xml=await readFile(new URL('fixtures/synthetic-invoice-dense.bpmn',import.meta.url),'utf8');
  const result=await diagramViews(xml),view=result.diagrams[0],items=drawing(await parsed(view.bpmnXml));
  assert.equal(view.layoutCounts.labelClash,0,'All complete labels need clear drawing space');
  for(const [labelId,shapeId] of [['End_SupplierTimeout','Task_SupplierReject'],['Flow_FailureToSchedule','Gate_FailedResolution']]) {
    const label=items.find(s=>s.bpmnElement.id===labelId).label.bounds,shape=items.find(s=>s.bpmnElement.id===shapeId).bounds;
    assert.ok(!intersects(label,shape),`${labelId}: label clears ${shapeId}`);
  }
  assert.equal(await semantics(result.bpmnXml),await semantics(xml));
});


test('one or more bottom timers stay docked inside a four-marker host and clear every glyph',async()=>{
  const flowSemantics=definitions=>definitions.rootElements.find(e=>e.$type==='bpmn:Process').flowElements.map(e=>({id:e.id,type:e.$type,name:e.name,compensation:e.isForCompensation,loop:e.loopCharacteristics?.$type,sequential:e.loopCharacteristics?.isSequential,attachedTo:e.attachedToRef?.id,cancelActivity:e.cancelActivity,eventDefinitions:e.eventDefinitions?.map(d=>d.$type),source:e.sourceRef?.id,target:e.targetRef?.id}));
  for(const count of [1,2,3]) {
    const xml=markedBoundaryTimers(count),result=await diagramViews(xml),view=result.diagrams[0],items=drawing(await parsed(view.bpmnXml));
    assert.equal(await semantics(result.bpmnXml),await semantics(xml),'Only display DI changes in the whole-model export');
    assert.deepEqual(flowSemantics(await parsed(view.bpmnXml)),flowSemantics(await parsed(xml)),'Standalone view retains the exact timer, marker and flow semantics');
    const host=items.find(s=>s.bpmnElement.id==='Host').bounds;
    const timers=items.filter(s=>s.bpmnElement.$type==='bpmn:BoundaryEvent').sort((a,b)=>a.bounds.x-b.bounds.x);
    const native=drawing(await parsed((await layoutXml(xml,{platform:'none',collapse:['Host']})).xml));
    assert.deepEqual(timers.map(t=>t.bpmnElement.id),native.filter(s=>s.bpmnElement.$type==='bpmn:BoundaryEvent').sort((a,b)=>a.bounds.x-b.bounds.x).map(t=>t.bpmnElement.id),'Timer sibling order stays intact');
    const hostSvg=group(view.svg,'Host'),markers=[...hostSvg.matchAll(/<g data-activity-marker="([^"]+)" transform="translate\(([-\d.]+) ([-\d.]+)\)"/g)].map(m=>({kind:m[1],x:Number(m[2]),y:Number(m[3]),width:14,height:14}));
    assert.deepEqual(markers.map(m=>m.kind),['parallel','collapsed','compensation','ad-hoc'],'Every combined marker stays visible');
    const portable=drawing(await parsed(result.bpmnXml));
    for(let i=0;i<timers.length;i++) {
      const timer=timers[i],b=timer.bounds,cx=b.x+b.width/2,cy=b.y+b.height/2;
      assert.equal(timer.bpmnElement.attachedToRef.id,'Host');
      assert.ok(cx>=host.x+b.width/2+8-.01 && cx<=host.x+host.width-b.width/2-8+.01,`${count} timers: center ${cx} stays on the straight bottom span of ${host.x}..${host.x+host.width}`);
      assert.ok(Math.abs(cy-host.y-host.height)<.01,'Timer center stays exactly on its original bottom side');
      assert.ok(markers.every(m=>b.x+b.width+8<=m.x || m.x+m.width+8<=b.x),'Timer envelope has at least 8px of horizontal clearance from each marker');
      if(i) assert.ok(b.x-timers[i-1].bounds.x>=b.width+20-.01,'Sibling timer envelopes keep a 20px gutter');
      const circle=group(view.svg,timer.bpmnElement.id).match(/<circle\b([^>]*)>/);
      assert.ok(circle,'The timer remains a visible BPMN event');
      assert.ok(Math.abs(Number(attr(circle[1],'cx'))-cx)<.01 && Math.abs(Number(attr(circle[1],'cy'))-cy)<.01,'Actual SVG circle docks at the exported DI position');
      assert.deepEqual({...portable.find(s=>s.bpmnElement.id===timer.bpmnElement.id).bounds},{...b},'Both BPMN exports agree on timer geometry');
    }
    for(const kind of ['overlaps','through','detachedEdge','diagonal','outsideLane','outsidePool','labelClash','labelOnLine','activityLabelBorder','activityLabelIcon','activityLabelMarker','activityLabelBoundary']) assert.equal(view.layoutCounts[kind],0,`${count} timers: ${kind}`);
  }
});
