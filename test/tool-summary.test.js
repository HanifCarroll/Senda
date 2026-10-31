import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeResult } from '../src/server/tools.js';

test('tool results carry a short readable summary for saves, lists, reviews and exports', () => {
  const reviewUrl = 'https://senda.test/app/projects/p?model=as-is&revision=3';
  assert.equal(summarizeResult('apply_revision', { revision: 3, savedReceipt: { model: 'as-is', revision: 3, unchanged: false, reviewUrl } }),
    `Saved As-is revision 3. Review it at ${reviewUrl}`);
  assert.equal(summarizeResult('apply_revision', { revision: 3, savedReceipt: { model: 'to-be', revision: 3, unchanged: true, reviewUrl } }),
    `No changes were needed. To-be revision 3 is still current: ${reviewUrl}`);
  assert.equal(summarizeResult('list_projects', [{ id: 'a' }]), '1 project is available.');
  assert.equal(summarizeResult('list_projects', []), '0 projects are available.');
  assert.equal(summarizeResult('review_project', { model: 'to-be', revision: 2, url: 'https://senda.test/r' }), 'Review To-be revision 2 at https://senda.test/r');
  assert.equal(summarizeResult('export_bpmn', { model: 'as-is', revision: 4, filename: 'as-is-r4.bpmn', browserDownload: 'https://senda.test/d' }),
    'Exported As-is revision 4 as as-is-r4.bpmn. Download it at https://senda.test/d');
  assert.equal(summarizeResult('read_sources', { sources: [] }), null);
});
