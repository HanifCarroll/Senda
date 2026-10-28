import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createApplication } from "../src/server/application.js";
import { createNodeHandler } from "../src/server/node-adapter.js";
import { onboardingProposals } from "../examples/complex-onboarding/proposals.js";

test(
  "hosted projects, OAuth PKCE, scoped MCP edits, revocation and durable revisions",
  { timeout: 120000 },
  async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), "scribe-hosted-test-"));
    let application;
    const server = createServer((req, res) =>
      createNodeHandler(application, origin)(req, res),
    );
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    application = await createApplication({
      origin,
      directory,
      secret: "test-only-auth-secret-with-more-than-thirty-two-characters",
    });
    const clients = [];
    const request = (pathname, cookie, body, method) =>
      fetch(origin + pathname, {
        method: method || (body ? "POST" : "GET"),
        redirect: "manual",
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body ? { origin, "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    async function signup(email) {
      const response = await request("/api/auth/sign-up/email", null, {
        email,
        password: "integration-password-12345",
        name: email.split("@")[0],
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.getSetCookie().join(";"), /HttpOnly/i);
      return response.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    }
    const content = async (response) => {
      const data = await response.json();
      assert.ok(response.ok, JSON.stringify(data));
      return data;
    };
    try {
      await t.test(
        "discovery, sign-in boundary and two-user isolation",
        async () => {
          const wrongHost = await new Promise((resolve, reject) => {
            const req = httpRequest(
              origin + "/api/projects",
              { headers: { host: "untrusted.example" } },
              (response) => {
                response.resume();
                resolve(response.statusCode);
              },
            );
            req.on("error", reject);
            req.end();
          });
          assert.equal(wrongHost, 403);
          const metadata = await content(
            await request("/.well-known/oauth-protected-resource"),
          );
          assert.equal(metadata.resource, `${origin}/mcp`);
          const oauth = await content(
            await request("/.well-known/oauth-authorization-server/api/auth"),
          );
          assert.equal(oauth.issuer, `${origin}/api/auth`);
          assert.equal(oauth.client_id_metadata_document_supported, true);
          assert.equal((await request("/api/projects")).status, 401);
          assert.equal(
            (
              await fetch(`${origin}/mcp`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: "{}",
              })
            ).status,
            401,
          );
        },
      );
      const alice = await signup("alice@example.test"),
        bob = await signup("bob@example.test");
      const { proposals, texts } = await onboardingProposals();
      const project = await content(
        await request("/api/projects", alice, {
          name: "Synthetic onboarding",
          purpose: "Review current onboarding with clarifications",
          perspective: "Brightline Studio",
          source: {
            id: "Source_Transcript",
            title: "Synthetic process interview",
            kind: "transcript",
            text: texts.Source_Transcript,
          },
        }),
      );
      const other = await content(
        await request("/api/projects", alice, {
          name: "Another private process",
          purpose: "Test consent boundaries",
          perspective: "Owner",
        }),
      );
      await t.test(
        "sources, revisions and exports require the project owner",
        async () => {
          assert.deepEqual(
            await content(await request("/api/projects", bob)),
            [],
          );
          for (const action of [
            "read",
            "review",
            "sources",
            "questions",
            "checks",
            "bpmn",
            "head",
          ])
            assert.equal(
              (await request(`/api/projects/${project.id}/${action}`, bob))
                .status,
              404,
              action,
            );
          assert.equal(
            (
              await request(`/api/projects/${project.id}`, bob, {
                expectedRevision: 1,
                summary: "Attempted update",
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await fetch(`${origin}/api/projects`, {
                method: "POST",
                headers: {
                  cookie: alice,
                  origin: "https://untrusted.example",
                  "content-type": "application/json",
                },
                body: "{}",
              })
            ).status,
            403,
          );
        },
      );
      const redirect = "http://127.0.0.1:48882/callback";
      const registration = await content(
        await request("/api/auth/oauth2/register", null, {
          client_name: "Synthetic SDK client",
          redirect_uris: [redirect],
          application_type: "native",
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          scope: "openid profile offline_access projects:read projects:write",
        }),
      );
      async function connect(
        scopes = "openid profile offline_access projects:read projects:write",
      ) {
        const verifier = randomBytes(32).toString("base64url");
        const query = new URLSearchParams({
          response_type: "code",
          client_id: registration.client_id,
          redirect_uri: redirect,
          scope: scopes,
          state: "integration-state",
          prompt: "consent",
          code_challenge: createHash("sha256")
            .update(verifier)
            .digest("base64url"),
          code_challenge_method: "S256",
          resource: `${origin}/mcp`,
        });
        const authorize = await request(
          `/api/auth/oauth2/authorize?${query}`,
          alice,
        );
        let next = authorize.headers.get("location");
        if (!next) {
          const data = await authorize.json();
          next = data.url || data.redirect_uri;
        }
        assert.ok(next, "authorization leads to the consent page");
        const signed = new URL(next, origin).search.slice(1);
        const consent = await content(
          await request(
            `/api/consent?query=${encodeURIComponent(signed)}`,
            alice,
          ),
        );
        assert.equal(consent.client, registration.client_id);
        const tampered = new URLSearchParams(signed);
        tampered.set("client_id", "changed-client");
        assert.equal(
          (
            await request(
              `/api/consent?query=${encodeURIComponent(tampered.toString())}`,
              alice,
            )
          ).status,
          400,
        );
        const accepted = await content(
          await request("/api/consent", alice, {
            query: signed,
            projectId: project.id,
            accept: true,
          }),
        );
        const callback = new URL(accepted.redirect_uri || accepted.url);
        assert.equal(callback.searchParams.get("state"), "integration-state");
        const tokenResponse = await fetch(`${origin}/api/auth/oauth2/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code: callback.searchParams.get("code"),
            code_verifier: verifier,
            redirect_uri: redirect,
            client_id: registration.client_id,
            resource: `${origin}/mcp`,
          }),
        });
        const token = await content(tokenResponse);
        assert.ok(token.access_token && token.refresh_token);
        const client = new Client(
          { name: "hosted-integration", version: "1.0.0" },
          { versionNegotiation: { mode: { pin: "2026-07-28" } } },
        );
        await client.connect(
          new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
            authProvider: { token: async () => token.access_token },
          }),
        );
        clients.push(client);
        return { token, client };
      }
      const { client, token } = await connect();
      await t.test(
        "2025 stateless compatibility uses the same token and project boundary",
        async () => {
          const legacy = new Client({
            name: "legacy-profile-check",
            version: "1.0.0",
          });
          clients.push(legacy);
          await legacy.connect(
            new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
              authProvider: { token: async () => token.access_token },
            }),
          );
          const result = await legacy.callTool({
            name: "list_projects",
            arguments: {},
          });
          assert.deepEqual(
            JSON.parse(result.content[0].text).map((p) => p.id),
            [project.id],
          );
        },
      );
      async function call(name, arguments_ = {}, connection = client) {
        if (
          arguments_.projectId &&
          !["list_models", "create_to_be_model"].includes(name)
        )
          arguments_ = { model: "as-is", ...arguments_ };
        const result = await connection.callTool({
          name,
          arguments: arguments_,
        });
        return {
          ...result,
          value: JSON.parse(result.content.find((c) => c.type === "text").text),
        };
      }
      await t.test(
        "the real SDK sees only consented projects and cannot approve a model",
        async () => {
          assert.deepEqual(
            (await call("list_projects")).value.map((p) => p.id),
            [project.id],
          );
          assert.equal(
            (await call("read_project", { projectId: other.id })).isError,
            true,
          );
          const tools = await client.listTools();
          assert.ok(
            !tools.tools.some((t) =>
              /approve|finalize|review_scenario/.test(t.name),
            ),
          );
          assert.ok(
            (await call("get_discovery_method")).value["references/remote.md"],
          );
        },
      );
      await t.test(
        "a draft and three realistic clarification rounds persist through MCP",
        async () => {
          for (const [index, proposal] of proposals.entries()) {
            const result = await call("apply_revision", {
              projectId: project.id,
              proposal,
            });
            assert.ok(!result.isError, JSON.stringify(result.value));
            const state = (
              await call("read_project", { projectId: project.id })
            ).value;
            assert.equal(state.revision, index + 2);
            assert.equal(
              state.discovery.questions.filter((q) => q.status !== "answered")
                .length,
              [7, 5, 4, 0][index],
            );
            assert.deepEqual(state.reviews, {});
            assert.deepEqual(state.scenarioReviews, {});
          }
          const review = await content(
            await request(`/api/projects/${project.id}/review`, alice),
          );
          const exported = (
            await call("export_bpmn", { projectId: project.id })
          ).value;
          assert.equal(review.exportXml, exported.xml);
          assert.equal(
            await (
              await request(`/api/projects/${project.id}/bpmn`, alice)
            ).text(),
            exported.xml,
          );
          assert.equal(review.views[0].layoutCounts.crossings, 1);
          assert.equal(review.history.length, 5);
        },
      );
      await t.test(
        "oversized requests and operation batches are rejected before saving",
        async () => {
          const large = await fetch(`${origin}/api/projects`, {
            method: "POST",
            headers: {
              cookie: alice,
              origin,
              "content-type": "application/json",
            },
            body: "x".repeat(650000),
          });
          assert.equal(large.status, 413);
          assert.equal((await large.json()).code, "LIMIT");
          const batch = await request(`/api/projects/${project.id}`, alice, {
            expectedRevision: 5,
            summary: "Oversized operation batch",
            operations: Array.from({ length: 501 }, () => ({
              op: "set",
              id: "Invoice",
              values: { name: "Do not save" },
            })),
          });
          assert.equal(batch.status, 413);
          assert.equal(
            (
              await content(
                await request(`/api/projects/${project.id}/head`, alice),
              )
            ).revision,
            5,
          );
        },
      );
      await t.test(
        "stale and invalid writes leave model and evidence unchanged",
        async () => {
          const stale = await call("apply_revision", {
            projectId: project.id,
            proposal: { expectedRevision: 1, summary: "Stale change" },
          });
          assert.equal(stale.value.code, "STALE_REVISION");
          const bad = await call("apply_revision", {
            projectId: project.id,
            proposal: {
              expectedRevision: 5,
              summary: "Invalid quotation",
              sources: [
                {
                  id: "NotSaved",
                  title: "Unused source",
                  kind: "answer",
                  text: "Valid words.",
                },
              ],
              claims: [
                {
                  id: "BadEvidence",
                  statement: "Unsupported statement",
                  kind: "order",
                  status: "supported",
                  state: "current",
                  elementIds: [],
                  evidence: [
                    {
                      sourceId: "Source_Transcript",
                      segmentId: "line-1",
                      quote: "A fabricated quotation.",
                    },
                  ],
                },
              ],
            },
          });
          assert.equal(bad.value.code, "INVALID_EVIDENCE");
          const current = (
            await call("read_project", { projectId: project.id })
          ).value;
          assert.equal(current.revision, 5);
          assert.ok(
            !current.discovery.sources.some((s) => s.id === "NotSaved"),
          );
          const racing = await Promise.all(
            ["A", "B"].map((id) =>
              request(`/api/projects/${other.id}`, alice, {
                expectedRevision: 1,
                summary: `Concurrent ${id}`,
                sources: [
                  { id: `Source_${id}`, title: id, text: id, kind: "answer" },
                ],
              }),
            ),
          );
          assert.deepEqual(racing.map((r) => r.status).sort(), [200, 409]);
        },
      );
      await t.test(
        "To-be planning has its own MCP revisions, questions, evidence and exports",
        async () => {
          const before = (await call("read_project", { projectId: project.id }))
            .value;
          const tools = await client.listTools();
          assert.ok(
            tools.tools
              .find((t) => t.name === "apply_revision")
              .inputSchema.required.includes("model"),
          );
          const brief =
            "In the planned process, Finance checks each deposit invoice before sending it. Keep other steps unchanged for now.";
          const created = await call("create_to_be_model", {
            projectId: project.id,
            baselineRevision: 5,
            brief,
          });
          assert.ok(!created.isError, JSON.stringify(created.value));
          assert.equal(created.value.revision, 1);
          const args = { projectId: project.id, model: "to-be" };
          const first = (await call("read_project", args)).value;
          assert.equal(first.mode, "proposed");
          assert.deepEqual(first.discovery.claims, []);
          assert.deepEqual(first.reviews, {});
          assert.deepEqual(first.scenarioReviews, {});
          assert.equal(first.discovery.walkthrough, undefined);
          const source = first.discovery.sources[0];
          const claim = {
            id: "Planned_Invoice",
            statement: brief,
            state: "proposed",
            status: "supported",
            kind: "activity",
            elementIds: ["Invoice"],
            evidence: [
              {
                sourceId: source.id,
                segmentId: source.segments[0].id,
                quote: brief,
                basis: "prescribed",
              },
            ],
          };
          const revised = await call("apply_revision", {
            ...args,
            proposal: {
              expectedRevision: 1,
              summary:
                "Plan a Finance check before issuing the deposit invoice",
              operations: [
                {
                  op: "set",
                  id: "Invoice",
                  values: { name: "Check and issue deposit invoice" },
                },
              ],
              claims: [claim],
              questions: [
                {
                  id: "Q_Checker",
                  question: "Who checks the planned invoice?",
                  why: "The future responsibility needs confirmation.",
                  elementIds: ["Invoice"],
                },
              ],
            },
          });
          assert.ok(!revised.isError, JSON.stringify(revised.value));
          const answer = await content(
            await request(
              `/api/projects/${project.id}/answers?model=to-be`,
              alice,
              {
                expectedRevision: 2,
                questionId: "Q_Checker",
                text: "The Finance lead checks and sends each deposit invoice.",
              },
            ),
          );
          assert.equal(answer.revision, 3);
          assert.equal(
            (await call("read_questions", args)).value.questions[0].status,
            "open",
          );
          const sources = (await call("read_sources", args)).value;
          const answerSource = sources.find((s) => s.kind === "answer");
          const resolved = await call("apply_revision", {
            ...args,
            proposal: {
              expectedRevision: 3,
              summary: "Assign the planned invoice check to the Finance lead",
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
                  why: "The future responsibility needs confirmation.",
                  status: "answered",
                  answerSourceId: answerSource.id,
                  elementIds: ["Invoice"],
                },
              ],
              claims: [
                {
                  ...claim,
                  statement: answerSource.text,
                  evidence: [
                    {
                      sourceId: answerSource.id,
                      segmentId: answerSource.segments[0].id,
                      quote: answerSource.text,
                      basis: "prescribed",
                    },
                  ],
                },
              ],
            },
          });
          assert.ok(!resolved.isError, JSON.stringify(resolved.value));
          assert.equal(resolved.value.revision, 4);
          const review = await content(
            await request(
              `/api/projects/${project.id}/review?model=to-be`,
              alice,
            ),
          );
          assert.equal(review.modelKind, "to-be");
          assert.equal(review.history.length, 4);
          assert.equal(
            review.changes.summary,
            "Assign the planned invoice check to the Finance lead",
          );
          assert.equal(
            review.elements.find((e) => e.id === "Invoice").label,
            "Check and send deposit invoice",
          );
          assert.equal(
            (
              await call("read_project", { ...args, revision: 1 })
            ).value.model.find((e) => e.id === "Invoice").name,
            before.model.find((e) => e.id === "Invoice").name,
          );
          assert.deepEqual(
            (await call("read_project", { projectId: project.id })).value,
            before,
          );
          const modelList = (
            await call("list_models", { projectId: project.id })
          ).value;
          assert.equal(modelList.asIs.revision, 5);
          assert.equal(modelList.toBe.baseline.revision, 5);
          const exported = (await call("export_bpmn", args)).value;
          assert.equal(exported.filename, "to-be-revision-4.bpmn");
          assert.equal(exported.xml, review.exportXml);
          assert.equal(
            await (
              await request(
                `/api/projects/${project.id}/bpmn?model=to-be`,
                alice,
              )
            ).text(),
            exported.xml,
          );
          assert.equal(
            (
              await request(`/api/projects/${project.id}/models`, bob, {
                baselineRevision: 5,
                brief,
              })
            ).status,
            404,
          );
          for (const action of [
            "models",
            "read",
            "review",
            "sources",
            "questions",
            "checks",
            "bpmn",
            "head",
          ])
            assert.equal(
              (
                await request(
                  `/api/projects/${project.id}/${action}?model=to-be`,
                  bob,
                )
              ).status,
              404,
            );
          const duplicate = await call("create_to_be_model", {
            projectId: project.id,
            baselineRevision: 5,
            brief,
          });
          assert.equal(duplicate.value.code, "MODEL_EXISTS");
          const stale = await call("apply_revision", {
            ...args,
            proposal: {
              expectedRevision: 1,
              summary: "Old future plan",
              operations: [
                { op: "set", id: "Invoice", values: { name: "Must not save" } },
              ],
            },
          });
          assert.equal(stale.value.code, "STALE_REVISION");
          const mixed = await call("apply_revision", {
            ...args,
            proposal: {
              expectedRevision: 4,
              summary: "Must not mix current claims into a future diagram",
              claims: [{ ...claim, state: "current" }],
            },
          });
          assert.equal(mixed.value.code, "MIXED_PROCESS_STATE");
          assert.equal((await call("read_project", args)).value.revision, 4);
        },
      );
      await t.test(
        "browser tools use the same owner checks and force the active project",
        async () => {
          assert.equal(
            (await request(`/api/browser-tools?project=${project.id}`, bob))
              .status,
            404,
          );
          assert.equal(
            (
              await request(`/api/browser-tools?project=${project.id}`, alice, {
                name: "read_project",
                arguments: { projectId: other.id },
              })
            ).status,
            403,
          );
          const result = await content(
            await request(`/api/browser-tools?project=${project.id}`, alice, {
              name: "read_project",
              arguments: {},
            }),
          );
          assert.equal(result.name, "Synthetic onboarding");
          const definitions = await content(
            await request(`/api/browser-tools?project=${project.id}`, alice),
          );
          assert.ok(definitions.some((t) => t.name === "apply_revision"));
          assert.ok(!definitions.some((t) => t.name === "create_project"));
          const endpoint = `/api/browser-tools?project=${project.id}&model=to-be`;
          assert.equal(
            (
              await request(endpoint, alice, {
                name: "apply_revision",
                arguments: {
                  model: "as-is",
                  proposal: {
                    expectedRevision: 5,
                    summary: "Wrong active model",
                  },
                },
              })
            ).status,
            403,
          );
          const future = await content(
            await request(endpoint, alice, {
              name: "read_project",
              arguments: {},
            }),
          );
          assert.equal(future.mode, "proposed");
          assert.equal(future.revision, 4);
          const futureDefinitions = await content(
            await request(endpoint, alice),
          );
          const apply = futureDefinitions.find(
            (t) => t.name === "apply_revision",
          );
          assert.ok(!("projectId" in apply.inputSchema.properties));
          assert.ok(!("model" in apply.inputSchema.properties));
        },
      );
      await t.test(
        "read-only tokens cannot write and revocation rejects existing and refresh tokens",
        async () => {
          const readOnly = await connect("openid offline_access projects:read");
          const blocked = await fetch(`${origin}/mcp`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${readOnly.token.access_token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "tools/call",
              params: {
                name: "apply_revision",
                arguments: {
                  projectId: project.id,
                  proposal: { expectedRevision: 5, summary: "Blocked write" },
                },
              },
            }),
          });
          assert.equal(blocked.status, 403);
          assert.match(
            blocked.headers.get("www-authenticate"),
            /projects:write/,
          );
          assert.equal(
            (await request("/api/connections", alice, {}, "DELETE")).status,
            200,
          );
          assert.equal(
            (
              await fetch(`${origin}/mcp`, {
                method: "POST",
                headers: {
                  authorization: `Bearer ${token.access_token}`,
                  "content-type": "application/json",
                },
                body: "{}",
              })
            ).status,
            401,
          );
          const refreshed = await fetch(`${origin}/api/auth/oauth2/token`, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "refresh_token",
              refresh_token: token.refresh_token,
              client_id: registration.client_id,
              resource: `${origin}/mcp`,
            }),
          });
          assert.equal(refreshed.status, 400);
          const renewed = await connect();
          assert.equal(
            (
              await call(
                "read_project",
                { projectId: project.id },
                renewed.client,
              )
            ).value.revision,
            5,
          );
          assert.equal(
            (
              await fetch(`${origin}/mcp`, {
                method: "POST",
                headers: {
                  authorization: `Bearer ${token.access_token}`,
                  "content-type": "application/json",
                },
                body: "{}",
              })
            ).status,
            401,
            "reconsent must not resurrect an old access token",
          );
        },
      );
      await t.test(
        "accounts and revisions survive reopening the service",
        async () => {
          application.close();
          application = await createApplication({
            origin,
            directory,
            secret:
              "test-only-auth-secret-with-more-than-thirty-two-characters",
          });
          assert.equal(
            (await content(await request(`/api/projects/${project.id}`, alice)))
              .revision,
            5,
          );
          assert.deepEqual(
            await content(await request("/api/projects", bob)),
            [],
          );
        },
      );
    } finally {
      for (const client of clients) await client.close();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      application.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
