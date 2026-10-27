import { hash } from './store.js';
import { requireThat } from './errors.js';
import { parseModel } from './model.js';

function unique(items, label) {
  requireThat(new Set(items.map(x => x.id)).size === items.length, 'DUPLICATE_ID', `Duplicate ${label} IDs in this request.`);
}

export function addSources(existing, inputs) {
  unique(inputs, 'source');
  const sources = [...existing];
  for (const input of inputs) {
    requireThat(!sources.some(s => s.id === input.id), 'IMMUTABLE_SOURCE', `Source ${input.id} already exists. Add a new source instead.`);
    const text = input.text.replace(/\r\n?/g, '\n');
    const segments = text.split('\n').flatMap((text, i) => text.trim() ? [{ id: `line-${i + 1}`, line: i + 1, text }] : []);
    requireThat(segments.length > 0, 'EMPTY_SOURCE', 'A source must contain readable text.');
    sources.push({ ...input, text, segments, sha256: hash(text) });
  }
  return sources;
}

function upsert(existing, updates, removals, label) {
  unique(updates, label);
  requireThat(new Set(removals).size === removals.length, 'DUPLICATE_ID', `Duplicate removed ${label} IDs.`);
  const map = new Map(existing.map(x => [x.id, x]));
  for (const id of removals) {
    requireThat(map.has(id) && !updates.some(x => x.id === id), 'INVALID_REMOVAL', `Cannot remove ${label} ${id}: absent or also being updated.`);
    map.delete(id);
  }
  for (const entry of updates) map.set(entry.id, entry);
  return [...map.values()];
}

export function updateDiscovery(discovery, proposal, aliases) {
  const resolve = entry => ({ ...entry, elementIds: entry.elementIds.map(id => aliases[id] || id) });
  return {
    ...discovery,
    context: { ...discovery.context, ...proposal.context },
    stage: proposal.stage || discovery.stage,
    sources: addSources(discovery.sources, proposal.sources),
    claims: upsert(discovery.claims, proposal.claims.map(resolve), proposal.removeClaimIds, 'claim'),
    questions: upsert(discovery.questions, proposal.questions.map(resolve), proposal.removeQuestionIds, 'question'),
    glossary: proposal.glossary ?? discovery.glossary,
  };
}

export async function validateReferences(snapshot) {
  const { discovery, mode } = snapshot;
  const ids = new Set((await parseModel(snapshot.xml)).elements.map(e => e.id));
  const claims = new Set(discovery.claims.map(c => c.id));
  const sources = new Map(discovery.sources.map(s => [s.id, s]));
  for (const claim of discovery.claims) {
    requireThat(claim.state === mode || !claim.elementIds.length, 'MIXED_PROCESS_STATE', `Claim ${claim.id} describes ${claim.state} behavior but the diagram describes ${mode} behavior.`);
    for (const evidence of claim.evidence) {
      const source = sources.get(evidence.sourceId);
      const segment = source?.segments.find(s => s.id === evidence.segmentId);
      requireThat(segment?.text.includes(evidence.quote), 'INVALID_EVIDENCE', `The cited quote for ${claim.id} is not present in that source segment.`, { evidence });
    }
  }
  for (const entry of [...discovery.claims, ...discovery.questions]) {
    for (const id of entry.elementIds)
      requireThat(ids.has(id), 'DANGLING_EVIDENCE', `${entry.id} refers to missing BPMN element ${id}. Update the reference in the same proposal.`);
  }
  for (const question of discovery.questions) {
    for (const id of question.claimIds)
      requireThat(claims.has(id), 'DANGLING_QUESTION', `Question ${question.id} refers to missing claim ${id}.`);
    if (question.status === 'answered')
      requireThat(sources.get(question.answerSourceId)?.kind === 'answer', 'INVALID_ANSWER', `Question ${question.id} must cite a source whose kind is answer.`);
  }
}
