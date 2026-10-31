import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { Claim, Question, Proposal, SourceInput } from '../src/core/schema.js';

const options = { numRuns: 500, seed: Number(process.env.FC_SEED ?? 20261031) };
const nonblank = fc.string({ minLength: 1, maxLength: 100 }).filter(value => value.trim().length > 0);
const evidence = { sourceId: 'source_1', segmentId: 'segment_1', quote: 'The operator checks the request.' };

test('supported and inferred claims always require evidence; inferences need a rationale', () => {
  fc.assert(fc.property(nonblank, fc.constantFrom('supported', 'inferred'), (statement, status) => {
    const claim = { id: 'claim_1', statement, kind: 'activity', status, rationale: 'Derived from the interview.' };
    assert.equal(Claim.safeParse(claim).success, false);
    assert.equal(Claim.safeParse({ ...claim, evidence: [evidence] }).success, true);
    if (status === 'inferred') assert.equal(Claim.safeParse({ ...claim, evidence: [evidence], rationale: ' \n' }).success, false);
  }), options);
});

test('answered questions cannot cite evidence from another source', () => {
  fc.assert(fc.property(nonblank, fc.constantFrom('open', 'answered', 'deferred'), (question, status) => {
    const input = { id: 'question_1', question, why: 'Clarify the process.', status, answerSourceId: 'source_1', answerEvidence: [evidence] };
    assert.equal(Question.safeParse(input).success, status === 'answered');
    assert.equal(Question.safeParse({ ...input, answerEvidence: [{ ...evidence, sourceId: 'source_2' }] }).success, false);
  }), options);
});

test('accepted generated proposals and sources remain valid after serialization', () => {
  fc.assert(fc.property(nonblank, fc.integer({ min: 1, max: 100000 }), fc.string({ minLength: 1 }), (summary, revision, text) => {
    const source = SourceInput.parse({ id: 'source_1', title: summary, kind: 'transcript', text });
    const proposal = Proposal.parse({ expectedRevision: revision, summary, sources: [source] });
    assert.deepEqual(Proposal.parse(JSON.parse(JSON.stringify(proposal))), proposal);
  }), options);
});
