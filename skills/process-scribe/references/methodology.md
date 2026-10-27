# Discovery method and quality profile

This is an original implementation-oriented summary of Dumas, La Rosa, Mendling and Reijers (2018), *Fundamentals of Business Process Management*, second edition, Chapter 5. The five-stage method is in §5.3 (pp. 177–182); the quality discussion is in §5.4 (pp. 183–193). [Publisher DOI](https://doi.org/10.1007/978-3-662-56509-4).

The book is not bundled. The software and examples do not reproduce its figures or worked examples.

## Five stages

| Stage | What to establish | Useful handoff to the next stage |
| --- | --- | --- |
| 1. Boundaries | The viewpoint, why the model is needed, what initiates the process, its possible outcomes, relevant inputs/outputs and exclusions | A short scope statement; triggers and outcomes; questions about gaps |
| 2. Activities and events | The main work and significant things that happen; enough detail for the modeling purpose | A vocabulary of activities and events with supporting evidence |
| 3. Resources and handoffs | Who performs each activity; internal responsibilities; external participants and exchanged messages | Ownership and handoff claims; candidate lanes and pools |
| 4. Control flow | What precedes what; alternatives and their conditions; independent work; repetitions and rework | An evidenced routing structure, with unanswered ordering questions preserved |
| 5. Additional detail | Relevant documents/data, exceptional paths, timing and other details needed for the purpose | A usable draft plus explicit limits and remaining questions |

This method is iterative. Later discoveries can revise earlier boundaries or activities. Experienced modelers may work through resources and control flow together. Detail should follow the intended use of the model; adding every available BPMN construct is not the objective.

The application adds an evidence ledger, immutable source records, revisions and a current/proposed distinction. These are implementation choices serving this product, not features attributed to the textbook's five-stage procedure.

## Quality review

### Syntactic quality: verification

Structural rules concern valid combinations and connections of modeling elements. Check references and element types, start/end direction, sequence-flow scope, message flows between participants, decisions and joins, and paths from process entry to exit. Some simplified modeling rules in the book are conventions for understandable models, not prohibitions against every more general BPMN structure.

Behavioral rules concern what can happen when tokens move through the model. A diagram can be structurally acceptable while work deadlocks, repeats forever, never executes, or continues with unintended duplicate tokens. Soundness includes the possibility of completion, proper completion, and absence of dead activities. Control-flow analysis normally abstracts other aspects; data and communication need attention too.

Process Scribe implements Miragon validation, parser diagnostics and selected additional checks. It detects two simple mismatched split/join patterns: exclusive alternatives meeting at a parallel join, and parallel branches meeting at an exclusive merge. These checks do **not** constitute a general soundness proof. No exhaustive state-space analysis or comprehensive XSD validation is implemented.

The exclusive-to-parallel deadlock pattern blocks this profile's finalization. The parallel-to-exclusive pattern is advisory: repeated continuation may be intentional, so the reviewer must establish the intended behavior rather than automatically replacing the merge.

### Semantic quality: validation

Ask whether the model says things that are true of the intended process and whether it includes what matters. A process owner or other informed participant should walk through concrete instances, including alternate and exceptional cases. Discuss omissions, contradictions, participant perspective and the difference between observed practice and desired improvements.

Exact quotations and element links make a claim auditable. They cannot establish that the claim follows from the quotation, or that an interview was complete. The review record captures a human's assessment of a particular version.

### Pragmatic quality: certification by use

Judge whether the intended audience can understand and use the model, and whether it can be maintained and learned from. Show the rendered diagram at its normal reading size. Ask the reader to explain a case and identify who acts, what triggers work and why each branch is taken. Merely passing visual metrics does not establish comprehension.

Use a consistent direction, normally from upper left toward lower right where appropriate; reduce crossings, crowded labels and unnecessary bends. Keep related work visually organized, make handoffs evident and use a shared business vocabulary. A legitimate loop may need a backward edge: preserving behavior takes priority over a layout score.

For wording:

- Activities normally use an imperative verb and its object, such as **Check application**.
- Events normally describe an object and its resulting state, such as **Application received**.
- Following the convention discussed in §5.4.3, normally leave XOR/OR split gateways unlabeled and place meaningful conditions on the outgoing flows. Generic yes/no labels require the reader to look elsewhere for their meaning.
- Represent actual decision-making work explicitly when it exists in the process. Do not invent a task simply to satisfy a naming preference.

Miragon's `W_GATEWAY_NAME` advisory prefers question-shaped gateway names. This profile does not apply that advice as a requirement; the raw warning is retained with its override rationale. Other label and layout suggestions remain visible.

## Seven modeling guidelines, adapted

These are readable paraphrases of the seven guidelines discussed in the chapter, not hard BPMN validity constraints:

1. Use the fewest elements that still explain the relevant behavior.
2. Keep the number of connections at an individual node manageable.
3. Use a start event for each distinct trigger and an end event for each distinct outcome. Do not collapse distinct outcomes merely to force exactly one end event in the whole process.
4. Prefer recognizable structured blocks where they represent the process faithfully. Some rework structures do not fit simple paired blocks.
5. Avoid inclusive routing when simpler routing expresses the same behavior. Never replace OR with XOR or AND if it changes the process.
6. Name activities with a verb and an object.
7. Consider decomposition when a model grows beyond roughly 30 elements, choosing meaningful subprocesses rather than arbitrary chunks.

Process Scribe counts **flow nodes per process/subprocess scope**, excluding connectors and lane/pool frames, for its 30-element advisory. That count is an operational interpretation of the size guideline, not a standardized BPMN limit. Its warning for routing degree above four is an application heuristic; the book's degree guideline does not prescribe that number.

The book distinguishes general recommendations from agreed modeling conventions. For this application, the five stages guide discovery; explicit starts/ends and reachability are finalization-profile prerequisites; supported evidence and explicit human review are product requirements; readability suggestions remain advisory and can involve reasonable tradeoffs.

## Review scenarios and limits

Before approving a version, discuss at least:

- A normal completion from each trigger to its appropriate outcome.
- Every alternative condition, including whether conditions overlap or leave gaps.
- The activation and completion of parallel branches and their join.
- Rework entry, repeated behavior and a credible exit.
- Missing or late messages, timers, interruptions and exceptional outcomes that are in scope.
- Whether participants and internal roles are correctly distinguished.
- Whether source evidence supports the control flow, not just the activity names.
- Whether the intended reader can explain the diagram without its author narrating every symbol.

This local profile is conservative. Event and ad hoc subprocesses need additional validation support before finalization. A human walkthrough is valuable evidence, but does not transform the implemented checks into a formal proof.

## Reference

Dumas, M., La Rosa, M., Mendling, J., & Reijers, H. A. (2018). *Fundamentals of Business Process Management* (2nd ed.). Springer. Chapter 5, §§5.3–5.4, pp. 177–193. https://doi.org/10.1007/978-3-662-56509-4
