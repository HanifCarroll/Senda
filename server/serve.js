import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApplication } from "./application.js";
import { createNodeHandler } from "./node-adapter.js";

process.env.PROCESS_SCRIBE_HOSTED = "1";
const port = Number(process.env.PORT || 3000);
const origin = process.env.APP_URL || `http://127.0.0.1:${port}`;
const parsed = new URL(origin);
if (parsed.origin !== origin || !["http:", "https:"].includes(parsed.protocol))
  throw new Error("APP_URL must be an origin without a path or trailing slash.");
if (
  process.env.NODE_ENV === "production" &&
  parsed.protocol !== "https:" &&
  !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
)
  throw new Error("Public deployments require HTTPS.");
if (
  process.env.PROCESS_SCRIBE_LOCAL_REVIEW === "1" &&
  (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    !["127.0.0.1", "::1"].includes(process.env.HOST || "127.0.0.1"))
)
  throw new Error("Local export reviews must run on a loopback-only server.");
const directory = path.resolve(process.env.PROCESS_SCRIBE_DATA || ".process-scribe/hosted");
const application = await createApplication({ origin, directory });
const root = fileURLToPath(new URL("../dist/client/", import.meta.url));
const render = (await import("../dist/server/server.js")).default;
const types = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json",
  ".woff2": "font/woff2",
};
const server = createServer(
  createNodeHandler(application, origin, async (request) => {
    const url = new URL(request.url);
    if (
      url.pathname.startsWith("/assets/") ||
      url.pathname.startsWith("/marketing/") ||
      url.pathname.startsWith("/examples/") ||
      url.pathname === "/favicon.svg"
    ) {
      try {
        const filename = await realpath(path.join(root, decodeURIComponent(url.pathname)));
        if (!filename.startsWith(root + path.sep) && !filename.startsWith(root))
          return new Response(null, { status: 404 });
        return new Response(await readFile(filename), {
          headers: {
            "content-type": types[path.extname(filename)] || "application/octet-stream",
            "cache-control": url.pathname.startsWith("/assets/")
              ? "public, max-age=31536000, immutable"
              : "public, max-age=3600",
          },
        });
      } catch {
        return new Response(null, { status: 404 });
      }
    }
    return render.fetch(request);
  }),
);
server.listen(port, process.env.HOST || "127.0.0.1", () => console.log(`Senda: ${origin}`));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      application.close();
      process.exit(0);
    }),
  );
