import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { diagramSvg } from './model.js';
import { assess } from './quality.js';
import { ScribeError } from './errors.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const list = items => items.length ? `<ul>${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">None recorded.</p>';
const findings = items => list(items.map(i => `${i.message}${i.elements?.length ? ` (${i.elements.join(', ')})` : ''}`));

export function reviewHtml(snapshot, quality, svg) {
  const { discovery: d } = snapshot;
  const claimRows = d.claims.map(c => `<tr><td><b>${esc(c.id)}</b><br>${esc(c.statement)}</td><td>${esc(c.state)}<br>${esc(c.status)}</td><td>${esc(c.elementIds.join(', '))}</td><td>${c.evidence.map(e => `<p><a href="#${esc(e.sourceId)}-${esc(e.segmentId)}">${esc(e.sourceId)} / ${esc(e.segmentId)}</a><br>“${esc(e.quote)}”</p>`).join('')}${c.rationale ? `<p>Inference: ${esc(c.rationale)}</p>` : ''}</td></tr>`).join('');
  const image = svg ? `<img class="diagram" alt="BPMN process model" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">` : '<p>No diagram is available yet.</p>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${esc(snapshot.name)} — Process Scribe</title><style>
  :root{color-scheme:light;font:16px/1.6 system-ui,sans-serif;color:#182a34;background:#f1f4f5}body{max-width:1180px;margin:auto;padding:40px 24px}header{border-bottom:3px solid #16756e;padding-bottom:24px}h1{font-size:2.5rem;line-height:1.15;margin:12px 0}h2{font-size:1.5rem;margin:0 0 12px}h3{font-size:1.1rem}section{background:white;border:1px solid #dbe3e5;border-radius:12px;margin:24px 0;padding:28px}.tag{display:inline-block;border-radius:30px;background:#d9ede9;padding:4px 12px;margin-right:6px;font-weight:650}.muted{color:#52646d}.diagram-frame{overflow:auto}.diagram{display:block;min-width:560px;width:100%;min-height:160px;max-height:800px;object-fit:contain}.table{overflow:auto}table{min-width:720px;width:100%;border-collapse:collapse;font-size:.92rem}th,td{padding:12px;text-align:left;border-bottom:1px solid #dbe3e5;vertical-align:top;overflow-wrap:anywhere}th{background:#f1f4f5}a{color:#075e7a}li{margin:8px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}.source-line:target{background:#fff1bd}footer{margin:30px 0;color:#52646d}@media print{body{padding:0;background:white}section{break-inside:avoid;border-radius:0}.table{overflow:visible}a{color:inherit}} </style></head><body>
  <header><span class="tag">Process Scribe</span><span class="tag">${esc(snapshot.status)}</span><span class="tag">${esc(snapshot.mode)} process · revision ${snapshot.revision}</span><h1>${esc(snapshot.name)}</h1><p>${esc(d.context.purpose)}</p><p class="muted">Perspective: ${esc(d.context.perspective)} · Current discovery stage: ${esc(d.stage.replaceAll('-', ' '))}</p></header>
  <section><h2>Scope and boundaries</h2><p><b>Trigger:</b> ${esc(d.context.trigger || 'Not established')}</p><b>Outcomes</b>${list(d.context.outcomes)}<p>${esc(d.context.scopeNotes)}</p></section>
  <section><h2>Process model</h2><div class="diagram-frame" tabindex="0" aria-label="Scrollable process diagram">${image}</div><p><a href="model.bpmn">Open the BPMN file</a> · <a href="diagram.svg">Open the diagram</a> · <a href="quality.json">Full quality report</a></p></section>
  <section><h2>Questions for the process owner</h2>${d.questions.length ? d.questions.map(q => `<h3>${esc(q.question)}</h3><p>${esc(q.why)}</p><p class="muted">${esc(q.id)} · ${esc(q.status)} · ${q.status === 'answered' ? 'resolved' : q.blocking ? 'blocks finalization' : 'optional clarification'}${q.answerSourceId ? ` · answer: ${esc(q.answerSourceId)}` : ''}</p>`).join('') : '<p>No questions recorded. A walkthrough may still reveal omissions.</p>'}</section>
  <section><h2>Quality and review</h2><p>Structural checks: <b>${quality.structural.passed ? 'passed the implemented checks' : 'issues found'}</b>. General behavioral soundness: <b>not proved</b>.</p><p>Finalization: ${quality.readyToFinalize ? 'ready' : `${quality.blockers.length} outstanding checks or reviews`}.</p><h3>Outstanding checks</h3>${findings(quality.blockers)}<h3>Behavioral findings</h3>${findings(quality.behavioral.findings)}<h3>Readability suggestions</h3>${findings(quality.readability.findings)}<h3>Human review checklist</h3>${list(quality.readability.manual)}${Object.entries(quality.reviews).map(([aspect, r]) => `<p><b>${esc(aspect)}:</b> ${r ? `${esc(r.outcome)} — ${esc(r.reviewer)}. ${esc(r.notes)}` : 'Awaiting explicit human review.'}</p>`).join('')}<p class="muted">Source quotations can be checked mechanically. Whether they support the model, and whether the model is complete and understandable, needs human review. A review record is local attribution, not authenticated identity.</p></section>
  <section><h2>Claims and supporting evidence</h2><div class="table" tabindex="0" aria-label="Scrollable evidence table"><table><thead><tr><th>Claim</th><th>State / confidence</th><th>Model elements</th><th>Source evidence</th></tr></thead><tbody>${claimRows || '<tr><td colspan="4">No claims recorded.</td></tr>'}</tbody></table></div></section>
  <section><h2>Shared vocabulary</h2>${list(d.glossary.map(g => `${g.term}: ${g.definition}${g.aliases.length ? ` (also: ${g.aliases.join(', ')})` : ''}`))}</section>
  <section><h2>Source material</h2>${d.sources.map(s => `<h3>${esc(s.title)} (${esc(s.id)})</h3>${s.segments.map(seg => `<p class="source-line" id="${esc(s.id)}-${esc(seg.id)}"><b>${seg.line}.</b> ${esc(seg.text)}</p>`).join('')}`).join('')}</section>
  <footer>Method informed by Dumas, La Rosa, Mendling &amp; Reijers (2018), <i>Fundamentals of Business Process Management</i>, 2nd ed., Chapter 5, §§5.3–5.4. This report contains source material: share it only with its intended audience.</footer></body></html>`;
}

export async function exportBundle(project, output) {
  const snapshot = project.read();
  const destination = path.resolve(output || path.join(project.store.directory, 'exports', `revision-${snapshot.revision}`));
  const parent = path.dirname(destination);
  await mkdir(parent, { recursive: true });
  // Reserve the destination before rendering; concurrent exports cannot overwrite each other.
  try { await mkdir(destination, { mode: 0o700 }); }
  catch (e) { if (e.code === 'EEXIST') throw new ScribeError('EXPORT_EXISTS', 'The export directory already exists. Choose a new output directory.'); throw e; }
  const staging = path.join(parent, `.process-scribe-export-${randomUUID()}`);
  try {
    await mkdir(staging, { mode: 0o700 });
    const quality = await assess(snapshot), svg = await diagramSvg(snapshot.xml);
    const files = {
      'model.bpmn': snapshot.xml,
      'diagram.svg': svg || '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="160"><text x="24" y="80">No process model yet</text></svg>',
      'discovery.json': JSON.stringify({ revision: snapshot.revision, mode: snapshot.mode, discovery: snapshot.discovery, reviews: snapshot.reviews }, null, 2),
      'quality.json': JSON.stringify(quality, null, 2),
      'history.json': JSON.stringify(project.history().filter(h => h.revision <= snapshot.revision), null, 2),
      'review.html': reviewHtml(snapshot, quality, svg),
    };
    for (const [name, data] of Object.entries(files)) await writeFile(path.join(staging, name), data, { mode: 0o600 });
    await rename(staging, destination);
    return { revision: snapshot.revision, directory: destination, files: Object.keys(files) };
  } catch (e) { await rm(staging, { recursive: true, force: true }); await rm(destination, { recursive: true, force: true }); throw e; }
}
