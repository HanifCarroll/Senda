# Senda on Cloudflare

The production application uses Workers at `https://senda.hanifcarroll.com`, D1 for accounts and project/revision records, a private R2 bucket for immutable model snapshots, and Email Service for passwordless sign-in links. Better Auth remains the authentication library. The local Node server, CLI and offline exports keep their existing storage and behavior.

## Storage and concurrency

`CloudProjects` checks ownership and the agent's project grant before resolving a model or reading R2. Each revision contains the same snapshot used by the local `Project` implementation. Both runtimes share `ProjectCore`, evidence validation, BPMN operations and the review/layout pipeline.

R2 objects have random immutable keys and a SHA-256 digest. A conditional D1 insert publishes one revision only if its expected parent is still current. A losing writer receives `STALE_REVISION`; its model and evidence never become visible. The two model states retain separate histories and a fixed As-is baseline for the To-be plan. D1 read replication is disabled for the initial deployment.

An upload that is never published can leave a private orphan object. After an ambiguous database/network error, the service deliberately keeps the blob: the database may already have committed its reference. Reconcile unreferenced objects against D1 before any cleanup. Never delete a blob merely because a request timed out.

The R2 bucket has no public website or custom domain. Private content is served through authenticated application endpoints. Public examples and screenshots are separate synthetic assets. Existing local account databases and interview projects are not automatically uploaded.

## Authentication and account email

Production requires a private `BETTER_AUTH_SECRET`, passed through Workers secrets. Production uses passwordless email links and optional Google sign-in. Magic links expire after 10 minutes, are stored hashed, and are consumed atomically once. Email scanners see a confirmation page; only the person pressing Continue starts verification. Signing in with the same email keeps the existing user ID, projects and revisions. Password login is disabled in the Worker; old recovery-page links lead to the new sign-in flow. The separate local Node server retains its password fallback because it has no mail transport. Google requires a dedicated OAuth client; the option appears only when both credentials are configured. See [Google setup and account connections](authentication.md).

Account messages use `accounts@mail.senda.hanifcarroll.com` through a sender-restricted Email Service binding. That subdomain has separate SPF, DKIM and DMARC records. Email content previews are disabled in Cloudflare's activity log so account links are not retained there. Worker observability redacts query strings. The app limits request bodies and applies per-peer and authentication rate limits.

The Worker creates and initializes Better Auth within each request, avoiding a cached authentication context with request-scoped D1 I/O. Immutable drawing data uses a small bounded cache. MCP signature verification reads public signing keys through the local Better Auth API instead of fetching its own public origin. The pinned MCP wrapper forwards this key supplier to its core verifier; issuer, audience, expiry, scopes and DPoP checks remain in that verifier. Retain the real Worker MCP regression when upgrading Better Auth because the wrapper currently declares only a URL type.

Complex automatic layouts exceeded the initial 30-second CPU limit in live checks. The paid Worker now allows 120 seconds, below Cloudflare's five-minute maximum. Geometry is cached by project and XML digest so evidence-only revisions reuse it; quality and evidence remain separately bound to model and revision. Both caches are bounded. A cold complex drawing can still be slow; the loading screen waits without starting overlapping refreshes.

## Agent compatibility

Authenticated Streamable HTTP MCP, PKCE, dynamic client registration, project consent and immediate revocation use the same handler as the Node application. Native WebMCP remains a progressive enhancement on private current-model pages.

Both deployments advertise Client ID Metadata Documents (CIMD) and retain dynamic client registration for compatibility. The Node adapter uses Better Auth's DNS-pinned HTTPS transport. The Worker uses a runtime-specific public-network transport in `cloudflare/cimd.js`: it refuses to operate without `global_fetch_strictly_public`, rejects non-public literal hosts and non-HTTPS resources, strips cookies/authorization headers, and refuses redirects. Better Auth retains document validation, exact redirect checks, fetch-size/time limits, public JWKS validation and MCP profile checks.

Cloudflare's public-fetch network boundary is the same platform mechanism used by its own OAuth provider. It avoids legacy same-zone origin routing instead of using Node's unsupported DNS lookup callback. This implementation keeps Better Auth and its existing accounts, grants and revocation; no Container or authentication-provider migration is required. Do not remove the flag or replace this transport with unrestricted fetch. Standards/SDK checks do not establish every commercial client's complete connection flow.

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

Cloudflare Workers Builds is connected to `HanifCarroll/Senda` on `main`, using Node 24.18.0. Its build runs the Node suite, Cloudflare build, typecheck and publication checks; deployment applies pending D1 migrations and uploads the built Worker. The existing production signing secret remains in Workers secrets and is never copied into the build environment. GitHub separately runs both Node and real local Worker workflows. Verify the Cloudflare build result and deployed version after each push.

Wrangler uploads built assets, the Worker and the sender/database/bucket bindings. The custom domain provisions DNS and TLS. Avoid changing unrelated domain records or another project's bindings. API health is `/health`; OAuth protected-resource metadata is `/.well-known/oauth-protected-resource`.

The Cloudflare Vite plugin currently pins an older Wrangler/Miniflare combination with dependency advisories. Package overrides select the installed Wrangler version and its matching Miniflare release; the build and runtime tests verify that combination. Update these pins together and recheck the dependency audit.

## Runtime verification

Run local D1 migrations and start the built Worker with a private temporary persistence directory, `LOCAL_EMAIL_OUTBOX=1`, `--infer-origin-from-routes=false`, and a non-production signing secret. Browser tests use dummy Google credentials to verify the OAuth start; those values are never production credentials. Preserving the loopback origin is necessary because the production custom-domain route otherwise changes the URL seen by local Workers. `node scripts/test-cloudflare-workflow.js` exercises the Worker through HTTP and the real MCP SDK: single-use magic links, two-user isolation, discovery and clarification rounds, separate model histories, saved future-design answers, matching exports, concurrent writers, oversized requests, revocation and disabled password login. CI runs this sequence.

Only a loopback origin can use the local test outbox. It writes signed email messages to the private local R2 simulator for inspection by the test harness. No public endpoint serves that outbox, and production sends through Email Service.

`npm run test:cloudflare:browser` adds real browser checks for passwordless sign-in, scanner-safe confirmation, returning accounts, Google OAuth start, separate model tabs and mobile overflow. It blocks JavaScript to check the server-rendered sign-in form cannot submit before hydration, checks that credentials never enter a query string, and delays a diagram response beyond the five-second polling interval to catch overlapping refreshes. Install Chromium with `npx playwright install chromium`, or set `SENDA_TEST_BROWSER` to an existing Chrome executable. CI installs the browser and runs this check against the same local Worker.

Primary references: [TanStack Start on Workers](https://developers.cloudflare.com/changelog/post/2025-10-24-tanstack-start/), [D1](https://developers.cloudflare.com/d1/), [R2 bindings](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/), [Email Service](https://developers.cloudflare.com/email-service/), [custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), and [Better Auth databases](https://better-auth.com/docs/concepts/database).
