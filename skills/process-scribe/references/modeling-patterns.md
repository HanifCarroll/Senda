# Choosing a BPMN pattern from business evidence

Use the business meaning to choose a construct. Consult the CLI's operation schema before editing; these examples describe semantics, not invented command syntax.

| Evidence or uncertainty | Useful clarification | Modeling decision |
| --- | --- | --- |
| Different routes depend on known data | Can more than one condition hold? Is there a remaining/default case? | Exclusive choice for one route; inclusive choice when several routes can activate; explicit conditions on outgoing flows |
| Activities can happen independently | Must both happen? What waits for both? | Parallel split/join when both are required; a merge is not automatically a synchronization |
| A reply competes with a deadline | Is the choice determined by data already known, or by which event arrives first? | Event-based waiting/racing rather than an ordinary data decision |
| Work is repeated | Is this a retry of the same work, or one instance per item? What ends it? | A loop/rework path versus sequential or parallel multi-instance activity |
| A reminder happens during a wait | Does it cancel the wait, or does the original activity continue? | Interrupting versus non-interrupting boundary event |
| A failure affects a wider scope | Which active work stops? What continues? | Correct boundary scope, termination, or event subprocess; check the support limit below |
| Completed work must be undone | What completed activity is being compensated, and what action reverses it? | Compensation event and associated compensation activity, outside ordinary sequence flow |
| Work has no prescribed order | Is the order genuinely discretionary, or merely unknown to us? | Ad hoc modeling only when supported by evidence; otherwise retain an ordering question |
| A condition can become true while waiting | Is this an immediate decision, a received message, or a persistent condition wait? | Distinguish gateway choice, message catch, and conditional event |
| Information is sent | Is it directed to a particular participant or broadcast? | Message versus signal; do not invent the receiver's internal process |

## Boundaries and handoffs

Pools are participants in an interaction, not necessarily legal companies. Lanes partition responsibilities within a process. Two independent departments can be separate participants; a role name does not automatically require a separate pool. Sequence flows stay inside a process scope; message flows cross participants.

Capture inputs, outputs, significant document states, sender, recipient and decision rules through artifact/handoff/condition claims and native BPMN elements when relevant. Do not draw a sequence flow to mean a document association. Preserve manual work when documenting the business process.

## Deliberate abstraction

Use meaningful subprocesses to keep levels readable. Collapsed content still exists; an intentionally unspecified subprocess has no modeled internals. For the latter, add an `abstractions` record with the subprocess ID, reason, inputs and outcomes. Only empty ordinary subprocesses can use this exemption. An existing detailed subprocess must not be hidden from validation through an abstraction record.

If the internal behavior is simply unknown and needed for the purpose, record the gap. Do not use abstraction to excuse an unsupported sequence or to bypass a broken process. The app still checks the parent flow and requires supported claims for its business elements.

## Current support and limits

This table describes the companion application's conceptual profile. Generic native editing/import/rendering does not imply specialized validation or formal soundness.

| Construct | What the app checks or supports | What remains for the agent and reviewer |
| --- | --- | --- |
| Ordinary tasks, events, choices, parallel branches, rework and nested ordinary subprocesses | Native operations/rendering; selected structural rules; scope reachability; two narrow split/join patterns | Condition coverage, feasible loops, synchronization and evidence |
| Conceptual XOR/OR conditions | A meaningful branch label, expression body, or default designation can satisfy the condition-presence check | Whether conditions are correct, mutually exclusive where appropriate, and complete |
| Intentionally unspecified subprocess | Explicit abstraction contract exempts only its omitted internals from start/end requirements | Whether the omission fits the purpose and the boundary contract is accurate |
| Compensation | Associated handler, same scope, no ordinary sequence flow through the handler; ordinary path checks exclude compensation elements | What triggers compensation, completed work, propagation and the outcome |
| Boundary timers/messages, event choices and multi-instance work | Native representation and selected generic checks; ordinary paths where applicable | Interruption semantics, races, cardinality, completion conditions and all relevant cases |
| Event or ad hoc subprocess | May be retained as a draft; finalization explicitly reports unsupported specialized validation | Do not replace the real behavior with a made-up sequence to make finalization pass |
| Multiple diagram planes | Every available plane is rendered and linked in the review bundle | Inspect child diagrams as well as the overview; missing coordinates/content remain visible in drawing notes |

Plain-language conditions are enough for conceptual modeling. No executable expression language, service binding, or workflow deployment is implemented. The application does not prove general behavioral soundness.

Basis: Dumas et al. (2018), Chapters 3–4, especially printed pp. 78–107 and 117–139; conceptual/executable distinction and expressions in Chapter 10, pp. 372–399. Examples and implementation rules here are original adaptations.
