import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { semanticCases } from '../evals/hosted-agent/cases.js';
import { runSemanticCases } from '../evals/hosted-agent/run.js';
import { createAgentModel, AGENT_MODEL_ID } from '../src/server/agent/provider.js';

assert.equal(process.env.SENDA_TEST_LIVE_AGENT, '1', 'Opt in explicitly: this benchmark uses OpenAI API credit.');
assert.ok(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY is required.');
assert.equal(AGENT_MODEL_ID, 'gpt-6-luna', 'Recalculate the benchmark cost bound before changing models.');
await mkdir(resolve('tmp'), { recursive: true, mode: 0o700 });
const directory = await mkdtemp(resolve('tmp', 'agent-semantic-eval-'));
const model = createAgentModel(process.env.OPENAI_API_KEY, { baseURL: 'https://api.openai.com/v1' });
const fixtures = (await Promise.all([1, 2, 3].map(semanticCases))).flatMap((cases, i) => cases.map(f => ({ ...f, seed: i + 1 })));
assert.equal(fixtures.length, 60);
console.log('Running 60 synthetic controls. At most 60 requests, no retries; maximum $1.20 at the configured Luna ceiling.');
const report = await runSemanticCases({
  model, fixtures,
  saveReport: async report => {
    await writeFile(directory + '/pending.json', JSON.stringify(report, null, 2), { mode: 0o600 });
    await rename(directory + '/pending.json', directory + '/results.json');
  },
  onCase: row => console.log(JSON.stringify({ seed: row.seed, id: row.id, pass: row.pass, actual: row.actual, error: row.error })),
});
console.log('Results: ' + directory + '/results.json');
if (!report.passed) process.exitCode = 1;
