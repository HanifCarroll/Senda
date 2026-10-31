import { mkdir, symlink, realpath, lstat, readlink, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// Links skills/senda into Claude Code and Codex. Pass --agent claude or --agent codex to install for one.
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, 'skills', 'senda');
const agents = {
  claude: path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'skills'),
  codex: path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills'),
};

const flag = process.argv.indexOf('--agent');
const requested = flag === -1 ? 'all' : process.argv[flag + 1];
if (requested !== 'all' && !(requested in agents)) throw new Error('Use --agent claude, --agent codex or --agent all.');
const selected = requested === 'all' ? Object.keys(agents) : [requested];

const installed = {};
for (const agent of selected) {
  const skills = agents[agent];
  const destination = path.join(skills, 'senda');
  await mkdir(skills, { recursive: true });
  // Remove a link left by an earlier install of this checkout under the skill's old name.
  const legacy = path.join(skills, 'process-scribe');
  if (await readlink(legacy).catch(() => null) === path.join(root, 'skills', 'process-scribe')) await unlink(legacy);
  const existing = await lstat(destination).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
  if (!existing) await symlink(source, destination, 'dir');
  else if (await realpath(destination).catch(() => null) !== await realpath(source))
    throw new Error(`A different skill already exists at ${destination}. It has not been changed.`);
  installed[agent] = destination;
}
console.log(JSON.stringify({ installed, source, note: 'Start a new agent session if the skill is not listed yet.' }, null, 2));
