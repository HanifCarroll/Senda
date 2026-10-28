import { hash } from './hash.js';
import { requireThat } from './errors.js';
import { parseModel, typeOf } from './model.js';
import { currentWalkthrough } from './review-state.js';

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
  const next = {
    ...discovery,
    context: { ...discovery.context, ...proposal.context },
    stage: proposal.stage || discovery.stage,
    sources: addSources(discovery.sources, proposal.sources),
    claims: upsert(discovery.claims, proposal.claims.map(resolve), proposal.removeClaimIds, 'claim'),
    questions: upsert(discovery.questions, proposal.questions.map(resolve), proposal.removeQuestionIds, 'question'),
    glossary: proposal.glossary ?? discovery.glossary,
  };
  for (const [key, removeKey] of [['abstractions', 'removeAbstractionIds'], ['stakeholders', 'removeStakeholderIds'], ['conflicts', 'removeConflictIds'], ['scenarios', 'removeScenarioIds']]) {
    if (discovery[key] !== undefined || proposal[key].length || proposal[removeKey].length) {
      const updates = proposal[key].map(entry => key === 'scenarios' ? resolve(entry) : key === 'abstractions' ? { ...entry, elementId: aliases[entry.elementId] || entry.elementId } : entry);
      next[key] = upsert(discovery[key] || [], updates, proposal[removeKey], key);
    }
  }
  if (proposal.walkthrough !== undefined) next.walkthrough = proposal.walkthrough ? { steps: proposal.walkthrough.steps.map(resolve) } : null;
  return next;
}

export async function validateReferences(snapshot) {
  const { discovery, mode } = snapshot;
  const elements = (await parseModel(snapshot.xml)).elements;
  const ids = new Set(elements.map(e => e.id));
  const claims = new Set(discovery.claims.map(c => c.id));
  const sources = new Map(discovery.sources.map(s => [s.id, s]));
  const checkEvidence = (entry, evidenceItems = entry.evidence || []) => {
    for (const evidence of evidenceItems) {
      const source = sources.get(evidence.sourceId);
      const segment = source?.segments.find(s => s.id === evidence.segmentId);
      requireThat(segment?.text.includes(evidence.quote), 'INVALID_EVIDENCE', `The cited quote for ${entry.id} is not present in that source segment.`, { evidence });
    }
  };
  for (const claim of discovery.claims) {
    requireThat(claim.state === mode || !claim.elementIds.length, 'MIXED_PROCESS_STATE', `Claim ${claim.id} describes ${claim.state} behavior but the diagram describes ${mode} behavior.`);
    checkEvidence(claim);
  }
  const steps = currentWalkthrough(snapshot)?.steps || [];
  unique(steps, 'walkthrough step');
  for (const entry of [...discovery.claims, ...discovery.questions, ...(discovery.scenarios || []), ...steps]) {
    for (const id of entry.elementIds || [])
      requireThat(ids.has(id), 'DANGLING_EVIDENCE', `${entry.id} refers to missing BPMN element ${id}. Update the reference in the same proposal.`);
    checkEvidence(entry);
  }
  for (const entry of [...discovery.questions, ...(discovery.conflicts || []), ...steps]) {
    for (const id of entry.claimIds)
      requireThat(claims.has(id), 'DANGLING_CLAIM', `${entry.id} refers to missing claim ${id}.`);
  }
  for (const question of discovery.questions) {
    checkEvidence(question, question.answerEvidence || []);
    if (question.status === 'answered')
      requireThat(sources.get(question.answerSourceId)?.kind === 'answer', 'INVALID_ANSWER', `Question ${question.id} must cite a source whose kind is answer.`);
  }
  for (const conflict of discovery.conflicts || []) checkEvidence(conflict);
  for (const stakeholder of discovery.stakeholders || [])
    for (const id of stakeholder.sourceIds) requireThat(sources.has(id), 'DANGLING_SOURCE', `${stakeholder.id} refers to missing source ${id}.`);
  const abstracted = new Set();
  for (const abstraction of discovery.abstractions || []) {
    const element = elements.find(e => e.id === abstraction.elementId);
    requireThat(typeOf(element || {}) === 'SubProcess' && !element.triggeredByEvent && !element.flowElements?.length, 'INVALID_ABSTRACTION', 'An abstraction record can describe only an intentionally empty ordinary subprocess.', { elementId: abstraction.elementId });
    requireThat(!abstracted.has(element.id), 'DUPLICATE_ABSTRACTION', 'Use one abstraction record per subprocess.', { elementId: element.id });
    abstracted.add(element.id);
  }
}
