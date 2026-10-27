# Shared projects and agent connections

The product is Senda, targeting `senda.hanifcarroll.com`. DNS and public deployment must be verified separately. Set `PRODUCT_NAME` for the server and `VITE_PRODUCT_NAME` when building the web app. Existing `process-scribe` CLI, skill and repository identifiers remain compatible.

## Run the complete application

Use Node 24. `npm ci`, `npm run build`, then `npm run serve` runs the public homepage, example, account screens, private project app, HTTP API and MCP endpoint. `APP_URL` must be the exact public origin without a trailing slash. Local development defaults to `http://127.0.0.1:3000`. Set `PORT` and `APP_URL` together to use another port. `npm run dev:hosted` enables the same API in Vite development.

`PROCESS_SCRIBE_DATA` defaults to `.process-scribe/hosted`. It contains the account database, project catalog and one ordinary Senda project database per opaque UUID. Do not put it in a publicly served directory. The service reuses `Project` for all source/model mutations and the improved `diagramViews` pipeline for review and export. The local CLI, local review mode and offline bundles retain their existing behavior. Local export-file server functions are disabled in hosted mode: private local files are never made available as a public example.

The public `/example` is an explicitly generated synthetic fixture, independent of private account data. Rebuild it with `node scripts/build-public-example.js` after relevant modeling/layout changes. Its first draft and final version include scripted clarification rounds and unapproved human-review cases.

## Accounts and authorization

Better Auth 1.7.14 handles email/password accounts, hashed passwords, HTTP-only sessions, session expiry and OAuth. Passwords require at least 12 characters. Email delivery, email ownership verification and account recovery are not configured in this release; do not describe addresses as verified or advertise recovery that does not exist. Public launch needs an account-support/recovery decision alongside hosting. No agent provider key or built-in model call is required.

Every source, project, revision, check, review, browser-tool and BPMN operation checks account ownership before opening the project. Agents also need an explicit project grant. UUIDs identify projects; host paths are never public project identifiers. Private API responses use `no-store`. Browser writes require the exact configured Origin and JSON content type. HTTP bodies are limited to 600 KB, proposals to 500 operations, and projects to 40 sources / 1 MB of source text. A simple per-peer request limit and Better Auth's database rate limits protect the initial single-server deployment. Do not trust arbitrary forwarded IP headers; behind a proxy these conservative limits may group callers at the proxy address.

Human browser answers append immutable answer sources. They remain available beside the corresponding open question until the modeling agent revises the model and resolves it with evidence. Merely receiving an answer does not establish the model's interpretation. Existing sources and past revisions remain immutable. A stale or invalid batch changes neither the model nor its evidence.

## As-is and To-be models

Each private project starts with an **As-is** model (`current` mode). The **To-be** tab can create one separate future-process model (`proposed` mode), from a chosen saved As-is revision plus the owner's design brief. The baseline drawing is copied as an unconfirmed planning draft at To-be revision 1. Current claims, questions, walkthroughs, scenarios and approvals are not copied as future facts. A plan keeps the baseline revision and content digest; later As-is revisions do not automatically rebase it. Creating a second plan is rejected rather than replacing its history.

The project catalog stores the relationship in `project_plans`. Each model uses its own ordinary `Project` database, sources, claims, question state, atomic revisions, history and render cache keys. Existing As-is databases are left in place; the catalog migration only adds the optional relation. Every model lookup checks the same project ownership and agent grant first. A project grant covers both models; the consent screen states that scope.

`GET /api/projects/:id/models` returns both heads, As-is revision summaries and the fixed baseline. `POST` to that endpoint accepts `{ baselineRevision, brief }`. Other project endpoints accept `?model=as-is` or `?model=to-be`, optionally `&revision=N` for saved reads; omission retains the original As-is API behavior. The UI always supplies the active model. BPMN filenames identify the model, and the UI's revision menu shows only that model's history. Planning uses the same discovery method, clarifications, checks and improved portable geometry. It makes no execution or performance claims.

## Remote MCP

The primary endpoint is `/mcp`. It uses the official MCP server SDK 2.4.0 with current stateless 2026-07-28 serving and the SDK's stateless 2025 compatibility path. The same endpoint is authenticated on every request. GET and DELETE are not session-management endpoints and return 405. The official SDK client is tested in modern and legacy modes. Commercial clients are not listed as supported until their actual connection flows are tested.

Better Auth's MCP and CIMD plugins supply resource-bound OAuth authorization, PKCE, exact redirect matching, JWT verification and protected-resource / authorization-server discovery. CIMD uses the official Node transport that rejects special-use destinations and redirects. DCR is deliberately enabled as a fallback for clients that need registration. Discovery includes both mechanisms. The signed consent query is checked before displaying or processing a grant.

Users select a private project on the consent screen. `projects:read` permits reading that grant; `projects:write` additionally permits source/model revisions and creating a project. A write without its scope receives a 403 scope challenge. A new project created by a connected agent is owned by the same user and granted to that connection. A connection cannot list another private project merely because it has the same owner. Human approvals and finalization are not exposed as agent tools.

Disconnecting agents clears all project grants, increments the account's agent epoch, deletes OAuth access/refresh token records and clears consent. The endpoint checks the epoch and current grant on every request, so an existing JWT stops working immediately; renewed consent does not resurrect it. Signing out of the web UI is separate from disconnecting an agent.

The tool inventory covers project create/list/read, `list_models`, `create_to_be_model`, sources, questions, discovery method, proposal/operation schema, atomic revisions, checks, review links and portable BPMN export. Remote model tools require an explicit `model: "as-is" | "to-be"`; revision numbers are independent within each model. The service API and browser tools use the same project methods. The downloadable `/api/skill.zip` includes the method and references, including future-process planning; installing/using it remains an action for the agent or user. Tool registration does not automatically execute the skill.

## Browser collaboration

On an active private project, the app detects the draft `document.modelContext.registerTool` API. When available, it registers tools with an abort signal and removes them when the project/model is left or a historical revision is opened. Arguments and results use structured schemas; calls go to the same authenticated backend. The backend injects the active project ID and model, rejecting attempts to override either. `get_visible_project_context` reports both plus the visible and server revisions. A saved tool revision refreshes the visible model. Ordinary remote-agent changes and plan creation are detected every five seconds while the tab is visible. Historical revisions do not auto-jump to the latest version.

No polyfill claims WebMCP support. Unsupported browsers keep the regular app and remote MCP flow. Native registration, discovery, revision writes and visible updates were verified in Chrome 156 with WebMCP enabled, including the official DevTools MCP agent bridge. See [browser setup and verification](browser-setup.md). Contract mocks alone do not establish native compatibility.

## Deploy at the chosen subdomain

Neden uses a Cloudflare static-assets Worker with a custom domain at `neden.hanifcarroll.com`. This product also runs Node and SQLite, so its application cannot use that static-only configuration unchanged. Keep Cloudflare as the DNS/domain front and use a Node host with a durable disk. The included Dockerfile and Compose/Caddy configuration provide a concrete single-server deployment option; an equivalent managed Node service must mount a persistent volume at `/data`.

1. Select a Node host for `senda.hanifcarroll.com`. No new domain purchase is needed.
2. Copy `.env.example` to `.env`, set the chosen `APP_HOSTNAME`, display name and a unique `BETTER_AUTH_SECRET` of at least 32 characters. Keep the secret outside Git. Set both display-name variables for direct builds; Compose supplies the build name from `PRODUCT_NAME`.
3. Configure the Cloudflare record for the selected host and HTTPS on the origin. Only then start the prepared deployment. Preserve `/data` across releases and keep a consistent secret; replacing either loses account/project continuity or signing capability.
4. Verify account creation/sign-in, two-user isolation, OAuth consent, revision updates, revocation, examples, assets and BPMN downloads through the actual HTTPS hostname. Check cookie Secure/HttpOnly attributes and OAuth discovery's exact issuer/resource. Local success is not deployment verification.
5. Back up the entire data directory using a coordinated SQLite backup/snapshot or a stopped service. Copying just a live `.sqlite` file can miss its WAL. Store backups separately with restricted access and verify a restore. This release targets one process on a durable host, not horizontally distributed or ephemeral/serverless storage.

The container and TLS/domain preparation do not provision a paid host or configure email delivery. These are concrete external deployment dependencies; no public deployment is claimed until they are resolved and the live flow is checked.

Primary implementation references: [Better Auth MCP](https://www.better-auth.com/docs/plugins/mcp), [OAuth provider](https://www.better-auth.com/docs/plugins/oauth-provider), [MCP HTTP serving](https://ts.sdk.modelcontextprotocol.io/v2/serving/http), [remote connections](https://modelcontextprotocol.io/docs/develop/connect-remote-servers), [Chrome WebMCP](https://developer.chrome.com/docs/ai/webmcp), and [WebMCP draft](https://webmachinelearning.github.io/webmcp/).
