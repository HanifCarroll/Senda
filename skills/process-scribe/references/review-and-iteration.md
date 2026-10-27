# Review a diagram and incorporate the next answer

## Prepare a readable version

Export from a saved revision and inspect the actual diagram, including available child diagrams. Add a `walkthrough` with short business-language steps linked to claims and model elements. State conditions, parallel work, waiting and exceptional outcomes explicitly. An ordered list of paragraphs must not suggest sequential execution where work is parallel or alternative.

Do not invent narrative details to make the account smoother. A model element link makes a statement traceable, not true. Claim links expose its supporting quotations. The app binds the walkthrough to the model and discovery content; after a change, refresh it in the same proposal or let it be visibly marked stale. A stale walkthrough blocks finalization, and can be explicitly removed with `walkthrough: null` when no longer wanted.

## Ask the reader to check cases

Save a few relevant `scenarios` with a starting situation, expected outcome, model-element links and optional source evidence. Include normal completion and material alternatives, parallel completion, rework exit, late/missing messages, interruptions and exceptions. Choose cases for this model instead of inventing examples for every BPMN construct.

Ask an informed participant to explain how a case proceeds. Check who acts, what enables the next activity, whether branches wait correctly, and what marks the outcome. Record the actual feedback using `review-scenario`. A confirmed scenario is a human walkthrough of the specified content, not a simulated trace. Unchecked or failed recorded scenarios block finalization; scenario records themselves are optional during discovery.

Record accuracy (`semantic`), behavior (`behavioral`), and clarity (`pragmatic`) feedback with `review` when the human has provided it. Scenario confirmation does not silently grant these approvals. A content change invalidates all current feedback; earlier feedback stays in revision history. Drafts remain useful and editable without finalization.

## Apply a clarification

1. Inspect the current revision and the affected source passages, claims, questions and model elements.
2. Add the answer as a new immutable source. Use `answerEvidence` to select exact relevant excerpts when that source addresses several questions.
3. Update claims and question/conflict status only as far as the answer supports. Update the corresponding diagram, scenario expectations and walkthrough in the same proposal when they change together.
4. Validate and inspect the rendered result. Preserve stable IDs and prefer incremental layout unless the structure needs broader reorganization.
5. Present the actual answer, what changed, the updated diagram, and remaining questions. Keep raw question/source/element identifiers inside supporting details.

Use `diff` for readable model changes and the proposal `summary` for the business reason. A failed operation or stale revision leaves the current project intact. Re-read and reconcile after a stale-write error; do not replay blindly with a new revision number.

## What counts as completion

The requested outcome can be a useful draft with explicit open questions. When a fully reviewed model is requested, address the app's checks, resolve in-scope uncertainty and conflicts, refresh a stale walkthrough, confirm any recorded scenarios, and obtain the three human assessments. Do not treat a valid quotation, a clean layout, or a library success result as proof of a complete and correct process.

Basis: Dumas et al. (2018), §5.1 and §5.4, printed pp. 160–164 and 183–193, with case semantics from Chapters 3–4. Revision hashes and record structures are application design choices.
