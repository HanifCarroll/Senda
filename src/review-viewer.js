import { createHash } from 'node:crypto';
import { mountReview } from './review-client.js';
import { typeOf } from './model.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export function elementLabel(element) {
  if (element.name?.trim()) return element.name;
  if (element.sourceRef && element.targetRef) return `${element.sourceRef.name || 'Unnamed sender'} → ${element.targetRef.name || 'Unnamed recipient'}`;
  const type = typeOf(element).replace(/([a-z])([A-Z])/g, '$1 $2');
  const previous = element.incoming?.[0]?.sourceRef?.name;
  return previous && element.$instanceOf?.('bpmn:Gateway') ? `${type} after ${previous}` : type || 'Model element';
}

export function reviewData(snapshot, diagrams, elements) {
  const sources = new Map(snapshot.discovery.sources.map(source => [source.id, source.title]));
  const catalog = elements.filter(e => diagrams.some(d => d.elementIds.includes(e.id)) || diagrams.some(d => d.elementId === e.id)).map(e => ({
    id: e.id, type: typeOf(e), typeLabel: typeOf(e).replace(/([a-z])([A-Z])/g, '$1 $2'), label: elementLabel(e),
    source: e.sourceRef?.id, target: e.targetRef?.id,
    abstraction: snapshot.discovery.abstractions?.find(a => a.elementId === e.id),
    viewIds: diagrams.filter(d => d.elementIds.includes(e.id)).map(d => d.elementId),
    claims: snapshot.discovery.claims.filter(c => c.elementIds.includes(e.id)).map(c => ({ statement: c.statement, status: c.status, evidence: c.evidence.map(entry => ({ ...entry, sourceTitle: sources.get(entry.sourceId) || 'Source passage' })) })),
    questions: snapshot.discovery.questions.filter(q => q.elementIds.includes(e.id) || q.claimIds.some(id => snapshot.discovery.claims.some(c => c.id === id && c.elementIds.includes(e.id)))).map(q => ({ id: q.id, question: q.question, status: q.status })),
  }));
  return { views: diagrams, elements: catalog };
}

export function reviewViewer(snapshot, diagrams, elements, rendering) {
  if (!diagrams.length) return { markup: '', script: '', hash: '', css: '' };
  const payload = reviewData(snapshot, diagrams, elements);
  const script = `(${mountReview.toString()})(${safeJson(payload)});`;
  const hash = createHash('sha256').update(script).digest('base64');
  const complete = rendering && !rendering.missingMessageIds.length;
  const coverage = rendering?.totalMessages
    ? `<p class="drawing-coverage${complete ? '' : ' notice'}">${complete ? `All ${rendering.totalMessages} message exchanges are shown across these views. Open a subprocess or choose a message to follow it.` : `${rendering.missingMessageIds.length} message exchanges still have no drawing. Inspect the BPMN model before relying on these views.`}</p>` : '';
  const markup = `${coverage}<div id="diagram-explorer" hidden>
    <div class="explorer-topline"><div><p class="eyebrow">Explore the process</p><h3 id="current-view-title"></h3></div><a id="view-download" href="${esc(diagrams[0].file)}">Download this view</a></div>
    <nav id="view-breadcrumbs" aria-label="Diagram location"></nav>
    <div class="explorer-controls"><label>View<select id="view-choice"></select></label><label class="search-field">Find a step or message<input id="element-search" type="search" autocomplete="off" placeholder="Search the diagram" aria-controls="search-results"></label></div>
    <div id="search-results" class="search-results" hidden aria-live="polite"></div>
    <p id="view-caption" class="muted"></p>
    <p id="enclosing-events" class="enclosing-events" hidden></p>
    <div class="diagram-toolbar" role="toolbar" aria-label="Diagram controls"><button type="button" id="parent-view">↑ Parent</button><span class="toolbar-spacer"></span><button type="button" id="zoom-out" aria-label="Zoom out">−</button><output id="zoom-value" aria-label="Zoom level"></output><button type="button" id="zoom-in" aria-label="Zoom in">+</button><button type="button" id="zoom-fit">Fit</button><button type="button" id="zoom-actual">100%</button></div>
    <div class="explorer-workspace"><div id="diagram-stage" tabindex="0"></div><aside id="element-inspector" aria-label="Element details"></aside></div>
    <p class="diagram-help">Drag to pan. Click a subprocess to open it; select a task or connection for evidence. With the diagram focused, use arrow keys to pan, + / − to zoom, or Home to fit.</p>
    <p id="diagram-status" class="sr-only" role="status"></p>
    <div id="child-views" aria-label="Subprocesses"></div>
    <details id="messages-panel"><summary id="message-summary">Messages in this part</summary><div id="message-list"></div></details>
  </div>`;
  const css = `
    [hidden]{display:none!important}.eyebrow{text-transform:uppercase;letter-spacing:.09em;font-size:.72rem;font-weight:750;color:#55716e;margin:0 0 4px}.explorer-topline{display:flex;justify-content:space-between;align-items:center;gap:16px}.explorer-topline h3{margin:0;font-size:1.3rem}.explorer-topline>a{font-size:.85rem;white-space:nowrap}.drawing-coverage{background:#eaf4f1;border:1px solid #c9e2da;padding:12px 16px;border-radius:8px;color:#255a50;font-size:.9rem}.enclosing-events{font-size:.8rem;color:#5b4a2c}.context-event{border:1px solid #dfd1b7;background:#fff8e9;color:#5b4a2c;border-radius:20px;margin:3px;padding:5px 10px}
    #diagram-explorer button,#diagram-explorer input,#diagram-explorer select,.diagram-jump{font:inherit}#diagram-explorer button,.diagram-jump{cursor:pointer}#diagram-explorer button:focus-visible,#diagram-explorer input:focus-visible,#diagram-explorer select:focus-visible,.diagram-jump:focus-visible{outline:3px solid #16756e;outline-offset:3px}#diagram-explorer button:disabled{opacity:.45;cursor:default}#diagram-explorer .text-button,.diagram-jump{border:0;background:transparent;color:#075e7a;padding:0;text-align:left;text-decoration:underline;text-underline-offset:3px}.diagram-jump{font-size:.85rem;display:block;margin-top:8px}
    #view-breadcrumbs{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:12px 0;font-size:.85rem}#view-breadcrumbs [aria-current]{color:#233c42;text-decoration:none;cursor:default;font-weight:700}.breadcrumb-divider{color:#809197}.explorer-controls{display:flex;gap:14px;align-items:end}.explorer-controls label{display:flex;flex-direction:column;gap:4px;font-size:.8rem;font-weight:650;flex:1;min-width:0}.explorer-controls select,.explorer-controls input{width:100%;border:1px solid #c1d0d2;border-radius:6px;padding:9px;background:white;color:#182a34;min-height:42px}.search-results{border:1px solid #c1d0d2;border-radius:6px;max-height:260px;overflow:auto;padding:10px;margin-top:8px}.search-results p{margin:0 0 8px}.search-result,.message-button{display:block;width:100%;text-align:left;border:0;background:#f0f6f5;padding:10px 12px;margin:6px 0;border-radius:6px;color:#183d46}.search-result:hover,.message-button:hover,.child-view:hover{background:#dcece7}#diagram-explorer small{display:block;color:#59706e;font-size:.75rem;margin-top:3px}
    .diagram-toolbar{display:flex;gap:6px;align-items:center;padding:9px;border:1px solid #cbdcda;background:#f5f9f8;border-radius:8px 8px 0 0}.diagram-toolbar button{border:1px solid #c6d5d3;background:white;border-radius:5px;min-width:36px;min-height:36px;padding:4px 9px;color:#214a49}.diagram-toolbar output{font-size:.8rem;min-width:44px;text-align:center;font-variant-numeric:tabular-nums}.toolbar-spacer{flex:1}.explorer-workspace{display:grid;grid-template-columns:minmax(0,1fr) 280px;border:1px solid #cbdcda;border-top:0;border-radius:0 0 8px 8px;overflow:hidden}
    #diagram-stage{height:560px;min-width:0;background:white;overflow:hidden;touch-action:none;cursor:grab;outline-offset:-4px;position:relative}#diagram-stage:focus-visible{outline:3px solid #16756e}#diagram-stage.panning{cursor:grabbing}#diagram-stage svg{display:block;user-select:none}#diagram-stage g.selectable{cursor:pointer}#diagram-stage g.selectable:focus-visible{outline:2px solid #16756e}#diagram-stage g.selectable:hover>rect,#diagram-stage g.selectable:hover>circle{stroke:#16756e}#diagram-stage .is-selected>rect,#diagram-stage .is-selected>circle,#diagram-stage .is-selected>path:not(.connection-hit),#diagram-stage .is-selected>polyline:not(.connection-hit){stroke:#008b83;stroke-width:3}#diagram-stage .connection-hit{pointer-events:stroke;stroke:transparent!important;fill:none!important}
    #element-inspector{padding:18px;background:#f6f9f8;border-left:1px solid #d7e2e0;max-height:560px;overflow:auto;min-width:0;font-size:.87rem}#element-inspector h3{font-size:1.05rem;margin:4px 0 12px}#element-inspector h4{margin:22px 0 8px;font-size:.9rem}#element-inspector blockquote{padding:9px 12px;font-size:.82rem;background:white}#element-inspector blockquote p{margin:0}#element-inspector .evidence-status{text-transform:capitalize;color:#476b61;font-size:.75rem;margin-top:-6px}.primary-button{border:1px solid #116f64;border-radius:6px;background:#116f64;color:white;padding:8px 12px}.diagram-help{font-size:.78rem;color:#576b71;margin:8px 0 16px}#child-views{display:flex;gap:8px;flex-wrap:wrap}.child-view{background:#f0f6f5;color:#20433f;border:1px solid #d0dfda;border-radius:7px;text-align:left;padding:10px 13px;flex:1;min-width:150px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    @media(min-width:1400px){body{max-width:1380px}.explorer-workspace{grid-template-columns:minmax(0,1fr) 300px}#diagram-stage{height:620px}#element-inspector{max-height:620px}}@media(max-width:850px){.explorer-workspace{grid-template-columns:minmax(0,1fr)}#element-inspector{border-left:0;border-top:1px solid #d7e2e0;max-height:330px}#diagram-stage{height:460px}}@media(max-width:600px){.explorer-topline{align-items:start;flex-direction:column}.explorer-controls{flex-direction:column;align-items:stretch}.diagram-toolbar{gap:4px;padding:6px}.diagram-toolbar button{padding:3px 7px;min-height:40px}.diagram-toolbar output{min-width:36px}#diagram-stage{height:400px}#child-views{flex-direction:column}}@media print{#diagram-explorer,.diagram-jump{display:none!important}#static-diagrams>summary{display:none}#static-diagrams::details-content{content-visibility:visible}#static-diagrams>details::details-content{content-visibility:visible}}
  `;
  return { markup, css, script, hash };
}
