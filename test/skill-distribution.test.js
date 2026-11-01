import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = (script, args, cwd, env) => spawnSync(process.execPath, [script, ...args], {
  cwd, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 15_000,
});
const successful = result => { assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout); };
async function fixture(t) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'senda-skill-package-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const packageRoot = path.join(temporary, 'package');
  await mkdir(path.join(packageRoot, 'scripts'), { recursive: true });
  await mkdir(path.join(packageRoot, 'bin'));
  await cp(path.join(root, 'skills/senda'), path.join(packageRoot, 'skills/senda'), { recursive: true });
  await cp(path.join(root, 'scripts/install-skill.js'), path.join(packageRoot, 'scripts/install-skill.js'));
  await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: '@senda-fixture/cli', version: '1.2.3', type: 'module', bin: { senda: 'bin/senda.js' } }));
  await writeFile(path.join(packageRoot, 'bin/senda.js'), 'console.log(JSON.stringify({ local: true, args: process.argv.slice(2) }));\n');
  const env = { CLAUDE_CONFIG_DIR: path.join(temporary, 'claude'), CODEX_HOME: path.join(temporary, 'codex') };
  const destination = path.join(env.CLAUDE_CONFIG_DIR, 'skills/senda');
  return { temporary, packageRoot, env, destination, installer: path.join(packageRoot, 'scripts/install-skill.js') };
}

test('install-skill is a CLI command and installs a persistent copy into isolated agent homes', async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'senda-install-command-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const env = { CLAUDE_CONFIG_DIR: path.join(temporary, 'claude'), CODEX_HOME: path.join(temporary, 'codex') };
  const result = successful(run(path.join(root, 'bin/senda.js'), ['install-skill', '--agent', 'all'], root, env));
  for (const agent of ['claude', 'codex']) {
    assert.equal((await lstat(result.installed[agent])).isSymbolicLink(), false);
    assert.match(await readFile(path.join(result.installed[agent], 'SKILL.md'), 'utf8'), /name: senda/);
  }
});

test('copied skill uses its companion CLI and falls back to a pinned npm package after removal', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t);
  successful(run(f.installer, ['--agent', 'claude'], f.temporary, f.env));
  assert.equal((await lstat(f.destination)).isSymbolicLink(), false);
  const runner = path.join(f.destination, 'scripts/run.mjs');
  assert.deepEqual(successful(run(runner, ['status', '--human'], f.temporary, f.env)), { local: true, args: ['status', '--human'] });
  const runtime = JSON.parse(await readFile(path.join(f.destination, 'senda-runtime.json'), 'utf8'));
  assert.equal(runtime.package, '@senda-fixture/cli@1.2.3');
  await rm(f.packageRoot, { recursive: true });
  const bin = path.join(f.temporary, 'bin');
  await mkdir(bin);
  await writeFile(path.join(bin, 'npx'), '#!/usr/bin/env node\nconsole.log(JSON.stringify({ npm: process.argv.slice(2), cwd: process.cwd() }));\n', { mode: 0o755 });
  const result = successful(run(runner, ['--project', 'private project', 'status'], f.temporary, { ...f.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` }));
  assert.deepEqual(result.npm, ['--yes', '--package', '@senda-fixture/cli@1.2.3', 'senda', '--project', 'private project', 'status']);
  assert.equal(result.cwd, await realpath(f.temporary));
  assert.match(await readFile(path.join(f.destination, 'SKILL.md'), 'utf8'), /name: senda/);
  await writeFile(path.join(bin, 'npx'), '#!/usr/bin/env node\nprocess.exitCode = 17;\n', { mode: 0o755 });
  assert.equal(run(runner, ['status'], f.temporary, { ...f.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` }).status, 17);
});

test('installer updates its own copy, migrates its own symlink, and preserves unrelated skills', async t => {
  const f = await fixture(t);
  await mkdir(path.dirname(f.destination), { recursive: true });
  await symlink(path.join(f.packageRoot, 'skills/senda'), f.destination, 'dir');
  successful(run(f.installer, ['--agent', 'claude'], f.temporary, f.env));
  assert.equal((await lstat(f.destination)).isSymbolicLink(), false);
  await writeFile(path.join(f.packageRoot, 'skills/senda/release.txt'), 'updated');
  successful(run(f.installer, ['--agent', 'claude'], f.temporary, f.env));
  assert.equal(await readFile(path.join(f.destination, 'release.txt'), 'utf8'), 'updated');
  await rm(f.destination, { recursive: true });
  await mkdir(f.destination);
  await writeFile(path.join(f.destination, 'mine.txt'), 'Keep this skill.');
  const refused = run(f.installer, ['--agent', 'claude'], f.temporary, f.env);
  assert.notEqual(refused.status, 0);
  assert.equal(await readFile(path.join(f.destination, 'mine.txt'), 'utf8'), 'Keep this skill.');
});

test('Claude marketplace bundles the skill and hosted MCP without credentials', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, '.claude-plugin/plugin.json'), 'utf8'));
  const marketplace = JSON.parse(await readFile(path.join(root, '.claude-plugin/marketplace.json'), 'utf8'));
  const mcp = JSON.parse(await readFile(path.join(root, '.mcp.json'), 'utf8'));
  assert.equal(manifest.name, 'senda');
  assert.equal(marketplace.name, 'senda');
  assert.equal(marketplace.plugins[0].name, manifest.name);
  assert.ok(['.', './'].includes(marketplace.plugins[0].source));
  assert.deepEqual(mcp, { mcpServers: { senda: { type: 'http', url: 'https://senda.hanifcarroll.com/mcp' } } });
  assert.match(await readFile(path.join(root, 'skills/senda/SKILL.md'), 'utf8'), /name: senda/);
});

test('installing all agents preflights collisions before changing either installation', async t => {
  const f = await fixture(t);
  const custom = path.join(f.env.CODEX_HOME, 'skills/senda');
  await mkdir(custom, { recursive: true });
  await writeFile(path.join(custom, 'mine.txt'), 'Keep this skill.');
  const result = run(f.installer, ['--agent', 'all'], f.temporary, f.env);
  assert.notEqual(result.status, 0);
  await assert.rejects(lstat(f.destination), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(custom, 'mine.txt'), 'utf8'), 'Keep this skill.');
});

test('a plugin checkout without npm dependencies falls back to its own pinned package', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.packageRoot, 'bin/senda.js'), "import 'senda-missing-fixture-dependency';\n");
  const bin = path.join(f.temporary, 'bin');
  await mkdir(bin);
  await writeFile(path.join(bin, 'npx'), '#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)));\n', { mode: 0o755 });
  const result = successful(run(path.join(f.packageRoot, 'skills/senda/scripts/run.mjs'), ['schema'], f.temporary, { ...f.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` }));
  assert.deepEqual(result, ['--yes', '--package', '@senda-fixture/cli@1.2.3', 'senda', 'schema']);
});
