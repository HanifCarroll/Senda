# Visual review of a process diagram

Use this checklist after exporting or changing layout. Inspect the rendered result; DI rectangles and layout metrics do not measure the reader's understanding or every font's actual extents.

## Inspect every view

1. Inventory the overview and every populated subprocess in `diagrams.json`. Open each, including views not on the normal completion path. Verify that all original messages appear somewhere and that the viewer retains their actual endpoints. Do not imply that the collapsed overview draws a nested exchange.
2. At **100%**, inspect all activity/event names, branch conditions, pool/lane titles and message labels. Look for overlapping text, lines through text, clipping, labels confused with another route, and event/subprocess markers obscured by names or connections. Follow both directions of each exchange and every rework, deadline and cancellation route.
3. At **Fit**, on the intended desktop and narrow screen, check whether the structure is apparent. If labels become too small, use readable zoom, pan and subprocess navigation. Do not shrink the font or remove meaningful words merely to fit the whole model in one screen. Check that evidence and source panels do not hide the selected step. A focused view must still explain its enclosing interruptions and outside parties.
4. Look for ambiguous intersections, shared segments, unnecessarily long routes, excessive bends, unexplained backward edges, crowded joins and wasted space. A real rework loop can go backward. Prefer a simple, visible return path; do not add gateways, link events, or alter conditions solely to improve a metric.
5. Read a normal case and relevant alternatives aloud using only the diagram. Check recognizable split/join blocks, who acts next, whether parallel branches synchronize, how rework exits, and distinct successful/exceptional outcomes. Ask the intended reader for feedback; record only feedback actually given.

After fixing a drawing, repeat the sweep and compare the saved BPMN, stable IDs, flow endpoints, lane memberships and evidence. Report the views actually inspected and remaining concerns. A clean geometric report is not a claim of semantic correctness, behavioral soundness or human approval.

## Modeling choices that help readers

Use consistent business terms, imperative verb/object activities, and object/state event names. Label material triggers, interruptions and outcomes. Keep conditions near their split and make the paths meaningful in isolation. This project's book-based convention leaves XOR/OR splits normally unnamed and uses explicit outgoing conditions. Camunda's question-shaped gateway convention differs; do not mix the two conventions or invent decision work to satisfy either.

Use consistent left-to-right progression with recognizable blocks where faithful. Group related work into meaningful subprocesses with a purpose/outcome, rather than arbitrary chunks. The existing roughly 30-flow-node advisory per scope and routing-degree advisory are prompts to review complexity. They must not conceal exceptions, conflate outcomes or replace inclusive routing with a different behavior.

Reordering lanes or pools can reduce handoff crossings while retaining responsibilities. Keep the order consistent when equally readable options exist, especially across clarification rounds. Do not remove responsibility information or message flows for a cleaner picture. Prefer separating detail through the existing overview/detail navigation. Use color only as supplementary information, never as the sole way to distinguish business outcomes or evidence status.

Lane bodies are valid space for cross-role connections; their headers and contained nodes still need clearance. When evaluating another layout engine, check responsibility bands, attached events, direction, route length and all detail views alongside the crossing count. A zero-crossing overview may be harder to read if forward work runs backwards or its connections wrap around the whole diagram.

## App safeguards and limits

The shared renderer compares a bounded set of layout projections, including nearby-role lane orders (for up to six lanes) and reversed pool order. It prefers fewer crossings, then shorter routes/fewer bends, retaining the original on ties. Saved project BPMN, lane membership, evidence and revision history are unchanged. The complete BPMN export now carries the improved standard DI while preserving original semantics; standalone view BPMNs carry each visible scoped context. An editor may use different fonts or omit outside participants on subprocess drill-down. Check the imported result and use the view file when the message context is needed. This is a heuristic, not a global layout solver; lane ordering may still shift when a structural update changes the best candidate.

Routing reserves pool/lane title strips and the bounds of other labels. Connections must approach an attachment from outside its border rather than running along the border into the arrow. Candidate acceptance cannot trade new text collisions, title intrusions, ambiguous attachments, missing shapes or other hard geometry defects for fewer crossings. Branch conditions are placed near their originating decision where space permits. Review checks identify affected views and offer a direct link to open them. `quality.json` reports display checks separately from saved-model checks.

Additional advisory heuristics use model coordinates: a branch label more than 140 px from its decision, and an edge with at least four bends whose length exceeds both 700 px and twice its direct Manhattan distance. A 32px label gutter below the lower-right corner of a collapsed subprocess allows for common bpmn-js navigation controls. These thresholds are app choices, not textbook requirements or BPMN rules. Geometry checks use label bounds; font overflow, marker legibility and comprehension still require the rendered sweep. Unresolved findings remain visible; the app does not silently declare the drawing approved.

## Basis and further reading

Sources reviewed 27 October 2026. This is an original application-specific synthesis; no textbook figures or extracts are distributed.

| Source | Relevant guidance and use here |
| --- | --- |
| Dumas et al., *Fundamentals of Business Process Management*, 2nd ed. (2018), §3.5, printed pp. 103–105; §§5.4.3–5.4.4, pp. 189–193. [Book DOI](https://doi.org/10.1007/978-3-662-56509-4) | Meaningful decomposition, manageable size and routing degree, visual/logical structure, terminology, labels, and the seven modeling guidelines. Guidelines differ from agreed conventions. Pragmatic quality ultimately requires reader testing. See the canonical [methodology summary](methodology.md). |
| [Camunda: Creating readable process models](https://docs.camunda.io/docs/components/best-practices/modeling/creating-readable-process-models/) | Meaningful labels, recognizable split/join blocks, left-to-right flow, fewer crossings and better lane/pool order. Informs display-order comparison and the manual route sweep. We preserve the book's gateway-label convention and do not automatically remove lanes or introduce link events. |
| [Camunda: Naming BPMN elements](https://docs.camunda.io/docs/components/best-practices/modeling/naming-bpmn-elements/) | Specific activity names, business-state events and consistent language. Label meaning needs human judgment rather than a rigid English grammar test. |
| [SAP Signavio: Introduction to business process modeling in practice](https://learning.sap.com/courses/managing-business-processes-with-sap-signavio-solutions/introduction-to-business-process-modeling-in-practice-bpmn-2-0-_ae4a5df4-43d7-458e-be67-3546a9b81193) | Audience and purpose determine detail; alignment, reduced wasted space and rearranged lanes help readers. Add explanations for advanced constructs; retain material interactions in accessible detail views. |
| [Lübke, Ahrens & Schneider (2021): Influence of diagram layout and scrolling on understandability of BPMN processes](https://link.springer.com/article/10.1007/s10799-021-00327-7) | An eye-tracking study of 21 professional developers supports attention to direction, scrolling and initially visible content. Its single-letter task labels and limited diagram variants constrain generalization. It supports checking actual screens, not a universal no-scroll rule or shrinking realistic labels to fit. |
