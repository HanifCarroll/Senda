# Architecture and backend choice

The host agent performs discovery using the skill. It submits structured proposals through the CLI. The service validates evidence references and uses Miragon to apply BPMN operations in memory. It checks the candidate, then writes a single SQLite snapshot containing both the BPMN XML and the discovery records. Exports are derived from a saved revision.

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

## Why Miragon here

The selected product centers on an agent's discovery workflow. Miragon already provides native operations, atomic operation batches, incremental layout, validation and rendering through a JavaScript library as well as a CLI. This application calls the library, avoiding subprocess parsing for model edits. It retains the standard BPMN artifact as the model representation.

BPMN Kit remains a plausible alternative for a product needing deeper ownership of an integrated model SDK and editor. Both candidates have programmatic APIs, so “CLI versus SDK” is not a sufficient distinction. The choice here is the specific existing operation/validation/layout pipeline and the smaller amount of integration needed for this initial workflow. It is not a general claim that Miragon is always better.

The earlier comparison environments and exploratory output are not product dependencies. Only reusable synthetic regression fixtures remain. This repository's tests are the evidence for the behavior of this implementation; they do not reproduce every comparison with another library.

## Persistence and concurrency

The project database has append-only revisions containing a complete JSON snapshot and its digest. The JSON contains standard BPMN XML, context, source passages and attribution, claims, questions, vocabulary, stakeholder coverage, conflicts, abstraction contracts, walkthroughs, scenarios, review records and status. Source IDs cannot be overwritten through the service. Revision triggers prevent accidental SQL updates/deletes; the digest detects ordinary corruption, not malicious modification by someone with full filesystem access.

The SQLite schema remains version 1. Snapshot formats 1 and 2 are readable without rewriting prior rows. New content revisions use format 2. Optional discovery collections are absent or empty in old projects; an ordinary read/export does not migrate them or fabricate metadata. Newer snapshot versions are rejected.

Each mutation requires `expectedRevision`. A write transaction takes a SQLite lock, rechecks that revision, and appends exactly one snapshot. Candidate generation happens outside the lock; the final compare-and-swap prevents competing writers from losing a newer revision. The application must reread after a stale request. There is no distributed service, identity provider or authorization boundary here.

Model content and discovery data determine a content digest. Overall and scenario reviews refer to that digest and the `dumas-conceptual-v2` quality profile. Adding feedback does not invalidate other feedback; changing the model or discovery content does. Legacy approvals without this profile binding are historical feedback, not current approval. Finalization is a local reviewed state with no relation to deployment or process execution.

The written walkthrough has its own basis digest over the model and discovery inputs, excluding the walkthrough itself. An atomic proposal can update the model, evidence, scenarios and walkthrough together. Retaining an old walkthrough after changing its basis marks it stale; export labels and collapses that old text. Stale walkthrough references may point to historical elements, while newly supplied/current walkthroughs must reference current elements and claims. Refreshing identical text against an unchanged basis is a no-op.

Scenario descriptions are content. Their feedback is separate revision-bound review data. Scenario confirmation is an explicit human attestation, not simulated execution, and does not grant overall review approval. Recorded scenarios must be confirmed before finalization; neither scenarios nor finalization are required for draft editing.

## Boundaries

- **Miragon:** generic BPMN operations, XML handling, layout, structural diagnostics, SVG rendering.
- **Process Scribe:** durable projects, evidence and conflict references, clarification state, explicit abstraction, revision concurrency, conceptual quality profile, scenario/walkthrough freshness, human feedback and report generation.
- **Host agent:** interviewing, extraction, interpretation, useful questions, proposed changes and communication.
- **Process owner / intended reader:** truth, completeness, scenario review and comprehensibility.

Metadata is stored beside the BPMN, not embedded into arbitrary BPMN extensions. Export the complete bundle if provenance matters. Editing the BPMN in another tool is supported only through an explicit import back into the project. Unsupported parser warnings stop the import; the application does not promise lossless support for every engine extension.

## Future adapters

An MCP server or HTTP endpoint can wrap `Project` methods after the local workflow is validated. Such an adapter would need project selection, credentials and authorization where appropriate, request limits, concurrent-client behavior, and transport-specific error handling. It should preserve the revision requirement and atomic model/evidence updates. A custom editor or execution engine is a separate product decision.

## Verification scope

The behavioral checks intentionally recognize only simple branch paths. They do not explore general token states or evaluate conditions. Graph reachability is a useful prerequisite, not proof that a node can execute. Business-language branch labels satisfy conceptual condition presence; executable expression validation is outside the product. A deliberately empty ordinary subprocess needs an explicit abstraction contract to omit internal path requirements. Compensation handlers are associated with their boundary events and checked outside ordinary sequence flow. The finalization profile excludes event/ad hoc subprocesses until specialized checks are added.

Readability metrics are indicators. Missing names, generic branch labels, high routing degree and large scopes receive suggestions, while wording and audience comprehension remain human review. The review bundle presents actual answers, written explanations, readable changes and available child diagram planes before technical details. Source content is escaped in HTML; diagrams are embedded as SVG images rather than executable inline markup, with a restrictive content policy and no remote resources. The renderer's drawing notes remain available when a plane omits or cannot draw content.
