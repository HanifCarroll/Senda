import { assess } from "../core/quality.js";
import { diagramViews } from "../core/diagram-views.js";
import { reviewData } from "../core/review-viewer.js";
import { contentHash, hash } from "../core/hash.js";
import { parseModel } from "../core/model.js";
const caches = new Map();
const assessments = new Map();
export async function renderReview(
  p,
  id,
  revision,
  model,
  { previousRevision } = {},
) {
  const snapshot = p.read(revision),
    // A clarification can change the revision without changing the diagram.
    // Keep geometry separate from revision-bound evidence and quality checks.
    key = `${id}:${hash(snapshot.xml)}`;
  let drawing = caches.get(key);
  if (!drawing) {
    const projection = await diagramViews(snapshot.xml);
    drawing = {
      ...projection,
      model: await parseModel(snapshot.xml),
    };
    if (caches.size >= 4) caches.delete(caches.keys().next().value);
    caches.set(key, drawing);
  }
  const { diagrams, bpmnXml } = drawing;
  const assessmentKey = `${id}:${model}:${snapshot.revision}`;
  let assessment = assessments.get(assessmentKey);
  if (!assessment) {
    assessment = await assess(snapshot);
    if (assessments.size >= 4) assessments.delete(assessments.keys().next().value);
    assessments.set(assessmentKey, assessment);
  }
  const quality = { ...assessment, rendering: drawing.rendering };
  const history = p.history();
  let previous;
  if (previousRevision !== undefined) {
    previous = previousRevision === null ? undefined : p.read(previousRevision);
  } else {
    for (const h of [...history]
      .reverse()
      .filter((h) => h.revision < snapshot.revision)) {
      const candidate = p.read(h.revision);
      if (contentHash(candidate) !== contentHash(snapshot)) {
        previous = candidate;
        break;
      }
    }
  }
  return {
    id: `${id}:${model}`,
    projectId: id,
    modelKind: model,
    exportFilename: `${model}-revision-${snapshot.revision}.bpmn`,
    title: snapshot.name,
    revision: snapshot.revision,
    mode: snapshot.mode,
    exportXml: bpmnXml,
    ...reviewData(snapshot, diagrams, drawing.model.elements),
    discovery: snapshot.discovery,
    quality,
    changes: previous
      ? {
          ...(await p.diff(previous.revision, snapshot.revision)),
          summary: history.find((h) => h.revision === snapshot.revision)
            ?.summary,
        }
      : null,
    history: history.map((h) => ({
      id: String(h.revision),
      processKey: `${id}:${model}`,
      contentKey: `${id}:${model}:${h.revision}`,
      title: `${snapshot.name} · ${model === "as-is" ? "As-is" : "To-be"}`,
      label: `Revision ${h.revision}`,
      revision: h.revision,
      created: h.createdAt,
      modified: Date.parse(h.createdAt),
      summary: h.summary,
      perspective: snapshot.discovery.context.perspective,
    })),
  };
}
