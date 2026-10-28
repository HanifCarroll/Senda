# Shared projects and agent connections

The product is Senda, live at `https://senda.hanifcarroll.com` on Cloudflare Workers. See [Cloudflare resources, deployment and runtime verification](cloudflare.md). Set `PRODUCT_NAME` for the server and `VITE_PRODUCT_NAME` when building the web app. Existing `process-scribe` CLI, skill and repository identifiers remain compatible.

## Run the complete application

Use Node 24. `npm ci`, `npm run build`, then `npm run serve` runs the public homepage, example, account screens, private project app, HTTP API and MCP endpoint. `APP_URL` must be the exact public origin without a trailing slash. Local development defaults to `http://127.0.0.1:3000`. Set `PORT` and `APP_URL` together to use another port. `npm run dev:hosted` enables the same API in Vite development.

`PROCESS_SCRIBE_DATA` defaults to `.process-scribe/hosted`. It contains the account database, project catalog and one ordinary Senda project database per opaque UUID. Do not put it in a publicly served directory. The service reuses `Project` for all source/model mutations and the improved `diagramViews` pipeline for review and export. The local CLI, local review mode and offline bundles retain their existing behavior. Local export-file server functions are disabled in hosted mode: private local files are never made available as a public example.

The public `/example` is an explicitly generated synthetic fixture, independent of private account data. Rebuild it with `node scripts/build-public-example.js` after relevant modeling/layout changes. Its first draft and final version include scripted clarification rounds and unapproved human-review cases.

## Accounts and authorization

Better Auth 1.7.14 handles email/password accounts, hashed passwords, HTTP-only sessions, session expiry and OAuth. Passwords require at least 12 characters. Production verifies email ownership before sign-in and sends verification/password-reset messages through Cloudflare Email Service. Resetting a password invalidates existing sessions. The separate local Node server has no email transport and does not claim email verification or password recovery. No agent provider key or built-in model call is required.

Every source, project, revision, check, review, browser-tool and BPMN operation checks account ownership before opening the project. Agents also need an explicit project grant. UUIDs identify projects; host paths are never public project identifiers. Private API responses use `no-store`. Browser writes require the exact configured Origin and JSON content type. HTTP bodies are limited to 600 KB, proposals to 500 operations, and projects to 40 sources / 1 MB of source text. Cloudflare applies a 240-request-per-minute peer limit alongside Better Auth's database rate limits. The Worker supplies the trusted Cloudflare peer header itself. The local Node adapter uses its own peer limit; do not trust arbitrary forwarded IP headers.

Human browser answers append immutable answer sources. They remain available beside the corresponding open question until the modeling agent revises the model and resolves it with evidence. Merely receiving an answer does not establish the model's interpretation. Existing sources and past revisions remain immutable. A stale or invalid batch changes neither the model nor its evidence.

## As-is and To-be models

Each private project starts with an **As-is** model (`current` mode). The **To-be** tab can create one separate future-process model (`proposed` mode), from a chosen saved As-is revision plus the owner's design brief. The baseline drawing is copied as an unconfirmed planning draft at To-be revision 1. Current claims, questions, walkthroughs, scenarios and approvals are not copied as future facts. A plan keeps the baseline revision and content digest; later As-is revisions do not automatically rebase it. Creating a second plan is rejected rather than replacing its history.

The project catalog stores the relationship in `project_plans`. Each model has separate sources, claims, question state, atomic revisions, history and render cache keys. The local Node adapter uses a `Project` database per model; Cloudflare uses D1 metadata and immutable private R2 snapshots with the same shared `ProjectCore`. Existing local As-is databases remain in place. Every model lookup checks the same project ownership and agent grant first. A project grant covers both models; the consent screen states that scope.

`GET /api/projects/:id/models` returns both heads, As-is revision summaries and the fixed baseline. `POST` to that endpoint accepts `{ baselineRevision, brief }`. Other project endpoints accept `?model=as-is` or `?model=to-be`, optionally `&revision=N` for saved reads; omission retains the original As-is API behavior. The UI always supplies the active model. BPMN filenames identify the model, and the UI's revision menu shows only that model's history. Planning uses the same discovery method, clarifications, checks and improved portable geometry. It makes no execution or performance claims.

## Remote MCP

The primary endpoint is `/mcp`. It uses the official MCP server SDK 2.4.0 with current stateless 2026-07-28 serving and the SDK's stateless 2025 compatibility path. The same endpoint is authenticated on every request. GET and DELETE are not session-management endpoints and return 405. The official SDK client is tested in modern and legacy modes. Commercial clients are not listed as supported until their actual connection flows are tested.

Better Auth's MCP and CIMD plugins supply resource-bound OAuth authorization, PKCE, exact redirect matching, JWT verification and protected-resource / authorization-server discovery. CIMD uses the official Node transport that rejects special-use destinations and redirects. The local Node deployment advertises both mechanisms. The Cloudflare deployment supports dynamic client registration (DCR) and does not advertise CIMD: its DNS-pinned Node transport uses an option unsupported by Workers. See the [tested limitation and Container alternative](cloudflare.md#agent-compatibility). The signed consent query is checked before displaying or processing a grant.

Users select a private project on the consent screen. `projects:read` permits reading that grant; `projects:write` additionally permits source/model revisions and creating a project. A write without its scope receives a 403 scope challenge. A new project created by a connected agent is owned by the same user and granted to that connection. A connection cannot list another private project merely because it has the same owner. Human approvals and finalization are not exposed as agent tools.

Disconnecting agents clears all project grants, increments the account's agent epoch, deletes OAuth access/refresh token records and clears consent. The endpoint checks the epoch and current grant on every request, so an existing JWT stops working immediately; renewed consent does not resurrect it. Signing out of the web UI is separate from disconnecting an agent.

The tool inventory covers project create/list/read, `list_models`, `create_to_be_model`, sources, questions, discovery method, proposal/operation schema, atomic revisions, checks, review links and portable BPMN export. Remote model tools require an explicit `model: "as-is" | "to-be"`; revision numbers are independent within each model. The service API and browser tools use the same project methods. The downloadable `/api/skill.zip` includes the method and references, including future-process planning; installing/using it remains an action for the agent or user. Tool registration does not automatically execute the skill.

## Browser collaboration

On an active private project, the app detects the draft `document.modelContext.registerTool` API. When available, it registers tools with an abort signal and removes them when the project/model is left or a historical revision is opened. Arguments and results use structured schemas; calls go to the same authenticated backend. The backend injects the active project ID and model, rejecting attempts to override either. `get_visible_project_context` reports both plus the visible and server revisions. A saved tool revision refreshes the visible model. Ordinary remote-agent changes and plan creation are detected every five seconds while the tab is visible. Historical revisions do not auto-jump to the latest version.

No polyfill claims WebMCP support. Unsupported browsers keep the regular app and remote MCP flow. Native registration, discovery, revision writes and visible updates were verified in Chrome 156 with WebMCP enabled, including the official DevTools MCP agent bridge. See [browser setup and verification](browser-setup.md). Contract mocks alone do not establish native compatibility.

## Production and alternative Node deployment

Production uses Workers, D1, private R2 and Email Service at the chosen HTTPS subdomain. Follow [Cloudflare deployment](cloudflare.md) for resources, migrations, secrets, build and live checks. Retain the signing secret and both storage resources between releases. Local databases and interview projects are not uploaded automatically.

The Dockerfile and Compose/Caddy configuration remain an alternative for a single Node service with durable storage, including clients requiring the official CIMD transport. Set the exact `APP_URL`, keep a unique `BETTER_AUTH_SECRET` outside Git, and preserve `/data`. This alternative does not configure account email; add and verify a mail transport before claiming verification or recovery. Back up a local database with a coordinated SQLite backup or a stopped service; copying a live main file can miss its WAL.

For either deployment, verify accounts, two-user isolation, OAuth consent, revisions, revocation, examples and BPMN downloads through the actual HTTPS hostname. Local tests alone do not establish a deployed connection. Commercial MCP clients still need individual connection tests.

Primary implementation references: [Better Auth MCP](https://www.better-auth.com/docs/plugins/mcp), [OAuth provider](https://www.better-auth.com/docs/plugins/oauth-provider), [MCP HTTP serving](https://ts.sdk.modelcontextprotocol.io/v2/serving/http), [remote connections](https://modelcontextprotocol.io/docs/develop/connect-remote-servers), [Chrome WebMCP](https://developer.chrome.com/docs/ai/webmcp), and [WebMCP draft](https://webmachinelearning.github.io/webmcp/).
