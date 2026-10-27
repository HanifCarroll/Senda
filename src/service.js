import { Store, contentHash } from './store.js';
import { Init, Proposal, ReviewInput, ScenarioReviewInput, ImportInput, Revision, proposalSchema, QUALITY_PROFILE } from './schema.js';
import { createModel, editModel, prepareImport, parseModel, modelChanges, OPS_SCHEMA } from './model.js';
import { addSources, updateDiscovery, validateReferences } from './discovery.js';
import { assess } from './quality.js';
import { requireThat } from './errors.js';
import { walkthroughHash } from './review-state.js';

export class Project {
  constructor(directory) { this.store = new Store(directory); }
  static async create(directory, input) {
    const options = Init.parse(input);
    const snapshot = {
      formatVersion: 2, name: options.name, mode: options.mode, status: 'draft',
      xml: await createModel(options.name), reviews: {}, scenarioReviews: {},
      discovery: {
        stage: 'boundaries', context: { purpose: options.purpose, perspective: options.perspective, trigger: '', outcomes: [], scopeNotes: '', profile: QUALITY_PROFILE },
        sources: addSources([], options.sources), claims: [], questions: [], glossary: [],
        abstractions: [], stakeholders: [], conflicts: [], scenarios: [],
      },
    };
    const store = new Store(directory, { create: true });
    try { store.append(0, snapshot, 'Initialize process discovery'); } finally { store.close(); }
    return new Project(directory);
  }
  close() { this.store.close(); }
  read(revision) { return this.store.read(revision === undefined ? undefined : Revision.parse(revision)); }
  history() { return this.store.history(); }
  async inspect(revision) {
    const s = this.read(revision);
    const { xml, ...data } = s;
    return { ...data, model: (await parseModel(xml)).elements.map(e => ({ id: e.id, type: e.$type, name: e.name, parent: e.$parent?.id, source: e.sourceRef?.id, target: e.targetRef?.id })) };
  }
  current(expectedRevision) {
    const s = this.read();
    requireThat(s.revision === expectedRevision, 'STALE_REVISION', 'Read the current project before applying changes.', { expected: expectedRevision, actual: s.revision });
    return s;
  }
  async saveContent(previous, candidate, summary) {
    await validateReferences(candidate);
    const quality = await assess(candidate);
    requireThat(quality.structural.passed, 'INVALID_MODEL', 'The candidate failed structural checks; the current revision was kept.', { findings: quality.structural.findings });
    if (contentHash(previous) === contentHash(candidate)) return { revision: previous.revision, unchanged: true, quality };
    const saved = this.store.append(previous.revision, { ...candidate, formatVersion: 2, status: 'draft', reviews: {}, scenarioReviews: {} }, summary);
    return { revision: saved.revision, unchanged: false, quality: await assess(saved) };
  }
  async apply(input) {
    const proposal = Proposal.parse(input);
    const previous = this.current(proposal.expectedRevision);
    const edit = await editModel(previous.xml, proposal.operations, proposal.layout);
    const candidate = { ...previous, xml: edit.xml, discovery: updateDiscovery(previous.discovery, proposal, edit.aliases) };
    if (proposal.walkthrough) {
      const basisHash = walkthroughHash(candidate), old = previous.discovery.walkthrough;
      candidate.discovery.walkthrough = old?.basisHash === basisHash && JSON.stringify(old.steps) === JSON.stringify(candidate.discovery.walkthrough.steps)
        ? old : { ...candidate.discovery.walkthrough, basisHash, basedOnRevision: previous.revision };
    }
    const result = await this.saveContent(previous, candidate, proposal.summary);
    return { ...result, aliases: edit.aliases, backend: edit.report };
  }
  async import(input) {
    const request = ImportInput.parse(input), previous = this.current(request.expectedRevision);
    const xml = await prepareImport(request.xml);
    return this.saveContent(previous, { ...previous, xml }, request.summary);
  }
  async validate(revision) { return assess(this.read(revision)); }
  async review(input) {
    const request = ReviewInput.parse(input), previous = this.current(request.expectedRevision);
    const review = { aspect: request.aspect, outcome: request.outcome, reviewer: request.reviewer, notes: request.notes, profile: QUALITY_PROFILE, contentHash: contentHash(previous), reviewedRevision: previous.revision, recordedAt: new Date().toISOString() };
    const candidate = { ...previous, status: 'draft', reviews: { ...previous.reviews, [request.aspect]: review } };
    const saved = this.store.append(previous.revision, candidate, `Record ${request.aspect} review: ${request.outcome}`);
    return { revision: saved.revision, review, quality: await assess(saved) };
  }
  async reviewScenario(input) {
    const request = ScenarioReviewInput.parse(input), previous = this.current(request.expectedRevision);
    requireThat(previous.discovery.scenarios?.some(s => s.id === request.scenarioId), 'SCENARIO_NOT_FOUND', 'Read the recorded scenarios before reviewing one.');
    const { expectedRevision, ...feedback } = request;
    const review = { ...feedback, profile: QUALITY_PROFILE, contentHash: contentHash(previous), reviewedRevision: previous.revision, recordedAt: new Date().toISOString() };
    const saved = this.store.append(previous.revision, { ...previous, status: 'draft', scenarioReviews: { ...previous.scenarioReviews, [request.scenarioId]: review } }, `Record scenario feedback: ${request.outcome}`);
    return { revision: saved.revision, review, quality: await assess(saved) };
  }
  async finalize(expectedRevision) {
    const previous = this.current(Revision.parse(expectedRevision));
    const quality = await assess(previous);
    requireThat(quality.readyToFinalize, 'REVIEW_INCOMPLETE', 'This model is not ready to finalize.', { blockers: quality.blockers });
    if (previous.status === 'reviewed') return { revision: previous.revision, unchanged: true, quality };
    const saved = this.store.append(previous.revision, { ...previous, status: 'reviewed' }, 'Finalize reviewed process model');
    return { revision: saved.revision, status: saved.status, quality: await assess(saved) };
  }
  async diff(from, to) {
    const a = this.read(from), b = this.read(to);
    return { from: a.revision, to: b.revision, model: await modelChanges(a.xml, b.xml), discoveryChanged: JSON.stringify(a.discovery) !== JSON.stringify(b.discovery), reviewsChanged: JSON.stringify(a.reviews) !== JSON.stringify(b.reviews), status: { from: a.status, to: b.status } };
  }
}

export const schema = () => ({ proposal: proposalSchema(), operations: OPS_SCHEMA });
