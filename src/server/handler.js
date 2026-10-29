import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireMcpAuth } from "@better-auth/mcp";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { ModelKind } from "./contracts.js";
import { createAgentHandler } from "./tools.js";
import { toolDefinitions } from "./tools.js";
import { publicError, requireThat } from "../core/errors.js";
import { skillBundle } from "#senda/skill";
import { zipSync, strToU8 } from "fflate";
import { createInsufficientScopeError } from "better-auth/oauth2";

const json = (data, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });
const Body = z.record(z.string(), z.unknown());

export async function createRequestHandler({
  origin,
  projects,
  auth,
  hostedAgent,
  billing,
  localJwks = false,
  features = {
    accountEmail: false,
    agentClientDiscovery: "cimd-and-dynamic-registration",
    loginMethods: { magicLink: false, google: false, password: true },
  },
}) {
  const resource = `${origin}/mcp`;
  const mcp = requireMcpAuth(
    auth,
    async (request, claims) => {
      const clientId = claims.client_id || claims.azp,
        userId = claims.sub;
      if (
        typeof userId !== "string" ||
        typeof clientId !== "string" ||
        claims.scribe_epoch !== (await projects.epoch(userId)) ||
        !(await projects.connections(userId)).some((g) => g.client === clientId)
      )
        return json(
          {
            error: "This connection was revoked. Reconnect to continue.",
          },
          401,
        );
      const actor = {
        userId,
        clientId,
        scopes: String(claims.scope || "").split(" "),
      };
      const body = await request
        .clone()
        .json()
        .catch(() => null);
      const called =
        body?.method === "tools/call"
          ? toolDefinitions.find((t) => t.name === body.params?.name)
          : null;
      if (called && !called.read && !actor.scopes.includes("projects:write"))
        throw createInsufficientScopeError(["projects:write"]);
      return createAgentHandler(projects, actor, origin).fetch(request);
    },
    {
      resource,
      requiredScopes: ["projects:read"],
      // Better Auth 1.7.14 forwards this to its core jwksFetch, which accepts
      // a supplier as well as a URL. This Worker's public-origin self-fetch
      // fails live. Read the same public keys through the auth API instead; the
      // provider still verifies signature, issuer, audience, scopes and DPoP.
      // Keep the Worker workflow regression when upgrading Better Auth: the
      // MCP wrapper's declaration currently only advertises a string here.
      ...(localJwks ? { jwksUrl: () => auth.api.getJwks() } : {}),
    },
  );

  async function signedConsent(query, headers) {
    requireThat(
      typeof query === "string" &&
        query.length < 12000 &&
        (await verifyOAuthQueryParams(query, (await auth.$context).secret)),
      "INVALID_REQUEST",
      "This connection request expired or changed. Start again from your agent.",
    );
    const params = new URLSearchParams(query),
      client = params.get("client_id");
    const res = await auth.handler(
      new Request(
        `${origin}/api/auth/oauth2/public-client?client_id=${encodeURIComponent(client || "")}`,
        { headers },
      ),
    );
    requireThat(
      res.ok,
      "INVALID_REQUEST",
      "This agent could not be identified. Start the connection again.",
    );
    return {
      query,
      client,
      clientInfo: await res.json(),
      scopes: (params.get("scope") || "").split(" "),
      claims: params.get("claims"),
    };
  }
  async function handle(request) {
    const url = new URL(request.url),
      pathname = url.pathname;
    if (pathname === "/health") return json({ status: "ok" });
    if (pathname === "/api/config" && request.method === "GET") return json(features);
    if (pathname.startsWith("/.well-known/")) {
      const response = await auth.handler(request);
      if (response.status !== 404) return response;
      return auth.handler(new Request(`${origin}/api/auth${pathname}`, request));
    }
    if (pathname.startsWith("/api/auth/")) return auth.handler(request);
    if (pathname === "/mcp") {
      if (request.method !== "POST")
        return new Response(null, { status: 405, headers: { Allow: "POST" } });
      const sentOrigin = request.headers.get("origin");
      if (sentOrigin && sentOrigin !== origin)
        return json({ error: "This origin is not enabled for agent connections." }, 403);
      return mcp(request);
    }
    if (!pathname.startsWith("/api/")) return null;
    if (pathname === "/api/billing/webhook") {
      if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
      if (!billing) return json({ message: "Billing is not configured." }, 503);
      try { return json(await billing.webhook(request)); }
      catch (error) {
        const invalid = ["BAD_SIGNATURE", "BILLING_CONTEXT_MISMATCH", "INVALID_REQUEST"].includes(error.code);
        console.error("Senda billing notification stopped", { code: error.code, name: error.name });
        return json({ message: invalid ? "This billing notification could not be verified." : "Please retry this billing notification." }, invalid ? 400 : 503);
      }
    }
    if (pathname === "/api/skill" || pathname === "/api/skill.zip") {
      const references = await skillBundle();
      if (pathname.endsWith(".zip"))
        return new Response(
          zipSync(
            Object.fromEntries(
              Object.entries(references).map(([name, text]) => [
                `process-scribe/${name}`,
                strToU8(text),
              ]),
            ),
          ),
          {
            headers: {
              "content-type": "application/zip",
              "content-disposition": 'attachment; filename="process-scribe-skill.zip"',
            },
          },
        );
      return json({
        name: "process-scribe",
        references,
        remoteTools: [
          "list_projects",
          "list_models",
          "create_to_be_model",
          "read_project",
          "read_sources",
          "get_model_schema",
          "apply_revision",
          "review_project",
          "export_bpmn",
        ],
      });
    }
    try {
      if (!["GET", "HEAD"].includes(request.method))
        requireThat(
          request.headers.get("origin") === origin &&
            request.headers.get("content-type")?.startsWith("application/json"),
          "FORBIDDEN",
          "Submit this request from your Senda page.",
        );
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session)
        return json(
          {
            code: "UNAUTHENTICATED",
            message: "Sign in to open your private projects.",
          },
          401,
        );
      const actor = { userId: session.user.id };
      const body = async () => Body.parse(await request.json());
      if (pathname === "/api/billing" || pathname.startsWith("/api/billing/")) {
        if (!billing && ["/api/billing", "/api/billing/config"].includes(pathname) && request.method === "GET") return json({ available: false });
        requireThat(billing, "BILLING_UNAVAILABLE", "Paid plans are not available yet.");
        return await billing.handle(request, actor, session.user.email);
      }
      if (pathname.startsWith("/api/agent/")) {
        requireThat(hostedAgent, "NOT_FOUND", "The Senda agent is not available here.");
        return await hostedAgent.handle(request, actor, session.user.email);
      }
      if (pathname === "/api/session" && request.method === "GET")
        return json({
          user: {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
          },
        });
      if (pathname === "/api/browser-tools") {
        const projectId = z.uuid().parse(url.searchParams.get("project"));
        const model = ModelKind.parse(url.searchParams.get("model") || "as-is");
        await projects.authorize(actor, projectId);
        const available = toolDefinitions.filter(
          (t) => !["list_projects", "create_project"].includes(t.name),
        );
        if (request.method === "GET")
          return json(
            available.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: z.toJSONSchema(
                t.input.omit(
                  Object.fromEntries(
                    ["projectId", "model"]
                      .filter((key) => key in t.input.shape)
                      .map((key) => [key, true]),
                  ),
                ),
                { io: "input" },
              ),
            })),
          );
        if (request.method === "POST") {
          const input = z
            .strictObject({
              name: z.string(),
              arguments: z.record(z.string(), z.unknown()),
            })
            .parse(await body());
          const tool = available.find((t) => t.name === input.name);
          requireThat(tool, "NOT_FOUND", "This browser tool is not available.");
          requireThat(
            input.arguments.projectId === undefined || input.arguments.projectId === projectId,
            "FORBIDDEN",
            "Browser tools are limited to the open project. Read the visible project context before editing.",
          );
          requireThat(
            input.arguments.model === undefined || input.arguments.model === model,
            "FORBIDDEN",
            "Browser tools are limited to the active model. Read the visible project context before editing.",
          );
          const args = tool.input.parse({
            ...input.arguments,
            ...("projectId" in tool.input.shape ? { projectId } : {}),
            ...("model" in tool.input.shape ? { model } : {}),
          });
          return json(await tool.run(projects, actor, args, origin));
        }
      }
      if (pathname === "/api/projects") {
        if (request.method === "GET") return json(await projects.list(actor));
        if (request.method === "POST") return json(await projects.create(actor, await body()), 201);
      }
      if (pathname === "/api/connections") {
        if (request.method === "GET")
          return json({
            url: resource,
            connections: await projects.connections(actor.userId),
          });
        if (request.method === "DELETE") {
          await projects.revokeAll(actor.userId);
          const adapter = (await auth.$context).adapter;
          for (const model of projects.revokesAuthTokens
            ? []
            : ["oauthRefreshToken", "oauthAccessToken", "oauthConsent"])
            await adapter.deleteMany({
              model,
              where: [{ field: "userId", value: actor.userId }],
            });
          return json({ revoked: true });
        }
      }
      if (pathname === "/api/consent") {
        if (request.method === "GET")
          return json({
            ...(await signedConsent(url.searchParams.get("query"), request.headers)),
            projects: await projects.list(actor),
          });
        if (request.method === "POST") {
          const input = z
            .strictObject({
              query: z.string(),
              projectId: z.uuid().optional(),
              createProjects: z.boolean().default(false),
              connectOnly: z.boolean().default(false),
              accept: z.boolean(),
            })
            .parse(await body());
          const consent = await signedConsent(input.query, request.headers);
          if (input.accept) {
            requireThat(
              consent.scopes.includes("projects:read") &&
                (input.projectId || input.connectOnly ||
                  (input.createProjects && consent.scopes.includes("projects:write"))),
              "INVALID_REQUEST",
              "Choose a project, or allow new projects with read and write access.",
            );
            requireThat(
              !input.createProjects || consent.scopes.includes("projects:write"),
              "INVALID_REQUEST",
              "Creating projects requires projects:write access.",
            );
            if (input.projectId) await projects.authorize(actor, input.projectId);
          }
          const response = await auth.handler(
            new Request(`${origin}/api/auth/oauth2/consent`, {
              method: "POST",
              headers: request.headers,
              body: JSON.stringify({
                accept: input.accept,
                oauth_query: input.query,
              }),
            }),
          );
          if (response.ok && input.accept)
            await projects.grant(actor.userId, consent.client, input.projectId);
          return response;
        }
      }
      const match =
        /^\/api\/projects\/([^/]+)(?:\/(head|read|review|sources|questions|checks|bpmn|export-info|answers|models))?$/.exec(
          pathname,
        );
      if (match) {
        const [, id, action = "read"] = match;
        const model = ModelKind.parse(url.searchParams.get("model") || "as-is");
        const revision = url.searchParams.has("revision")
          ? z.coerce.number().int().positive().parse(url.searchParams.get("revision"))
          : undefined;
        if (request.method === "GET") {
          if (action === "models") return json(await projects.models(actor, id));
          if (action === "head") return json(await projects.head(actor, id, model));
          if (action === "read") return json(await projects.read(actor, id, revision, model));
          if (action === 'export-info') {
            requireThat(revision, 'INVALID_REQUEST', 'Choose a saved revision to download.');
            return json(await projects.withProject(actor, id, p => {
              const saved = p.read(revision);
              return { name: saved.name, model, revision: saved.revision, filename: `${model}-revision-${saved.revision}.bpmn` };
            }, model, revision));
          }
          if (action === "review") {
            const started = performance.now();
            const value = await projects.review(actor, id, revision, model);
            const response = json(value);
            response.headers.set("server-timing", `review;dur=${(performance.now() - started).toFixed(1)}`);
            if (value.cacheStatus) response.headers.set("x-senda-review-cache", value.cacheStatus);
            return response;
          }
          if (action === "sources") return json(await projects.sources(actor, id, model));
          if (action === "questions") return json(await projects.questions(actor, id, model));
          if (action === "checks") return json(await projects.checks(actor, id, model));
          if (action === "bpmn")
            return new Response((await projects.review(actor, id, revision, model)).exportXml, {
              headers: {
                "content-type": "application/xml",
                "content-disposition": `attachment; filename="${model}${revision ? `-revision-${revision}` : ""}.bpmn"`,
                "cache-control": "private, no-store",
              },
            });
        }
        if (request.method === "POST" && action === "models")
          return json(await projects.createToBe(actor, id, await body()), 201);
        if (request.method === "POST" && action === "sources")
          return json(await projects.addSource(actor, id, await body(), model));
        if (request.method === "POST" && action === "answers") {
          const input = z
            .strictObject({
              expectedRevision: z.number().int().positive(),
              questionId: z.string(),
              text: z.string().trim().min(1).max(50000),
            })
            .parse(await body());
          const state = await projects.questions(actor, id, model),
            question = state.questions.find((q) => q.id === input.questionId);
          requireThat(
            question,
            "NOT_FOUND",
            "This clarification is no longer available. Refresh the project.",
          );
          return json(
            await projects.addSource(
              actor,
              id,
              {
                expectedRevision: input.expectedRevision,
                source: {
                  id: `Answer_${randomUUID()}`,
                  kind: "answer",
                  title: `Answer: ${question.question}`.slice(0, 240),
                  text: input.text,
                  origin: `clarification:${question.id}`,
                  contributor: session.user.name,
                },
              },
              model,
            ),
          );
        }
        if (request.method === "POST" && action === "read")
          return json(await projects.apply(actor, id, await body(), model));
      }
      return json({ code: "NOT_FOUND", message: "This endpoint is not available." }, 404);
    } catch (error) {
      const e = publicError(error),
        status =
          {
            NOT_FOUND: 404,
            FORBIDDEN: 403,
            STALE_REVISION: 409,
            MODEL_EXISTS: 409,
            LIMIT: 413,
            FAILED: 500,
          }[e.code] || 400;
      if (status === 500) console.error("Hosted operation failed:", error.name);
      return json(
        status === 500
          ? {
              code: "FAILED",
              message: "The operation could not be completed. Please try again.",
            }
          : e,
        status,
      );
    }
  }
  return {
    auth,
    projects,
    handle,
  };
}
