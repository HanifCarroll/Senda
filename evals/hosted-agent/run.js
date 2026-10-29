import assert from 'node:assert/strict';
import { generateText } from 'ai';
import { reviewCandidate } from '../../src/server/agent/semantic-review.js';
import { AGENT_MODEL_ID } from '../../src/server/agent/provider.js';
import { usageCost } from '../../src/server/agent/limits.js';

export async function runSemanticCases({ model, fixtures, saveReport, onCase = () => {}, review = reviewCandidate }) {
  assert.ok(fixtures.length > 0 && fixtures.length <= 60);
  let requests = 0, pendingCase = null;
  const results = [];
  const report = () => ({
    model: AGENT_MODEL_ID, expectedCases: fixtures.length, completedCases: results.length,
    complete: results.length === fixtures.length,
    passed: results.length === fixtures.length && results.every(r => r.pass),
    requests, reservedCostCeilingUsd: requests * .02, pendingCase,
    normalCorrectVerdicts: results.filter(r => r.actual === r.expected).length,
    guardedRejections: results.filter(r => r.guardedRejection).length,
    unsafeAccepted: results.filter(r => r.expected === 'needs_revision' && r.actual === 'supported').length,
    results,
  });
  await saveReport(report());
  for (const f of fixtures) {
    const started = Date.now(), result = { seed: f.seed, id: f.id, expected: f.expected };
    let usage;
    try {
      const verdict = await review({
        model, candidate: f.candidate, overviewTurn: !!f.overviewTurn,
        userMessage: 'Check this process against the interview; keep unspecified behavior as an open question.',
        maxBytes: 60000, maxOutputTokens: 16000, signal: AbortSignal.timeout(180000),
        generate: options => {
          const payload = JSON.parse(options.prompt);
          payload.after.reverse();
          return generateText({ ...options, prompt: JSON.stringify(payload) });
        },
        reserveCall: async () => {
          assert.ok(requests < 60, 'Benchmark request cap reached');
          requests++;
          pendingCase = { seed: f.seed, id: f.id, request: requests };
          await saveReport(report());
        },
        onUsage: async value => { usage = value; },
      });
      Object.assign(result, { actual: verdict.verdict, verdict, pass: verdict.verdict === f.expected });
    } catch (error) {
      const guardedRejection = f.expected === 'needs_revision' && error.code === 'SEMANTIC_REVIEW';
      Object.assign(result, {
        actual: guardedRejection ? 'rejected-by-factual-guard' : undefined,
        pass: guardedRejection, guardedRejection,
        error: { name: error.name, code: error.code, status: error.statusCode },
      });
    }
    Object.assign(result, { usage, measuredCostCeilingUsd: usage ? usageCost(usage) : undefined, ms: Date.now() - started });
    results.push(result);
    pendingCase = null;
    await saveReport(report());
    await onCase(result);
  }
  return report();
}
