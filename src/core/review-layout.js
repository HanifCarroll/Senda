import { BpmnModdle } from 'bpmn-moddle';
import { layoutXml, metricsXml } from '@miragon/bpmn-cli';
import { collect } from './model.js';

const soft = new Set(['crossings', 'segmentOverlap', 'parallelRun', 'branchLabelFar', 'longDetour']);
const score = counts => Object.entries(counts).reduce((sum, [key, value]) => sum + value * (key === 'crossings' ? 100 : soft.has(key) ? 10 : 10000), 0);
const safe = (before, after) => Object.keys(before).every(key => soft.has(key) || (after[key] || 0) <= before[key]);
const improves = (before, after) => safe(before.counts, after.counts) && (score(after.counts) < score(before.counts)
  || (score(after.counts) === score(before.counts) && after.effort < before.effort - 1));
const segments = edge => (edge.waypoint || []).slice(1).map((p, i) => [edge.waypoint[i], p]);
const isFrame = shape => ['bpmn:Participant', 'bpmn:Lane'].includes(shape.bpmnElement?.$type) || shape.isExpanded;
// Miragon draws names in 30px bands. These implicit titles have no BPMNLabel
// bounds, so ordinary label metrics do not protect them from routed edges.
const headerBands = shapes => shapes.filter(shape => shape.bpmnElement?.$type === 'bpmn:Lane' || (shape.bpmnElement?.$type === 'bpmn:Participant' && shape.bpmnElement.processRef)).map(shape => {
  const b = shape.bounds;
  return shape.isHorizontal === false
    ? { x: b.x, y: b.y, width: b.width, height: Math.min(30, b.height) }
    : { x: b.x, y: b.y, width: Math.min(30, b.width), height: b.height };
});
// Common bpmn-js editors place a 20px drill-down button just beyond a collapsed
// subprocess's lower-right corner. Leave a small gutter for it and its focus ring.
const controlBands = shapes => shapes.filter(s=>s.bpmnElement?.$type==='bpmn:SubProcess' && !s.isExpanded).map(s=>({x:s.bounds.x+s.bounds.width-18,y:s.bounds.y+s.bounds.height+2,width:32,height:32}));
const contains = (b, p) => p.x >= b.x && p.y >= b.y && p.x <= b.x + b.width && p.y <= b.y + b.height;
const overlaps = (a, b, gap = 3) => a.x < b.x + b.width + gap && a.x + a.width > b.x - gap && a.y < b.y + b.height + gap && a.y + a.height > b.y - gap;
function through(a, b, box) {
  if (a.x === b.x) return a.x > box.x + .1 && a.x < box.x + box.width - .1 && Math.max(a.y, b.y) > box.y + .1 && Math.min(a.y, b.y) < box.y + box.height - .1;
  return a.y > box.y + .1 && a.y < box.y + box.height - .1 && Math.max(a.x, b.x) > box.x + .1 && Math.min(a.x, b.x) < box.x + box.width - .1;
}
function collision(a, b, c, d) {
  if ((a.x === b.x) === (c.x === d.x)) {
    if (a.x === b.x && a.x === c.x) return Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y)) - Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y)) > 1;
    if (a.y === b.y && a.y === c.y) return Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x)) - Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x)) > 1;
    return false;
  }
  const [v1,v2,h1,h2] = a.x === b.x ? [a,b,c,d] : [c,d,a,b];
  return v1.x >= Math.min(h1.x,h2.x) && v1.x <= Math.max(h1.x,h2.x) && h1.y >= Math.min(v1.y,v2.y) && h1.y <= Math.max(v1.y,v2.y);
}

const distanceTo = (box, point) => Math.hypot(Math.max(box.x - point.x, 0, point.x - box.x - box.width), Math.max(box.y - point.y, 0, point.y - box.y - box.height));
const branch = item => item.bpmnElement?.$type === 'bpmn:SequenceFlow' && item.bpmnElement.sourceRef?.$instanceOf('bpmn:Gateway') && item.bpmnElement.sourceRef.outgoing?.length > 1;
const lengthOf = edge => segments(edge).reduce((n, [a,b]) => n + Math.abs(a.x-b.x) + Math.abs(a.y-b.y), 0);
function portNormal(point, shape) {
  if (!shape) return null;
  const b=shape.bounds;
  if(Math.abs(point.x-b.x)<.5) return {x:-1,y:0};
  if(Math.abs(point.x-b.x-b.width)<.5) return {x:1,y:0};
  if(Math.abs(point.y-b.y)<.5) return {x:0,y:-1};
  if(Math.abs(point.y-b.y-b.height)<.5) return {x:0,y:1};
  return null;
}
const dot = (a,b,n) => (b.x-a.x)*n.x+(b.y-a.y)*n.y;
const searchBudget = elements => ({ remaining: elements.filter(e=>['bpmn:SequenceFlow','bpmn:MessageFlow'].includes(e.$type)).length > 25 ? 100000 : 500000 });

// Extra presentation checks complement the library's DI metrics. Distances are
// conservative app heuristics in model pixels, not BPMN validity constraints.
async function measure(xml, definitions) {
  const result = await metricsXml(xml);
  result.counts = { ...result.counts, titleIntrusion: 0, branchLabelFar: 0, longDetour: 0, tangentEntry: 0, labelOnControl: 0 };
  result.problems = [...result.problems];
  result.effort = 0;
  const add = (kind, ids) => { result.counts[kind]++; result.problems.push({ kind, ids }); };
  for (const diagram of definitions.diagrams || []) {
    const all = diagram.plane.planeElement || [], shapes = all.filter(e=>e.bounds), edges = all.filter(e=>e.waypoint?.length>=2);
    const headers = headerBands(shapes);
    for (const edge of edges) {
      const length = lengthOf(edge), turns = edge.waypoint.length - 2;
      result.effort += length + turns * 24;
      if (headers.some(box => segments(edge).some(([a,b]) => through(a,b,box)))) add('titleIntrusion', [edge.bpmnElement.id]);
      if (branch(edge) && edge.label?.bounds) {
        const distance = distanceTo(edge.label.bounds, edge.waypoint[0]);
        result.effort += distance * 2;
        if (distance > 140) add('branchLabelFar', [edge.bpmnElement.id]);
      }
      const start=edge.waypoint[0], end=edge.waypoint.at(-1), direct=Math.abs(start.x-end.x)+Math.abs(start.y-end.y);
      const from=portNormal(start,shapes.find(s=>s.bpmnElement?.id===edge.bpmnElement.sourceRef?.id)), to=portNormal(end,shapes.find(s=>s.bpmnElement?.id===edge.bpmnElement.targetRef?.id));
      if((from && dot(start,edge.waypoint[1],from)<=0) || (to && dot(edge.waypoint.at(-2),end,to)>=0)) add('tangentEntry',[edge.bpmnElement.id]);
      if (turns >= 4 && length > Math.max(700, direct * 2)) add('longDetour', [edge.bpmnElement.id]);
    }
    for (const item of all.filter(e=>e.label?.bounds)) if (headers.some(box=>overlaps(item.label.bounds,box,0))) add('titleIntrusion', [item.bpmnElement.id]);
    for (const item of all.filter(e=>e.label?.bounds)) if (controlBands(shapes).some(box=>overlaps(item.label.bounds,box,0))) add('labelOnControl', [item.bpmnElement.id]);
  }
  return result;
}

class Queue {
  items = [];
  push(item) {
    let i = this.items.length; this.items.push(item);
    while (i) { const p = (i - 1) >> 1; if (this.items[p].cost <= item.cost) break; this.items[i] = this.items[p]; i = p; } this.items[i] = item;
  }
  pop() {
    const result = this.items[0], last = this.items.pop();
    if (this.items.length) { let i = 0; while (i * 2 + 1 < this.items.length) { let c = i * 2 + 1; if (this.items[c + 1]?.cost < this.items[c].cost) c++; if (this.items[c].cost >= last.cost) break; this.items[i] = this.items[c]; i = c; } this.items[i] = last; }
    return result;
  }
}

/** Orthogonal routing on a visibility grid. Real endpoints and node positions
 * stay fixed. Obstacle avoidance and a strong crossing penalty favor free
 * gutters; the existing drawing is retained unless measured quality improves.
 */
function route(edge, shapes, edges, budget) {
  if (budget.remaining <= 0) return null;
  const start = edge.waypoint[0], end = edge.waypoint.at(-1);
  const from=portNormal(start,shapes.find(s=>s.bpmnElement?.id===edge.bpmnElement.sourceRef?.id)), to=portNormal(end,shapes.find(s=>s.bpmnElement?.id===edge.bpmnElement.targetRef?.id));
  const stubs=[...(from?[{x:start.x+from.x*16,y:start.y+from.y*16}]:[]),...(to?[{x:end.x+to.x*16,y:end.y+to.y*16}]:[])];
  const bounds = shapes.map(s => s.bounds);
  const home = edge.bpmnElement?.$type === 'bpmn:MessageFlow' ? null : shapes.filter(isFrame).filter(s => contains(s.bounds,start) && contains(s.bounds,end)).sort((a,b) => a.bounds.width*a.bounds.height-b.bounds.width*b.bounds.height)[0]?.bounds;
  const area = home || { x: Math.min(...bounds.map(b => b.x)) - 30, y: Math.min(...bounds.map(b => b.y)) - 30, width: 0, height: 0 };
  if (!home) { area.width = Math.max(...bounds.map(b => b.x + b.width)) - area.x + 30; area.height = Math.max(...bounds.map(b => b.y + b.height)) - area.y + 30; }
  const headers = headerBands(shapes);
  // Sequence flows may cross intervening responsibility lanes. Their title
  // strips and contained nodes remain obstacles; a lane body is traversable.
  const obstacles = [...shapes.filter(s => s.bpmnElement?.$type !== 'bpmn:Lane' && (!isFrame(s) || (!contains(s.bounds,start) && !contains(s.bounds,end)))).map(s => s.bounds), ...headers];
  const labels = [...shapes, ...edges].filter(s => s !== edge && s.label?.bounds).map(s => ({ x:s.label.bounds.x-8, y:s.label.bounds.y-4, width:s.label.bounds.width+16, height:s.label.bounds.height+8 }));
  const lines = edges.filter(e => e !== edge).flatMap(segments);
  const coordinates = axis => [...new Set([
    start[axis], end[axis], ...edge.waypoint.map(p => p[axis]),
    ...stubs.map(p=>p[axis]),
    area[axis] + 16, area[axis] + area[axis === 'x' ? 'width' : 'height'] - 16,
    ...bounds.flatMap(b => [b[axis] - 22, b[axis] + b[axis === 'x' ? 'width' : 'height'] + 22]),
    ...headers.flatMap(b => [b[axis] - 16, b[axis] + b[axis === 'x' ? 'width' : 'height'] + 16]),
    ...lines.flatMap(line => line.flatMap(p => [p[axis] - 16, p[axis] + 16])),
  ])].filter(v => v >= area[axis] && v <= area[axis] + area[axis === 'x' ? 'width' : 'height']).sort((a,b) => a-b);
  const xs = coordinates('x'), ys = coordinates('y'), width = xs.length;
  if (width * ys.length > 30000) return null; // Bounded work on unusually large imported views.
  const index = (x,y,dir) => (y*width+x)*2+dir;
  const queue = new Queue(), distances = new Map(), previous = new Map();
  for (const dir of [0,1]) { const x=xs.indexOf(start.x), y=ys.indexOf(start.y), key=index(x,y,dir); queue.push({x,y,dir,key,cost:0}); distances.set(key,0); }
  let finish, visited = 0;
  const blockers = [...obstacles, ...labels];
  while (queue.items.length) {
    const current=queue.pop(); if (current.cost !== distances.get(current.key)) continue;
    // Presentation is optional; a dense routing grid must never make a saved
    // model impossible to open or export. Keep the valid baseline on exhaustion.
    if (++visited > 60000 || --budget.remaining < 0) return null;
    if (xs[current.x]===end.x && ys[current.y]===end.y) { finish=current.key; break; }
    for (const [dx,dy,dir] of [[1,0,0],[-1,0,0],[0,1,1],[0,-1,1]]) {
      const x=current.x+dx, y=current.y+dy;
      if (x<0 || x>=width || y<0 || y>=ys.length) continue;
      const a={x:xs[current.x],y:ys[current.y]}, b={x:xs[x],y:ys[y]};
      if(from && a.x===start.x && a.y===start.y && dot(a,b,from)<=0) continue;
      if(to && b.x===end.x && b.y===end.y && dot(a,b,to)>=0) continue;
      if (blockers.some(box => through(a,b,box))) continue;
      const cost=current.cost + Math.abs(a.x-b.x)+Math.abs(a.y-b.y)+(dir===current.dir?0:24)
        + lines.filter(([c,d])=>collision(a,b,c,d)).length*1500;
      const key=index(x,y,dir);
      if (cost >= (distances.get(key) ?? Infinity)) continue;
      distances.set(key,cost); previous.set(key,current.key); queue.push({x,y,dir,key,cost});
    }
  }
  if (finish===undefined) return null;
  const path=[];
  for (let key=finish;key!==undefined;key=previous.get(key)) { const n=Math.floor(key/2); path.unshift({x:xs[n%width],y:ys[Math.floor(n/width)]}); }
  return path.filter((p,i)=>!i || i===path.length-1 || !((path[i-1].x===p.x && p.x===path[i+1].x) || (path[i-1].y===p.y && p.y===path[i+1].y)));
}

function moveLabel(item, shapes, edges) {
  const box = item.label?.bounds;
  if (!box) return;
  const lines = edges.flatMap(segments);
  const blockers = [...headerBands(shapes), ...controlBands(shapes), ...shapes.filter(s=>!isFrame(s)).map(s=>s.bounds), ...[...shapes,...edges].filter(s=>s!==item && s.label?.bounds).map(s=>s.label.bounds)];
  // Text can be wider than its DI box after font measurement/wrapping. Leave a
  // real gutter around labels instead of merely avoiding their rectangle.
  const cost = b => blockers.filter(o=>overlaps(b,o)).length*100 + lines.filter(([a,c])=>through(a,c,{x:b.x-12,y:b.y-5,width:b.width+24,height:b.height+10})).length*30;
  const original = { x:box.x,y:box.y,width:box.width,height:box.height };
  const isBranch = branch(item);
  const anchor = isBranch ? item.waypoint[0] : {x:box.x+box.width/2,y:box.y+box.height/2};
  const home = shapes.filter(isFrame).filter(s=>contains(s.bounds,anchor)).sort((a,b)=>a.bounds.width*a.bounds.height-b.bounds.width*b.bounds.height)[0]?.bounds;
  const candidates = [];
  if (item.waypoint) for (const [a,b] of segments(item)) {
    const x=(a.x+b.x)/2, y=(a.y+b.y)/2;
    candidates.push({x:x-box.width/2,y:y-box.height-10},{x:x-box.width/2,y:y+10},{x:x+10,y:y-box.height/2},{x:x-box.width-10,y:y-box.height/2});
    if (isBranch) for (const offset of [16,24,32,64,96]) {
      const ratio=Math.min(1,offset/(Math.abs(b.x-a.x)+Math.abs(b.y-a.y)||1)), near={x:a.x+(b.x-a.x)*ratio,y:a.y+(b.y-a.y)*ratio};
      candidates.push({x:near.x+12,y:near.y-box.height/2},{x:near.x-box.width-12,y:near.y-box.height/2},{x:near.x-box.width/2,y:near.y-box.height-12},{x:near.x-box.width/2,y:near.y+12});
    }
  }
  for (const dx of [0,-20,20,-40,40,-60,60,-80,80]) for (const dy of [-12,12,-28,28,-48,48,-64,64]) candidates.push({x:box.x+dx,y:box.y+dy});
  const placement = b => isBranch ? distanceTo(b,item.waypoint[0])*2 : Math.hypot(b.x-original.x,b.y-original.y);
  let best=original, bestCost=cost(original)*1000+placement(original);
  for (const p of candidates) {
    const candidate={...original,...p};
    if (home && (!contains(home,candidate)||!contains(home,{x:candidate.x+box.width,y:candidate.y+box.height}))) continue;
    const nextCost=cost(candidate)*1000 + placement(candidate);
    if (nextCost<bestCost) { best=candidate; bestCost=nextCost; }
  }
  box.x=best.x; box.y=best.y;
}

export async function optimizeReviewLayout(xml, { routingBudget } = {}) {
  const moddle=new BpmnModdle(), {rootElement:definitions}=await moddle.fromXML(xml);
  routingBudget ||= searchBudget(collect(definitions));
  const baseline=await measure(xml,definitions);
  let current=baseline, currentXml=xml;
  const serialize=async()=> (await moddle.toXML(definitions,{format:true})).xml;
  for (const diagram of definitions.diagrams || []) {
    const all=diagram.plane.planeElement || [], shapes=all.filter(e=>e.bounds), edges=all.filter(e=>e.waypoint?.length>=2);
    for (let pass=0;pass<3;pass++) {
      const ids=new Set(current.problems.filter(p=>['crossings','segmentOverlap','parallelRun','titleIntrusion','longDetour','labelOnLine','tangentEntry'].includes(p.kind)).flatMap(p=>p.ids));
      for (const edge of edges.filter(e=>ids.has(e.bpmnElement?.id))) {
        const points=route(edge,shapes,edges,routingBudget); if (!points) continue;
        const saved=edge.waypoint, label=edge.label?.bounds, oldLabel=label?{x:label.x,y:label.y}:null;
        edge.waypoint=points.map(p=>moddle.create('dc:Point',p)); moveLabel(edge,shapes,edges);
        const candidate=await serialize(), measured=await measure(candidate,definitions);
        if (improves(current,measured)) { current=measured; currentXml=candidate; }
        else { edge.waypoint=saved; if(label) Object.assign(label,oldLabel); }
      }
      for (const item of [...shapes,...edges].filter(e=>e.label?.bounds)) {
        const label=item.label.bounds, saved={x:label.x,y:label.y}; moveLabel(item,shapes,edges);
        if (label.x===saved.x && label.y===saved.y) continue;
        const candidate=await serialize(), measured=await measure(candidate,definitions);
        if (improves(current,measured)) { current=measured; currentXml=candidate; } else Object.assign(label,saved);
      }
    }
  }
  return { xml:currentXml, before:baseline.counts, after:current.counts, problems:current.problems, effort:current.effort };
}

/** Compare a bounded set of display orders. Memberships, references, and BPMN
 * behavior stay intact; only the disposable projection's declaration order and
 * DI change. Ties keep the original order to limit visual churn on revisions.
 */
export async function layoutReviewProjection(xml, collapsed = []) {
  const moddle=new BpmnModdle(), {rootElement:definitions}=await moddle.fromXML(xml);
  const elements=collect(definitions), options=[];
  for (const laneSet of elements.filter(e=>e.$type==='bpmn:LaneSet' && e.lanes?.length>2 && e.lanes.length<=6)) {
    const ids=laneSet.lanes.map(l=>l.id), membership=new Map(laneSet.lanes.flatMap(l=>(l.flowNodeRef||[]).map(n=>[n.id,l.id])));
    const pairs=elements.filter(e=>e.$type==='bpmn:SequenceFlow').map(e=>[membership.get(e.sourceRef?.id),membership.get(e.targetRef?.id)]).filter(([a,b])=>a&&b&&a!==b);
    if (!pairs.length) continue;
    const permutations=a=>a.length?a.flatMap((l,i)=>permutations(a.filter((_,j)=>i!==j)).map(p=>[l,...p])):[[]];
    const ranked=permutations(ids).map(order=>({order,span:pairs.reduce((n,[s,t])=>n+Math.abs(order.indexOf(s)-order.indexOf(t)),0),change:order.reduce((n,id,i)=>n+Math.abs(ids.indexOf(id)-i),0)})).sort((a,b)=>a.span-b.span||a.change-b.change);
    // Also sample the next span tier: minimum total handoff distance does not
    // necessarily minimize crossings in the actual orthogonal drawing.
    const selected=ranked.filter(p=>p.change && p.span===ranked[0].span).slice(0,2);
    const next=ranked.find(p=>p.change && p.span>ranked[0].span);
    if(next) selected.push(...ranked.filter(p=>p.change && p.span===next.span).slice(0,2));
    for (const {order} of selected) options.push({laneSetId:laneSet.id,order});
    break; // At most six expensive native layout/routing variants per view.
  }
  if (elements.some(e=>e.$type==='bpmn:Collaboration' && e.participants?.length>1)) options.push({reversePools:true});
  // Share the search budget across every display-order variant of this view.
  const routingBudget = searchBudget(elements);
  const layout = async projection => {
    const native=await layoutXml(projection,{platform:'none',collapse:collapsed});
    return optimizeReviewLayout(native.xml, { routingBudget });
  };
  let best=await layout(xml), original=best;
  for (const option of options) {
    const m=new BpmnModdle(),{rootElement:copy}=await m.fromXML(xml), all=collect(copy);
    if (option.order) all.find(e=>e.id===option.laneSetId).lanes.sort((a,b)=>option.order.indexOf(a.id)-option.order.indexOf(b.id));
    if (option.reversePools) for (const c of all.filter(e=>e.$type==='bpmn:Collaboration')) c.participants.reverse();
    const candidate=await layout((await m.toXML(copy)).xml);
    if (improves({counts:best.after,effort:best.effort},{counts:candidate.after,effort:candidate.effort})) best=candidate;
  }
  return {...best,before:original.before};
}
