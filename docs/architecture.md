# Architecture and backend choice

The host agent performs discovery using the skill. It submits structured proposals through the CLI. The service validates evidence references and uses Miragon to apply BPMN operations in memory. It checks the candidate, then appends one snapshot containing both the BPMN XML and the discovery records. `ProjectCore` is shared by local SQLite and Cloudflare D1/R2 storage adapters. Exports are derived from a saved revision.

```text
Interview / documents / clarification answers
                   |
        Host agent + discovery skill
                   |
        Proposal (claims + BPMN edits)
                   |
         CLI / JavaScript Project API
                   |
    Evidence checks + Miragon + quality checks
                   |
      Atomic SQLite revision / human reviews
                   |
        HTML + BPMN + SVG + JSON bundle
```

## Review rendering

Exports derive one view per process overview and nonempty subprocess. `diagram-views.js` builds temporary display projections: local tasks and connections retain their IDs, and external message endpoints are represented by their participant. Each message remains connected to its actual local task. The viewer retains the original sender and recipient for evidence and navigation. Parent views link to nested exchanges instead of drawing invented flows to collapsed subprocess boxes. Events attached to enclosing work remain reachable from child views.

The projections are laid out through Miragon, then passed through `review-layout.js` before rendering. A bounded comparison of at most six display orders considers nearby-role lane arrangements (up to six lanes) and reversed pool order. It preserves lane membership and flow endpoints. The orthogonal router holds node positions and endpoints fixed within each candidate, reserves implicit pool/lane title strips and other labels, and penalizes crossings and bends. Selection cannot introduce new text collisions or other hard geometry defects to reduce crossings. Equal scores favor shorter routes and fewer bends; exact ties retain the original. Branch labels prefer their originating decision's lane. Saved project XML, revisions and evidence remain unchanged.

`bpmn-export.js` transfers only DI from the selected layouts onto a fresh parse of the complete original model. `model.bpmn` includes the improved overview and standard child planes; original nodes, lane memberships, conditions, extensions and message endpoints remain intact. Synthetic view participants/processes and projected message endpoints are never copied into the complete model. Standard child planes omit external context pools/messages for bpmn-js interoperability. Separate `view-*.bpmn` artifacts reproduce each scoped review, with documentation stating the partial scope and original message endpoints. `model-original.bpmn` preserves exact saved bytes. `discovery.json` marks export format 2; library grouping and evidence use that original XML. Legacy bundles continue to load, and their web downloads receive fresh improved DI without rewriting their files. See [portable BPMN and research](portable-bpmn.md).

`quality.json` keeps original-model metrics separately from per-view layout metrics and actual rendered message coverage. Additional display advisories identify title-strip intrusions, distant branch labels and long detours; numeric thresholds are application heuristics. Both HTML and web review checks name affected views; the web app links to them. Geometry uses DI bounds, so actual rendered fonts, clipping, marker legibility and reader comprehension still need visual review. The [readability reference](../skills/process-scribe/references/readability.md) documents the visual sweep, textbook basis, external sources, convention differences and limits.

The HTML bundle embeds a small browser viewer with subprocess navigation, zoom/pan, search, message jumps and element evidence. It has no network dependencies, model-editing operations or execution simulation. A content hash authorizes its exact script; JSON is escaped for the script context and SVG is sanitized before entering the document. Static SVG images/downloads remain available without JavaScript.

## Local snapshot review application

`web/` is a TanStack Start application using React, TanStack Router, Vite, Tailwind and shadcn/ui's Radix components. The route loader calls validated Start server functions to list or read saved review bundles. `src/review-library.js` limits reads to the configured export root, rejects traversal and symlink escapes, and caches at most ten drawing results by model digest. File access, BPMN parsing and layout stay in server code; they are not bundled into the browser. Library metadata includes the process title, revision creation date and change summary. Process grouping uses title, mode, perspective and the initial immutable source digest; exact duplicates additionally match full model/evidence/review content and revision number. Grouping is navigation only and does not merge or delete exports.

The React app owns navigation, selection, evidence, sources, clarifications, walkthroughs and review checks. Validated URL search fields preserve the section, view, selected step and source. Session storage contains only per-view camera coordinates and scale. The diagram remains mounted across section changes; a focus request runs once after navigation, so source visits do not recenter the camera. Evidence is collapsed by default, with a resizable desktop panel and a shadcn bottom sheet on mobile. A small SVG controller owns geometry, hit areas, camera transforms and input handlers inside a React ref; listeners and resize observers are disposed on view changes. Imported SVG passes an element/attribute whitelist before DOM insertion. Source text is rendered as React text. Stale walkthroughs are explicitly withheld from the current review.

Answer and correction dialogs prepare editable requests for manual clipboard transfer to the host agent. The app does not send messages or append model changes or human approvals. Review cases and automation findings remain distinct, and the detailed model diff is disclosed separately from the revision summary.

Local snapshot mode runs on loopback and reads exported revisions. New CLI revisions must be exported and selected in that library. The page-header BPMN download uses fresh portable DI; the view download dialog offers SVG and standalone BPMN. The offline bundle remains a portable fallback with its own content security policy. Hosted account projects use the authorized service described below and do not expose the local filesystem library.

The app uses a fixed Neutral semantic palette defined in its stylesheet. It does not read previous browser theme preferences or encode process meaning in color. Component sources are checked in under `web/components/ui`; `components.json` declares the Radix Nova style and utility aliases.

## Why Miragon here

The selected product centers on an agent's discovery workflow. Miragon already provides native operations, atomic operation batches, incremental layout, validation and rendering through a JavaScript library as well as a CLI. This application calls the library, avoiding subprocess parsing for model edits. It retains the standard BPMN artifact as the model representation.

BPMN Kit remains a plausible alternative for a product needing deeper ownership of an integrated model SDK and editor. Both candidates have programmatic APIs, so “CLI versus SDK” is not a sufficient distinction. The choice here is the specific existing operation/validation/layout pipeline and the smaller amount of integration needed for this initial workflow. It is not a general claim that Miragon is always better.

The earlier comparison environments and exploratory output are not product dependencies. Only reusable synthetic regression fixtures remain. This repository's tests are the evidence for the behavior of this implementation; they do not reproduce every comparison with another library.

## Persistence and concurrency

The project database has append-only revisions containing a complete JSON snapshot and its digest. The JSON contains standard BPMN XML, context, source passages and attribution, claims, questions, vocabulary, stakeholder coverage, conflicts, abstraction contracts, walkthroughs, scenarios, review records and status. Source IDs cannot be overwritten through the service. Revision triggers prevent accidental SQL updates/deletes; the digest detects ordinary corruption, not malicious modification by someone with full filesystem access.

The SQLite schema remains version 1. Snapshot formats 1 and 2 are readable without rewriting prior rows. New content revisions use format 2. Optional discovery collections are absent or empty in old projects; an ordinary read/export does not migrate them or fabricate metadata. Newer snapshot versions are rejected.

Each mutation requires `expectedRevision`. A write transaction takes a SQLite lock, rechecks that revision, and appends exactly one snapshot. Candidate generation happens outside the lock; the final compare-and-swap prevents competing writers from losing a newer revision. The application must reread after a stale request. The core `Project` library has no identity boundary; the hosted adapter checks ownership and agent grants before opening it.

Model content and discovery data determine a content digest. Overall and scenario reviews refer to that digest and the `dumas-conceptual-v2` quality profile. Adding feedback does not invalidate other feedback; changing the model or discovery content does. Legacy approvals without this profile binding are historical feedback, not current approval. Finalization is a local reviewed state with no relation to deployment or process execution.

The written walkthrough has its own basis digest over the model and discovery inputs, excluding the walkthrough itself. An atomic proposal can update the model, evidence, scenarios and walkthrough together. Retaining an old walkthrough after changing its basis marks it stale; export labels and collapses that old text. Stale walkthrough references may point to historical elements, while newly supplied/current walkthroughs must reference current elements and claims. Refreshing identical text against an unchanged basis is a no-op.

Scenario descriptions are content. Their feedback is separate revision-bound review data. Scenario confirmation is an explicit human attestation, not simulated execution, and does not grant overall review approval. Recorded scenarios must be confirmed before finalization; neither scenarios nor finalization are required for draft editing.

## Boundaries

- **Miragon:** generic BPMN operations, XML handling, layout, structural diagnostics, SVG rendering.
- **Senda:** durable projects, evidence and conflict references, clarification state, explicit abstraction, revision concurrency, conceptual quality profile, scenario/walkthrough freshness, human feedback and report generation.
- **Host agent:** interviewing, extraction, interpretation, useful questions, proposed changes and communication.
- **Process owner / intended reader:** truth, completeness, scenario review and comprehensibility.

Metadata is stored beside the BPMN, not embedded into arbitrary BPMN extensions. Export the complete bundle if provenance matters. Editing the BPMN in another tool is supported only through an explicit import back into the project. Unsupported parser warnings stop the import; the application does not promise lossless support for every engine extension.

## Hosted account projects and agent adapters

`server/` provides one shared authenticated request handler. The Node adapter wraps local `Project` databases; the Cloudflare adapter wraps the same `ProjectCore` using D1 metadata and private R2 snapshots. Better Auth supplies accounts, sessions and resource-bound OAuth; a durable catalog maps opaque IDs to private local project databases. The HTTP API, official SDK MCP endpoint and progressive active-project WebMCP tools all use that service. Expected revisions, source/reference validation and atomic saves remain in the existing core. Agent tools cannot record human approval. The app persists uploads and clarification answers, offers saved revisions and detects agent updates without requiring a new manual export. Local file-server functions are disabled on the hosted deployment. The public example is a separate generated synthetic fixture.

A private project has an As-is model and an optional To-be model with separate snapshot histories. Node stores them in separate `Project` databases; Cloudflare stores revision metadata in D1 and immutable snapshot content in private R2. The catalog pins the To-be model to a specific As-is revision and content digest. Creation copies validated BPMN as an unconfirmed baseline plus a design brief; claims, walkthroughs, scenarios, questions and reviews remain separate. Each model owns its history and expected revision. Renderer and camera keys include the model so identical BPMN IDs and revision numbers cannot mix views. Remote tools require a model argument; native browser tools bind to the active UI model and reject an override. Later As-is revisions never silently rebase a plan. See the [planning method](../skills/process-scribe/references/planning.md).

The public Senda marketing page uses real application screenshots. Production runs on Cloudflare Workers at `senda.hanifcarroll.com`, with D1 accounts/catalog/revision records, private R2 snapshots and Email Service. The local Node service remains available. See [Cloudflare storage and concurrency](cloudflare.md), [hosted configuration and verification boundaries](hosted.md) and [marketing design/provenance](marketing-design.md). A custom editor, billing, execution engine and broader process analytics remain outside this workflow.

## Verification scope

The behavioral checks intentionally recognize only simple branch paths. They do not explore general token states or evaluate conditions. Graph reachability is a useful prerequisite, not proof that a node can execute. Business-language branch labels satisfy conceptual condition presence; executable expression validation is outside the product. A deliberately empty ordinary subprocess needs an explicit abstraction contract to omit internal path requirements. Compensation handlers are associated with their boundary events and checked outside ordinary sequence flow. The finalization profile excludes event/ad hoc subprocesses until specialized checks are added.

Readability metrics are indicators. Missing names, generic branch labels, high routing degree and large scopes receive suggestions, while wording and audience comprehension remain human review. The review bundle presents actual answers, written explanations, readable changes and available child diagram planes before technical details. Source content is escaped in HTML; diagrams are embedded as SVG images rather than executable inline markup, with a restrictive content policy and no remote resources. The renderer's drawing notes remain available when a plane omits or cannot draw content.
