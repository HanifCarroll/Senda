# Plan and revise a To-be process

Use this reference when the user explicitly asks to plan a future process. The output is a proposed BPMN model that can be discussed and revised. Execution, implementation, cost estimates and claimed performance gains require their own work and evidence.

## Establish the starting point

Read the As-is model, its sources, open questions and saved revisions. Select an identifiable As-is revision and obtain the user's intended changes, constraints and desired outcomes. A current-process transcript reports what happens today; it does not establish a future design. Keep unresolved As-is gaps visible when they affect the plan.

In the hosted app, use `list_models`, then `create_to_be_model` with the project ID, selected `baselineRevision` and an exact or faithful design `brief` from the user. The UI offers the same operation in the To-be tab. If a plan already exists, read and revise it. Do not replace it or create a second project to hide its history.

The new plan starts at revision 1 with a copy of that As-is diagram and the design brief as a source. The copied drawing is an **unconfirmed planning baseline**. Current claims, answered questions, scenarios, walkthroughs and human approvals are not copied as future truth. Inspect the selected As-is revision separately for historical context. Decide with the user what should carry forward; do not quietly approve every copied step.

For a local CLI project, use a separate directory initialized with `--mode proposed`. Import a saved As-is BPMN file into it, add the design brief as a source, and record the As-is project/revision in the new context. Local directories do not have the hosted app's automatic baseline relationship. Preserve the original local project.

## Apply the same five stages

1. Revisit the future trigger, outcomes, perspective and scope against the design brief.
2. Identify work and events that stay, change, move, appear or disappear. Keep related steps at a consistent level of detail.
3. Clarify future responsibility and handoffs. A proposed system or role is a design choice, not an observed fact.
4. Check ordering, choices, parallel work, rework, timers and exceptions affected by the change. Ask about unresolved decisions rather than drawing an invented answer.
5. Add only the supporting detail needed to understand and review the future process.

For connected tools, explicitly pass `model: "to-be"` and that model's current `expectedRevision`. Use `state: "proposed"` for claims linked to the plan. Cite the design brief or clarification source with `basis: "prescribed"` for explicit design decisions. Use `inferred` plus a rationale for interpretation. A source match establishes provenance; a supported design statement does not establish that the process currently operates that way.

Save new design answers as immutable answer sources. Revise the affected model, claims and question status together. Keep changes incremental and summarize the intended business change. Reread and reconcile stale writes against the selected model; never substitute an As-is revision number into a To-be proposal.

## Review each revision

Use the same structural, behavioral, evidence and readability checks as As-is modeling. Refresh the planned-process walkthrough and relevant scenarios. Walk through normal work and the exceptions changed by the design; check that responsibility and outcomes remain understandable. Keep human review explicitly tied to this future model and its current content.

Present both model links, the To-be revision, the As-is baseline revision, changes and unresolved decisions. Each model has its own sources and history. Later As-is updates do not automatically alter or rebase the plan. Compare them deliberately when needed and document any subsequent alignment as a new To-be revision.

Label exported files and review links As-is or To-be. Do not describe an approved plan as implemented, or report a predicted benefit as a measured result.
