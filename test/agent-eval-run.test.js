import test from 'node:test';
import assert from 'node:assert/strict';
import { runSemanticCases } from '../evals/hosted-agent/run.js';

const fixture = (id, expected = 'supported') => ({ id, seed: 1, expected, candidate: {} });
const verdict = value => ({ verdict: value, issues: [] });
function recording() {
  const writes = [];
  return { writes, saveReport: async report => { writes.push(structuredClone(report)); } };
}

test('an interrupted passing prefix remains incomplete and its next request is recorded before dispatch', async () => {
  const store = recording();
  let dispatched = 0;
  await assert.rejects(runSemanticCases({
    fixtures: [fixture('one'), fixture('two')], ...store,
    review: async options => {
      await options.reserveCall();
      const saved = store.writes.at(-1);
      assert.equal(saved.pendingCase.request, dispatched + 1);
      assert.equal(saved.requests, dispatched + 1);
      assert.equal(saved.complete, false);
      assert.equal(saved.passed, false);
      dispatched++;
      return verdict('supported');
    },
    saveReport: async report => {
      await store.saveReport(report);
      if (report.completedCases === 1 && !report.pendingCase) throw new Error('Simulated interruption after a passing prefix');
    },
  }), /Simulated interruption/);
  assert.equal(dispatched, 1);
  const last = store.writes.at(-1);
  assert.equal(last.expectedCases, 2); assert.equal(last.completedCases, 1);
  assert.equal(last.complete, false); assert.equal(last.passed, false);
});

test('complete reports classify ordinary verdicts, semantic guards and unrelated errors separately', async () => {
  const store = recording();
  const outcomes = [verdict('supported'), verdict('needs_revision'), { code: 'SEMANTIC_REVIEW' }, { code: 'SEMANTIC_REVIEW' }, { name: 'AbortError' }, { statusCode: 401 }, verdict('supported')];
  const expected = ['supported','needs_revision','needs_revision','supported','needs_revision','needs_revision','needs_revision'];
  let i = 0;
  const report = await runSemanticCases({
    fixtures: expected.map((e,i)=>fixture('case-'+i,e)), ...store,
    review: async options => {
      await options.reserveCall(); await options.onUsage({ inputTokens: 8, outputTokens: 2 });
      const outcome = outcomes[i++]; if (!outcome.verdict) throw outcome; return outcome;
    },
  });
  assert.equal(report.complete, true); assert.equal(report.passed, false);
  assert.equal(report.requests, 7); assert.equal(report.normalCorrectVerdicts, 2);
  assert.equal(report.guardedRejections, 1); assert.equal(report.unsafeAccepted, 1);
  assert.deepEqual(report.results.map(r=>r.pass),[true,true,true,false,false,false,false]);
  assert.ok(report.results.every(r=>r.measuredCostCeilingUsd===.000002));
  assert.equal(report.pendingCase, null);
});

test('the 61st reservation is blocked before a dispatch', async () => {
  let dispatched = 0;
  const report = await runSemanticCases({
    fixtures: [fixture('cap')], saveReport: async () => {},
    review: async options => {
      for (let i=0;i<61;i++) { await options.reserveCall(); dispatched++; }
      return verdict('supported');
    },
  });
  assert.equal(dispatched, 60); assert.equal(report.requests, 60);
  assert.equal(report.reservedCostCeilingUsd, 1.2); assert.equal(report.passed, false);
});

test('a pending checkpoint failure stops dispatch and cannot produce a passing result', async () => {
  let dispatched = 0;
  const report = await runSemanticCases({
    fixtures: [fixture('disk')],
    saveReport: async report => { if (report.pendingCase) throw Object.assign(new Error('Disk full'),{code:'ENOSPC'}); },
    review: async options => { await options.reserveCall(); dispatched++; return verdict('supported'); },
  });
  assert.equal(dispatched, 0); assert.equal(report.passed, false);
  assert.equal(report.results[0].error.code, 'ENOSPC');
});

test('only a fully completed matching run reports success', async () => {
  const store = recording();
  const report = await runSemanticCases({ fixtures: [fixture('good')], ...store,
    review: async options => { await options.reserveCall(); return verdict('supported'); },
  });
  assert.equal(store.writes[0].passed, false); assert.equal(store.writes[0].complete, false);
  assert.equal(report.complete, true); assert.equal(report.passed, true);
  assert.deepEqual(store.writes.at(-1), report);
});
