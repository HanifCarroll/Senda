import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import { BpmnModdle } from 'bpmn-moddle';
import { savedModelPath, savedModelSignIn } from '../src/shared/model-links.js';
import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";
import { mkdir } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { getPlatformProxy } from "wrangler";
import { hash } from "../src/core/hash.js";
import { onboardingProposals } from "../examples/complex-onboarding/proposals.js";
const base = process.env.SENDA_TEST_ORIGIN || "http://127.0.0.1:8788",
  email = `browser-${Date.now()}@example.test`;
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "Run the browser fixture locally.",
);
const artifacts =
  process.env.SENDA_BROWSER_ARTIFACTS || path.join(os.tmpdir(), "senda-browser-smoke");
await mkdir(artifacts, { recursive: true });
const proxy = await getPlatformProxy({
    configPath: "wrangler.jsonc",
    persist: { path: path.join(process.env.SENDA_TEST_STATE || "/tmp/senda-cf-full", "v3") },
  }),
  browser = await chromium.launch({
    ...(process.env.SENDA_TEST_BROWSER ? { executablePath: process.env.SENDA_TEST_BROWSER } : {}),
    headless: true,
  });
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    acceptDownloads: true,
  }),
  p = await context.newPage(),
  errors = [];
const credentialRequests = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("request", (r) => {
  if (new URL(r.url()).searchParams.has("password"))
    credentialRequests.push(new URL(r.url()).pathname);
});
async function mail() {
  const o = await proxy.env.SNAPSHOTS.get("test-outbox/" + hash(email) + ".json");
  assert.ok(o);
  return o.json();
}
try {
  const nojs = await browser.newContext({ javaScriptEnabled: false }),
    ssr = await nojs.newPage();
  await ssr.goto(base + "/sign-in");
  assert.equal(await ssr.locator("form").getAttribute("method"), "post");
  assert.ok(await ssr.getByRole("button", { name: "Send sign-in link", exact: true }).isDisabled());
  await nojs.close();
  for (const [width, height] of [[1440, 1000], [1024, 1000], [390, 844], [320, 844]]) {
    await p.setViewportSize({ width, height });
    await p.goto(base + "/");
    await p.getByRole("img", { name: /^Finance subprocess:/ }).waitFor();
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px: homepage has no horizontal overflow`);
    const illustration = await p.evaluate(() => {
      const svg = [...document.querySelectorAll('svg[aria-label^="Finance subprocess:"]')]
        .find(element => element.getBoundingClientRect().width > 0);
      const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      const distance = (a, b) => Math.hypot(Math.max(a.left - b.right, b.left - a.right, 0), Math.max(a.top - b.bottom, b.top - a.bottom, 0)) / scale;
      return [...svg.querySelectorAll("g")]
        .filter(group => group.querySelector(":scope > rect") && group.querySelector("circle"))
        .map(group => {
          const border = group.querySelector(":scope > rect").getBoundingClientRect();
          const badge = group.querySelector("circle").getBoundingClientRect();
          const icon = [...group.querySelectorAll(":scope > g")].find(child => !child.querySelector("circle"))?.getBoundingClientRect();
          return {
            badgeInset: Math.min(badge.left - border.left, border.right - badge.right, badge.top - border.top, border.bottom - badge.bottom) / scale,
            lines: [...group.querySelectorAll(":scope > text")].map(text => {
              const label = text.getBoundingClientRect();
              return {
                text: text.textContent,
                fontSize: Number.parseFloat(getComputedStyle(text).fontSize) * scale,
                borderInset: Math.min(label.left - border.left, border.right - label.right, label.top - border.top, border.bottom - label.bottom) / scale,
                badgeGap: distance(label, badge),
                iconGap: icon ? distance(label, icon) : null,
              };
            }),
          };
        });
    });
    await writeFile(`${artifacts}/homepage-spacing-${width}.json`, JSON.stringify(illustration, null, 2));
    assert.equal(illustration.length, 3);
    for (const activity of illustration) {
      assert.ok(activity.badgeInset >= 6.9, "Step badges have seven model pixels of border clearance");
      for (const line of activity.lines) {
        assert.ok(line.fontSize >= 12, `${width}px: ${line.text} remains readable`);
        assert.ok(line.borderInset >= 10, `${width}px: ${line.text} clears the task border`);
        assert.ok(line.badgeGap >= 8, `${width}px: ${line.text} clears the number badge`);
        assert.ok(line.iconGap === null || line.iconGap >= 8, `${width}px: ${line.text} clears the task icon`);
      }
    }
    const annotationFonts = await p.evaluate(() => {
      const svg = [...document.querySelectorAll('svg[aria-label^="Finance subprocess:"]')].find(element => element.getBoundingClientRect().width > 0);
      const outer = svg.getBoundingClientRect(), view = svg.viewBox.baseVal, scale = outer.width / view.width;
      const segments = [...svg.querySelectorAll("polyline")].flatMap(line => {
        const points = line.getAttribute("points").trim().split(/\s+/).map(pair => pair.split(",").map(Number));
        return points.slice(1).map((point, index) => [points[index], point]);
      });
      return [...svg.querySelectorAll(":scope > text")].map(text => {
        const r = text.getBoundingClientRect();
        const box = { left: (r.left - outer.left) / scale + view.x, right: (r.right - outer.left) / scale + view.x, top: (r.top - outer.top) / scale + view.y, bottom: (r.bottom - outer.top) / scale + view.y };
        const connectionGap = Math.min(...segments.map(([a, b]) => Math.hypot(Math.max(box.left - Math.max(a[0], b[0]), Math.min(a[0], b[0]) - box.right, 0), Math.max(box.top - Math.max(a[1], b[1]), Math.min(a[1], b[1]) - box.bottom, 0))));
        return { text: text.textContent, fontSize: Number.parseFloat(getComputedStyle(text).fontSize) * scale, connectionGap, viewBoxInset: Math.min(box.left - view.x, view.x + view.width - box.right, box.top - view.y, view.y + view.height - box.bottom) };
      });
    });
    await writeFile(`${artifacts}/homepage-annotations-${width}.json`, JSON.stringify(annotationFonts, null, 2));
    for (const label of annotationFonts) {
      assert.ok(label.fontSize >= 12, `${width}px: ${label.text} annotation remains readable`);
      assert.ok(label.connectionGap >= 7.9, `${width}px: ${label.text} clears every connector by eight model pixels`);
      assert.ok(label.viewBoxInset >= 10, `${width}px: ${label.text} is complete inside the illustration`);
    }
  }
  await p.setViewportSize({ width: 1440, height: 1000 });
  console.log("Homepage task labels, icons and number badges have clear spacing on desktop and mobile");
  await p.goto(base + "/sign-in");
  await p.getByLabel("Email", { exact: true }).fill(email);
  await p.getByRole("button", { name: "Send sign-in link", exact: true }).click();
  await p.getByText("Your sign-in link is on its way", { exact: true }).waitFor();
  assert.equal(await p.getByLabel("Password", { exact: true }).count(), 0);
  await p.screenshot({ path: artifacts + "/cf-magic-desktop.png" });
  await p.setViewportSize({ width: 390, height: 844 });
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.screenshot({ path: artifacts + "/cf-magic-mobile.png" });
  const firstLink = (await mail()).text.match(/http[^\s]+/)[0];
  await p.goto(firstLink);
  await p.getByRole("button", { name: "Continue to Senda", exact: true }).waitFor();
  assert.ok(!(await context.request.get(base + "/api/session")).ok());
  await p.getByRole("button", { name: "Continue to Senda", exact: true }).click();
  await p.waitForURL(base + "/app");
  await p.getByRole("button", { name: "Set up your agent", exact: true }).waitFor();
  assert.ok(await p.getByRole("button", { name: "Set up your agent", exact: true }).isVisible());
  await p.getByRole("button", { name: "Set up your agent", exact: true }).click();
  assert.match(await p.getByRole("dialog").innerText(), /Choose New projects/);
  await p.getByRole("button", { name: "Close", exact: true }).click();
  console.log("UI magic link and scanner-safe confirmation passed");
  const post = async (path, data) => {
    const r = await context.request.post(base + path, { headers: { origin: base }, data });
    assert.ok(r.ok(), await r.text());
    return r.json();
  };
  const redirect = base + "/agent-test/callback";
  const registration = await post("/api/auth/oauth2/register", {
    client_name: "Agent-first browser test",
    redirect_uris: [redirect],
    application_type: "native",
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: "openid offline_access projects:read projects:write",
  });
  const verifier = randomBytes(32).toString("base64url");
  const authorization = new URLSearchParams({
    response_type: "code", client_id: registration.client_id,
    redirect_uri: redirect, scope: "openid offline_access projects:read projects:write",
    state: "browser-agent-first", prompt: "consent", resource: base + "/mcp",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  const readAuthorization = new URLSearchParams(authorization);
  readAuthorization.set("scope", "openid offline_access projects:read");
  await p.goto(base + "/api/auth/oauth2/authorize?" + readAuthorization);
  await p.getByRole("button", { name: "Allow connection", exact: true }).waitFor();
  assert.equal(await p.getByRole("combobox").innerText(), "Connect without a project");
  await p.getByRole("button", { name: "Allow connection", exact: true }).click();
  await p.waitForURL(url => url.pathname === "/agent-test/callback");
  await p.goto(base + "/api/auth/oauth2/authorize?" + authorization);
  await p.getByRole("button", { name: "Allow connection", exact: true }).waitFor();
  assert.equal(await p.getByRole("combobox").innerText(), "New projects");
  assert.ok(await p.getByRole("button", { name: "Allow connection", exact: true }).isEnabled());
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.screenshot({ path: artifacts + "/cf-new-project-consent-desktop.png" });
  await p.setViewportSize({ width: 390, height: 844 });
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.screenshot({ path: artifacts + "/cf-new-project-consent-mobile.png" });
  await p.getByRole("button", { name: "Allow connection", exact: true }).click();
  await p.waitForURL(url => url.pathname === "/agent-test/callback");
  assert.ok(new URL(p.url()).searchParams.has("code"));
  await p.goto(base + "/app");
  await p.setViewportSize({ width: 1440, height: 1000 });
  console.log("Empty-account consent allows the agent to create the first project");
  const { proposals, texts } = await onboardingProposals();
  const project = await post("/api/projects", {
    name: "Cloudflare browser walkthrough",
    purpose: "Review both model states on Workers",
    perspective: "Brightline",
    source: {
      id: "Source_Transcript",
      title: "Synthetic interview",
      kind: "transcript",
      text: texts.Source_Transcript,
    },
  });
  for (const proposal of proposals) await post("/api/projects/" + project.id, proposal);
  let reviewRequests = 0;
  p.on('request', request => { if (/\/api\/projects\/[^/]+\/review\?/.test(new URL(request.url()).pathname + new URL(request.url()).search)) reviewRequests++; });
  await p.route("**/api/projects/*/review?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6500));
    await route.continue();
  });
  await p.goto(base + "/app/projects/" + project.id + "?section=diagram");
  await p.locator("#diagram-stage svg").waitFor({ timeout: 60000 });
  assert.equal(await p.getByRole("heading", { name: "Cloudflare browser walkthrough", exact: true }).count(), 1);
  assert.equal(reviewRequests, 1, "A slow initial review must finish without a poll replacing it.");
  await p.unrouteAll({ behavior: "wait" });
  let metadataPolls = 0;
  await p.route(`**/api/projects/${project.id}/models`, async route => {
    if (++metadataPolls === 1) await route.fulfill({ status: 503, json: { message: 'Temporary synthetic interruption' } });
    else await route.continue();
  });
  const paused = p.getByText("Updates paused. Use Refresh to reconnect.", { exact: true });
  await paused.waitFor({ timeout: 15000 });
  await paused.waitFor({ state: 'hidden', timeout: 15000 });
  await p.unroute(`**/api/projects/${project.id}/models`);
  assert.equal(reviewRequests, 1, 'Recovering metadata updates does not reload an unchanged diagram');
  const messages = p.locator(".messages-panel");
  await messages.locator('[data-slot="accordion-trigger"]').click();
  const intakeMessage = p.locator("[data-message-id]").filter({ hasText: "Request missing items" });
  assert.match(await intakeMessage.innerText(), /Open subprocess: Check handover pack/);
  await intakeMessage.click();
  await p.waitForURL(/view=Intake/);
  assert.match(await intakeMessage.innerText(), /Show in this diagram/);
  await intakeMessage.focus();
  await p.keyboard.press("Enter");
  assert.equal(new URL(p.url()).searchParams.get("view"), "Intake");
  assert.ok(new URL(p.url()).searchParams.get("element"));
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  console.log("Message destinations and keyboard navigation passed");
  await p.getByRole("tab", { name: /^To-be/ }).click();
  await p.getByRole("button", { name: "Create To-be model", exact: true }).click();
  await p
    .getByLabel("What should change?", { exact: true })
    .fill("Synthetic plan: Finance should check each deposit invoice before sending it.");
  await p.getByRole("button", { name: "Create planning draft", exact: true }).click();
  await p.getByRole("combobox", { name: "Revision", exact: true }).getByText("Revision 1", { exact: true }).waitFor();
  await p.getByRole("button", { name: "Planning details", exact: true }).click();
  await p.getByRole("button", { name: "View original As-is", exact: true }).waitFor();
  assert.ok(await p.getByRole("button", { name: "View original As-is", exact: true }).isVisible());
  await p.getByRole("button", { name: "View original As-is", exact: true }).click();
  await p.waitForURL(url => url.searchParams.get("model") === "as-is" && url.searchParams.get("revision") === "5");
  await p.getByRole("tab", { name: /^To-be/ }).click();
  await p.getByRole("combobox", { name: "Revision", exact: true }).getByText("Revision 1", { exact: true }).waitFor();
  for (const [w, h] of [
    [1440, 1000],
    [390, 844],
  ]) {
    await p.setViewportSize({ width: w, height: h });
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await p.screenshot({ path: `${artifacts}/cf-project-${w}.png` });
  }
  const requestPage = await context.newPage();
  await requestPage.goto(base + "/example");
  await requestPage.getByRole("button", { name: "Confirm and hold kickoff", exact: true }).press("Enter");
  await requestPage.getByRole("button", { name: "Show evidence", exact: true }).click();
  const evidence = requestPage.getByLabel("Element details", { exact: true });
  assert.ok(await evidence.getByText("Confirm and hold kickoff", { exact: true }).isVisible());
  await requestPage.getByRole("button", { name: "Send handover pack", exact: true }).press("Enter");
  assert.ok(await evidence.getByText("Send handover pack", { exact: true }).isVisible());
  assert.match(await evidence.innerText(), /Client Success reviews it and acknowledges acceptance/);
  assert.equal(await requestPage.getByRole("button", { name: "Request a correction", exact: true }).count(), 0);
  await requestPage.getByRole("button", { name: "Find a step or message", exact: true }).click();
  await requestPage.getByRole("searchbox", { name: "Search", exact: true }).fill("deposit invoice");
  await requestPage.getByRole("dialog").getByRole("button", { name: "Issue deposit invoice Step", exact: true }).click();
  await requestPage.waitForURL(url => url.searchParams.get("view") === "FinanceWork" && url.searchParams.get("element") === "Invoice");
  assert.ok(await evidence.getByText("Issue deposit invoice", { exact: true }).isVisible());
  await requestPage.getByRole("tab", { name: "Clarifications", exact: true }).click();
  assert.equal(await requestPage.getByRole("button", { name: /Copy question|Prepare my answer|Clarify this answer/ }).count(), 0);
  await requestPage.screenshot({ path: artifacts + "/cf-agent-chat-review.png" });
  await requestPage.close();
  console.log("Evidence follows the selected step; review has no prompt-copy handoff");

  // Client recovery checks use a controlled transport; real model persistence is
  // covered by the Worker workflow and separately opted-in provider journey.
  const chatId = "5a1ce263-893b-41d9-9d42-9c8171471085";
  const nextChatId = "d47e95db-b4d5-4c01-936f-5d9759a334e0";
  let replyReady = false, chatPolls = 0;
  await p.route("**/api/agent/config", route => route.fulfill({ json: { available: true } }));
  const savedMessages = [{ role: "user", text: "Please improve our invoice process.\n\n" + "Finance checks the billing details, asks for anything missing and checks the reply again before sending the invoice. ".repeat(18) }];
  await p.route("**/api/agent/chats**", async route => {
    const req = route.request(), url = new URL(req.url());
    const isNext = url.pathname.endsWith(nextChatId);
    if (req.method() === "GET") chatPolls++;
    if (req.method() === "POST" && url.pathname.endsWith("/chats"))
      return route.fulfill({ json: { id: nextChatId } });
    return route.fulfill({ json: {
      id: isNext ? nextChatId : chatId, projectId: project.id,
      model: "to-be", working: !isNext && !replyReady,
      messages: isNext ? [] : [...savedMessages, ...(replyReady ? [{ role: "assistant", text: "Saved the **future diagram**." }] : [])],
    } });
  });
  await p.goto(base + "/app/agent?chat=" + chatId);
  await p.getByRole("status").getByText(/A reply is being prepared/).waitFor();
  assert.ok(await p.getByLabel("Continue the conversation", { exact: true }).isDisabled());
  assert.ok(await p.getByRole("button", { name: "Working…", exact: true }).isDisabled());
  const latestMessageClear = async () => p.waitForFunction(() => {
    const message = document.querySelector('main article:last-of-type')?.getBoundingClientRect();
    const composer = document.querySelector('main form')?.getBoundingClientRect();
    return message && composer && message.bottom > 0 && message.bottom <= composer.top + 1;
  });
  for (const [width, height] of [[1440,1000],[390,844]]) {
    await p.setViewportSize({ width, height });
    await p.reload();
    await p.getByRole("status").getByText(/A reply is being prepared/).waitFor();
    await latestMessageClear();
    await p.screenshot({ path: `${artifacts}/agent-pending-clear-${width}.png` });
    // Let the initial load and its scroll finish before testing unchanged polls.
    await p.waitForResponse(response => response.url().includes('/api/agent/chats/') && response.request().method() === 'GET');
    await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    assert.ok(await p.evaluate(() => window.scrollY <= 1), 'The reader can move to the beginning of the conversation');
    const beforePoll = chatPolls;
    while (chatPolls < beforePoll + 2) await p.waitForResponse(response => response.url().includes('/api/agent/chats/') && response.request().method() === 'GET');
    assert.ok(await p.evaluate(() => window.scrollY <= 1), "Unchanged progress polling must not move a reader away from earlier messages");
  }
  replyReady = true;
  await p.getByText("Saved the", { exact: false }).waitFor();
  await latestMessageClear();
  assert.equal(await p.getByRole("link", { name: "Open diagram", exact: false }).getAttribute("href"), `/app/projects/${project.id}?model=to-be`);
  await p.reload();
  await p.getByText("Saved the", { exact: false }).waitFor();
  await p.getByLabel("Continue the conversation", { exact: true }).fill("A later detail.");
  assert.ok(await p.getByRole("button", { name: "Send message", exact: true }).isEnabled());
  for (const [width, height] of [[1440,1000],[390,844]]) {
    await p.setViewportSize({ width, height });
    await p.reload();
    await p.getByText("Saved the", { exact: false }).waitFor();
    await latestMessageClear();
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await p.screenshot({ path: `${artifacts}/agent-chat-${width}.png` });
  }
  await p.getByRole("button", { name: "New conversation", exact: true }).click();
  await p.getByLabel("Your transcript or process notes", { exact: true }).waitFor();
  assert.equal(await p.getByText("Saved the", { exact: false }).count(), 0);
  assert.equal(await p.getByLabel("Your transcript or process notes", { exact: true }).inputValue(), "");
  await p.goto(base + "/app/agent");
  await p.getByLabel("Your transcript or process notes", { exact: true }).waitFor();
  assert.equal(await p.getByRole("link", { name: "Open diagram", exact: false }).count(), 0);
  await p.unroute("**/api/agent/chats**");
  await p.unroute("**/api/agent/config");
  console.log("Agent UI transport checks: reader scroll preserved during polling, composer clearance, reload, model link, fresh conversation and desktop/mobile passed");
  await p.getByRole("button", { name: "Sign out", exact: true }).click();
  await p.waitForURL(base + "/");
  await p.goto(firstLink);
  await p.getByRole("button", { name: "Continue to Senda", exact: true }).click();
  await p.getByText("Sign-in needs attention", { exact: true }).waitFor();
  assert.ok(!(await context.request.get(base + "/api/session")).ok());
  await p.getByLabel("Email", { exact: true }).fill(email);
  await p.getByRole("button", { name: "Send sign-in link", exact: true }).click();
  await p.getByText("Your sign-in link is on its way", { exact: true }).waitFor();
  await p.goto((await mail()).text.match(/http[^\s]+/)[0]);
  await p.getByRole("button", { name: "Continue to Senda", exact: true }).click();
  await p.waitForURL(base + "/app");
  await p.getByText("Cloudflare browser walkthrough", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(credentialRequests, []);
  // Exercise the Google button and real OAuth start with local test credentials.
  const config = await (await context.request.get(base + "/api/config")).json();
  if (config.loginMethods.google) {
    await p.goto(base + "/sign-in");
    let googleUrl;
    await p.route("https://accounts.google.com/**", (route) => {
      googleUrl = new URL(route.request().url());
      return route.fulfill({ contentType: "text/html", body: "<p>Google OAuth test boundary</p>" });
    });
    await p.getByRole("button", { name: "Sign in with Google", exact: true }).click();
    await p.getByText("Google OAuth test boundary", { exact: true }).waitFor();
    assert.equal(googleUrl.searchParams.get("redirect_uri"), base + "/api/auth/callback/google");
    assert.ok(googleUrl.searchParams.get("state"));
    await p.unrouteAll({ behavior: "wait" });
  }
  // Inspect the browser's saved files, not just the attachment HTTP response.
  await post(`/api/projects/${project.id}?model=to-be`, {
    expectedRevision: 1, summary: 'Finance reviews the future invoice before sending it',
    operations: [{ op: 'set', id: 'Invoice', values: { name: 'Review and issue deposit invoice' } }],
  });
  const downloadedFiles = [];
  async function capture(page, role, name, filename) {
    const pending = page.waitForEvent('download');
    await page.getByRole(role, { name, exact: true }).click();
    const download = await pending;
    assert.equal(await download.failure(), null);
    const file = path.join(artifacts, filename);
    await download.saveAs(file);
    const text = await readFile(file, 'utf8');
    downloadedFiles.push({ file: filename, suggestedFilename: download.suggestedFilename(), bytes: Buffer.byteLength(text) });
    return text;
  }
  async function bpmnFile(xml, invoiceName) {
    const parsed = await new BpmnModdle().fromXML(xml);
    assert.deepEqual(parsed.warnings, []);
    assert.ok(parsed.rootElement.diagrams.length);
    assert.ok(parsed.rootElement.diagrams.flatMap(d => d.plane?.planeElement || []).length);
    assert.equal(parsed.elementsById.Invoice.name, invoiceName);
  }
  for (const [model, revision, invoiceName] of [
    ['as-is', 5, 'Issue deposit invoice'], ['to-be', 1, 'Issue deposit invoice'], ['to-be', 2, 'Review and issue deposit invoice'],
  ]) {
    await p.goto(base + savedModelPath(project.id, model, revision, true));
    await p.getByRole('link', { name: 'Download BPMN', exact: true }).waitFor();
    await p.getByText(`${model === 'as-is' ? 'As-is' : 'To-be'} · Revision ${revision}`, { exact: true }).waitFor();
    assert.equal(await p.getByRole('link', { name: 'Review this saved version', exact: true }).getAttribute('href'), savedModelPath(project.id, model, revision));
    const xml = await capture(p, 'link', 'Download BPMN', `${model}-r${revision}.bpmn`);
    await bpmnFile(xml, invoiceName);
  }
  await p.goto(base + `/app/projects/${project.id}?model=to-be&revision=2&view=FinanceWork`);
  await p.locator('#diagram-stage svg').waitFor({ timeout: 60000 });
  await p.getByRole('button', { name: 'Download this view', exact: true }).click();
  await p.getByRole('button', { name: 'BPMN view', exact: true }).waitFor();
  await bpmnFile(await capture(p, 'button', 'BPMN view', 'finance-view.bpmn'), 'Review and issue deposit invoice');
  await p.getByRole('button', { name: 'Download this view', exact: true }).click();
  const svg = await capture(p, 'button', 'SVG image', 'finance-view.svg');
  assert.match(svg, /<svg\b/);
  assert.equal(await p.evaluate(text => new DOMParser().parseFromString(text, 'image/svg+xml').querySelectorAll('parsererror').length, svg), 0);
  const returningContext = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const returning = await returningContext.newPage();
  let unsolicitedDownloads = 0;
  returning.on('download', () => unsolicitedDownloads++);
  const intended = savedModelPath(project.id, 'to-be', 1, true);
  await returning.goto(base + intended);
  await returning.waitForURL(base + savedModelSignIn(project.id, 'to-be', 1, true));
  await returning.getByLabel('Email', { exact: true }).fill(email);
  await returning.getByRole('button', { name: 'Send sign-in link', exact: true }).click();
  await returning.getByText('Your sign-in link is on its way', { exact: true }).waitFor();
  await returning.goto((await mail()).text.match(/http[^\s]+/)[0]);
  await returning.getByRole('button', { name: 'Continue to Senda', exact: true }).click();
  await returning.waitForURL(base + intended);
  await returning.getByRole('link', { name: 'Download BPMN', exact: true }).waitFor();
  await returning.reload();
  await returning.getByRole('link', { name: 'Download BPMN', exact: true }).waitFor();
  assert.equal(unsolicitedDownloads, 0, 'Sign-in and reload must not silently start or repeat a download');
  assert.ok(await returning.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await returning.screenshot({ path: artifacts + '/download-mobile.png' });
  await bpmnFile(await capture(returning, 'link', 'Download BPMN', 'signed-in-to-be-r1.bpmn'), 'Issue deposit invoice');
  await returning.goto(base + `/app/download/${project.id}?model=to-be&revision=99999`);
  await returning.getByText('Download unavailable', { exact: true }).waitFor();
  assert.equal(await returning.getByRole('link', { name: 'Download BPMN', exact: true }).count(), 0);
  await returningContext.close();
  assert.deepEqual(errors, []);
  await writeFile(artifacts + '/browser-downloads.json', JSON.stringify({ files: downloadedFiles, signedOutDestinationPreserved: true, reloadDoesNotDownload: true, modelAndRevisionSemanticsVerified: true }, null, 2));
  console.log('Actual BPMN/SVG files, independent saved revisions and signed-out mobile download return passed');

  await writeFile(
    artifacts + "/cf-ui.json",
    JSON.stringify(
      {
        magicLink: true,
        scannerSafe: true,
        singleUse: true,
        returningAccount: true,
        signIn: true,
        projectId: project.id,
        toBe: true,
        googleOAuthStart: !!config.loginMethods.google,
        viewports: [1440, 390],
        preHydrationBlocked: true,
        slowLoadCompleted: true,
        credentialQueryRequests: credentialRequests.length,
        errors,
      },
      null,
      2,
    ),
  );
  console.log("UI returning-account login, token reuse rejection and Google OAuth start passed");
  // A plan selection must survive first-time email sign-in without accepting
  // an arbitrary callback URL or starting a purchase before the user chooses it.
  const buyerContext = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    buyer = await buyerContext.newPage(), buyerEmail = `buyer-${Date.now()}@example.test`;
  await buyer.goto(base + "/pricing");
  await buyer.getByRole("link", { name: "Choose Pro", exact: false }).waitFor();
  assert.ok(await buyer.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await buyer.screenshot({ path: artifacts + "/pricing-mobile.png", fullPage: true });
  await buyer.getByRole("link", { name: "Choose Pro", exact: false }).click();
  await buyer.waitForURL(base + "/sign-in?plan=pro");
  await buyer.getByLabel("Email", { exact: true }).fill(buyerEmail);
  await buyer.getByRole("button", { name: "Send sign-in link", exact: true }).click();
  await buyer.getByText("Your sign-in link is on its way", { exact: true }).waitFor();
  const buyerMessage = await (await proxy.env.SNAPSHOTS.get("test-outbox/" + hash(buyerEmail) + ".json")).json();
  await buyer.goto(buyerMessage.text.match(/http[^\s]+/)[0]);
  await buyer.getByRole("button", { name: "Continue to Senda", exact: true }).click();
  await buyer.waitForURL(base + "/app/billing");
  await buyer.getByRole("heading", { name: "Your plan", exact: true }).waitFor();
  await buyer.getByText("Paid plans aren’t available yet.", { exact: false }).waitFor();
  assert.ok(await buyer.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await buyer.route("**/api/billing", route => route.fulfill({ json: {
    available: true, checkoutAvailable: false, managed: true, priceUsd: 29,
    includedUsd: 6, usedUsd: 0, pendingUsd: 0, projectLimit: 3,
    subscription: { status: "past_due", active: false, periodEnd: "2026-12-29T00:00:00Z" },
  } }));
  await buyer.reload();
  await buyer.getByText("Your latest payment hasn’t completed.", { exact: false }).waitFor();
  assert.ok(await buyer.getByRole("button", { name: "Manage subscription", exact: false }).isVisible());
  assert.ok(await buyer.getByRole('button', { name: 'Update payment method', exact: false }).isVisible());
  assert.equal(await buyer.getByRole("button", { name: "Choose Pro", exact: true }).count(), 0);
  assert.ok(await buyer.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await buyer.screenshot({ path: artifacts + "/billing-recovery-mobile.png", fullPage: true });
  let releaseCardUpdate;
  const cardStarted = new Promise(resolve => {
    void buyer.route('**/api/billing/payment-method', async route => {
      assert.deepEqual(route.request().postDataJSON(), {});
      await new Promise(done => { releaseCardUpdate = async () => { await route.fulfill({ json: { url: base + '/app/billing?card-update-test=opened' } }); done(); }; resolve(); });
    });
  });
  await buyer.getByRole('button', { name: 'Update payment method', exact: false }).click();
  await cardStarted;
  await buyer.getByRole('button', { name: 'Opening Stripe…', exact: false }).waitFor();
  assert.ok(await buyer.getByRole('button', { name: 'Manage subscription', exact: false }).isDisabled());
  await releaseCardUpdate();
  await buyer.waitForURL(base + '/app/billing?card-update-test=opened');
  await buyer.goto(base + savedModelPath(project.id, 'to-be', 1, true));
  await buyer.getByText('Download unavailable', { exact: true }).waitFor();
  assert.equal(await buyer.getByRole('link', { name: 'Download BPMN', exact: true }).count(), 0);
  assert.equal(await buyer.getByText('Cloudflare browser walkthrough', { exact: true }).count(), 0);
  await buyer.goto(base + "/usage");
  await buyer.getByRole("heading", { name: "Usage and subscription terms", exact: true }).waitFor();
  assert.ok(await buyer.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await buyer.screenshot({ path: artifacts + "/usage-mobile.png", fullPage: true });
  await buyer.setViewportSize({ width: 1440, height: 1000 });
  await buyer.goto(base + "/pricing");
  await buyer.screenshot({ path: artifacts + "/pricing-desktop.png", fullPage: true });
  await buyerContext.close();
  console.log("Public pricing, mobile terms and plan selection through first-time email sign-in passed");
} catch (e) {
  console.error("Page", new URL(p.url()).pathname, (await p.locator("body").innerText()).slice(0, 1500));
  await p.screenshot({ path: artifacts + "/cf-ui-error.png" });
  throw e;
} finally {
  await browser.close();
  await proxy.dispose();
}
