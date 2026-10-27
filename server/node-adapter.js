import { Readable } from "node:stream";

const MAX_BODY = 600_000;
const buckets = new Map();

export function createNodeHandler(application, origin, fallback) {
  return async (req, res, next) => {
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    try {
      const expected = new URL(origin);
      const target = req.url || "/";
      if (!target.startsWith("/") || target.startsWith("//")) {
        res.writeHead(400);
        return res.end("Invalid request target.");
      }
      if (
        target !== "/health" &&
        String(req.headers.host || "").toLowerCase() !== expected.host.toLowerCase()
      ) {
        const localAlias =
          expected.hostname === "127.0.0.1" && req.headers.host === `localhost:${expected.port}`;
        if (localAlias && ["GET", "HEAD"].includes(req.method)) {
          res.writeHead(307, { location: new URL(target, origin).href });
          return res.end();
        }
        res.writeHead(403, { "content-type": "application/json", "cache-control": "no-store" });
        return res.end(
          JSON.stringify({
            code: "FORBIDDEN",
            message: "Open this application at its configured address.",
          }),
        );
      }
      const pathname = new URL(req.url, origin).pathname;
      const handled =
        pathname.startsWith("/api/") ||
        pathname.startsWith("/.well-known/") ||
        pathname === "/mcp" ||
        pathname === "/health";
      if (!handled && next) return next();
      if (handled) {
        const ip = req.socket.remoteAddress || "unknown",
          now = Date.now();
        if (buckets.size > 5000)
          for (const [key, value] of buckets) if (now - value.start > 60000) buckets.delete(key);
        const bucket = buckets.get(ip) || { start: now, count: 0 };
        if (now - bucket.start > 60000) {
          bucket.start = now;
          bucket.count = 0;
        }
        bucket.count++;
        buckets.set(ip, bucket);
        if (bucket.count > 240 || buckets.size > 6000) {
          res.writeHead(429, {
            "Retry-After": "60",
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          return res.end(
            JSON.stringify({ code: "RATE_LIMIT", message: "Please try again in a minute." }),
          );
        }
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > MAX_BODY) {
          req.resume();
          res.setHeader("connection", "close");
          res.writeHead(413, { "content-type": "application/json", "cache-control": "no-store" });
          return res.end(
            JSON.stringify({
              code: "LIMIT",
              message:
                "Keep each request below 600 KB. Use a smaller transcript or revision proposal.",
            }),
          );
        }
        chunks.push(chunk);
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers))
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      headers.set("x-scribe-client-ip", req.socket.remoteAddress || "127.0.0.1");
      const request = new Request(new URL(req.url, origin), {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
        signal: controller.signal,
      });
      const response =
        (await application.handle(request)) ||
        (await fallback?.(request)) ||
        new Response("Not found", { status: 404 });
      res.statusCode = response.status;
      for (const [key, value] of response.headers)
        if (key !== "set-cookie") res.setHeader(key, value);
      if (
        pathname.startsWith("/app") ||
        pathname === "/local" ||
        (pathname === "/" && new URL(request.url).searchParams.has("review"))
      )
        res.setHeader("cache-control", "private, no-store");
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader("set-cookie", cookies);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
      res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
      if (request.method === "HEAD" || !response.body) return res.end();
      Readable.fromWeb(response.body)
        .on("error", () => res.destroy())
        .pipe(res);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Request failed:", error.name);
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end('{"code":"FAILED","message":"The request could not be completed."}');
    }
  };
}
