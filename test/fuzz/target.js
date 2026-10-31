import assert from 'node:assert/strict';
import { Claim, Question, Proposal, SourceInput } from '../../src/core/schema.js';

export function fuzz(data) {
  let value;
  try { value = JSON.parse(data.toString('utf8')); } catch (error) {
    if (error instanceof SyntaxError) return;
    throw error;
  }
  for (const schema of [Claim, Question, Proposal, SourceInput]) {
    const result = schema.safeParse(value);
    if (result.success) assert.deepEqual(schema.parse(JSON.parse(JSON.stringify(result.data))), result.data);
  }
  const claim = Claim.safeParse(value);
  if (claim.success && ['supported', 'inferred'].includes(claim.data.status)) {
    assert.ok(claim.data.evidence.length > 0);
    if (claim.data.status === 'inferred') assert.ok(claim.data.rationale.trim());
  }
  const question = Question.safeParse(value);
  if (question.success && question.data.status === 'answered') {
    assert.ok(question.data.answerSourceId);
    for (const item of question.data.answerEvidence ?? []) assert.equal(item.sourceId, question.data.answerSourceId);
  }
}
