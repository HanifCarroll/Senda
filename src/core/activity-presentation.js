import { BpmnModdle } from 'bpmn-moddle';
import { layoutXml, applyToXml, renderSvg } from '@miragon/bpmn-cli';
import { taskIcon, activityMarkers } from './activity-glyphs.js';
import { wrapLines, textWidth, LINE_HEIGHT, escapeSvg, coordinate as n } from './diagram-text.js';

export const isActivity = shape => shape.bounds && shape.bpmnElement?.$instanceOf('bpmn:Activity');
const markersFor = shape => activityMarkers(shape.bpmnElement, !!shape.bpmnElement.$instanceOf('bpmn:CallActivity') || (shape.bpmnElement.$instanceOf('bpmn:SubProcess') && !shape.isExpanded), { stroke:'#22242a', fill:'#ffffff' });
const iconType = element => ['UserTask','ManualTask','ServiceTask','SendTask','ReceiveTask','ScriptTask','BusinessRuleTask'].find(type=>element.$instanceOf(`bpmn:${type}`));
const intersects = (a,b) => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
const boundarySide = (event,host) => {
  const b=event.bounds,h=host.bounds,c={x:b.x+b.width/2,y:b.y+b.height/2};
  return Object.entries({top:Math.abs(c.y-h.y),bottom:Math.abs(c.y-h.y-h.height),left:Math.abs(c.x-h.x),right:Math.abs(c.x-h.x-h.width)}).sort((a,b)=>a[1]-b[1])[0][0];
};

export function activityPresentation(shape, boundaries = [], { native = false, nativeSvg } = {}) {
  const b=shape.bounds,element=shape.bpmnElement,markers=markersFor(shape),icon=iconType(element);
  const padding=native?7:12;
  let lines=element.name?.trim()?wrapLines(element.name,b.width-padding*2):[];
  const height=lines.length*LINE_HEIGHT;
  const top=shape.isExpanded?b.y+36:b.y+(b.height-height)/2;
  let label={x:b.x+(b.width-Math.max(0,...lines.map(line=>textWidth(line))))/2,y:top,width:Math.max(0,...lines.map(line=>textWidth(line))),height};
  if(nativeSvg && lines.length) {
    const entry=[...activityGroups(nativeSvg)].find(group=>group.id===escapeSvg(element.id));
    const text=entry && nativeSvg.slice(entry.start,entry.end).match(/<text\b[^>]*>([\s\S]*?)<\/text>/)?.[1];
    const spans=[...(text||'').matchAll(/<tspan\b[^>]*x="([-\d.]+)"[^>]*y="([-\d.]+)"[^>]*>([\s\S]*?)<\/tspan>/g)];
    if(spans.length) {
      lines=spans.map(s=>s[3].replace(/&#(x[\da-f]+|\d+);/gi,(_,code)=>String.fromCodePoint(code[0]==='x'?parseInt(code.slice(1),16):Number(code))).replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&amp;','&'));
      const width=Math.max(...lines.map(line=>textWidth(line,{native:true})));
      label={x:Number(spans[0][1])-width/2,y:Number(spans[0][2])-LINE_HEIGHT*.75,width,height:lines.length*LINE_HEIGHT};
    }
  }
  const glyph=icon?{x:b.x+(native?4:8),y:b.y+(native?4:8),width:20,height:20}:null;
  const gap=native?3:6,total=markers.length*14+Math.max(0,markers.length-1)*gap;
  const markerBoxes=markers.map((marker,i)=>({...marker,x:b.x+(b.width-total)/2+i*(14+gap),y:b.y+b.height-(native?18:22),width:14,height:14}));
  return {lines,label,icon,glyph,markers:markerBoxes,content:{x:b.x+12,y:b.y+36,width:b.width-24,height:b.height-72},boundaries};
}

export function activityProblems(shape, boundaries, options) {
  const p=activityPresentation(shape,boundaries,options),b=shape.bounds,ids=[shape.bpmnElement.id],problems=[];
  if (!p.lines.length) return problems;
  const add=kind=>problems.push({kind,ids});
  if(p.label.x<b.x+12-.1 || p.label.x+p.label.width>b.x+b.width-12+.1 || p.label.y<b.y+36-.1 || p.label.y+p.label.height>b.y+b.height-36+.1) add('activityLabelBorder');
  if(p.glyph && intersects(p.label,{...p.glyph,x:p.glyph.x-8,y:p.glyph.y-8,width:36,height:36})) add('activityLabelIcon');
  if(p.markers.some(m=>intersects(p.label,{...m,x:m.x-8,y:m.y-8,width:30,height:30}))) add('activityLabelMarker');
  if(boundaries.some(e=>intersects(p.label,{x:e.bounds.x-8,y:e.bounds.y-8,width:e.bounds.width+16,height:e.bounds.height+16}))) add('activityLabelBoundary');
  return problems;
}

const boundarySlot = events => Math.max(64,...events.map(e=>(e.label?.bounds?.width||90)+24));
const boundaryInset = events => Math.max(...events.map(e=>e.bounds.width/2+8));
const markerClearance = count => count*10+36;

function requiredSize(shape, boundaries) {
  let width=[140,160,180,200,240].find(w=>wrapLines(shape.bpmnElement.name || '',w-24).length<=2) || 240;
  const markers=markersFor(shape), groups=Object.groupBy(boundaries,event=>boundarySide(event,shape));
  for(const side of ['top','bottom']) if(groups[side]?.length>1 || (side==='bottom'&&markers.length&&groups[side]?.length)) {
    const events=groups[side],slot=boundarySlot(events),markerCount=side==='bottom'?markers.length:0;
    width=Math.max(width,events.length*slot+24+(markerCount?markerCount*20+32:0));
    if(markerCount) width=Math.max(width,2*(markerClearance(markerCount)+boundaryInset(events)+(Math.ceil(events.length/2)-1)*slot));
  }
  const lines=wrapLines(shape.bpmnElement.name || '',width-24);
  const reserve=Math.max(36,...boundaries.map(e=>Math.max(e.bounds.width,e.bounds.height)/2+8));
  let height=Math.max(88,Math.ceil(lines.length*LINE_HEIGHT+2*reserve));
  for(const side of ['left','right']) if(groups[side]?.length>1) height=Math.max(height,groups[side].length*64+24);
  return {width:Math.max(shape.bounds.width,width),height:Math.max(shape.bounds.height,height)};
}


function redockEdges(items, original) {
  const shapes=new Map(items.filter(s=>s.bounds).map(s=>[s.bpmnElement.id,s]));
  for(const edge of items.filter(e=>e.waypoint?.length>=2)) for(const [reference,index] of [['sourceRef',0],['targetRef',edge.waypoint.length-1]]) {
    const shape=shapes.get(edge.bpmnElement?.[reference]?.id),old=shape&&original.get(shape.bpmnElement.id),point=edge.waypoint[index];
    if(!old || ['x','y','width','height'].every(key=>old[key]===shape.bounds[key])) continue;
    const next=shape.bounds;
    const side=Object.entries({left:Math.abs(point.x-old.x),right:Math.abs(point.x-old.x-old.width),top:Math.abs(point.y-old.y),bottom:Math.abs(point.y-old.y-old.height)}).sort((a,b)=>a[1]-b[1])[0][0];
    const ratio=(value,start,length)=>Math.max(0,Math.min(1,(value-start)/length));
    point.x=['left','right'].includes(side)?next.x+(side==='right'?next.width:0):next.x+ratio(point.x,old.x,old.width)*next.width;
    point.y=['top','bottom'].includes(side)?next.y+(side==='bottom'?next.height:0):next.y+ratio(point.y,old.y,old.height)*next.height;
  }
}

function growFrames(shapes) {
  const ancestor=(element,container)=>{for(let at=element;at;at=at.$parent) if(at===container) return true;return false;};
  const frames=shapes.filter(s=>s.bpmnElement?.$instanceOf('bpmn:Participant')||s.bpmnElement?.$instanceOf('bpmn:Lane')||s.isExpanded);
  for(const frame of frames.sort((a,b)=>a.bounds.width*a.bounds.height-b.bounds.width*b.bounds.height)) {
    const e=frame.bpmnElement;
    const members=shapes.filter(s=>s!==frame && (e.processRef?ancestor(s.bpmnElement?.attachedToRef||s.bpmnElement,e.processRef):e.$instanceOf('bpmn:Lane')?e.flowNodeRef?.includes(s.bpmnElement?.attachedToRef||s.bpmnElement):frame.isExpanded?ancestor(s.bpmnElement,e):false));
    if(!members.length) continue;
    const boxes=members.flatMap(s=>[s.bounds,...(s.label?.bounds?[s.label.bounds]:[])]);
    frame.bounds.width=Math.max(frame.bounds.width,...boxes.map(b=>b.x+b.width+24-frame.bounds.x));
    frame.bounds.height=Math.max(frame.bounds.height,...boxes.map(b=>b.y+b.height+24-frame.bounds.y));
  }
  for(const pool of frames.filter(s=>s.bpmnElement.processRef)) for(const lane of frames.filter(s=>s.bpmnElement.$instanceOf('bpmn:Lane')&&ancestor(s.bpmnElement,pool.bpmnElement.processRef))) lane.bounds.width=Math.max(lane.bounds.width,pool.bounds.x+pool.bounds.width-lane.bounds.x);
}

export async function sizeReviewActivities(xml) {
  const moddle=new BpmnModdle(),{rootElement:d}=await moddle.fromXML(xml);
  for(const diagram of d.diagrams || []) {
    const items=diagram.plane.planeElement || [],shapes=items.filter(s=>s.bounds),activities=shapes.filter(isActivity);
    const original=new Map(shapes.map(s=>[s.bpmnElement.id,{...s.bounds}]));
    const docks=new Map(activities.map(host=>[host,shapes.filter(s=>s.bpmnElement?.attachedToRef===host.bpmnElement).map(event=>({event,side:boundarySide(event,host),position:['top','bottom'].includes(boundarySide(event,host))?event.bounds.x:event.bounds.y}))]));
    for(const host of activities) Object.assign(host.bounds,requiredSize(host,docks.get(host).map(d=>d.event)));
    for(const host of activities) {
      const h=host.bounds,groups=Object.groupBy(docks.get(host),d=>d.side);
      for(const [side,events] of Object.entries(groups)) {
        events.sort((a,b)=>a.position-b.position);
        const horizontal=['top','bottom'].includes(side),span=horizontal?h.width:h.height;
        const markerCount=side==='bottom'?markersFor(host).length:0;
        let positions=events.map((_,i)=>(i+.5)*span/events.length);
        if(markerCount) {
          const boundaries=events.map(({event})=>event),clearance=markerClearance(markerCount),slot=boundarySlot(boundaries),inset=boundaryInset(boundaries),leftCount=Math.ceil(events.length/2);
          positions=events.map((_,i)=>span/2+(i<leftCount?-clearance-(leftCount-1-i)*slot:clearance+(i-leftCount)*slot));
          positions=positions.map(at=>Math.max(inset,Math.min(span-inset,at)));
        }
        events.forEach(({event},i)=>{
          const b=event.bounds;
          b.x=horizontal?h.x+positions[i]-b.width/2:(side==='left'?h.x:h.x+h.width)-b.width/2;
          b.y=horizontal?(side==='top'?h.y:h.y+h.height)-b.height/2:h.y+positions[i]-b.height/2;
          if(event.label?.bounds) {
            const l=event.label.bounds;
            l.x=b.x+(b.width-l.width)/2;
            l.y=side==='top'?b.y-l.height-12:b.y+b.height+12;
          }
        });
      }
    }
    growFrames(shapes);
    redockEdges(items,original);
  }
  const resized=(await moddle.toXML(d,{format:true})).xml;
  const tidy=await layoutXml(resized,{platform:'none',tidy:true});
  const {rootElement:packed}=await new BpmnModdle().fromXML(tidy.xml);
  const operations=[];
  for(const diagram of packed.diagrams || []) {
    const items=diagram.plane.planeElement || [],shapes=items.filter(s=>s.bounds);
    for(const host of shapes.filter(isActivity)) {
      const bottom=shapes.filter(e=>e.bpmnElement?.attachedToRef===host.bpmnElement && boundarySide(e,host)==='bottom');
      if(bottom.length>1) operations.push({op:'space',below:host.bpmnElement.id,by:`${Math.ceil(Math.max(...bottom.map(e=>e.label?.bounds?.height||0))+48)}px`});
    }
    for(const edge of items.filter(e=>e.waypoint?.length>=2 && ['bpmn:SequenceFlow','bpmn:MessageFlow'].includes(e.bpmnElement.$type))) operations.push({op:'route',id:edge.bpmnElement.id,...(edge.bpmnElement.sourceRef?.$instanceOf('bpmn:BoundaryEvent')?{exit:'right'}:{})});
  }
  const routed=operations.length?(await applyToXml(tidy.xml,operations,{platform:'none'})).xml:tidy.xml;
  const finalModdle=new BpmnModdle(),{rootElement:final}=await finalModdle.fromXML(routed);
  // Format operations are free to rehome labels. Establish owner-relative boxes
  // after they finish so the bounded optimizer sees the actual final obstacles.
  for(const diagram of final.diagrams || []) {
    const items=diagram.plane.planeElement || [],shapes=items.filter(s=>s.bounds);
    const original=new Map(shapes.map(s=>[s.bpmnElement.id,{...s.bounds}]));
    for(const event of shapes.filter(s=>s.bpmnElement?.attachedToRef && s.label?.bounds)) {
      const host=shapes.find(s=>s.bpmnElement===event.bpmnElement.attachedToRef),side=boundarySide(event,host),b=event.bounds,l=event.label.bounds;
      l.x=b.x+(b.width-l.width)/2;
      l.y=side==='top'?b.y-l.height-12:b.y+b.height+12;
    }
    growFrames(shapes);
    redockEdges(items,original);
  }
  return (await finalModdle.toXML(final,{format:true})).xml;
}

const safeColor=value=>typeof value==='string'&&/^(#[\da-f]{3,8}|[a-z]+|(?:rgb|hsl)a?\([\d.,%\s+-]+\))$/i.test(value)?value:undefined;
const color=(element,key)=>safeColor(element?.get?.(key));
function activitySvg(shape,boundaries) {
  const b=shape.bounds,e=shape.bpmnElement,p=activityPresentation(shape,boundaries);
  const style={fill:color(shape,'color:background-color')||color(shape,'bioc:fill')||'#ffffff',stroke:color(shape,'color:border-color')||color(shape,'bioc:stroke')||'#22242a'};
  const labelColor=color(shape.label,'color:color')||style.stroke;
  const rect=(inset,stroke,extra='')=>`<rect x="${n(b.x+inset)}" y="${n(b.y+inset)}" width="${n(b.width-inset*2)}" height="${n(b.height-inset*2)}" rx="${10-inset}" fill="${inset?'none':style.fill}" stroke="${style.stroke}" stroke-width="${stroke}"${extra}/>`;
  let out=e.$instanceOf('bpmn:Transaction')?rect(0,1.5)+rect(3,1.5):e.triggeredByEvent?rect(0,2,' stroke-dasharray="1 4" stroke-linecap="round"'):rect(0,e.$instanceOf('bpmn:CallActivity')?5:2);
  if(p.glyph) out+=`<g data-activity-icon="${p.icon}" transform="translate(${n(p.glyph.x)} ${n(p.glyph.y)})">${taskIcon(e,style)}</g>`;
  if(p.lines.length) out+=`<text data-activity-label="${escapeSvg(e.id)}" font-family="Arial, Arimo, sans-serif" font-size="12" fill="${labelColor}" text-anchor="middle">${p.lines.map((line,i)=>`<tspan x="${n(b.x+b.width/2)}" y="${n(p.label.y+12+i*LINE_HEIGHT)}">${escapeSvg(line)}</tspan>`).join('')}</text>`;
  for(const m of p.markers) out+=`<g data-activity-marker="${m.kind}" transform="translate(${n(m.x)} ${n(m.y)})">${activityMarkers(e,!!e.$instanceOf('bpmn:CallActivity')||(e.$instanceOf('bpmn:SubProcess')&&!shape.isExpanded),style).find(marker=>marker.kind===m.kind).svg}</g>`;
  return out;
}

/** The public renderer promises complete data-id groups. Balanced scanning
 * keeps that public boundary independent of the order of upstream children. */
function* activityGroups(svg) {
  for(const match of svg.matchAll(/<g\b[^>]*\bdata-id="([^"]*)"[^>]*>/g)) {
    let depth=1,end;
    const start=match.index+match[0].length;
    for(const token of svg.slice(start).matchAll(/<\/?g\b[^>]*>/g)) {
      depth+=token[0].startsWith('</')?-1:token[0].endsWith('/>')?0:1;
      if(!depth) {end=start+token.index;break;}
    }
    if(end===undefined) throw new Error('The diagram renderer returned an incomplete activity group.');
    yield {id:match[1],start,end};
  }
}
export async function renderReviewSvg(xml) {
  const [rendered,{rootElement:d}]=await Promise.all([renderSvg(xml),new BpmnModdle().fromXML(xml)]);
  const shapes=(d.diagrams[0]?.plane.planeElement || []).filter(s=>s.bounds);
  const replacements=new Map(shapes.filter(isActivity).map(s=>[escapeSvg(s.bpmnElement.id),activitySvg(s,shapes.filter(event=>event.bpmnElement?.attachedToRef===s.bpmnElement))]));
  const edits=[...activityGroups(rendered.svg)].filter(group=>replacements.has(group.id));
  let svg=rendered.svg;
  for(const edit of edits.reverse()) svg=svg.slice(0,edit.start)+replacements.get(edit.id)+svg.slice(edit.end);
  return {...rendered,svg};
}
