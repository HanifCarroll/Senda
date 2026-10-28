# Senda on Cloudflare

The production application uses Workers at `https://senda.hanifcarroll.com`, D1 for accounts and project/revision records, a private R2 bucket for immutable model snapshots, and Email Service for account verification and password resets. Better Auth remains the authentication library. The local Node server, CLI and offline exports keep their existing storage and behavior.

## Storage and concurrency

`CloudProjects` checks ownership and the agent's project grant before resolving a model or reading R2. Each revision contains the same snapshot used by the local `Project` implementation. Both runtimes share `ProjectCore`, evidence validation, BPMN operations and the review/layout pipeline.

R2 objects have random immutable keys and a SHA-256 digest. A conditional D1 insert publishes one revision only if its expected parent is still current. A losing writer receives `STALE_REVISION`; its model and evidence never become visible. The two model states retain separate histories and a fixed As-is baseline for the To-be plan. D1 read replication is disabled for the initial deployment.

An upload that is never published can leave a private orphan object. After an ambiguous database/network error, the service deliberately keeps the blob: the database may already have committed its reference. Reconcile unreferenced objects against D1 before any cleanup. Never delete a blob merely because a request timed out.

The R2 bucket has no public website or custom domain. Private content is served through authenticated application endpoints. Public examples and screenshots are separate synthetic assets. Existing local account databases and interview projects are not automatically uploaded.

## Authentication and account email

Production requires a private `BETTER_AUTH_SECRET`, passed through Workers secrets. Email ownership is verified before sign-in. Password-reset links expire after 30 minutes, verification links after one hour. Resetting a password revokes existing sessions; links cannot be reused after a successful reset.

Account messages use `accounts@mail.senda.hanifcarroll.com` through a sender-restricted Email Service binding. That subdomain has separate SPF, DKIM and DMARC records. Email content previews are disabled in Cloudflare's activity log so account links are not retained there. Worker observability redacts query strings. The app limits request bodies and applies per-peer and authentication rate limits.

The Worker creates and initializes Better Auth within each request, avoiding a cached authentication context with request-scoped D1 I/O. Immutable drawing data uses a small bounded cache. MCP signature verification reads public signing keys through the local Better Auth API instead of fetching its own public origin. The pinned MCP wrapper forwards this key supplier to its core verifier; issuer, audience, expiry, scopes and DPoP checks remain in that verifier. Retain the real Worker MCP regression when upgrading Better Auth because the wrapper currently declares only a URL type.

## Agent compatibility

Authenticated Streamable HTTP MCP, PKCE, dynamic client registration, project consent and immediate revocation use the same handler as the Node application. Native WebMCP remains a progressive enhancement on private current-model pages.

The Node deployment also supports Client ID Metadata Documents (CIMD). Its official transport pins validated DNS answers using `node:https`'s `lookup` option. The Workers runtime rejects that option, so **the Cloudflare deployment does not advertise or enable CIMD**. It uses standard dynamic registration. A client requiring URL-based registration needs another supported registration method, or a separately verified Node transport hosted in a Cloudflare Container. Replacing the transport with unrestricted `fetch` would lose its DNS-pinning guarantees and is not the implemented fallback.

## Build and deploy

Use Node 24, install the locked dependencies, and run:

```sh
npm test
npm run build:cloudflare
npm run typecheck
npm run check
npx wrangler d1 migrations apply senda --remote
npx wrangler deploy --config dist-cloudflare/server/wrangler.json --secrets-file <private-secrets.json>
```

The secrets JSON must contain a unique `BETTER_AUTH_SECRET` of at least 32 characters. Keep it outside version control. Retain this secret and both storage resources between releases. The checked-in Wrangler configuration identifies the Senda resources and custom domain; changing accounts requires explicit new resources and bindings.

Cloudflare Workers Builds is connected to `HanifCarroll/process-scribe` on `main`, using Node 24.18.0. Its build runs the Node suite, Cloudflare build, typecheck and publication checks; deployment applies pending D1 migrations and uploads the built Worker. The existing production signing secret remains in Workers secrets and is never copied into the build environment. GitHub separately runs both Node and real local Worker workflows. Verify the Cloudflare build result and deployed version after each push.

Wrangler uploads built assets, the Worker and the sender/database/bucket bindings. The custom domain provisions DNS and TLS. Avoid changing unrelated domain records or another project's bindings. API health is `/health`; OAuth protected-resource metadata is `/.well-known/oauth-protected-resource`.

The Cloudflare Vite plugin currently pins an older Wrangler/Miniflare combination with dependency advisories. Package overrides select the installed Wrangler version and its matching Miniflare release; the build and runtime tests verify that combination. Update these pins together and recheck the dependency audit.

## Runtime verification

Run local D1 migrations and start the built Worker with a private temporary persistence directory, `LOCAL_EMAIL_OUTBOX=1`, `--infer-origin-from-routes=false`, and a non-production signing secret. Preserving the loopback origin is necessary because the production custom-domain route otherwise changes the URL seen by local Workers. `node scripts/test-cloudflare-workflow.js` exercises the Worker through HTTP and the real MCP SDK: verification, two-user isolation, discovery and clarification rounds, separate model histories, saved future-design answers, matching exports, concurrent writers, oversized requests, revocation and password reset. CI runs this sequence.

Only a loopback origin can use the local test outbox. It writes signed email messages to the private local R2 simulator for inspection by the test harness. No public endpoint serves that outbox, and production sends through Email Service.

`npm run test:cloudflare:browser` adds real browser checks for account verification, sign-in, password reset, separate model tabs and mobile overflow. It blocks JavaScript to check the server-rendered sign-in form cannot submit before hydration, checks that credentials never enter a query string, and delays a diagram response beyond the five-second polling interval to catch overlapping refreshes. Install Chromium with `npx playwright install chromium`, or set `SENDA_TEST_BROWSER` to an existing Chrome executable. CI installs the browser and runs this check against the same local Worker.

Primary references: [TanStack Start on Workers](https://developers.cloudflare.com/changelog/post/2025-10-24-tanstack-start/), [D1](https://developers.cloudflare.com/d1/), [R2 bindings](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/), [Email Service](https://developers.cloudflare.com/email-service/), [custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), and [Better Auth databases](https://better-auth.com/docs/concepts/database).
