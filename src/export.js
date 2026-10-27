import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { diagramViews } from './diagram-views.js';
import { assess } from './quality.js';
import { contentHash } from './store.js';
import { reviewHtml } from './review-page.js';
import { ScribeError } from './errors.js';

export { reviewHtml } from './review-page.js';

export async function exportBundle(project, output) {
  const snapshot = project.read();
  const destination = path.resolve(output || path.join(project.store.directory, 'exports', `revision-${snapshot.revision}`));
  await mkdir(path.dirname(destination), { recursive: true });
  try { await mkdir(destination, { mode: 0o700 }); }
  catch (e) { if (e.code === 'EEXIST') throw new ScribeError('EXPORT_EXISTS', 'The export directory already exists. Choose a new output directory.'); throw e; }
  const staging = path.join(path.dirname(destination), `.process-scribe-export-${randomUUID()}`);
  try {
    await mkdir(staging, { mode: 0o700 });
    const quality = await assess(snapshot), { diagrams, rendering, bpmnXml } = await diagramViews(snapshot.xml);
    quality.rendering = rendering;
    const history = project.history().filter(h => h.revision <= snapshot.revision);
    let previous;
    for (const entry of [...history].reverse().slice(1)) {
      const candidate = project.read(entry.revision);
      if (contentHash(candidate) !== contentHash(snapshot)) { previous = candidate; break; }
    }
    const changes = previous ? { ...await project.diff(previous.revision, snapshot.revision), summary: history.find(h => h.revision === previous.revision + 1)?.summary } : null;
    const files = {
      'model.bpmn': bpmnXml,
      'model-original.bpmn': snapshot.xml,
      'diagram.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="160"><text x="24" y="80">No process model yet</text></svg>',
      ...Object.fromEntries(diagrams.map(d => [d.file, d.svg])),
      ...Object.fromEntries(diagrams.map(d => [d.bpmnFile, d.bpmnXml])),
      'diagrams.json': JSON.stringify(diagrams.map(({ svg, bpmnXml, ...metadata }) => metadata), null, 2),
      'discovery.json': JSON.stringify({ exportVersion: 2, name: snapshot.name, revision: snapshot.revision, mode: snapshot.mode, discovery: snapshot.discovery, reviews: snapshot.reviews, scenarioReviews: snapshot.scenarioReviews || {} }, null, 2),
      'quality.json': JSON.stringify(quality, null, 2),
      'history.json': JSON.stringify(history, null, 2),
      'changes.json': JSON.stringify(changes, null, 2),
      'review.html': await reviewHtml(snapshot, quality, diagrams, changes),
    };
    for (const [name, data] of Object.entries(files)) await writeFile(path.join(staging, name), data, { mode: 0o600 });
    await rename(staging, destination);
    return { revision: snapshot.revision, directory: destination, files: Object.keys(files) };
  } catch (e) { await rm(staging, { recursive: true, force: true }); await rm(destination, { recursive: true, force: true }); throw e; }
}
