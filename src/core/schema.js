import { z } from 'zod';

export const Id = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/);
const Text = z.string().trim().min(1).max(8000);
export const Revision = z.number().int().positive();
export const QUALITY_PROFILE = 'dumas-conceptual-v2';
export const Stage = z.enum(['boundaries', 'activities', 'responsibilities', 'control-flow', 'additional-detail', 'quality-review']);
export const SourceInput = z.strictObject({
  id: Id,
  title: Text,
  kind: z.enum(['transcript', 'answer', 'document', 'observation']),
  text: z.string().min(1).max(2_000_000),
  origin: Text.optional(),
  contributor: Text.optional(),
  collectedOn: z.iso.date().optional(),
  period: Text.optional(),
  coverage: Text.optional(),
});
export const Evidence = z.strictObject({ sourceId: Id, segmentId: Id, quote: Text, basis: z.enum(['reported', 'observed', 'prescribed', 'derived']).optional() });
export const Claim = z.strictObject({
  id: Id,
  statement: Text,
  kind: z.enum(['boundary', 'activity', 'event', 'responsibility', 'handoff', 'order', 'condition', 'exception', 'artifact']),
  status: z.enum(['supported', 'inferred', 'disputed', 'unknown']),
  state: z.enum(['current', 'proposed']).default('current'),
  evidence: z.array(Evidence).default([]),
  elementIds: z.array(z.string().min(1)).default([]),
  rationale: z.string().max(8000).default(''),
}).superRefine((claim, ctx) => {
  if (['supported', 'inferred'].includes(claim.status) && !claim.evidence.length)
    ctx.addIssue({ code: 'custom', path: ['evidence'], message: 'Supported and inferred claims need source evidence.' });
  if (claim.status === 'inferred' && !claim.rationale.trim())
    ctx.addIssue({ code: 'custom', path: ['rationale'], message: 'Explain the inference.' });
});
export const Question = z.strictObject({
  id: Id,
  question: Text,
  why: Text,
  blocking: z.boolean().default(true),
  status: z.enum(['open', 'answered', 'deferred']).default('open'),
  claimIds: z.array(Id).default([]),
  elementIds: z.array(z.string().min(1)).default([]),
  answerSourceId: Id.optional(),
  answerEvidence: z.array(Evidence).optional(),
}).superRefine((q, ctx) => {
  if (q.status === 'answered' && !q.answerSourceId)
    ctx.addIssue({ code: 'custom', path: ['answerSourceId'], message: 'An answered question needs its answer source.' });
  if (q.status !== 'answered' && q.answerSourceId)
    ctx.addIssue({ code: 'custom', path: ['answerSourceId'], message: 'Only answered questions can reference an answer.' });
  if (q.answerEvidence?.length && (q.status !== 'answered' || q.answerEvidence.some(e => e.sourceId !== q.answerSourceId)))
    ctx.addIssue({ code: 'custom', path: ['answerEvidence'], message: 'Answer excerpts must cite this question\'s answer source.' });
});
export const Context = z.strictObject({
  purpose: Text,
  perspective: Text,
  trigger: z.string().max(8000),
  outcomes: z.array(Text),
  scopeNotes: z.string().max(8000),
  profile: z.literal(QUALITY_PROFILE).optional(),
  audience: Text.optional(),
  owner: Text.optional(),
  customer: Text.optional(),
  detailLevel: z.enum(['overview', 'operational']).optional(),
});
export const GlossaryEntry = z.strictObject({ term: Text, definition: Text, aliases: z.array(Text).default([]) });
export const Abstraction = z.strictObject({
  id: Id, elementId: z.string().min(1), reason: Text,
  inputs: z.array(Text).min(1), outcomes: z.array(Text).min(1),
});
export const Stakeholder = z.strictObject({
  id: Id, role: Text, scope: Text,
  status: z.enum(['not-consulted', 'consulted', 'not-needed']).default('not-consulted'),
  sourceIds: z.array(Id).default([]), notes: z.string().max(8000).default(''),
}).superRefine((s, ctx) => {
  if (s.status === 'consulted' && !s.sourceIds.length) ctx.addIssue({ code: 'custom', path: ['sourceIds'], message: 'Link the contribution from this role.' });
  if (s.status === 'not-needed' && !s.notes.trim()) ctx.addIssue({ code: 'custom', path: ['notes'], message: 'Explain why this perspective is outside the discovery scope.' });
});
export const Conflict = z.strictObject({
  id: Id, description: Text, claimIds: z.array(Id).min(2),
  status: z.enum(['open', 'resolved']).default('open'),
  resolution: z.string().max(8000).default(''), evidence: z.array(Evidence).default([]),
}).superRefine((c, ctx) => {
  if (new Set(c.claimIds).size < 2) ctx.addIssue({ code: 'custom', path: ['claimIds'], message: 'A conflict needs at least two different claims.' });
  if (c.status === 'resolved' && (!c.resolution.trim() || !c.evidence.length)) ctx.addIssue({ code: 'custom', path: ['resolution'], message: 'Explain the resolution and cite its evidence.' });
});
export const Scenario = z.strictObject({
  id: Id, title: Text, kind: z.enum(['normal', 'alternative', 'parallel', 'rework', 'exception', 'message', 'other']),
  given: Text, expectedOutcome: Text,
  elementIds: z.array(z.string().min(1)).min(1), evidence: z.array(Evidence).default([]),
});
export const Walkthrough = z.strictObject({
  steps: z.array(z.strictObject({
    id: Id, text: Text, elementIds: z.array(z.string().min(1)).default([]), claimIds: z.array(Id).default([]),
  }).superRefine((s, ctx) => {
    if (!s.elementIds.length && !s.claimIds.length) ctx.addIssue({ code: 'custom', message: 'Link the statement to model elements or evidence claims.' });
  })).min(1),
});
export const Proposal = z.strictObject({
  expectedRevision: Revision,
  summary: Text,
  context: Context.partial().optional(),
  stage: Stage.optional(),
  sources: z.array(SourceInput).default([]),
  claims: z.array(Claim).default([]),
  removeClaimIds: z.array(Id).default([]),
  questions: z.array(Question).default([]),
  removeQuestionIds: z.array(Id).default([]),
  glossary: z.array(GlossaryEntry).optional(),
  abstractions: z.array(Abstraction).default([]),
  removeAbstractionIds: z.array(Id).default([]),
  stakeholders: z.array(Stakeholder).default([]),
  removeStakeholderIds: z.array(Id).default([]),
  conflicts: z.array(Conflict).default([]),
  removeConflictIds: z.array(Id).default([]),
  scenarios: z.array(Scenario).default([]),
  removeScenarioIds: z.array(Id).default([]),
  walkthrough: Walkthrough.nullable().optional(),
  operations: z.array(z.record(z.string(), z.unknown())).default([]),
  layout: z.enum(['incremental', 'full']).default('incremental'),
});
export const Init = z.strictObject({
  name: Text,
  purpose: Text,
  perspective: Text,
  mode: z.enum(['current', 'proposed']).default('current'),
  sources: z.array(SourceInput).default([]),
});
export const ReviewInput = z.strictObject({
  expectedRevision: Revision,
  aspect: z.enum(['semantic', 'behavioral', 'pragmatic']),
  outcome: z.enum(['approved', 'needs_changes']),
  reviewer: Text,
  notes: Text,
});
export const ScenarioReviewInput = z.strictObject({
  expectedRevision: Revision, scenarioId: Id,
  outcome: z.enum(['confirmed', 'needs_changes']), reviewer: Text, notes: Text,
});
export const ImportInput = z.strictObject({ expectedRevision: Revision, summary: Text, xml: z.string().min(1).max(5_000_000) });

export function proposalSchema() {
  return z.toJSONSchema(Proposal, { target: 'draft-2020-12', io: 'input' });
}
