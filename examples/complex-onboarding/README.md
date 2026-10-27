# Complex onboarding workflow fixture

This is an original synthetic interview with fictional participants and three scripted clarification rounds. It contains no real client information or genuine human review approvals.

Run `npm run test:workflow` from the repository root with Node 24. Each run creates a fresh ignored directory under `output/`, prints its location, and saves a report, proposals, CLI results and four review bundles. The final draft remains unapproved.

The rounds are:

1. Extract an incomplete draft with seven specific questions and a policy/practice disagreement. Do not invent the missing sequence or pretend that empty subprocesses are deliberate abstractions.
2. Establish parallel Finance and Delivery work, their join before setup, and the distinction between a tentative calendar hold and kickoff.
3. Add a noninterrupting payment reminder and readiness-wide interruption on deadline or withdrawal, followed by conditional refund and cancellation.
4. Resolve approved credit terms, plan revision and access-recheck loops, then require Client Success acceptance before closing the record.

The script calls the actual CLI in separate processes for initialization, edits, inspection, validation, export and differences. It checks stable element IDs, immutable sources, selected answer passages, fresh walkthroughs, persisted revisions and atomic rejection of stale/invalid edits. It inspects the resulting BPMN graph and event properties against the intended scenarios. Twelve saved scenarios are available for later human walkthrough.

`proposals.js` contains agent-authored modeling decisions and exact source quotations. It is a deterministic replay of this discovery exercise, not a transcript parser, autonomous clarification agent, independent LLM benchmark or BPMN execution engine. The checks do not prove general soundness or model real-world timer races.

Known drawing limitations found by this fixture:

- Native drawings omit message flows whose task endpoint is inside a collapsed subprocess. The review now creates a small view for each scope, with the outside participant shown beside the actual local task. The replay verifies that all eight messages are drawn across six views. Parent diagrams offer links to nested messages instead of pretending those messages connect to the collapsed subprocess itself.
- Miragon does not create lanes inside subprocesses. The overview uses internal-role lanes; named Finance and Delivery subprocesses and evidence make their detailed responsibilities explicit.
- Layout metrics and a generated SVG are not proof of legibility. Inspect the exported diagrams and review page in a browser before sharing or approving them.

The review viewer supports subprocess navigation, breadcrumbs, zoom/pan, search, direct message jumps, evidence inspection, and links back to events on enclosing work. Static downloads remain available. These interactions inspect a saved revision; they do not edit or execute it.

The test deliberately leaves all human review and scenario confirmation records empty. Synthetic answers resolve test discovery questions; they do not establish that a real process owner approved the model.
