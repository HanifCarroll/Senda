#!/usr/bin/env node
import { Command, InvalidArgumentError } from 'commander';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Project, schema, exportBundle, publicError } from '../src/core/index.js';

const integer = value => {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new InvalidArgumentError('Use a positive integer revision.');
  return Number(value);
};
const print = result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const program = new Command().name('process-scribe').description('Create and revise BPMN diagrams with your agent').version(version)
  .option('-p, --project <directory>', 'Directory containing the process project', '.process-scribe');
program.exitOverride();
program.configureOutput({ writeErr: () => {} });
const run = operation => async (...args) => {
  const project = new Project(program.opts().project);
  try { print(await operation(project, ...args)); } finally { project.close(); }
};

program.command('init').description('Create a private local discovery project')
  .requiredOption('--name <name>').requiredOption('--purpose <purpose>').requiredOption('--perspective <perspective>')
  .option('--mode <state>', 'current or proposed', 'current').option('--transcript <file>')
  .action(async opts => {
    const sources = opts.transcript ? [{ id: 'Source_Transcript', title: path.basename(opts.transcript), kind: 'transcript', text: await readFile(opts.transcript, 'utf8') }] : [];
    const p = await Project.create(program.opts().project, { name: opts.name, purpose: opts.purpose, perspective: opts.perspective, mode: opts.mode, sources });
    try { print(await p.inspect()); } finally { p.close(); }
  });
program.command('schema').description('Print proposal and Miragon operation schemas').action(() => print(schema()));
program.command('inspect').description('Read model elements, sources, claims and questions').option('--revision <n>', 'Saved revision', integer).action(run((p, o) => p.inspect(o.revision)));
program.command('history').description('Read revision summaries').action(run(p => p.history()));
program.command('status').description('Show current state and outstanding review work').action(run(async p => {
  const s = p.read(), q = await p.validate();
  return { name: s.name, revision: s.revision, status: s.status, stage: s.discovery.stage, readyToFinalize: q.readyToFinalize, blockers: q.blockers };
}));
program.command('apply').description('Atomically apply a proposal with evidence and BPMN operations')
  .requiredOption('--file <json>').action(run(async (p, o) => p.apply(JSON.parse(await readFile(o.file, 'utf8')))));
program.command('import').description('Import BPMN, preserving existing linked evidence when IDs still exist')
  .requiredOption('--file <bpmn>').requiredOption('--expected-revision <n>', 'Current revision', integer).requiredOption('--summary <text>')
  .action(run(async (p, o) => p.import({ expectedRevision: o.expectedRevision, summary: o.summary, xml: await readFile(o.file, 'utf8') })));
program.command('validate').description('Report separate automated checks and human review requirements').option('--revision <n>', 'Saved revision', integer)
  .action(run(async (p, o) => { const q = await p.validate(o.revision); if (!q.structural.passed || q.behavioral.findings.some(f => f.blocking)) process.exitCode = 2; return q; }));
program.command('diff').description('Compare two saved revisions').requiredOption('--from <n>', 'Earlier revision', integer).option('--to <n>', 'Later revision; defaults to current', integer)
  .action(run((p, o) => p.diff(o.from, o.to)));
program.command('review').description('Record explicit human feedback; the agent must not self-approve')
  .requiredOption('--expected-revision <n>', 'Current revision', integer).requiredOption('--aspect <aspect>', 'semantic, behavioral or pragmatic')
  .requiredOption('--outcome <outcome>', 'approved or needs_changes').requiredOption('--reviewer <name>').requiredOption('--notes <text>')
  .action(run((p, o) => p.review(o)));
program.command('review-scenario').description('Record a human walkthrough of one saved scenario')
  .requiredOption('--expected-revision <n>', 'Current revision', integer).requiredOption('--scenario <id>', 'Scenario to review')
  .requiredOption('--outcome <outcome>', 'confirmed or needs_changes').requiredOption('--reviewer <name>').requiredOption('--notes <text>')
  .action(run((p, { scenario, ...o }) => p.reviewScenario({ ...o, scenarioId: scenario })));
program.command('finalize').description('Mark a fully reviewed snapshot as reviewed; does not prove soundness')
  .requiredOption('--expected-revision <n>', 'Current revision', integer).action(run((p, o) => p.finalize(o.expectedRevision)));
program.command('export').description('Write a new self-contained review bundle containing source evidence').option('--out <directory>')
  .action(run((p, o) => exportBundle(p, o.out)));

try { await program.parseAsync(); }
catch (error) {
  if (['commander.helpDisplayed','commander.help','commander.version'].includes(error.code)) process.exitCode = 0;
  else { process.stderr.write(`${JSON.stringify({ error: publicError(error) })}\n`); process.exitCode = 1; }
}
