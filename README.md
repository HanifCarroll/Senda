<h1><img src="public/brand/logo.svg" alt="Senda" width="210"></h1>

Turn process interviews into clear BPMN diagrams. Clarify decisions, trace each step to its source, and keep revising the process with your agent.

Explore the current process, plan a separate future version, and compare saved revisions. Senda keeps the diagram, source material and clarification answers together in a private project.

The project includes a TanStack Start app, an agent skill, a local CLI and a JavaScript library. Your agent interprets the conversation; Senda stores the evidence and revisions, applies BPMN edits through [Miragon bpmn-cli](https://github.com/Miragon/bpmn-cli), and exports portable diagrams. The CLI and skill use the `process-scribe` command.

The discovery method follows Chapter 5 of *Fundamentals of Business Process Management*, second edition: boundaries → activities and events → resources and handoffs → control flow → relevant additional detail, with iteration and review throughout. Chapters 1–4 inform interview preparation, abstraction and modeling patterns. [Read the methodology summary](skills/process-scribe/references/methodology.md).

The application is live at **[senda.hanifcarroll.com](https://senda.hanifcarroll.com)** on Cloudflare Workers, with D1 accounts/revision records, private R2 snapshots and passwordless sign-in emails through Cloudflare Email Service. [Cloudflare deployment and compatibility](docs/cloudflare.md).

## Try the complete example

Requires **Node.js 24** and npm. Clone this repository, then run:

```sh
npm ci
npm test
npm run check
npm run demo
```

The demo creates a private workspace under the ignored `output/` directory and prints links to two local review pages. The first keeps ambiguous sequencing unresolved. The second uses a synthetic clarification to build the model, adds a written walkthrough and a case for review, then reopens the saved database before exporting. Human approvals and scenario confirmation remain pending.

Open the printed `after` path in a browser to explore the diagram, process explanation, actual clarification answer and cases to review. Click a subprocess to open its detail; use breadcrumbs or Parent to return. Zoom, pan, search for a step, or select a task/connection to see supporting quotations and questions. The message list jumps directly to the view containing an exchange. The bundle works offline and includes static SVG views and a BPMN download. Committed examples and tests are synthetic.

For a larger interview with three clarification rounds, run `npm run test:workflow`. It replays a 1,365-word synthetic consultancy-onboarding interview, checking four draft versions. Test output is temporary; use `npm run test:workflow -- --keep-output` to retain the report and diagrams for inspection. It covers parallel Finance/Delivery work, repeated corrections, credit terms, reminders, cancellation/refunds and acknowledged handover. Each CLI command reopens the saved project; assertions check evidence, model changes, stale-edit rejection and the final BPMN structure. All eight message exchanges are drawn across six small views, including outside participants for context. See the [fixture notes](examples/complex-onboarding/README.md) for coverage and limitations.

## Open the web app

```sh
npm run build
npm run serve
```

Open `http://127.0.0.1:3000`. The homepage explains the workflow and links to a public synthetic example. Create an account and private project, paste or upload a text transcript, and use **Connect your agent** to authorize a compatible remote MCP client and download the skill. Agent revisions appear automatically. Save clarification answers, revisit revision history, inspect evidence and export improved BPMN. The app uses **TanStack Start + React**, **shadcn/ui (Radix)** and the Ink + Teal palette. [Hosted architecture, compatibility, limits and deployment](docs/hosted.md).

Each project separates **As-is · Current process** from **To-be · Planned future**. Start a To-be draft from a selected As-is revision and a design brief, then clarify and revise it with your agent. Each model keeps its own sources, questions and revision history; future edits leave the As-is process intact. The plan retains its original baseline when the As-is process changes. [Future-process modeling method](skills/process-scribe/references/planning.md).

For local exported snapshots, use `npm run preview` and open `/local`; the preview keeps those files on loopback and retains existing `/?review=…` links. `PROCESS_SCRIBE_REVIEWS` selects another local export root. Local snapshots use manual agent/CLI updates and exports; hosted projects use the authorized service and do not expose that filesystem library. Exact duplicate exports share one visible version.

The diagram workspace uses the available screen height and can expand to fill the window. Evidence starts collapsed, including when a saved link selects a step. Open **Evidence** explicitly to inspect it; the desktop panel resizes, and the mobile view uses a bottom sheet. Source passages open in a drawer with a direct return to the diagram. Message links say whether they focus a message in this diagram or open a named subprocess or diagram. The URL retains the selected review, section, view and step; session storage remembers the pan and zoom without saving transcript text.

The walkthrough and source screens use narrower reading columns. Open questions appear before answer history; **Copy question**, **Prepare my answer** and **Request a correction** create a manual handoff to the modeling agent. Requests are editable and copied to the clipboard; the app does not send them or record invented approvals. Review checks prioritize the next question or case, with detailed diagram changes collapsed below the business summary.

`npm run dev:hosted` runs the full app in Vite development; `npm run dev` retains local snapshot development. `npm run typecheck` checks the React app after generating the route tree with a build. Portable `review.html` bundles remain available for offline sharing and do not require running the app.

The shared layout pass compares lane/pool display orders, reroutes connections through free space and keeps branch conditions near their decisions. It protects text and pool/lane titles, and never changes responsibility assignments, process behavior or saved project geometry. **Download BPMN** now includes the improved layout in standard BPMN DI. **Download this view** offers an SVG or a standalone BPMN view with the visible outside participants. Fresh bundles retain the exact saved XML as `model-original.bpmn`. Review checks identify views with remaining layout concerns. The complex fixture's crossings and text protection are checked in the regression suite; a cleaner drawing is not a proof of process correctness. See [portable exports and layout research](docs/portable-bpmn.md) and the skill's [all-view readability checklist](skills/process-scribe/references/readability.md).

## Use it with an agent

```sh
npm run install:skill
```

This creates a symlink at `$CODEX_HOME/skills/process-scribe` (normally `~/.codex/skills/process-scribe`), pointing to this checkout. It refuses to replace a different existing skill. Keep the checkout in place. Start a new agent session if the skill is not yet listed.

An example request:

> Use $process-scribe to model this interview as the current process. Ask me about missing decisions and ordering, keep the evidence attached, and give me a diagram to review.

The skill uses the host agent's existing tools and model. It guides discovery; it is not a trained extraction model or a guarantee of semantic accuracy. The application checks evidence references and requires human review before finalization.

## CLI quickstart

These commands run from the checkout. `--project` selects a directory containing a persistent SQLite database. Use an ignored workspace or a private directory for real material.

```sh
node bin/process-scribe.js --project workspaces/booking init \
  --name "Project booking" \
  --purpose "Explain how accepted proposals become bookings" \
  --perspective "Freelancer" \
  --transcript examples/transcript.txt

node bin/process-scribe.js --project workspaces/booking apply --file examples/01-discover.json
node bin/process-scribe.js --project workspaces/booking inspect
node bin/process-scribe.js --project workspaces/booking apply --file examples/02-answer-and-model.json
node bin/process-scribe.js --project workspaces/booking apply --file examples/03-review-context.json
node bin/process-scribe.js --project workspaces/booking validate
node bin/process-scribe.js --project workspaces/booking export
```

Every edit names the revision it was based on. A failed operation, invalid quote or stale revision leaves the previous snapshot intact. Sources cannot be overwritten. Changes to the model or discovery records invalidate prior reviews and scenario feedback; a retained written walkthrough becomes visibly stale until refreshed. Use `history` and `diff --from 1` to inspect the evolution, including readable descriptions of diagram changes.

`schema` prints the proposal schema and Miragon's operation schema; `--help` lists commands. [Command and proposal reference](skills/process-scribe/references/commands.md).

## What the quality report means

| Area | Implemented checks | Still requires judgment |
| --- | --- | --- |
| Structural verification | Miragon validation, parser diagnostics, scope/reference rules and selected compensation checks | Comprehensive BPMN XSD conformance is not claimed |
| Behavioral verification | Two narrow split/join mismatch patterns, including the negative deadlock fixture | General soundness, loops, events, message interactions, condition coverage |
| Semantic validation | Exact quotes and references, open questions/conflicts, source context, abstraction contracts, current/proposed separation | Whether the evidence supports the claims and the model matches the real process completely |
| Readability | Layout metrics, branch labels, routing degree, decomposition suggestions | Wording, vocabulary, granularity, clear handoffs and comprehension by the intended reader |

**A structurally valid model can still be wrong.** Review records cover semantic, behavioral and pragmatic review separately. A human can record approval or request changes; the agent must not invent approval. Approvals are local records, not authenticated identities. `finalize` marks the exact content as **reviewed**, not proven sound, deployment-ready or executable.

The conceptual profile accepts meaningful business-language branch conditions without requiring executable expressions. Intentionally unspecified subprocesses need an explicit reason and input/outcome contract. Compensation handlers use their own association checks rather than ordinary start/end paths. Genuine missing paths and incomplete decisions still prevent finalization.

Use `review-scenario` to record actual human feedback on a saved case. A recorded case must be confirmed before finalization, but creating cases and finalizing the model are optional during draft iteration. A human walkthrough is not an execution simulation.

Readability suggestions are advisory. They should never change real process behavior merely to improve appearance. The selected convention leaves split gateways unlabeled and labels outgoing conditions explicitly; Miragon's conflicting question-name advisory is retained in the report with an explanation of the override.

## Scope of version 0.3

- Transcript-to-diagram discovery and iterative clarification through a local CLI and JavaScript API, with durable revisions and portable review bundles.
- Optional audience/owner context, stakeholder coverage, evidence basis and attribution, conflicts, intentional abstractions, written walkthroughs and concrete review cases.
- Generic descriptive BPMN with the versioned `dumas-conceptual-v2` profile and incomplete drafts. Ordinary paths, accepted abstractions and compensation are assessed separately.
- Imports with parser warnings are rejected to avoid silent data loss. Engine-specific extensions need explicit compatibility work; no promise of arbitrary vendor round trips.
- Event and ad hoc subprocesses can remain drafts but need additional validation support before this profile will finalize them.
- Private account projects, source uploads, agent consent/revocation, authenticated MCP, a shared service API, revision history, automatic refresh and progressive WebMCP browser tools. Separate As-is and To-be models support iterative future-process planning with a pinned baseline. The public deployment uses Cloudflare Workers, D1, private R2 storage and passwordless sign-in emails and optional Google sign-in. Both the Worker and Node adapters support CIMD and dynamic OAuth registration.
- The offline review includes scoped diagrams with outside message participants, subprocess navigation, zoom/pan, search, message links and evidence inspection. Empty subprocesses remain visible as discovery gaps without blank detail views. Static SVGs remain available when scripting is disabled.
- Layout checking does not certify the diagram. The review derives fresh layouts without modifying the project or its evidence. Complete BPMN exports preserve process semantics and carry improved DI; standalone view files contain only their selected scope. Fonts and subprocess context support vary between editors. `quality.json` distinguishes saved-model checks from view geometry and message coverage.
- Version 0.1 project history is preserved without rewriting snapshots. New content revisions use format 2; old profile approvals need fresh feedback under the updated checks.
- Quantitative business analysis, simulation, process mining and workflow execution are outside this release. To-be support focuses on planning, clarifying and revising the future diagram.

The automated suite exercises persistence, atomic failure, stale writes, evidence integrity, old-project compatibility, walkthrough/scenario invalidation, conceptual conditions, abstraction, compensation, hierarchy exports, selected event/repetition fixtures, the CLI and HTML escaping. It is **not an independent LLM evaluation**. Use a real transcript and a clarification round with a process owner to assess discovery quality.

## Data and publication

Local projects remain local. Shared projects are stored in the configured service data directory and accessible to their owner and selected agent connections. Database files, `.env` files, workspaces, exports, output and PDFs are ignored by Git. Reports intentionally contain source quotations and full source text, so review the bundle before sharing it. An ignore file does not prevent someone from explicitly force-adding private material. The public example and marketing screenshots contain only synthetic data.

The textbook PDF, extracts, figures and private experiment notes are not in this repository. The public skill contains an original methodological summary with attribution.

## Implementation and attribution

[Architecture and backend decision](docs/architecture.md) · [Development instructions](CONTRIBUTING.md) · [MIT license](LICENSE)

The implementation pins `@miragon/bpmn-cli` 0.8.0. Third-party dependencies retain their respective licenses. Methodology reference: Marlon Dumas, Marcello La Rosa, Jan Mendling and Hajo A. Reijers (2018), *Fundamentals of Business Process Management*, 2nd ed., Springer, Chapter 5, §§5.3–5.4, pp. 177–193. [DOI](https://doi.org/10.1007/978-3-662-56509-4). This project is independent of the authors and Miragon.
