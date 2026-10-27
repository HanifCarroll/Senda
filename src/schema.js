import { z } from 'zod';

export const Id = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/);
const Text = z.string().trim().min(1).max(8000);
export const Revision = z.number().int().positive();
export const Stage = z.enum(['boundaries', 'activities', 'responsibilities', 'control-flow', 'additional-detail', 'quality-review']);
export const SourceInput = z.strictObject({
  id: Id,
  title: Text,
  kind: z.enum(['transcript', 'answer', 'document']),
  text: z.string().min(1).max(2_000_000),
});
export const Evidence = z.strictObject({ sourceId: Id, segmentId: Id, quote: Text });
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
}).superRefine((q, ctx) => {
  if (q.status === 'answered' && !q.answerSourceId)
    ctx.addIssue({ code: 'custom', path: ['answerSourceId'], message: 'An answered question needs its answer source.' });
  if (q.status !== 'answered' && q.answerSourceId)
    ctx.addIssue({ code: 'custom', path: ['answerSourceId'], message: 'Only answered questions can reference an answer.' });
});
export const Context = z.strictObject({
  purpose: Text,
  perspective: Text,
  trigger: z.string().max(8000),
  outcomes: z.array(Text),
  scopeNotes: z.string().max(8000),
});
export const GlossaryEntry = z.strictObject({ term: Text, definition: Text, aliases: z.array(Text).default([]) });
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
export const ImportInput = z.strictObject({ expectedRevision: Revision, summary: Text, xml: z.string().min(1).max(5_000_000) });

export function proposalSchema() {
  return z.toJSONSchema(Proposal, { target: 'draft-2020-12', io: 'input' });
}
