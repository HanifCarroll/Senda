import assert from 'node:assert/strict';
import { BpmnModdle } from 'bpmn-moddle';
import { z } from 'zod';
import { createModel, editModel, prepareImport, describeModel } from '../../src/core/model.js';
import { ScribeError } from '../../src/core/errors.js';

const edit = z.strictObject({ name: z.string().min(1).max(80).regex(/^[A-Za-z0-9 <>&"'-]+$/), count: z.number().int().min(1).max(5) });
const empty = await createModel('Synthetic fuzz process');

export async function fuzz(data) {
  const text = data.toString('utf8');
  let xml;
  if (text.trimStart().startsWith('{')) {
    let value;
    try { value = JSON.parse(text); } catch (error) {
      if (error instanceof SyntaxError) return;
      throw error;
    }
    const input = edit.safeParse(value);
    if (!input.success) return;
    const operations = [{ op: 'add', kind: 'start', id: 'Start', name: 'Request received' }];
    let after = 'Start';
    for (let i = 0; i < input.data.count; i++) {
      operations.push({ op: 'add', kind: 'task', id: `Task_${i}`, name: input.data.name, after });
      after = `Task_${i}`;
    }
    operations.push({ op: 'add', kind: 'end', id: 'End', name: 'Request completed', after });
    xml = (await editModel(empty, operations)).xml;
    const model = await describeModel(xml);
    assert.equal(model.filter(e => e.type === 'bpmn:Task').length, input.data.count);
    assert.ok(model.filter(e => e.type === 'bpmn:Task').every(e => e.name === input.data.name));
    assert.equal(model.filter(e => e.type === 'bpmn:SequenceFlow').length, input.data.count + 1);
  } else {
    try { xml = await prepareImport(text); }
    catch (error) {
      if (error instanceof ScribeError && ['LOSSY_IMPORT', 'INVALID_MODEL'].includes(error.code)) return;
      // These are the XML reader's explicit syntax failures; unexpected errors
      // (including TypeError/RangeError) remain fuzzer findings.
      if (error.constructor === Error && /^(unparsable content|failed to parse document as)/.test(error.message)) return;
      throw error;
    }
  }
  const moddle = new BpmnModdle(), parsed = await moddle.fromXML(xml);
  assert.deepEqual(parsed.warnings, []);
  const encoded = (await moddle.toXML(parsed.rootElement, { format: true })).xml;
  assert.deepEqual(await describeModel(encoded), await describeModel(xml));
  assert.equal(await prepareImport(encoded), encoded);
}
