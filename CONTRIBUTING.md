# Development

Use Node.js 24. Install with `npm ci`, then run `npm test`, `npm run check` and `npm run demo` after changes that affect the discovery workflow. Inspect the generated review page when changing exports or layout behavior. For web changes, also run `npm run build` and `npm run typecheck`, then check `npm run preview` on desktop and mobile. The build generates the ignored route tree; build before typechecking a fresh checkout. Keep local servers on loopback.

Keep committed fixtures synthetic. Do not add source interviews, database files, credentials, proprietary process descriptions, textbook pages or extracted copyrighted material. Project and export directories are ignored by default.

Use stable BPMN IDs and preserve the atomic relationship between XML and evidence. Add regression tests for behavior changes that can lose information, misstate validation, or accept an invalid edit. Readability advice must remain distinguishable from structural errors, behavioral findings, human assertions and product conventions.

The skill lives at `skills/process-scribe/SKILL.md`. Its methodology reference is the canonical original summary of the textbook approach. If application behavior and the skill diverge, update both and demonstrate the affected user workflow.

No generated reports, dependencies or benchmark environments belong in the repository. GitHub Actions runs the same checks and the synthetic demo on Linux. A remote passing run does not replace human review of a real process model.

Production runs on Cloudflare Workers, D1 and private R2. See [deployment and runtime checks](docs/cloudflare.md). The Node server is for local development and review exports. Shared HTTP/account operations live in `server/`; model-level reads and writes belong in `server/project-models.js`, with authorization and persistence in the Node and Cloudflare adapters. Keep the CLI and offline bundle functional when changing the hosted app.
