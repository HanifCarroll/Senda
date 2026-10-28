import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";
import { mkdir } from "node:fs/promises";
import { getPlatformProxy } from "wrangler";
import { hash } from "../src/hash.js";
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
  console.log("UI magic link and scanner-safe confirmation passed");
  const post = async (path, data) => {
    const r = await context.request.post(base + path, { headers: { origin: base }, data });
    assert.ok(r.ok(), await r.text());
    return r.json();
  };
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
  await p.route("**/api/projects/*/review?**", async (route) => {
    reviewRequests++;
    await new Promise((resolve) => setTimeout(resolve, 6500));
    await route.continue();
  });
  await p.goto(base + "/app/projects/" + project.id + "?section=diagram");
  await p.locator("#diagram-stage svg").waitFor({ timeout: 60000 });
  assert.equal(reviewRequests, 1, "A slow initial review must finish without a poll replacing it.");
  await p.unrouteAll({ behavior: "wait" });
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
  await p
    .locator(".app-header")
    .getByText(/Revision 1 ·/)
    .waitFor();
  assert.ok(await p.getByRole("button", { name: "View original As-is", exact: true }).isVisible());
  for (const [w, h] of [
    [1440, 1000],
    [390, 844],
  ]) {
    await p.setViewportSize({ width: w, height: h });
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await p.screenshot({ path: `${artifacts}/cf-project-${w}.png` });
  }
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
    await p.getByRole("button", { name: "Continue with Google", exact: true }).click();
    await p.getByText("Google OAuth test boundary", { exact: true }).waitFor();
    assert.equal(googleUrl.searchParams.get("redirect_uri"), base + "/api/auth/callback/google");
    assert.ok(googleUrl.searchParams.get("state"));
    await p.unrouteAll({ behavior: "wait" });
  }
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
} catch (e) {
  console.error("Page", p.url(), (await p.locator("body").innerText()).slice(0, 1500));
  await p.screenshot({ path: artifacts + "/cf-ui-error.png" });
  throw e;
} finally {
  await browser.close();
  await proxy.dispose();
}
