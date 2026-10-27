import { mkdir, symlink, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, 'skills', 'process-scribe');
const settingsRoot = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const destination = path.join(settingsRoot, 'skills', 'process-scribe');
await mkdir(path.dirname(destination), { recursive: true });
try {
  await lstat(destination);
  if (await realpath(destination) !== await realpath(source)) throw new Error(`A different skill already exists at ${destination}. It has not been changed.`);
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  await symlink(source, destination, 'dir');
}
console.log(JSON.stringify({ skill: destination, source, note: 'Start a new agent session if the skill is not yet available.' }, null, 2));
