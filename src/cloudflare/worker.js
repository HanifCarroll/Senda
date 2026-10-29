import start from "@tanstack/react-start/server-entry";

async function application(env, origin) {
  const [{ createRequestHandler }, { CloudProjects }, { cloudAuth }] = await Promise.all([
    import("../server/handler.js"), import("./projects.js"), import("./auth.js"),
  ]);
  // Authentication initialization and D1 work belong to this request. Cache
  // immutable drawing data, never an authentication context with live I/O.
  const projects = new CloudProjects(env.DB, env.SNAPSHOTS, { reviewVersion: process.env.SENDA_REVIEW_VERSION }),
    auth = cloudAuth(env, origin, projects);
  await auth.$context;
  const billing = new (await import("./billing.js")).CloudBilling(env, origin);
  return createRequestHandler({
    origin,
    projects,
    auth,
    billing,
    hostedAgent: new (await import("./agent.js")).HostedAgent(env, projects, origin, { billing }),
    localJwks: true,
    features: {
      accountEmail: true,
      agentClientDiscovery: "cimd-and-dynamic-registration",
      loginMethods: {
        magicLink: true,
        google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        password: false,
      },
    },
  });
}
export { SendaAgentWorkflow } from './agent-workflow.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const local =
      env.LOCAL_EMAIL_OUTBOX === "1" && ["127.0.0.1", "localhost"].includes(url.hostname);
    const origin = local ? url.origin : env.APP_URL;
    if (url.pathname === "/health")
      return Response.json({ status: "ok", storage: "cloudflare-d1-r2" });
    if (!origin || (!local && url.origin !== origin))
      return new Response("Open Senda at its configured address.", {
        status: 403,
      });
    if (
      env.REQUEST_LIMITER &&
      !(
        await env.REQUEST_LIMITER.limit({
          key: request.headers.get("cf-connecting-ip") || "local",
        })
      ).success
    )
      return Response.json(
        {
          code: "RATE_LIMITED",
          message: "Please wait a moment and try again.",
        },
        { status: 429, headers: { "retry-after": "60" } },
      );
    if (request.method !== "GET" && request.method !== "HEAD") {
      const size = Number(request.headers.get("content-length") || 0);
      if (size > 600_000)
        return Response.json(
          { code: "LIMIT", message: "Keep this request below 600 KB." },
          { status: 413 },
        );
      const reader = request.body?.getReader();
      let total = 0;
      const chunks = [];
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > 600_000) {
            await reader.cancel();
            return Response.json(
              { code: "LIMIT", message: "Keep this request below 600 KB." },
              { status: 413 },
            );
          }
          chunks.push(value);
        }
      }
      request = new Request(request, {
        body: reader ? new Blob(chunks) : null,
      });
    }
    // Trust the Cloudflare-provided peer address, never a browser's internal header.
    const headers = new Headers(request.headers);
    headers.set("x-scribe-client-ip", headers.get("cf-connecting-ip") || "local");
    request = new Request(request, { headers });
    const apiRequest = url.pathname.startsWith("/api/") || url.pathname === "/mcp" || url.pathname.startsWith("/.well-known/");
    const response = apiRequest
      ? (await (await application(env, origin)).handle(request)) || (await start.fetch(request))
      : await start.fetch(request);
    const result = new Response(response.body, response);
    result.headers.set("x-content-type-options", "nosniff");
    result.headers.set("referrer-policy", "same-origin");
    result.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
    if (
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/app") ||
      url.pathname === "/mcp" ||
      url.pathname === "/consent" ||
      url.pathname.startsWith("/sign-in") ||
      url.pathname === "/reset-password"
    )
      result.headers.set("cache-control", "private, no-store");
    return result;
  },
};
