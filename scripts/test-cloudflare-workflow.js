import assert from "node:assert/strict";
import { getPlatformProxy } from "wrangler";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import path from "node:path";
import { onboardingProposals } from "../examples/complex-onboarding/proposals.js";
import { hash } from "../src/core/hash.js";
import { CloudProjects } from "../src/cloudflare/projects.js";

// Run against a local Worker started with LOCAL_EMAIL_OUTBOX=1. Its private R2
// binding captures real signed mail links; no fixture email is sent externally.
const origin = process.env.SENDA_TEST_ORIGIN || "http://127.0.0.1:8788";
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(origin).hostname),
  "This fixture must run locally.",
);
const state = process.env.SENDA_TEST_STATE || "/tmp/senda-cf-full";
const proxy = await getPlatformProxy({
  configPath: "wrangler.jsonc",
  persist: { path: path.join(state, "v3") },
});
const checks = [];
const timings = {};
const clients = [];
async function request(url, cookie, body, options = {}) {
  return fetch(url.startsWith("http") ? url : origin + url, {
    method: body ? "POST" : "GET",
    redirect: "manual",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { origin, "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    ...options,
  });
}
async function value(response) {
  const r = await response;
  const x = await r.json();
  assert.ok(r.ok, JSON.stringify(x));
  return x;
}
async function mail(email) {
  const object = await proxy.env.SNAPSHOTS.get(`test-outbox/${hash(email)}.json`);
  assert.ok(object, "Account email captured by local test transport");
  return object.json();
}
async function actor(label) {
  const email = `senda-${label}-${Date.now()}@example.test`;
  await value(
    request("/api/auth/sign-in/magic-link", null, {
      email,
      name: label,
      callbackURL: origin + "/app",
      errorCallbackURL: origin + "/sign-in",
    }),
  );
  const message = await mail(email),
    confirm = new URL(message.text.match(/http[^\s]+/)[0]);
  assert.equal(confirm.pathname, "/sign-in/confirm");
  const scanned = await request(confirm.href);
  assert.ok(scanned.ok); // Opening the email link must not consume it.
  const redeem = origin + "/api/auth/magic-link/verify" + confirm.search;
  const login = await request(redeem);
  assert.equal(login.status, 302);
  assert.match(login.headers.getSetCookie().join(";"), /HttpOnly/);
  if (label === "owner") {
    const reused = await request(redeem);
    assert.match(reused.headers.get("location"), /error=INVALID_TOKEN/);
  }
  return {
    email,
    cookie: login.headers
      .getSetCookie()
      .map((x) => x.split(";")[0])
      .join("; "),
  };
}

try {
  const capabilities = await value(request("/api/config"));
  assert.equal(capabilities.loginMethods.magicLink, true);
  assert.equal(capabilities.loginMethods.password, false);
  const oauthMetadata = await value(request("/api/auth/.well-known/oauth-authorization-server"));
  assert.equal(oauthMetadata.client_id_metadata_document_supported, true);
  const alice = await actor("owner"),
    bob = await actor("other-owner");
  checks.push("passwordless verified sign-in, scanner-safe confirmation and single-use links");
  const { proposals, texts } = await onboardingProposals();
  assert.deepEqual(await value(request("/api/projects", alice.cookie)), []);
  const registration = await value(
    request("/api/auth/oauth2/register", null, {
      client_name: "Synthetic Cloudflare SDK",
      redirect_uris: ["http://127.0.0.1:48883/callback"],
      application_type: "native",
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "openid offline_access projects:read projects:write",
    }),
  );
  const verifier = randomBytes(32).toString("base64url"),
    query = new URLSearchParams({
      response_type: "code",
      client_id: registration.client_id,
      redirect_uri: "http://127.0.0.1:48883/callback",
      scope: "openid offline_access projects:read projects:write",
      state: "fixture",
      prompt: "consent",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      resource: origin + "/mcp",
    });
  const authorize = await request("/api/auth/oauth2/authorize?" + query);
  let target = authorize.headers.get("location");
  if (!target) {
    const x = await authorize.json();
    target = x.url || x.redirect_uri;
  }
  assert.ok(target);
  assert.equal(new URL(target, origin).pathname, "/sign-in");
  const signed = new URL(target, origin).search.slice(1);
  await value(
    request("/api/auth/sign-in/magic-link", null, {
      email: alice.email,
      callbackURL: `${origin}/consent?${signed}`,
      errorCallbackURL: origin + "/sign-in",
    }),
  );
  const loginLink = new URL((await mail(alice.email)).text.match(/http[^\s]+/)[0]);
  const resumed = await request(origin + "/api/auth/magic-link/verify" + loginLink.search);
  assert.equal(resumed.status, 302);
  assert.equal(new URL(resumed.headers.get("location"), origin).pathname, "/consent");
  alice.cookie = resumed.headers
    .getSetCookie()
    .map((x) => x.split(";")[0])
    .join("; ");
  assert.deepEqual(await value(request("/api/projects", alice.cookie)), []);
  checks.push("signed agent authorization resumes through a passwordless email link");
  const accepted = await value(
    request("/api/consent", alice.cookie, {
      query: signed,
      accept: true,
      createProjects: true,
    }),
  );
  const code = new URL(accepted.url || accepted.redirect_uri).searchParams.get("code");
  assert.ok(code);
  const token = await value(
    fetch(origin + "/api/auth/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: "http://127.0.0.1:48883/callback",
        client_id: registration.client_id,
        resource: origin + "/mcp",
      }),
    }),
  );
  const client = new Client({
    name: "senda-cloudflare-fixture",
    version: "1.0.0",
  });
  clients.push(client);
  // The Worker supplies local public keys to the upstream verifier. A usable
  // signed token must work, while changing its claims or signature must fail.
  const tokenParts = token.access_token.split(".");
  const alteredClaims = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(tokenParts[1], "base64url")), sub: "another-user" }),
  ).toString("base64url");
  for (const invalid of [
    `${tokenParts[0]}.${alteredClaims}.${tokenParts[2]}`,
    `${tokenParts[0]}.${tokenParts[1]}.${tokenParts[2][0] === "A" ? "B" : "A"}${tokenParts[2].slice(1)}`,
  ]) {
    const denied = await fetch(origin + "/mcp", {
      method: "POST",
      headers: { authorization: "Bearer " + invalid, "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(denied.status, 401);
  }
  checks.push("local public-key verification rejects altered claims and signatures");
  await client.connect(
    new StreamableHTTPClientTransport(new URL(origin + "/mcp"), {
      authProvider: { token: async () => token.access_token },
    }),
  );
  async function tool(name, args = {}) {
    const r = await client.callTool({ name, arguments: args });
    const x = JSON.parse(r.content.find((c) => c.type === "text").text);
    assert.ok(!r.isError, JSON.stringify(x));
    return x;
  }
  assert.deepEqual(await tool("list_projects"), []);
  const p = await tool("create_project", {
    name: "Synthetic Cloudflare onboarding",
    purpose: "Exercise As-is and future planning on Workers",
    perspective: "Brightline Studio",
    source: {
      id: "Source_Transcript",
      title: "Synthetic process interview",
      kind: "transcript",
      text: texts.Source_Transcript,
    },
  });
  assert.equal((await tool("read_sources", { projectId: p.id, model: "as-is" }))[0].text, texts.Source_Transcript);
  assert.ok((await value(request("/api/projects", alice.cookie))).some(x => x.id === p.id));
  const hidden = await value(request("/api/projects", alice.cookie, {
    name: "Unshared process", purpose: "Keep private", perspective: "Other team",
  }));
  assert.deepEqual((await tool("list_projects")).map(x => x.id), [p.id]);
  const deniedRead = await client.callTool({ name: "read_project", arguments: { projectId: hidden.id, model: "as-is" } });
  assert.equal(deniedRead.isError, true);
  assert.equal(JSON.parse(deniedRead.content[0].text).code, "NOT_FOUND");
  for (const action of ["read", "sources", "models", "head", "review", "bpmn"])
    assert.equal((await request(`/api/projects/${p.id}/${action}`, bob.cookie)).status, 404);
  checks.push("empty account connects before its first project; agent-created sources persist and unshared projects stay private");
  const method = await tool("get_discovery_method");
  for (const name of ["SKILL.md", "references/methodology.md", "references/remote.md", "references/planning.md"])
    assert.equal(method[name], await readFile(new URL(`../skills/process-scribe/${name}`, import.meta.url), "utf8"));
  assert.deepEqual((await value(request("/api/skill"))).references, method);
  const download = await request("/api/skill.zip");
  assert.equal(download.status, 200);
  const files = unzipSync(new Uint8Array(await download.arrayBuffer()));
  assert.deepEqual(Object.keys(files).sort(), Object.keys(method).map(name => `process-scribe/${name}`).sort());
  for (const [name, text] of Object.entries(method))
    assert.equal(strFromU8(files[`process-scribe/${name}`]), text);
  checks.push("the packaged discovery skill matches source through MCP, HTTP and ZIP download");

  for (const [index, proposal] of proposals.entries()) {
    await tool("apply_revision", { projectId: p.id, model: "as-is", proposal });
    const x = await tool("read_project", { projectId: p.id, model: "as-is" });
    assert.equal(x.revision, index + 2);
    assert.equal(
      x.discovery.questions.filter((q) => q.status !== "answered").length,
      [7, 5, 4, 0][index],
    );
  }
  checks.push("OAuth PKCE, project consent and four model revisions through real MCP SDK");
  const original = await tool("read_project", {
    projectId: p.id,
    model: "as-is",
  });
  const started = performance.now();
  const firstReviewResponse = await request(`/api/projects/${p.id}/review`, alice.cookie);
  const review = await value(firstReviewResponse);
  timings.firstReviewMs = Math.round(performance.now() - started);
  assert.equal(firstReviewResponse.headers.get("x-senda-review-cache"), "miss");
  const warmStarted = performance.now();
  const cachedReviewResponse = await request(`/api/projects/${p.id}/review`, alice.cookie);
  assert.equal(cachedReviewResponse.headers.get("x-senda-review-cache"), "hit");
  assert.deepEqual(await value(cachedReviewResponse), review);
  timings.cachedReviewMs = Math.round(performance.now() - warmStarted);
  assert.equal((await request(`/api/projects/${p.id}/review`, bob.cookie)).status, 404);
  const ownerId = (await value(request("/api/session", alice.cookie))).user.id;
  const metadataOnly = new CloudProjects(proxy.env.DB, { get: async () => { throw new Error("Metadata must not fetch transcript blobs"); } });
  assert.equal((await metadataOnly.models({ userId: ownerId }, p.id)).asIs.revision, 5);
  checks.push("persistent private review cache, authorization on cache hits and metadata without transcript reads");
  assert.equal(review.views.length, 6);
  assert.equal(review.views[0].layoutCounts.crossings, 1);
  assert.equal(
    await (await request(`/api/projects/${p.id}/bpmn`, alice.cookie)).text(),
    review.exportXml,
  );
  await tool("create_to_be_model", {
    projectId: p.id,
    baselineRevision: 5,
    brief:
      "Synthetic plan: Finance checks deposit invoices before sending them. Keep other onboarding steps unchanged for now.",
  });
  await tool("apply_revision", {
    projectId: p.id,
    model: "to-be",
    proposal: {
      expectedRevision: 1,
      summary: "Plan a Finance invoice check",
      operations: [
        {
          op: "set",
          id: "Invoice",
          values: { name: "Check and send deposit invoice" },
        },
      ],
      questions: [
        {
          id: "Q_Checker",
          question: "Who checks the planned invoice?",
          why: "The approving role needs a design decision.",
          elementIds: ["Invoice"],
        },
      ],
    },
  });
  await value(
    request(`/api/projects/${p.id}/answers?model=to-be`, alice.cookie, {
      expectedRevision: 2,
      questionId: "Q_Checker",
      text: "The Finance lead checks each invoice.",
    }),
  );
  const future = await tool("read_project", {
    projectId: p.id,
    model: "to-be",
  });
  const answer = future.discovery.sources.find((s) => s.kind === "answer");
  await tool("apply_revision", {
    projectId: p.id,
    model: "to-be",
    proposal: {
      expectedRevision: 3,
      summary: "Assign the planned check to the Finance lead",
      questions: [
        {
          id: "Q_Checker",
          question: "Who checks the planned invoice?",
          why: "The approving role needs a design decision.",
          elementIds: ["Invoice"],
          status: "answered",
          answerSourceId: answer.id,
        },
      ],
      claims: [
        {
          id: "C_Planned_Check",
          statement: answer.text,
          kind: "responsibility",
          state: "proposed",
          status: "supported",
          elementIds: ["Invoice"],
          evidence: [
            {
              sourceId: answer.id,
              segmentId: answer.segments[0].id,
              quote: answer.text,
              basis: "prescribed",
            },
          ],
        },
      ],
    },
  });
  assert.deepEqual(await tool("read_project", { projectId: p.id, model: "as-is" }), original);
  const futureReview = await value(
    request(`/api/projects/${p.id}/review?model=to-be`, alice.cookie),
  );
  assert.equal(futureReview.history.length, 4);
  assert.equal(
    (await value(request(`/api/projects/${p.id}/read?model=to-be&revision=1`, alice.cookie)))
      .revision,
    1,
  );
  const file = await tool("export_bpmn", { projectId: p.id, model: "to-be" });
  assert.equal(file.xml, futureReview.exportXml);
  assert.equal(file.filename, "to-be-revision-4.bpmn");
  checks.push("independent To-be edits, saved clarification, history and portable geometry");
  const racing = await Promise.all(
    ["A", "B"].map((id) =>
      request(`/api/projects/${p.id}?model=to-be`, alice.cookie, {
        expectedRevision: 4,
        summary: `Concurrent ${id}`,
        sources: [{ id: `Race_${id}`, title: id, kind: "answer", text: id }],
      }),
    ),
  );
  assert.deepEqual(racing.map((r) => r.status).sort(), [200, 409]);
  const current = await value(request(`/api/projects/${p.id}/read?model=to-be`, alice.cookie));
  assert.equal(current.revision, 5);
  assert.equal(current.discovery.sources.filter((s) => s.id.startsWith("Race_")).length, 1);
  assert.equal(
    (
      await request(`/api/browser-tools?project=${p.id}&model=to-be`, alice.cookie, {
        name: "apply_revision",
        arguments: {
          model: "as-is",
          proposal: { expectedRevision: 5, summary: "Wrong model" },
        },
      })
    ).status,
    403,
  );
  const many = await request(`/api/projects/${p.id}`, alice.cookie, {
    expectedRevision: 5,
    summary: "Oversized",
    sources: [
      {
        id: "TooLarge",
        title: "Too large",
        kind: "document",
        text: "x".repeat(650000),
      },
    ],
  });
  assert.equal(many.status, 413);
  await tool("add_source", { projectId: p.id, model: "as-is", expectedRevision: 5,
    source: { id: "Cache_Notes", title: "Additional notes", kind: "document", text: "Additional notes saved after the earlier review." } });
  const historicalResponse = await request(`/api/projects/${p.id}/review?revision=5`, alice.cookie);
  assert.equal(historicalResponse.headers.get("x-senda-review-cache"), "hit");
  const historical = await value(historicalResponse);
  assert.equal(historical.revision, 5);
  assert.equal(historical.exportXml, review.exportXml);
  assert.equal(historical.history.length, 6);
  assert.ok(!historical.discovery.sources.some(s => s.id === "Cache_Notes"));
  const newerResponse = await request(`/api/projects/${p.id}/review`, alice.cookie);
  assert.equal(newerResponse.headers.get("x-senda-review-cache"), "miss");
  assert.ok((await value(newerResponse)).discovery.sources.some(s => s.id === "Cache_Notes"));
  checks.push("cached historical diagrams retain their saved evidence and show fresh revision history");
  checks.push("D1 conditional writes, source atomicity, active-model binding and body limits");
  const revoke = await fetch(origin + "/api/connections", {
    method: "DELETE",
    headers: {
      cookie: alice.cookie,
      origin,
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.ok(revoke.ok);
  const denied = await fetch(origin + "/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer " + token.access_token,
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(denied.status, 401);
  checks.push("immediate remote-token revocation");
  const again = await actor("returning");
  assert.equal((await request("/api/session", again.cookie)).status, 200);
  const disabled = await request("/api/auth/sign-in/email", null, {
    email: alice.email,
    password: "unused-old-password",
  });
  assert.ok(!disabled.ok);
  checks.push("password sign-in is disabled and new magic links remain available");
  await writeFile(
    path.join(state, "workflow-result.json"),
    JSON.stringify({ projectId: p.id, checks, timings, passed: checks.length }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, checks, timings }, null, 2));
} finally {
  for (const c of clients) await c.close().catch(() => {});
  await proxy.dispose();
}
