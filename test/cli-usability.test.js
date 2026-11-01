import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = path.join(root, 'bin/senda.js');
const invoke = (args, env = {}, cwd = root) => spawnSync(process.execPath, [cli, ...args], {
  cwd, env: { ...process.env, SENDA_PROJECT: '', ...env }, encoding: 'utf8', timeout: 30_000,
});
const successful = result => {
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
const init = (directory, name, env = {}) => successful(invoke([
  '--project', directory, 'init', '--name', name, '--purpose', 'Test project selection.', '--perspective', 'Reviewer',
], env));

test('SENDA_PROJECT selects a project, explicit --project wins, and an empty value keeps .senda', async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'senda-project-option-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const first = path.join(temporary, 'first');
  const second = path.join(temporary, 'second');
  init(first, 'First process');
  init(second, 'Second process');
  assert.equal(JSON.parse(successful(invoke(['status'], { SENDA_PROJECT: first }))).name, 'First process');
  assert.equal(JSON.parse(successful(invoke(['--project', second, 'status'], { SENDA_PROJECT: first }))).name, 'Second process');
  init(path.join(temporary, '.senda'), 'Default process');
  assert.equal(JSON.parse(successful(invoke(['status'], {}, temporary))).name, 'Default process');
});

test('status keeps its JSON contract and offers a readable --human summary', async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'senda-human-status-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  init(temporary, 'Invoice approval');
  const data = JSON.parse(successful(invoke(['--project', temporary, 'status'])));
  assert.deepEqual(Object.keys(data), ['name', 'revision', 'status', 'stage', 'readyToFinalize', 'blockers']);
  const human = successful(invoke(['--project', temporary, 'status', '--human']));
  assert.match(human, /Invoice approval/);
  assert.match(human, new RegExp(`Revision ${data.revision}`));
  assert.ok(human.includes(data.stage));
  assert.ok(human.includes(data.blockers[0].message));
  assert.match(human, /The model contains no process behavior\./);
  assert.doesNotMatch(human, /\[object Object\]/);
  assert.throws(() => JSON.parse(human));
});

test('export --open opens the saved review without a shell; --no-open suppresses it', { skip: process.platform === 'win32' }, async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'senda-open-export-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const project = path.join(temporary, 'project');
  init(project, 'Review opener');
  const fakeBin = path.join(temporary, 'bin');
  const receipt = path.join(temporary, 'opened.json');
  await mkdir(fakeBin);
  await writeFile(path.join(fakeBin, process.platform === 'darwin' ? 'open' : 'xdg-open'),
    '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.SENDA_OPENER_RECEIPT, JSON.stringify(process.argv.slice(2)));\n', { mode: 0o755 });
  const env = { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`, SENDA_OPENER_RECEIPT: receipt, DISPLAY: ':test', CI: '' };
  const out = path.join(temporary, "review '$() & export");
  const exported = JSON.parse(successful(invoke(['--project', project, 'export', '--out', out, '--open'], env)));
  assert.equal(exported.directory, out);
  assert.deepEqual(JSON.parse(await readFile(receipt, 'utf8')), [pathToFileURL(path.join(out, 'review.html')).href]);
  await rm(receipt);
  successful(invoke(['--project', project, 'export', '--out', path.join(temporary, 'closed'), '--open', '--no-open'], env));
  await assert.rejects(readFile(receipt), { code: 'ENOENT' });
});

test('the demo opens its finished review and --no-open suppresses the launch', { timeout: 30_000, skip: process.platform === 'win32' }, async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'senda-demo-opener-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const receipt = path.join(temporary, 'opened.json');
  const fakeBin = path.join(temporary, 'bin');
  await mkdir(fakeBin);
  await writeFile(path.join(fakeBin, process.platform === 'darwin' ? 'open' : 'xdg-open'),
    '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.SENDA_OPENER_RECEIPT, JSON.stringify(process.argv.slice(2)));\n', { mode: 0o755 });
  const env = { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`, SENDA_OPENER_RECEIPT: receipt, DISPLAY: ':test', CI: '' };
  const automatic = JSON.parse(successful(spawnSync(process.execPath, ['scripts/demo.js'], { cwd: root, env, encoding: 'utf8', timeout: 30_000 })));
  t.after(() => rm(path.dirname(automatic.project), { recursive: true, force: true }));
  assert.deepEqual(JSON.parse(await readFile(receipt, 'utf8')), [pathToFileURL(automatic.after).href]);
  await rm(receipt);
  const result = spawnSync(process.execPath, ['scripts/demo.js', '--no-open'], {
    cwd: root, env, encoding: 'utf8', timeout: 30_000,
  });
  const data = JSON.parse(successful(result));
  t.after(() => rm(path.dirname(data.project), { recursive: true, force: true }));
  assert.match(await readFile(data.after, 'utf8'), /<html/);
  await assert.rejects(readFile(receipt), { code: 'ENOENT' });
});

test('a browser launch unavailable in CI preserves the successful export and explains how to open it', async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'senda-export-headless-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const project = path.join(temporary, 'project');
  init(project, 'Headless review');
  const result = invoke(['--project', project, 'export', '--out', path.join(temporary, 'review'), '--open'], { CI: '1' });
  const data = JSON.parse(successful(result));
  assert.match(await readFile(path.join(data.directory, 'review.html'), 'utf8'), /<html/);
  const warning = JSON.parse(result.stderr.split('\n').find(line => line.startsWith('{')));
  assert.equal(warning.warning.code, 'BROWSER_NOT_OPENED');
  assert.match(warning.warning.message, /review\.html/);
});
