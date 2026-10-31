# What Senda checks

Senda checks every revision before it saves it, and runs the full set of checks again before a model can be finalized. The results appear under **Review checks** in the app and in `quality.json` in each export.

| Area | What Senda checks |
| --- | --- |
| Structure | BPMN validation through Miragon bpmn-cli, parser diagnostics, scope and reference rules, and compensation associations |
| Behavior | Splits and joins that don't match, such as a parallel split closed by an exclusive join |
| Evidence | Exact quotes and source references, open questions and conflicts, source context, the inputs and outcomes of intentionally simplified subprocesses, and the separation of As-is and To-be models |
| Readability | Layout measurements, branch labels, how many connections meet at each element, and suggestions for splitting a crowded diagram |

## Review and approval

People review a model in three ways, and Senda records each one separately: whether it matches what actually happens, whether its paths and decisions behave sensibly, and whether the intended reader can follow it. A person gives an approval or asks for changes, and an agent records it only after the person has actually given that feedback. Connected agents can't record approvals at all. `finalize` then marks the exact content that was reviewed.

Use `review-scenario` to record a person's feedback on a saved example case. A recorded case has to be confirmed before the model can be finalized. During drafting, cases and finalization are optional.

## Modeling rules

- Branch conditions can be written in business language; they don't need to be executable expressions.
- A subprocess left intentionally unspecified needs a reason plus its inputs and outcomes.
- Compensation handlers are checked through their associations instead of ordinary start and end paths.
- Missing paths and incomplete decisions block finalization.
- Exclusive and inclusive split gateways stay unlabeled, and each outgoing branch carries its condition. Miragon's advice to phrase gateway names as questions is overridden, and the report explains why.
- Readability suggestions never change process behavior to improve a drawing.

See [exports and layout](portable-bpmn.md) for how Senda lays out diagrams and checks each view.
