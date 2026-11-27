# Senda

Senda turns interviews into BPMN process diagrams that people can check against the original evidence. It keeps the account of how work happens today separate from the design for how it could happen in the future.

## Language

### Processes and planning

**Process**:
The recurring work being described, from what starts it to the outcomes it produces.
_Avoid_: Project (for the work itself), workflow (if it suggests automation)

**Project**:
The saved work in Senda for one **Process**, including its **As-is model** and any **To-be model** in the hosted app.
_Avoid_: Process, workspace (for one project)

**Process discovery**:
The work of establishing how a **Process** runs today from interviews, **Clarification answers**, and other **Sources**.

**Process boundary**:
The scope of a **Process model**: what starts the work, which outcomes end it, and what falls outside it.

**Perspective**:
The party whose work a **Process model** describes.

**Process model**:
A representation of a **Process** that keeps its BPMN **Diagram** together with the records that explain and support it.
_Avoid_: Diagram (for the whole model), workflow (for an executable workflow)

**As-is model**:
The **Process model** of how work is carried out today, separate from any proposed changes.
_Avoid_: As-is diagram (when referring to more than the drawing), current version (which could mean the latest revision)

**To-be model**:
The **Process model** of how work is intended to run in the future, with its own **Sources** and **Revisions** independent of the **As-is model**.
_Avoid_: To-be plan (when precision matters), new version of As-is

**As-is baseline**:
The specific **Revision** of the **As-is model** chosen as the unchanging starting point for a **To-be model**, not the initial To-be copy.
_Avoid_: Latest As-is, planning draft (for the starting revision)

**Design brief**:
A **Source** describing what should change, what should stay the same, and any constraints or unresolved decisions for the **To-be model**.
_Avoid_: Future transcript, plan (for the input alone)

**Revision**:
A numbered, immutable saved state of one **Process model** that preserves its content and any recorded review feedback.
_Avoid_: Version, snapshot, review (for the saved state)

### Diagrams

**Diagram**:
The BPMN drawing of a **Process model**.
_Avoid_: Model (for just the drawing), process map

**Diagram view**:
A drawing of one scope of a **Diagram**, such as the overall **Process** or the detail inside a **Subprocess**.
_Avoid_: Separate model, revision (for a different view of the same revision)

**Diagram element**:
An individual part of a **Diagram**, such as an **Activity**, event, decision, or connection.
_Avoid_: Step (for an element that is not work)

**Activity**:
A piece of work performed within a **Process**, shown as a task or larger unit of work in the **Diagram**.
_Avoid_: Step (as a catch-all for every element)

**Subprocess**:
An **Activity** that groups related work within a larger **Process** and can have its own **Diagram view**.
_Avoid_: Separate process (for work grouped within the parent process)

**Pool**:
A **Diagram element** that represents a distinct participant in a **Process** interaction.
_Avoid_: Lane

**Lane**:
A division of a **Process** that groups work by responsibility, typically drawn inside the participant's **Pool**.
_Avoid_: Pool

**Handoff**:
A transfer of work, information, or responsibility from one party to another within a **Process**.
_Avoid_: Message flow (a notation that can represent a handoff)

### Sources, evidence, and questions

**Source**:
A piece of original material recorded for a **Process model**, such as a **Transcript**, **Clarification answer**, document, or written observation.
_Avoid_: Evidence, passage (for the whole record)

**Transcript**:
A written record of a process interview, including interview notes recorded as that interview's **Source**.
_Avoid_: Interview (for the written record), source (when specifically distinguishing transcripts from other sources)

**Source passage**:
A specific part of a **Source** that a reader can revisit in its original context.
_Avoid_: Segment, source (for only the passage)

**Evidence**:
A citation of exact words in a **Source passage** that gives the basis for a **Claim** or another recorded conclusion.
_Avoid_: Source, proof, quote (for the citation as a whole)

**Claim**:
A recorded statement about a current or proposed **Process** that may be linked to a **Diagram element**, with its certainty kept separate from its **Evidence**.
_Avoid_: Model interpretation, supporting statement, fact (for a statement that may be uncertain)

**Conflict**:
A disagreement between recorded **Claims** about how the **Process** works or should work.
_Avoid_: Gap (when accounts disagree rather than lack detail)

**Clarification question**:
A question about a missing detail, **Conflict**, or design decision that matters to a **Process model**, whether open, deferred, or answered.
_Avoid_: Clarification (ambiguous between question and answer), open question (for the record in any state)

**Clarification answer**:
A response to a **Clarification question** kept as a **Source**, whether or not it has yet resolved the question in the **Process model**.
_Avoid_: Clarification (without saying whether it is the question or the answer), resolution (for the answer alone)

**Process vocabulary**:
The business terms and meanings used in one **Process model** so its intended readers can understand the work.
_Avoid_: Glossary (without saying whether it belongs to the process or to Senda)

### Review

**Walkthrough**:
A written explanation of how the **Process** proceeds, with links to relevant **Diagram elements** or **Claims**.
_Avoid_: Review scenario, execution trace

**Review scenario**:
A concrete starting situation and expected outcome for checking how a **Process model** handles a particular path.
_Avoid_: Review case, walkthrough, simulation

**Automated checks**:
Senda's checks on structure, behavior, **Evidence**, and readability that can find problems but cannot replace **Human review**.
_Avoid_: Approval, proof

**Human review**:
A person's recorded judgment of a **Process model**'s accuracy, behavior, or clarity, including feedback on whether a path matches a **Review scenario**'s expected outcome.
_Avoid_: Automated checks, agent approval

**Reviewed model**:
A **Process model** marked reviewed after its current content has met the required **Automated checks** and **Human review** requirements.
_Avoid_: Implemented process, proven model, approved plan (as a claim that the work is already in use)

**Review bundle**:
An offline package for reviewing a saved **Revision**, including its **Diagram**, **Sources**, and review material.
_Avoid_: BPMN download (for the whole package), project backup

### Agents

**Built-in agent**:
Senda's own assistant for drafting and revising a **Process model** in Senda.
_Avoid_: Connected agent

**Connected agent**:
An external assistant connected to the hosted app and limited to the **Projects** the user shares with it.
_Avoid_: Built-in agent, connector (the means of connection, not the agent), your own agent (if the connection matters)
