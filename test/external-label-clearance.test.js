import test from 'node:test';
import assert from 'node:assert/strict';
import {BpmnModdle} from 'bpmn-moddle';
import {diagramViews} from '../src/core/diagram-views.js';

test('external event labels reserve the renderer minimum width before finding a clear placement',async()=>{
 const xml=`<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:label-clearance"><bpmn:process id="P"><bpmn:startEvent id="Start" name="Customer Email Received"/><bpmn:userTask id="Record" name="Record Request"/><bpmn:userTask id="Check" name="Check Date Availability"/><bpmn:subProcess id="Outcome" name="Handle Booking Outcome"/><bpmn:endEvent id="End" name="Request Outcome Reached"/>${[['Start','Record'],['Record','Check'],['Check','Outcome'],['Outcome','End']].map(([a,b],i)=>`<bpmn:sequenceFlow id="F${i}" sourceRef="${a}" targetRef="${b}"/>`).join('')}</bpmn:process></bpmn:definitions>`;
 const original=xml,result=await diagramViews(xml),m=new BpmnModdle(),parsed=await m.fromXML(result.diagrams[0].bpmnXml);
 assert.deepEqual(parsed.warnings,[]);
 const items=parsed.rootElement.diagrams[0].plane.planeElement;
 for(const shape of items.filter(s=>s.bounds&&s.bpmnElement.$instanceOf('bpmn:Event')&&s.label?.bounds)){
  const b=shape.bounds,l=shape.label.bounds;
  assert.ok(l.width>=90,'Miragon renders external text at least 90px wide');
  assert.ok(l.x>=b.x+b.width+8||l.x+l.width<=b.x-8||l.y>=b.y+b.height+8||l.y+l.height<=b.y-8,`${shape.bpmnElement.id}: text has an 8px owner gutter`);
 }
 const canonical=async value=>{const d=(await m.fromXML(value)).rootElement;d.diagrams=[];return(await m.toXML(d,{format:true})).xml};
 assert.equal(await canonical(result.bpmnXml),await canonical(original),'Presentation does not change model behavior');
 assert.equal(xml,original);
});

test('gateway clearance includes the renderer second wrapping pass',async()=>{
 const xml=`<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:label-rewrap"><bpmn:process id="P"><bpmn:startEvent id="S"/><bpmn:exclusiveGateway id="G" name="Customer verification received"/><bpmn:task id="T1"/><bpmn:task id="T2"/><bpmn:endEvent id="E1"/><bpmn:endEvent id="E2"/>${[['S','G'],['G','T1'],['G','T2'],['T1','E1'],['T2','E2']].map(([a,b],i)=>`<bpmn:sequenceFlow id="F${i}" sourceRef="${a}" targetRef="${b}"/>`).join('')}</bpmn:process></bpmn:definitions>`;
 const view=(await diagramViews(xml)).diagrams[0],d=(await new BpmnModdle().fromXML(view.bpmnXml)).rootElement;
 const shape=d.diagrams[0].plane.planeElement.find(s=>s.bpmnElement.id==='G'),b=shape.bounds;
 const text=view.svg.match(/<text data-label="G"[^>]*>([\s\S]*?)<\/text>/)[1];
 const ys=[...text.matchAll(/<tspan[^>]*y="([-\d.]+)"/g)].map(m=>Number(m[1]));
 assert.ok(ys.length>=4,'Exercise the native second-pass split');
 assert.ok(shape.label.bounds.height>=ys.length*13.2,'Layout covers every native text line');
 const top=Math.min(...ys)-11,bottom=Math.max(...ys)+3.3;
 assert.ok(bottom<=b.y-8||top>=b.y+b.height+8,'Actual native text clears its gateway by 8px');
 assert.equal(view.layoutCounts.externalLabelBorder,0);
});
