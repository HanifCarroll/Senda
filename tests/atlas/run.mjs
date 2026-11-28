import { execFileSync, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const abort = new AbortController();
const { signal } = abort;
let interrupted;
function interrupt(code) {
  interrupted ??= code;
  abort.abort();
}
process.on('SIGINT', () => interrupt(130));
process.on('SIGTERM', () => interrupt(143));

function start(command, args, options) {
  signal.throwIfAborted();
  const child = spawn(command, args, { detached: true, ...options });
  const done = new Promise(resolve => {
    child.once('close', (code, signal) => resolve(code ?? signal));
    child.once('error', error => resolve('code' in error ? error.code : error.name));
  });
  function kill(name) {
    if (!child.pid) return;
    try { process.kill(-child.pid, name); }
    catch (error) {
      // The ARM64 coding guest disallows process-group signals. Wrangler also
      // forwards SIGTERM when signalled directly.
      if (error.code === 'EPERM') child.kill(name);
      else if (error.code !== 'ESRCH') throw error;
    }
  }
  let stopping;
  function stop() {
    return stopping ??= (async () => {
      kill('SIGTERM');
      await Promise.race([done, delay(2_000, undefined, { ref: false })]);
      kill('SIGKILL'); // The group's workerd can outlive its Wrangler parent.
      await done;
    })();
  }
  return { child, done, stop };
}

async function bounded(promise, label, ms) {
  const timer = new AbortController();
  try {
    return await Promise.race([
      promise,
      delay(ms, undefined, { signal: timer.signal }).then(() => { throw new Error(`${label} timed out`); }),
    ]);
  } finally {
    timer.abort();
  }
}

async function run(label, command, args, options, timeout) {
  const task = start(command, args, { stdio: ['ignore', 2, 2], ...options });
  const cancel = () => { void task.stop(); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const code = await bounded(task.done, label, timeout);
    signal.throwIfAborted();
    if (code !== 0) throw new Error(`${label} exited with ${code}`);
  } finally {
    signal.removeEventListener('abort', cancel);
    await task.stop();
  }
}

async function capture(commit, out, states) {
  // Stage the exact tree named in result.json. Neither Vite nor Wrangler can pick up
  // the caller's .env/.dev.vars, ignored data, or old build in this fresh tree.
  const scratch = await mkdtemp(join(tmpdir(), 'senda-atlas-'));
  const app = join(scratch, 'app');
  const state = join(scratch, 'state');
  const archive = join(scratch, 'senda.tar');
  const cwd = process.cwd();
  // Miniflare otherwise fetches a Request.cf sample even in local mode.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED = 'false';
  process.env.WRANGLER_SEND_METRICS = 'false';
  process.env.WRANGLER_LOG_PATH = join(scratch, 'wrangler-logs');
  const env = {
    PATH: process.env.PATH, HOME: scratch, TMPDIR: scratch,
    XDG_CACHE_HOME: scratch, XDG_CONFIG_HOME: scratch,
    CI: '1', WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_CF_FETCH_ENABLED: 'false',
  };
  const options = { cwd: app, env };
  let worker;
  const cancel = () => { void worker.stop(); };
  try {
    await mkdir(app);
    await run('Git archive', 'git', ['archive', '--output', archive, commit], {}, 30_000);
    await run('Unpack source', 'tar', ['-xf', archive], options, 30_000);
    // A restricted guest can use its preseeded npm packages without writing to
    // the shared cache. Copy package blobs only, not npm config or credentials.
    if (process.env.NPM_CONFIG_CACHE) {
      try { await cp(join(process.env.NPM_CONFIG_CACHE, '_cacache'), join(scratch, '.npm', '_cacache'), { recursive: true }); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await run('npm ci', 'npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], options, 180_000);
    await run('Worker build', 'npm', ['run', 'build:cloudflare'], options, 180_000);
    const wrangler = join(app, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
    await run('Local D1 migrations', process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'senda',
      '--config', 'wrangler.jsonc', '--local', '--persist-to', state], options, 60_000);
    worker = start(process.execPath, [wrangler, 'dev', '--config', 'dist-cloudflare/server/wrangler.json',
      '--local', '--ip', '127.0.0.1', '--port', '0', '--inspector-port', '0',
      '--infer-origin-from-routes=false', '--log-level', 'error', '--persist-to', state,
      '--var', 'LOCAL_EMAIL_OUTBOX:1', '--var', 'GOOGLE_CLIENT_ID:senda-local-test-client',
      '--var', 'GOOGLE_CLIENT_SECRET:senda-local-test-client-secret',
      '--var', 'BETTER_AUTH_SECRET:senda-ci-test-secret-not-used-in-production',
    ], { ...options, stdio: ['ignore', 2, 2, 'ipc'] });
    signal.addEventListener('abort', cancel, { once: true });
    const ready = new Promise(resolve => worker.child.on('message', message => {
      const data = typeof message === 'string' ? JSON.parse(message) : message;
      if (data.event === 'DEV_SERVER_READY' && data.ip === '127.0.0.1' && Number.isInteger(data.port) && data.port > 0)
        resolve(`http://127.0.0.1:${data.port}`);
    }));
    const base = await bounded(Promise.race([ready, worker.done.then(code => {
      throw new Error(`Local Worker exited before startup (${code})`);
    })]), 'Local Worker startup', 60_000);
    const health = await fetch(`${base}/health`, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]) });
    if (!health.ok) throw new Error(`Local Worker health check returned ${health.status}`);
    console.error('Atlas: local Worker is healthy');
    process.chdir(app);
    const { captureStates } = await import(pathToFileURL(join(app, 'tests/atlas/browser.mjs')).href);
    return await captureStates({ app, base, out, scratch, state, states, signal });
  } finally {
    process.chdir(cwd);
    signal.removeEventListener('abort', cancel);
    try { await worker?.stop(); }
    finally { await rm(scratch, { recursive: true, force: true }); }
  }
}

async function main() {
  const { values } = parseArgs({ options: { out: { type: 'string' }, only: { type: 'string' } } });
  if (!values.out || values.only === '') throw new Error('Usage: atlas/capture.sh --out <dir> [--only <id,id,...>]');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const manifest = JSON.parse(execFileSync('git', ['show', `${commit}:atlas/atlas.json`], { encoding: 'utf8' }));
  const known = new Map(manifest.states.map(state => [state.id, state]));
  const ids = values.only ? [...new Set(values.only.split(','))] : [...known.keys()];
  const states = ids.filter(id => known.has(id)).map(id => known.get(id));
  const out = resolve(values.out);
  const outcomes = states.length ? await capture(commit, out, states) : new Map();
  const result = { commit, captured: [], failed: [] };
  for (const id of ids) {
    const reason = known.has(id) ? outcomes.get(id) : 'unknown state';
    if (reason === null) result.captured.push(id);
    else result.failed.push({ id, reason: reason ?? 'capture step did not run' });
  }
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  return result.failed.length ? 2 : 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  if (!interrupted) console.error(`Atlas setup failed: ${error.message.split('\n')[0]}`);
  process.exitCode = 1;
} finally {
  if (interrupted) process.exitCode = interrupted;
}
