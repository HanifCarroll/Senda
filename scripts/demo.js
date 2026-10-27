import { readFile, mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project, exportBundle } from '../src/index.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await mkdir(path.join(root, 'output'), { recursive: true });
const directory = await mkdtemp(path.join(root, 'output', 'demo-'));
const readExample = name => readFile(path.join(root, 'examples', name), 'utf8');
let project = await Project.create(path.join(directory, 'project'), {
  name: 'Freelance project booking', purpose: 'Document how an accepted proposal becomes a confirmed booking.', perspective: 'Freelancer',
  sources: [{ id: 'Source_Transcript', title: 'Synthetic discovery interview', kind: 'transcript', contributor: 'Synthetic freelancer', origin: 'Demonstration transcript', text: await readExample('transcript.txt') }],
});
try {
  await project.apply(JSON.parse(await readExample('01-discover.json')));
  const before = await exportBundle(project, path.join(directory, 'before-clarification'));
  const answer = JSON.parse(await readExample('02-answer-and-model.json'));
  const reviewContext = JSON.parse(await readExample('03-review-context.json'));
  await project.apply({ ...answer, context: { ...answer.context, ...reviewContext.context }, stakeholders: reviewContext.stakeholders, scenarios: reviewContext.scenarios, walkthrough: reviewContext.walkthrough });
  project.close();
  project = new Project(path.join(directory, 'project'));
  const after = await exportBundle(project, path.join(directory, 'after-clarification'));
  console.log(JSON.stringify({ project: path.join(directory, 'project'), before: path.join(before.directory, 'review.html'), after: path.join(after.directory, 'review.html'), status: project.read().status, note: 'The synthetic answer supplies the missing order. Human reviews remain pending.' }, null, 2));
} finally { project.close(); }
