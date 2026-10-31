import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
// Child tools receive only runtime settings, never provider/database credentials.
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'SYSTEMROOT', 'CI'].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { env, stdio: 'inherit' });
  const stop = () => child.kill('SIGTERM');
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    code === 0 ? resolve() : reject(new Error(`${command} failed (${signal ?? code})`));
  });
});
const mode = process.argv[2];
const extra = process.argv.slice(3);
mkdirSync('tmp/fuzz/corpus', { recursive: true });
mkdirSync('tmp/fuzz/artifacts', { recursive: true });
if (mode === 'jazzer') {
  // Node instruments the original ESM source through Jazzer.js.
  await run('node', ['node_modules/@jazzer.js/core/dist/cli.js', 'test/fuzz/target.js',
    'tmp/fuzz/corpus', 'test/fuzz/corpus', '--sync', '--',
    '-runs=10000', '-seed=20261031', '-max_len=4096', '-timeout=5',
    '-artifact_prefix=tmp/fuzz/artifacts/', ...extra]);
  mkdirSync('tmp/fuzz/model-corpus', { recursive: true });
  await run('node', ['node_modules/@jazzer.js/core/dist/cli.js', 'test/fuzz/model-target.js',
    'tmp/fuzz/model-corpus', 'test/fuzz/model-corpus', '--',
    '-runs=1000', '-seed=20261031', '-max_len=4096', '-timeout=5',
    '-artifact_prefix=tmp/fuzz/artifacts/', ...extra]);
} else if (mode === 'api') {
  if (extra.length) throw new Error('API fuzzing accepts no remote URL or extra arguments. Edit the local fixture and schema to extend coverage.');
  await run('node', ['test/fuzz/api.js']);
} else {
  throw new Error('Use jazzer or api.');
}
