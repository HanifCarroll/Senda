import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseModel } from './model.js';
import { diagramViews } from './diagram-views.js';
import { reviewData } from './review-viewer.js';

const cache = new Map();
const inside = (root, file) => file === root || file.startsWith(root + path.sep);

async function read(root, directory, name) {
  const resolved = await realpath(path.join(directory, name));
  if (!inside(root, resolved)) throw new Error('Review file is outside the review library.');
  return readFile(resolved, 'utf8');
}

/** Only exports under the configured library are exposed; never arbitrary paths. */
export async function listReviews(root) {
  let base;
  try { base = await realpath(root); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const reviews = [];
  async function visit(directory, depth) {
    const entries = await readdir(directory, { withFileTypes: true });
    if (entries.some(e => e.isFile() && e.name === 'discovery.json') && entries.some(e => e.isFile() && e.name === 'model.bpmn')) {
      try {
        const [snapshotJson, exportedXml, historyJson, changesJson] = await Promise.all(['discovery.json', 'model.bpmn', 'history.json', 'changes.json'].map(file => read(base, directory, file)));
        const snapshot = JSON.parse(snapshotJson), { discovery, revision } = snapshot;
        const xml = snapshot.exportVersion === 2 ? await read(base, directory, 'model-original.bpmn') : exportedXml;
        const history = JSON.parse(historyJson), changes = JSON.parse(changesJson);
        const model = await parseModel(xml);
        const title = snapshot.name || model.elements.find(e => e.$type === 'bpmn:Process')?.name || discovery.context?.perspective || 'Process review';
        const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
        const relative = path.relative(base, directory);
        const entry = history.find(h => h.revision === revision);
        reviews.push({ id: Buffer.from(relative || '.').toString('base64url'), title,
          processKey: digest([title, snapshot.mode, discovery.context?.perspective, discovery.sources?.[0]?.sha256 || discovery.sources?.[0]?.text || '']),
          contentKey: digest([xml, discovery, snapshot.reviews, snapshot.scenarioReviews]),
          summary: changes?.summary || entry?.summary || 'Initial process discovery',
          created: entry?.createdAt || entry?.created_at || null,
          label: relative || 'Review', perspective: discovery.context?.perspective || 'Process review', revision, modified: (await stat(path.join(directory, 'discovery.json'))).mtimeMs });
      } catch { /* Incomplete exports are not offered as valid review choices. */ }
      return;
    }
    if (depth < 3) await Promise.all(entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => visit(path.join(directory, e.name), depth + 1)));
  }
  await visit(base, 0);
  return reviews.sort((a, b) => b.modified - a.modified || a.label.localeCompare(b.label));
}

export async function loadReview(root, id) {
  if (typeof id !== 'string' || !/^[\w-]{1,1000}$/.test(id)) throw new Error('Invalid review identifier.');
  const relative = Buffer.from(id, 'base64url').toString('utf8');
  if (Buffer.from(relative).toString('base64url') !== id || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Invalid review identifier.');
  const base = await realpath(root), directory = await realpath(path.resolve(base, relative));
  if (!inside(base, directory)) throw new Error('Review is outside the review library.');
  const [exportedXml, discoveryJson, qualityJson, changesJson] = await Promise.all(['model.bpmn', 'discovery.json', 'quality.json', 'changes.json'].map(file => read(base, directory, file)));
  const data = JSON.parse(discoveryJson);
  const xml = data.exportVersion === 2 ? await read(base, directory, 'model-original.bpmn') : exportedXml;
  const snapshot = { ...data, xml };
  const key = createHash('sha256').update(xml).digest('hex');
  let drawing = cache.get(key);
  if (!drawing) {
    const [model, projection] = await Promise.all([parseModel(xml), diagramViews(xml)]);
    drawing = { ...projection, model };
    if (cache.size >= 10) cache.delete(cache.keys().next().value);
    cache.set(key, drawing);
  }
  const { diagrams, rendering, model, bpmnXml } = drawing;
  const title = snapshot.name || model.elements.find(e => e.$type === 'bpmn:Process')?.name || snapshot.discovery.context?.perspective || 'Process review';
  return { id, title, revision: snapshot.revision, mode: snapshot.mode, xml, exportXml: bpmnXml,
    ...reviewData(snapshot, diagrams, model.elements), discovery: snapshot.discovery,
    quality: { ...JSON.parse(qualityJson), rendering }, changes: JSON.parse(changesJson),
  };
}
