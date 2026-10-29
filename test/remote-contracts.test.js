import test from 'node:test';
import assert from 'node:assert/strict';
import { skillBundle } from '#senda/skill';
import { schema } from '../src/core/project-core.js';
import { remoteMethod, remoteModelSchema, methodInput, methodOutput, modelSchemaOutput } from '../src/server/remote-contracts.js';

test('method references are retrieved on demand without dropping any installed instructions', async () => {
  const all = await skillBundle(), first = await remoteMethod();
  assert.deepEqual(Object.keys(first.documents), ['SKILL.md']);
  assert.ok(Buffer.byteLength(JSON.stringify(first)) < 12000);
  assert.deepEqual(new Set(first.availableReferences), new Set(Object.keys(all)));
  for (const reference of first.availableReferences) {
    const value = await remoteMethod({ reference });
    assert.equal(value.documents[reference], all[reference]);
    assert.equal(methodOutput.safeParse(value).success, true);
  }
  assert.deepEqual((await remoteMethod({ reference: 'all' })).documents, all);
  assert.equal(methodInput.safeParse({ reference: '../../.env' }).success, false);
});

test('operation slices retain every referenced definition and the full installed contract remains available', () => {
  const full = schema(), overview = remoteModelSchema();
  assert.deepEqual(overview.proposal, full.proposal);
  assert.ok(Buffer.byteLength(JSON.stringify(overview)) < 14000);
  assert.equal(overview.operations, undefined);
  for (const { name } of overview.operationIndex) {
    const result = remoteModelSchema({ operation: name });
    assert.equal(modelSchemaOutput.safeParse(result).success, true);
    assert.deepEqual(result.operations.$defs[name], full.operations.$defs[name]);
    const visit = value => {
      if (!value || typeof value !== 'object') return;
      if (value.$ref?.startsWith('#/$defs/')) assert.ok(result.operations.$defs[value.$ref.slice(8)], `Missing ${value.$ref}`);
      Object.values(value).forEach(visit);
    };
    visit(result.operations);
  }
  const result = remoteModelSchema({ section: 'full' });
  assert.deepEqual(result.operations, full.operations);assert.deepEqual(result.proposal, full.proposal);
});
