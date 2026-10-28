import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.filter(e => !e.name.startsWith('.dev.vars') && !['node_modules','.git','output','workspaces','.process-scribe','exports','coverage','tmp','dist','dist-cloudflare','.wrangler','.tanstack','routeTree.gen.ts'].includes(e.name)).map(e => e.isDirectory() ? walk(path.join(directory, e.name)) : path.join(directory, e.name)))).flat();
}
const files = await walk(root);
for (const file of files) {
  const relative = path.relative(root, file);
  assert.ok(!/\.(pdf|sqlite|pem|key)$/i.test(file), `Private or binary material in the source tree: ${relative}`);
  if (file.endsWith('.js') || file.endsWith('.mjs')) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${relative}: ${result.stderr}`);
  }
  if (/\.(png|webp|jpg|jpeg|woff2)$/i.test(file)) continue;
  const text = await readFile(file, 'utf8');
  // A source-tree hygiene check, not a replacement for reviewing the staged files.
  assert.ok(!/\/Users\/[^/\s]+\//.test(text), `Machine-specific path in ${relative}`);
  assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text), `Private key in ${relative}`);
  assert.ok(!/chatgpt-conversation:\/\//.test(text), `Private conversation reference in ${relative}`);
  if (relative.endsWith('.md')) {
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const link = match[1].split('#')[0];
      if (!link || /^[a-z]+:/i.test(link) || link.startsWith('$')) continue;
      await readFile(path.resolve(path.dirname(file), link));
    }
  }
}
const skill = await readFile(path.join(root, 'skills/process-scribe/SKILL.md'), 'utf8');
assert.match(skill, /^---\nname: process-scribe\ndescription: .+\n---/);
assert.ok(skill.split('\n').length < 500, 'Keep the skill focused.');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
assert.equal(pkg.dependencies['@miragon/bpmn-cli'], '0.8.0');
console.log(`Checked ${files.length} source files: syntax, document links, skill metadata and publication hygiene.`);
