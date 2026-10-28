import assert from "node:assert/strict";
import { getPlatformProxy } from "wrangler";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createHash, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { onboardingProposals } from "../examples/complex-onboarding/proposals.js";
import { hash } from "../src/hash.js";

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
  const object = await proxy.env.SNAPSHOTS.get(
    `test-outbox/${hash(email)}.json`,
  );
  assert.ok(object, "Account email captured by local test transport");
  return object.json();
}
async function actor(label) {
  const email = `senda-${label}-${Date.now()}@example.test`,
    password = "cloudflare-test-password-123";
  const signup = await value(
    request("/api/auth/sign-up/email", null, {
      name: label,
      email,
      password,
      callbackURL: origin + "/sign-in",
    }),
  );
  assert.equal(signup.token, null);
  if (label === "owner")
    assert.equal(
      (await request("/api/auth/sign-in/email", null, { email, password }))
        .status,
      403,
    );
  const message = await mail(email),
    url = message.text.match(/http[^\s]+/)[0];
  assert.equal(new URL(url).origin, origin);
  assert.equal((await request(url)).status, 302);
  const login = await request("/api/auth/sign-in/email", null, {
    email,
    password,
  });
  assert.ok(login.ok, await login.text());
  assert.match(login.headers.getSetCookie().join(";"), /HttpOnly/);
  return {
    email,
    password,
    cookie: login.headers
      .getSetCookie()
      .map((x) => x.split(";")[0])
      .join("; "),
  };
}
try {
  await value(request("/api/config")); // First public request must finish auth initialization.
  const alice = await actor("owner"),
    bob = await actor("other-owner");
  checks.push("email verification required before sign-in");
  const { proposals, texts } = await onboardingProposals();
  const p = await value(
    request("/api/projects", alice.cookie, {
      name: "Synthetic Cloudflare onboarding",
      purpose: "Exercise As-is and future planning on Workers",
      perspective: "Brightline Studio",
      source: {
        id: "Source_Transcript",
        title: "Synthetic process interview",
        kind: "transcript",
        text: texts.Source_Transcript,
      },
    }),
  );
  for (const action of ["read", "sources", "models", "head", "review", "bpmn"])
    assert.equal(
      (await request(`/api/projects/${p.id}/${action}`, bob.cookie)).status,
      404,
    );
  checks.push("private account/project isolation");
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
  const authorize = await request(
    "/api/auth/oauth2/authorize?" + query,
    alice.cookie,
  );
  let target = authorize.headers.get("location");
  if (!target) {
    const x = await authorize.json();
    target = x.url || x.redirect_uri;
  }
  assert.ok(target);
  const signed = new URL(target, origin).search.slice(1);
  const accepted = await value(
    request("/api/consent", alice.cookie, {
      query: signed,
      accept: true,
      projectId: p.id,
    }),
  );
  const code = new URL(accepted.url || accepted.redirect_uri).searchParams.get(
    "code",
  );
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
  for (const [index, proposal] of proposals.entries()) {
    await tool("apply_revision", { projectId: p.id, model: "as-is", proposal });
    const x = await tool("read_project", { projectId: p.id, model: "as-is" });
    assert.equal(x.revision, index + 2);
    assert.equal(
      x.discovery.questions.filter((q) => q.status !== "answered").length,
      [7, 5, 4, 0][index],
    );
  }
  checks.push(
    "OAuth PKCE, project consent and four model revisions through real MCP SDK",
  );
  const original = await tool("read_project", {
    projectId: p.id,
    model: "as-is",
  });
  const review = await value(
    request(`/api/projects/${p.id}/review`, alice.cookie),
  );
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
  assert.deepEqual(
    await tool("read_project", { projectId: p.id, model: "as-is" }),
    original,
  );
  const futureReview = await value(
    request(`/api/projects/${p.id}/review?model=to-be`, alice.cookie),
  );
  assert.equal(futureReview.history.length, 4);
  assert.equal(
    (
      await value(
        request(
          `/api/projects/${p.id}/read?model=to-be&revision=1`,
          alice.cookie,
        ),
      )
    ).revision,
    1,
  );
  const file = await tool("export_bpmn", { projectId: p.id, model: "to-be" });
  assert.equal(file.xml, futureReview.exportXml);
  assert.equal(file.filename, "to-be-revision-4.bpmn");
  checks.push(
    "independent To-be edits, saved clarification, history and portable geometry",
  );
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
  const current = await value(
    request(`/api/projects/${p.id}/read?model=to-be`, alice.cookie),
  );
  assert.equal(current.revision, 5);
  assert.equal(
    current.discovery.sources.filter((s) => s.id.startsWith("Race_")).length,
    1,
  );
  assert.equal(
    (
      await request(
        `/api/browser-tools?project=${p.id}&model=to-be`,
        alice.cookie,
        {
          name: "apply_revision",
          arguments: {
            model: "as-is",
            proposal: { expectedRevision: 5, summary: "Wrong model" },
          },
        },
      )
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
  checks.push(
    "D1 conditional writes, source atomicity, active-model binding and body limits",
  );
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
  const reset = await request("/api/auth/request-password-reset", null, {
    email: alice.email,
    redirectTo: origin + "/reset-password",
  });
  assert.ok(reset.ok);
  const resetMail = await mail(alice.email);
  assert.equal(resetMail.subject, "Reset your Senda password");
  const resetUrl = resetMail.text.match(/http[^\s]+/)[0];
  const redirect = await request(resetUrl);
  assert.equal(redirect.status, 302);
  const resetToken = new URL(
    redirect.headers.get("location"),
    origin,
  ).searchParams.get("token");
  assert.ok(resetToken);
  const newPassword = "new-cloudflare-test-password-456";
  assert.ok(
    (
      await request("/api/auth/reset-password", null, {
        token: resetToken,
        newPassword,
      })
    ).ok,
  );
  assert.equal((await request("/api/session", alice.cookie)).status, 401);
  assert.equal(
    (
      await request("/api/auth/sign-in/email", null, {
        email: alice.email,
        password: alice.password,
      })
    ).status,
    401,
  );
  const relogin = await request("/api/auth/sign-in/email", null, {
    email: alice.email,
    password: newPassword,
  });
  assert.ok(relogin.ok);
  checks.push("password reset invalidates the token and existing sessions");
  assert.equal(
    (
      await request("/api/auth/reset-password", null, {
        token: resetToken,
        newPassword: "another-test-password-789",
      })
    ).status,
    400,
  );
  await writeFile(
    path.join(state, "workflow-result.json"),
    JSON.stringify({ projectId: p.id, checks, passed: checks.length }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally {
  for (const c of clients) await c.close().catch(() => {});
  await proxy.dispose();
}
