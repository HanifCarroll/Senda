import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { BpmnModdle } from 'bpmn-moddle';
import { onboardingProposals } from '../../examples/complex-onboarding/proposals.js';
import { hash } from '../../src/core/hash.js';
import { savedModelPath } from '../../src/shared/model-links.js';

// Each scene is a replayable journey. Yield at the checkpoints that Atlas can
// capture, and leave the browser on the actual UI between checkpoints.
const shot = (id, proof, options) => ({ id, proof, ...options });
const overlay = { viewportOnly: true };

async function controls({ base, createPage, readMail }) {
  const p = await createPage();
  const b = (name, pg = p) => pg.getByRole('button', { name, exact: typeof name === 'string' });
  const t = (text, pg = p) => pg.getByText(text, { exact: typeof text === 'string' });
  const h = (name, pg = p) => pg.getByRole('heading', { name, exact: typeof name === 'string' });
  const link = (name, pg = p) => pg.getByRole('link', { name, exact: typeof name === 'string' });
  const tab = name => p.getByRole('tab', { name, exact: typeof name === 'string' });
  const combo = name => p.getByRole('combobox', { name, exact: true });
  const opt = name => p.getByRole('option', { name, exact: typeof name === 'string' });
  const field = (name, pg = p) => pg.getByLabel(name, { exact: true });
  const dialog = p.getByRole('dialog');
  const diagram = p.locator('#diagram-stage svg');
  const go = (route, pg = p) => pg.goto(base + route);
  const fit = async () => {
    await diagram.waitFor();
    await b('Fit').click();
    await p.mouse.move(0, 200);
  };
  const context = p.context();
  const post = async (route, data) => {
    const res = await context.request.post(base + route, { headers: { origin: base }, data, maxRedirects: 0 });
    assert.ok(res.ok(), `Local POST returned ${res.status()}`);
    return res.json();
  };
  const get = async route => {
    const res = await context.request.get(base + route, { maxRedirects: 0 });
    assert.ok(res.ok(), `Local GET returned ${res.status()}`);
    return res.json();
  };
  async function sendLink(pg, address) {
    await field('Email', pg).fill(address);
    await b('Send sign-in link', pg).click();
    await t('Your sign-in link is on its way', pg).waitFor();
    const url = new URL((await readMail(hash(address))).match(/http[^\s]+/)[0]);
    assert.equal(url.origin, base);
    return url.href;
  }
  return { p, b, t, h, link, tab, combo, opt, field, dialog, diagram, go, fit, post, get, sendLink };
}

async function download(control, extension) {
  const pending = control.page().waitForEvent('download');
  await control.click();
  const file = await pending;
  assert.equal(await file.failure(), null);
  assert.ok(file.suggestedFilename().endsWith(extension));
  const contents = await readFile(await file.path(), 'utf8');
  if (extension === '.bpmn') {
    const parsed = await new BpmnModdle().fromXML(contents);
    assert.deepEqual(parsed.warnings, []);
    assert.ok(parsed.rootElement.diagrams.length);
    assert.equal(parsed.elementsById.Invoice.name, 'Review and issue deposit invoice');
  } else assert.match(contents, /<svg\b/);
}

async function* marketing(options) {
  const { p, h, go } = await controls(options);
  await go('/');
  const demo = p.locator('[data-capture="evidence"]');
  await demo.scrollIntoViewIfNeeded();
  await demo.getByRole('blockquote').getByText(/My case starts when Sales gives me/).waitFor();
  await p.evaluate(() => window.scrollTo(0, 0));
  yield shot('home', h(/Turn interviews into process diagrams/));
  if (options.phone) await demo.getByRole('button', { name: 'Next step', exact: true }).click();
  else await demo.getByRole('button', { name: 'Coordinate readiness', exact: true }).click();
  yield shot('home-evidence', demo.getByRole('blockquote').getByText(/I tell Finance and Delivery/).first());
}

async function* publicPages(options) {
  const { t, h, go, fit, diagram } = await controls(options);
  await go('/example');
  await fit();
  yield shot('example', diagram);
  await go('/local');
  yield shot('local-empty', t('No local exports are available'));
  await go('/reset-password');
  yield shot('password-legacy', t('No password needed'));
  await go('/privacy');
  yield shot('privacy', h(/Privacy/i).first());
}

async function* projects(options) {
  const { p, b, t, h, link, tab, combo, opt, field, dialog, diagram, go, fit, post, get, sendLink } = await controls(options);
  const { base, createPage, phone } = options;
  const email = `reviewer-${randomUUID()}@example.test`;
  const name = 'Brightline client onboarding';
  async function reviewSection(name) {
    if (phone) {
      await combo('Review section').click();
      await opt(name).click();
    } else await tab(name).click();
  }
  await go('/sign-in');
  yield shot('sign-in', b('Sign in with Google'));
  const authLink = await sendLink(p, email);
  yield shot('sign-in-sent', t('Your sign-in link is on its way'));
  await p.goto(authLink);
  yield shot('sign-in-confirm', b('Continue to Senda'));
  await b('Continue to Senda').click();
  await p.waitForURL(base + '/app');
  yield shot('projects-empty', b('Set up your agent'));
  await b('Set up your agent').click();
  yield shot('connect-claude', tab('Claude'), overlay);
  await tab('ChatGPT').click();
  yield shot('connect-chatgpt', t(/On ChatGPT web, open/), overlay);
  await p.keyboard.press('Escape');

  const redirect = base + '/atlas-capture/callback';
  const client = await post('/api/auth/oauth2/register', { client_name: 'Example workspace connector', redirect_uris: [redirect], application_type: 'native', token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], scope: 'openid offline_access projects:read projects:write' });
  const authorize = new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: redirect, scope: 'openid offline_access projects:read projects:write', prompt: 'consent', resource: `${base}/mcp`, state: 'atlas-capture', code_challenge: createHash('sha256').update(randomBytes(32).toString('base64url')).digest('base64url'), code_challenge_method: 'S256' });
  await go(`/api/auth/oauth2/authorize?${authorize}`);
  yield shot('agent-consent', b('Allow connection'));
  assert.equal(await p.getByRole('combobox').innerText(), 'New projects');
  await b('Allow connection').click();
  await p.waitForURL(url => url.pathname === '/atlas-capture/callback');
  assert.ok(new URL(p.url()).searchParams.has('code'));
  await go('/app');

  const { proposals, texts } = await onboardingProposals();
  await b('New project').click();
  yield shot('project-new', h('New project'), overlay);
  assert.ok(await b('Create project').isDisabled());
  await p.locator('#initial-file').setInputFiles({ name: 'unreadable.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a Word file') });
  yield shot('project-import-error', t(/This Word file could not be read/), overlay);
  await p.locator('#initial-file').setInputFiles({ name: 'brightline-onboarding.txt', mimeType: 'text/plain', buffer: Buffer.from(texts.Source_Transcript) });
  await p.waitForFunction(text => {
    const input = document.getElementById('transcript');
    return input instanceof HTMLTextAreaElement && input.value === text;
  }, texts.Source_Transcript);
  await t('Optional details').click();
  await field('Process name').fill(name);
  await field('What do you want to understand?').fill('How a signed order becomes a ready-to-start project');
  await field('Whose process is this?').fill('Brightline Studio');
  yield shot('project-new-filled', b('Create project'), { ...overlay, scroll: t('Optional details') });
  await b('Create project').click();
  await p.waitForURL(url => /^\/app\/projects\/[^/]+$/.test(url.pathname));
  const project = { id: new URL(p.url()).pathname.split('/').at(-1) };
  const projectRoute = `/app/projects/${project.id}`;
  yield shot('project-awaiting-draft', t('1 saved source. The diagram will appear here when your agent saves a revision.'));
  const [source] = await get(`/api/projects/${project.id}/sources`);
  assert.equal(source.text, texts.Source_Transcript);
  async function apply(proposal) {
    const models = await get(`/api/projects/${project.id}/models`);
    await post(`/api/projects/${project.id}`, { ...JSON.parse(JSON.stringify(proposal).replaceAll('Source_Transcript', source.id)), expectedRevision: models.asIs.revision });
  }
  await apply(proposals[0]);
  await b('Refresh project').click();
  await fit();
  yield shot('as-is-draft', diagram);
  await reviewSection('Clarifications (7)');
  yield shot('questions-open', t('7 questions to clarify'));
  await b('Answer question').first().click();
  await field('Your answer').fill('Finance and Delivery start independently when the pack is complete. Workspace setup waits for both financial clearance and plan approval.');
  yield shot('question-answer', h('Clarify the process'), overlay);
  const answerResponse = p.waitForResponse(res => new URL(res.url()).pathname.endsWith('/answers'));
  await b('Save answer').click();
  const answered = await answerResponse;
  const failure = await answered.json();
  assert.equal(failure.code, 'INVALID_REQUEST');
  assert.ok(failure.details.some(detail => detail.path.join('.') === 'source.contributor'));
  yield shot('question-answer-error', dialog.getByRole('alert'), overlay);
  await post('/api/auth/update-user', { name: 'Brightline Reviewer' });
  await b('Save answer').click();
  yield shot('question-answer-saved', t('Answer saved for your agent'));
  for (const proposal of proposals.slice(1)) await apply(proposal);
  const loading = Promise.withResolvers();
  await p.route('**/api/projects/*/review?**', async route => {
    await loading.promise;
    await route.continue().catch(() => {}); // A selective capture can close the page here.
  }, { times: 1 });
  try {
    await go(`${projectRoute}?section=questions`);
    yield shot('project-loading', t('Preparing the diagram…'));
  } finally {
    loading.resolve(undefined);
  }
  yield shot('questions-answered', t(/^Answer history \(/));
  await reviewSection('Diagram');
  await fit();
  yield shot('as-is', diagram);
  await reviewSection('Walkthrough');
  yield shot('walkthrough', t('Read through the process'));
  await reviewSection('Review checks');
  yield shot('review-checks', t('Automated checks'));
  await reviewSection('Sources');
  yield shot('sources', t('Transcript and clarification sources'));
  await reviewSection('Diagram');
  await b('Find a step or message').click();
  await field('Search').fill('not a step in this diagram');
  yield shot('diagram-search-empty', t('No matching steps or messages.'), overlay);
  await field('Search').fill('deposit invoice');
  yield shot('diagram-search', b('Issue deposit invoice Step'), overlay);
  await b('Issue deposit invoice Step').click();
  await p.waitForURL(url => url.searchParams.get('view') === 'FinanceWork' && url.searchParams.get('element') === 'Invoice');
  yield shot('as-is-subprocess', diagram.getByRole('button', { name: 'Issue deposit invoice', exact: true }));
  const evidence = field('Element details');
  if (phone) await p.getByRole('toolbar', { name: 'Diagram controls' }).getByRole('button', { name: 'View evidence', exact: true }).click();
  else if (!(await evidence.isVisible())) await b('Show evidence').click();
  yield shot('step-evidence', evidence.locator('blockquote').first(), { viewportOnly: phone });
  await evidence.locator('blockquote button').first().click();
  yield shot('source-passage', h('Original source passage'), overlay);
  await b('Return to diagram').click();
  await b('Project actions').click();
  yield shot('project-actions', h('Project details'), overlay);
  await b('Add transcript').click();
  await field('Source title').fill('Follow-up interview with Finance');
  await field('Transcript text').fill('Luis: For this example, the coordinator records clearance before work moves to workspace setup.');
  yield shot('transcript-add', h('Add another transcript'), overlay);
  await b('Save transcript').click();
  yield shot('transcript-saved', t('Transcript saved. Your agent can read it from this project.'));
  await combo('Revision').click();
  yield shot('revision-picker', opt(/^Revision 2/), overlay);
  await opt(/^Revision 2/).click();
  await combo('Revision').getByText('Revision 2', { exact: true }).waitFor();
  await fit();
  yield shot('as-is-history', t('Viewing As-is revision 2'));
  await b('Return to latest').click();
  await tab(/^To-be/).click();
  yield shot('to-be-empty', h('Plan the future process'));
  await b('Create To-be model').click();
  await field('What should change?').fill('Finance should review each deposit invoice before sending it. Keep the rest of the clearance process as it is.');
  yield shot('to-be-create', h('Create a To-be model'), overlay);
  await b('Create planning draft').click();
  await combo('Revision').getByText('Revision 1', { exact: true }).waitFor();
  await fit();
  yield shot('to-be-draft', combo('Revision').getByText('Revision 1', { exact: true }));
  await b('Planning details').click();
  yield shot('to-be-planning', b('View original As-is'), overlay);
  const baseline = (await get(`/api/projects/${project.id}/models`)).toBe.baseline.revision;
  await b('View original As-is').click();
  await combo('Revision').getByText(`Revision ${baseline}`, { exact: true }).waitFor();
  await fit();
  yield shot('to-be-baseline', t(`Viewing As-is revision ${baseline}`));
  await post(`${projectRoute.replace('/app', '/api')}?model=to-be`, { expectedRevision: 1, summary: 'Finance reviews the future invoice before sending it', operations: [{ op: 'set', id: 'Invoice', values: { name: 'Review and issue deposit invoice' } }] });
  await go(`${projectRoute}?model=to-be&view=FinanceWork`);
  yield shot('to-be-revised', diagram.getByRole('button', { name: 'Review and issue deposit invoice', exact: true }));
  await b('Download this view').click();
  yield shot('export-view', b('SVG image'), { ...overlay, verify: async () => {
    await download(b('SVG image'), '.svg');
    await b('Download this view').click();
    await download(b('BPMN view'), '.bpmn');
  } });
  await p.keyboard.press('Escape');

  const intended = savedModelPath(project.id, 'to-be', 2, true);
  const returning = await createPage();
  await go(intended, returning);
  yield shot('download-sign-in', b('Sign in with Google', returning));
  let downloads = 0;
  returning.on('download', () => downloads++);
  await returning.goto(await sendLink(returning, email));
  await b('Continue to Senda', returning).click();
  await returning.waitForURL(base + intended);
  yield shot('export-saved', t('To-be · Revision 2', returning), { verify: async () => {
    assert.equal(downloads, 0);
    await download(link('Download BPMN', returning), '.bpmn');
  } });
  await go(savedModelPath(project.id, 'to-be', 99999, true), returning);
  yield shot('export-unavailable', t('Download unavailable', returning));
  await returning.context().close();

  await b('Project actions').click();
  await b('Delete project').click();
  yield shot('project-delete', h('Delete project?'), overlay);
  await dialog.getByRole('button', { name: 'Delete project', exact: true }).click();
  await p.waitForURL(url => url.searchParams.get('deleted') === project.id);
  yield shot('projects-deleted', h('Recently deleted'));
  await b('Restore').click();
  yield shot('projects-restored', link(name));
  assert.ok(await t(/Restored\./).isVisible());
  await b('Sign out').click();
  await p.waitForURL(base + '/');
  await p.goto(authLink);
  await b('Continue to Senda').click();
  yield shot('sign-in-error', t('Sign-in needs attention'));
  await p.route('**/api/billing/config', route => route.fulfill({ json: { available: true } }));
  await p.goto(await sendLink(p, email));
  await b('Continue to Senda').click();
  await p.waitForURL(base + '/app');
  await link(name).waitFor();
  yield shot('projects', link('Billing'));

  await go('/app/agent');
  yield shot('agent-unavailable', t('The built-in agent isn’t available for your account yet'));
  const chatId = '5a1ce263-893b-41d9-9d42-9c8171471085'; // Synthetic chat, not a provider ID.
  // UI fixtures for chat; do not call an AI provider.
  await p.route('**/api/agent/config*', route => route.fulfill({ json: { available: true } }));
  await p.route('**/api/agent/chats**', route => route.fulfill({ json: {
    id: chatId, projectId: project.id, model: 'to-be', working: false,
    messages: [{ role: 'user', text: 'Finance should review each deposit invoice before sending it.' }, { role: 'assistant', text: 'I saved **To-be revision 2**. The Finance subprocess now has a “Review and issue deposit invoice” activity. Your As-is model is unchanged.' }],
  } }));
  await go('/app/agent');
  yield shot('agent-start', field('Your transcript or process notes'));
  await go(`/app/agent?chat=${chatId}`);
  yield shot('agent-conversation', t(/The Finance subprocess now has/));

}

async function* billing(options) {
  const { p, b, t, h, link, field, go, sendLink } = await controls(options);
  const { base } = options;
  await go('/pricing');
  yield shot('pricing', link(/Choose Pro/));
  await link(/Choose Pro/).click();
  await p.waitForURL(base + '/sign-in?plan=pro');
  yield shot('sign-in-pro', b('Sign in with Google'));
  await p.goto(await sendLink(p, `buyer-${randomUUID()}@example.test`));
  await b('Continue to Senda').click();
  await p.waitForURL(base + '/app/billing');
  yield shot('billing-unavailable', t(/Paid plans aren’t available yet/));
  // UI fixtures for payment states; Stripe is never contacted.
  const periodEnd = '2026-12-29T00:00:00Z';
  const plan = { available: true, checkoutAvailable: true, managed: false, priceUsd: 29, includedUsd: 6, usedUsd: 0, pendingUsd: 0, projectLimit: 3 };
  await p.route('**/api/billing/config', route => route.fulfill({ json: { available: true } }));
  await p.route('**/api/billing', route => route.fulfill({ json: plan }));
  await p.reload();
  yield shot('billing-free', b('Choose Pro'));
  await p.route('**/api/billing/checkout', route => route.fulfill({ status: 503, json: { message: 'Checkout couldn’t start. Please try again.' } }));
  await b('Choose Pro').click();
  yield shot('billing-error', t('Billing needs attention'));
  await p.unroute('**/api/billing/checkout');
  await p.route('**/api/billing/checkout', route => route.fulfill({ json: { url: `${base}/app/billing?checkout=complete` } }));
  await b('Choose Pro').click();
  await p.waitForURL(base + '/app/billing?checkout=complete');
  yield shot('billing-pending', t(/Your plan appears here after Stripe confirms payment/));
  Object.assign(plan, { checkoutAvailable: false, managed: true, usedUsd: 2, projectLimit: 100, subscription: { status: 'active', active: true, periodEnd } });
  await go('/app/billing');
  yield shot('billing-pro', field('AI allowance used'));
  Object.assign(plan, { projectLimit: 3, subscription: { status: 'past_due', active: false, periodEnd } });
  await p.reload();
  yield shot('billing-past-due', t(/Your latest payment hasn’t completed/));
  await link('Usage and subscription terms').click();
  yield shot('usage', h('Usage and subscription terms'));
}

export const scenes = [marketing, publicPages, projects, billing];

// The Node test and the selective runner use the same literal checkpoint IDs.
// Keep the IDs on the yields, not in a second list that could drift.
export function sceneIds(scene) {
  return [...scene.toString().matchAll(/\byield shot\(([^,\n]+),/g)].map(([, literal]) => {
    assert.match(literal, /^'[a-z][a-z0-9]*(?:-[a-z0-9]+)*'$/);
    return literal.slice(1, -1);
  });
}
