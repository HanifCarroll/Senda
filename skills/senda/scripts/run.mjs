#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const script = realpathSync(fileURLToPath(import.meta.url));
const root = path.resolve(path.dirname(script), '../../..');
const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
const runtime = readJson(path.resolve(path.dirname(script), '../senda-runtime.json'));
const pkg = readJson(path.join(root, 'package.json'));
const cli = runtime?.cli || path.join(root, 'bin', 'senda.js');
const packageSpec = runtime?.package || (pkg?.name && pkg?.version ? `${pkg.name}@${pkg.version}` : null);

async function runPackage() {
  if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+@\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/.test(packageSpec || ''))
    throw new Error('This skill is missing its package version. Install the Senda skill again.');
  const args = ['--yes', '--package', packageSpec, 'senda', ...process.argv.slice(2)];
  let command = 'npx';
  if (process.platform === 'win32') {
    // Launch npm's JavaScript entry point directly so arguments never pass through cmd.exe.
    const npx = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
    if (!existsSync(npx)) throw new Error('npm could not be found. Install Node.js with npm, then try again.');
    command = process.execPath;
    args.unshift(npx);
  }
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false });
    child.once('error', () => reject(new Error('npm could not be started. Install Node.js with npm, then try again.')));
    child.once('exit', (code, signal) => { process.exitCode = signal ? 1 : code ?? 1; resolve(); });
  });
}

try {
  if (existsSync(cli)) {
    try { await import(pathToFileURL(cli).href); }
    catch (error) {
      // A plugin cache may include the checkout without its npm dependencies.
      if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
      await runPackage();
    }
  } else await runPackage();
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
