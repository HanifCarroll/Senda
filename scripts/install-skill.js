import { cp, lstat, mkdir, mkdtemp, readFile, readlink, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, 'skills', 'senda');
const marker = 'senda-runtime.json';
const managedBy = 'senda-install-skill';
const metadata = () => readFile(path.join(root, 'package.json'), 'utf8').then(JSON.parse);
const existing = file => lstat(file).catch(error => { if (error.code === 'ENOENT') return null; throw error; });

async function isManaged(destination, stat, packageName) {
  if (stat.isSymbolicLink()) {
    const target = await realpath(destination).catch(() => null);
    if (target === await realpath(source)) return true;
    if (target && path.basename(target) === 'senda' && path.basename(path.dirname(target)) === 'skills') {
      const pkg = await readFile(path.resolve(target, '../../package.json'), 'utf8').then(JSON.parse).catch(() => null);
      return [packageName, 'senda'].includes(pkg?.name) && pkg?.bin?.senda === 'bin/senda.js';
    }
    return false;
  }
  if (!stat.isDirectory()) return false;
  const runtime = await readFile(path.join(destination, marker), 'utf8').then(JSON.parse).catch(() => null);
  return runtime?.managedBy === managedBy;
}

export async function installSkill({ agent = 'all', env = process.env } = {}) {
  const agents = {
    claude: path.join(env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'skills'),
    codex: path.join(env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills'),
  };
  if (agent !== 'all' && !Object.hasOwn(agents, agent)) throw new Error('Use --agent claude, --agent codex or --agent all.');
  const pkg = await metadata();
  const selected = agent === 'all' ? Object.keys(agents) : [agent];
  const destinations = [];
  for (const name of selected) {
    const directory = path.join(agents[name], 'senda');
    const stat = await existing(directory);
    if (stat && !await isManaged(directory, stat, pkg.name))
      throw new Error(`A different skill already exists at ${directory}. It has not been changed.`);
    destinations.push({ name, directory, stat });
  }
  const installed = {};
  for (const { name, directory, stat } of destinations) {
    const parent = path.dirname(directory);
    await mkdir(parent, { recursive: true });
    const staging = await mkdtemp(path.join(parent, '.senda-install-'));
    const backup = `${directory}.previous-${randomUUID()}`;
    let movedPrevious = false;
    try {
      await cp(source, staging, { recursive: true });
      await writeFile(path.join(staging, marker), `${JSON.stringify({
        managedBy, package: `${pkg.name}@${pkg.version}`, cli: path.join(root, 'bin', 'senda.js'),
      }, null, 2)}\n`, { mode: 0o600 });
      if (stat) { await rename(directory, backup); movedPrevious = true; }
      try { await rename(staging, directory); }
      catch (error) { if (movedPrevious) await rename(backup, directory); throw error; }
      if (movedPrevious) await rm(backup, { recursive: true, force: true });
      const legacy = path.join(parent, 'process-scribe');
      if (await readlink(legacy).catch(() => null) === path.join(root, 'skills', 'process-scribe')) await unlink(legacy);
      installed[name] = directory;
    } finally { await rm(staging, { recursive: true, force: true }); }
  }
  return { installed, source, package: `${pkg.name}@${pkg.version}`, note: 'Start a new agent session if the skill is not listed yet.' };
}

if (process.argv[1] && await realpath(process.argv[1]).catch(() => null) === fileURLToPath(import.meta.url)) {
  const flag = process.argv.indexOf('--agent');
  try {
    const result = await installSkill({ agent: flag === -1 ? 'all' : process.argv[flag + 1] || '' });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
