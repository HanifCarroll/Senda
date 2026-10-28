# Review a diagram and incorporate the next answer

## Prepare a readable version

Export from a saved revision and inspect the actual diagram, including available child diagrams. Add a `walkthrough` with short business-language steps linked to claims and model elements. State conditions, parallel work, waiting and exceptional outcomes explicitly. An ordered list of paragraphs must not suggest sequential execution where work is parallel or alternative.

Use [readability.md](readability.md) for the all-view visual sweep, the app's layout safeguards and their limits. In particular, a lower crossing count cannot justify text collisions, hidden messages or changed responsibility assignments. Repeat the sweep after a broad layout change.

The offline review is interactive: open subprocesses, return with breadcrumbs, zoom/pan, search for steps, and select a task or connection to inspect its source evidence. Use the message list to jump to the detail containing an exchange. Each detail includes outside participants for context, while its evidence panel retains the original sender and recipient. Links to events on enclosing work preserve deadline/withdrawal context. These are read-only views, not model edits or execution traces.

The TanStack Start web app offers the same review data with shadcn controls. Run `npm run dev` from the checkout, choose a process and a dated exported revision, and use its diagram, walkthrough, clarification, source and review-check tabs. The library defaults to `output/`; `PROCESS_SCRIBE_REVIEWS` selects another export root. After a clarification, export a fresh snapshot and refresh the library. Evidence starts collapsed; open it explicitly after selecting a step. The app preserves the view, selection, pan and zoom when following source passages. Keep clarification answers, corrections and review feedback in the ongoing agent conversation; users do not need generated prompts or copy-and-paste handoffs. In hosted projects an answer can also be saved directly beside its question, then read by the agent before revising. Continue to apply evidence and model changes atomically through the connected tools or local CLI. The shared layout pass reduces measured crossings without changing saved model behavior. The fixed palette affects presentation only.

Check the export's message coverage and inspect both directions of each material exchange. The overview links to nested messages rather than moving their endpoints onto collapsed subprocess boxes. Do not treat a participant shown for context as a discovery claim about its internal process. The complete BPMN download preserves the process definitions and uses the improved layout. Its standard subprocess planes omit outside-pool context for editor compatibility. Use the separate standalone BPMN view when that context matters; it contains only the selected scope and documents original message endpoints. Do not import a standalone view as if it were the complete model. Fresh bundles also include `model-original.bpmn` with exact saved bytes. Inspect editor imports because fonts and subprocess support vary. Layout and coverage are reported separately in `quality.json`.

Do not invent narrative details to make the account smoother. A model element link makes a statement traceable, not true. Claim links expose its supporting quotations. The app binds the walkthrough to the model and discovery content; after a change, refresh it in the same proposal or let it be visibly marked stale. A stale walkthrough blocks finalization, and can be explicitly removed with `walkthrough: null` when no longer wanted.

## Ask the reader to check cases

Save a few relevant `scenarios` with a starting situation, expected outcome, model-element links and optional source evidence. Include normal completion and material alternatives, parallel completion, rework exit, late/missing messages, interruptions and exceptions. Choose cases for this model instead of inventing examples for every BPMN construct.

Ask an informed participant to explain how a case proceeds. Check who acts, what enables the next activity, whether branches wait correctly, and what marks the outcome. Record the actual feedback using `review-scenario`. A confirmed scenario is a human walkthrough of the specified content, not a simulated trace. Unchecked or failed recorded scenarios block finalization; scenario records themselves are optional during discovery.

Record accuracy (`semantic`), behavior (`behavioral`), and clarity (`pragmatic`) feedback with `review` when the human has provided it. Scenario confirmation does not silently grant these approvals. A content change invalidates all current feedback; earlier feedback stays in revision history. Drafts remain useful and editable without finalization.

## Apply a clarification

1. Inspect the current revision and the affected source passages, claims, questions and model elements.
2. Add the answer as a new immutable source. Use `answerEvidence` to select exact relevant excerpts when that source addresses several questions.
3. Update claims and question/conflict status only as far as the answer supports. Update the corresponding diagram, scenario expectations and walkthrough in the same proposal when they change together.
   Refresh earlier claim wording that still calls a now-resolved rule unknown. Preserve the earlier source and historical revision; do not overwrite evidence or leave the current inspector describing an obsolete gap.
4. Validate and inspect the rendered result. Preserve stable IDs and prefer incremental layout unless the structure needs broader reorganization.
5. Present the actual answer, what changed, the updated diagram, and remaining questions. Keep raw question/source/element identifiers inside supporting details.

Use `diff` for readable model changes and the proposal `summary` for the business reason. A failed operation or stale revision leaves the current project intact. Re-read and reconcile after a stale-write error; do not replay blindly with a new revision number.

## What counts as completion

The requested outcome can be a useful draft with explicit open questions. When a fully reviewed model is requested, address the app's checks, resolve in-scope uncertainty and conflicts, refresh a stale walkthrough, confirm any recorded scenarios, and obtain the three human assessments. Do not treat a valid quotation, a clean layout, or a library success result as proof of a complete and correct process.

Basis: Dumas et al. (2018), §5.1 and §5.4, printed pp. 160–164 and 183–193, with case semantics from Chapters 3–4. Revision hashes and record structures are application design choices.
