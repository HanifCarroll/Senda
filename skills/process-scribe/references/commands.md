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
| `context` | Patch `purpose`, `perspective`, `trigger`, `outcomes`, or `scopeNotes` |
| `stage` | `boundaries`, `activities`, `responsibilities`, `control-flow`, `additional-detail`, `quality-review` |
| `sources` | Append immutable `{id,title,kind,text}` records; kind is `transcript`, `answer`, or `document` |
| `claims` | Upsert complete claim records by ID |
| `questions` | Upsert complete question records by ID |
| `removeClaimIds`, `removeQuestionIds` | Explicitly remove obsolete records from the current view; prior revisions retain them |
| `glossary` | Replace the current list of `{term,definition,aliases}` entries |
| `operations` | Native Miragon operations; use the emitted operation schema |
| `layout` | `incremental` (default) or `full`, applied when operations are present |

A claim contains `id`, `statement`, `kind`, `status`, `state`, `evidence`, `elementIds` and optional `rationale`. Kinds: `boundary`, `activity`, `event`, `responsibility`, `handoff`, `order`, `condition`, `exception`, `artifact`. Status is `supported`, `inferred`, `disputed`, or `unknown`. State defaults to `current`; explicitly set `proposed` in proposed-state projects. Each evidence entry is `{sourceId,segmentId,quote}`. Supported and inferred claims require evidence; inferred claims also require a rationale. Multiple claims can cite the same segment. All linked BPMN IDs must exist after the edits, and linked claims must match the project state.

A question contains `id`, `question`, `why`, `blocking` (default true), `status` (default `open`), `claimIds` and `elementIds`. Status can be `open`, `answered` or `deferred`. An answered question requires `answerSourceId`, pointing to a source of kind `answer`. A deferred blocking question still blocks finalization. Updating a claim or question replaces that complete record; omitted optional arrays receive their default empty value.

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

Claims can use operation aliases in `elementIds`; the application resolves the aliases returned by Miragon before saving. Explicit stable IDs are easier to inspect. No API key or network LLM is called by `apply`.

## Validate, review and export

```sh
--project /private/path/booking validate
--project /private/path/booking export --out /private/path/review-v3
--project /private/path/booking review --expected-revision 3 --aspect semantic --outcome approved --reviewer "Process owner" --notes "Actual feedback and its scope"
--project /private/path/booking finalize --expected-revision 6
```

The review command is an example of syntax, not permission to fabricate approval. Use the actual current revision. Each review appends a revision; review aspects are `semantic`, `behavioral` and `pragmatic`, and outcomes are `approved` or `needs_changes`. Approvals bind to a digest of the model plus discovery records, so subsequent changes invalidate all three.

Finalization requires structural checks and the blocking deadlock-pattern check to pass; complete boundaries and graph paths; supported claims for business nodes and flows; no in-scope uncertain claims or unanswered blocking questions; and approval of all three review aspects. Parallel-to-exclusive merging and readability advice remain advisory because the intended behavior matters. Finalization records `reviewed`, not formal soundness or execution readiness.

An export is an immutable bundle in a new directory containing `review.html`, `model.bpmn`, `diagram.svg`, `discovery.json`, `quality.json` and `history.json`. Source text is included. Existing output directories are not overwritten. Export after each important revision rather than editing generated files in place.

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

`Project.create(directory, options)` returns an open project; close it when done. The same service could support future MCP or HTTP adapters, but those transports are not part of version 0.1.
