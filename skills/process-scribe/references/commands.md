# Command and proposal reference

The skill lives inside the companion repository. Run `node <skill-directory>/scripts/run.mjs` or, from the repository, `node bin/process-scribe.js`. Node.js 24 and `npm ci` are required. Commands below omit that prefix.

## Read and create

```sh
--project /private/path/booking init --name "Booking" --purpose "Explain booking" --perspective "Freelancer" --transcript /private/path/interview.txt
--project /private/path/booking inspect
--project /private/path/booking inspect --revision 2
--project /private/path/booking status
--project /private/path/booking history
--project /private/path/booking diff --from 1
schema
```

`init --mode proposed` creates a separate proposed-state project. The default is `current`. The initial transcript is `Source_Transcript`. Every nonempty line has its original line number and a stable `line-N` segment ID; blank lines are omitted from the segment list without renumbering. Preserve exact wording when citing evidence.

`inspect` returns the discovery records and a compact model element list. `read()` in the JS library also returns the XML. `schema` is authoritative for both proposal fields and Miragon operations. Runtime validation additionally checks cross-record references and quote existence; not every semantic refinement can be expressed in the JSON schema.

## Apply a proposal

```sh
--project /private/path/booking apply --file /private/path/proposal.json
```

The minimum proposal is:

```json
{ "expectedRevision": 1, "summary": "Record discovery findings" }
```

Optional fields:

| Field | Meaning |
| --- | --- |
| `context` | Patch `purpose`, `perspective`, `trigger`, `outcomes`, `scopeNotes`, or optional `audience`, `owner`, `customer`, `detailLevel` (`overview`/`operational`). The only profile is `dumas-conceptual-v2`. |
| `stage` | `boundaries`, `activities`, `responsibilities`, `control-flow`, `additional-detail`, `quality-review` |
| `sources` | Append immutable `{id,title,kind,text}` records; kind is `transcript`, `answer`, `document` or `observation`. Optional `origin`, `contributor`, `collectedOn` (YYYY-MM-DD), `period`, `coverage`. |
| `claims` | Upsert complete claim records by ID |
| `questions` | Upsert complete question records by ID |
| `removeClaimIds`, `removeQuestionIds` | Explicitly remove obsolete records from the current view; prior revisions retain them |
| `glossary` | Replace the current list of `{term,definition,aliases}` entries |
| `abstractions` / `removeAbstractionIds` | Upsert/remove `{id,elementId,reason,inputs,outcomes}`. Inputs/outcomes are nonempty text arrays; target must be an empty ordinary subprocess. |
| `stakeholders` / `removeStakeholderIds` | Upsert/remove `{id,role,scope,status,sourceIds,notes}`. Status: `not-consulted`, `consulted` (needs sources), `not-needed` (needs a reason in notes). |
| `conflicts` / `removeConflictIds` | Upsert/remove `{id,description,claimIds,status,resolution,evidence}`. At least two distinct claims; status `open` or `resolved`. Resolution needs an explanation and exact source evidence. |
| `scenarios` / `removeScenarioIds` | Upsert/remove `{id,title,kind,given,expectedOutcome,elementIds,evidence}`. Kind: `normal`, `alternative`, `parallel`, `rework`, `exception`, `message`, `other`. At least one model element; evidence is optional. |
| `walkthrough` | Replace with `{steps:[{id,text,elementIds,claimIds}]}`; every step needs a model or claim link. Use `null` to remove. Omit to retain it, possibly stale after edits. Its binding fields are application-owned. |
| `operations` | Native Miragon operations; use the emitted operation schema |
| `layout` | `incremental` (default) or `full`, applied when operations are present |

A claim contains `id`, `statement`, `kind`, `status`, `state`, `evidence`, `elementIds` and optional `rationale`. Kinds: `boundary`, `activity`, `event`, `responsibility`, `handoff`, `order`, `condition`, `exception`, `artifact`. Status is `supported`, `inferred`, `disputed`, or `unknown`. State defaults to `current`; explicitly set `proposed` in proposed-state projects. Each evidence entry is `{sourceId,segmentId,quote}` with optional `basis`: `reported`, `observed`, `prescribed`, or `derived`. Supported and inferred claims require evidence; inferred claims also require a rationale. Multiple claims can cite the same segment. All linked BPMN IDs must exist after the edits, and linked claims must match the project state.

A question contains `id`, `question`, `why`, `blocking` (default true), `status` (default `open`), `claimIds` and `elementIds`. Status can be `open`, `answered` or `deferred`. An answered question requires `answerSourceId`, pointing to a source of kind `answer`. Optional `answerEvidence` selects exact excerpts from that same answer source; otherwise the page shows the source's full text. A deferred blocking question still blocks finalization. Upserting any record replaces that complete record; omitted arrays receive their defaults. Omit the collection itself to preserve existing entries.

Example activity operation with evidence:

```json
{
  "expectedRevision": 1,
  "summary": "Record the supported activity without inventing its order",
  "claims": [{
    "id": "C_Check", "statement": "The clerk checks the application",
    "kind": "activity", "status": "supported", "state": "current",
    "evidence": [{"sourceId":"Interview","segmentId":"line-3","quote":"I check the application"}],
    "elementIds": ["Task_Check"]
  }],
  "operations": [{"op":"add","kind":"task","id":"Task_Check","name":"Check application"}]
}
```

This example assumes the cited source exists. It produces an incomplete draft and does not fabricate an ordering or completion. For a complete runnable fixture, use `examples/01-discover.json` and `examples/02-answer-and-model.json` in the companion repository.

Claims, questions, scenarios and walkthrough steps can use operation aliases in `elementIds`; abstractions can use one in `elementId`. Explicit stable IDs are easier to inspect. No API key or network LLM is called by `apply`. See `examples/03-review-context.json` for a complete walkthrough, stakeholder record and scenario applied after the two modeling examples.

Walkthroughs are bound to the model and discovery content excluding the walkthrough itself. Changing those inputs without supplying a refreshed walkthrough marks it stale; the old text is retained as explicitly outdated. Scenario reviews and overall reviews do not change that binding. Live claims, questions, scenarios and abstraction references must remain valid after edits. A stale walkthrough can retain historical references while it waits to be replaced.

## Validate, review and export

```sh
--project /private/path/booking validate
--project /private/path/booking export --out /private/path/review-v3
--project /private/path/booking review --expected-revision 3 --aspect semantic --outcome approved --reviewer "Process owner" --notes "Actual feedback and its scope"
--project /private/path/booking review-scenario --expected-revision 4 --scenario Case_Booking --outcome confirmed --reviewer "Process owner" --notes "Actual case walkthrough feedback"
--project /private/path/booking finalize --expected-revision 6
```

These commands illustrate syntax, not permission to fabricate approval. Use the actual current revision, not the illustrative numbers. Each review appends a revision; review aspects are `semantic`, `behavioral` and `pragmatic`, and outcomes are `approved` or `needs_changes`. Scenario outcomes are `confirmed` or `needs_changes`. Feedback binds to the content digest and quality profile; subsequent content changes invalidate both kinds of feedback. Scenario confirmation does not approve the three overall aspects.

Finalization requires structural checks and the blocking deadlock-pattern check to pass; complete boundaries and appropriate paths; supported claims for business nodes and flows; no in-scope uncertainty, open conflicts or unanswered blocking questions; no stale walkthrough; confirmation of any recorded scenarios; and approval of all three review aspects. Conceptual branch labels can supply conditions. Explicit abstractions and compensation use specialized checks. Scenario records and a written walkthrough are optional during discovery. Parallel-to-exclusive merging and readability advice remain advisory. Finalization records `reviewed`, not formal soundness or execution readiness.

An export is an immutable bundle in a new directory containing `review.html`, `model.bpmn`, `diagram.svg`, `diagrams.json`, `discovery.json`, `quality.json`, `history.json` and `changes.json`, plus numbered SVG files for additional diagram planes. Source text is included. The page shows the latest content change and expandable child diagrams. `diff` includes readable `model.descriptions` alongside element IDs. Existing output directories are not overwritten. Export after each important revision rather than editing generated files in place.

Version 0.1 projects open without rewriting historical snapshots or source records. New content revisions use snapshot format 2 in the same database. Legacy reviews without the new quality-profile binding need fresh feedback before finalization. Use version 0.2 or later for projects once new format-2 revisions have been saved.

Import an external editor's result with:

```sh
--project /private/path/booking import --file /private/path/edited.bpmn --expected-revision 3 --summary "Human editor adjustments"
```

Import requires compatible BPMN without parser warnings. Missing diagram coordinates are laid out. Existing IDs retain their evidence links; an import removing linked elements is rejected. Reconcile references explicitly before importing that change, preserving the history. A changed import invalidates reviews.

Successful commands write JSON to stdout. Failures write an error object to stderr and exit 1. `validate` exits 2 for structural failures or a blocking deadlock finding; advisory behavior findings, unresolved discovery work and missing reviews are reported in the JSON without making ordinary draft validation an execution failure. CLI help/version produce plain text.

## JavaScript API

```js
import { Project, exportBundle } from './src/index.js';
const project = new Project('/private/path/booking');
try {
  const current = await project.inspect();
  const quality = await project.validate();
  // await project.apply({ expectedRevision: current.revision, summary: '...', ... });
  const report = await exportBundle(project, '/private/path/review-v4');
} finally {
  project.close();
}
```

`Project.create(directory, options)` returns an open project; close it when done. `project.reviewScenario({expectedRevision,scenarioId,outcome,reviewer,notes})` records human case feedback. The same service could support future MCP or HTTP adapters; those transports are outside this release.
