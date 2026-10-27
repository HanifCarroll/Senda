#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync, existsSync } from 'node:fs';
import path from 'node:path';

const script = realpathSync(fileURLToPath(import.meta.url));
const root = path.resolve(path.dirname(script), '../../..');
const cli = path.join(root, 'bin', 'process-scribe.js');
if (!existsSync(cli)) {
  process.stderr.write('Process Scribe requires its companion repository. Install the skill with npm run install:skill from that checkout.\n');
  process.exitCode = 1;
} else await import(pathToFileURL(cli).href);
