# ELK comparison on synthetic client onboarding

Tested 27 October 2026 with elkjs 0.12.0, Node 24 and the final model from the [complex onboarding fixture](../examples/complex-onboarding/proposals.js). This is one synthetic process and its five detail views, not a general ranking of layout engines.

## Decision

Keep the current renderer. The best tested ELK hybrid removes both original overview crossings, but its much longer routes and backward handoffs make it harder to follow. Representative ELK detail layouts also introduce crossings where the current views have none. ELK remains an experiment rather than a production dependency.

The comparison exposed a general restriction in our router: it treated intervening lane bodies as solid obstacles. A connection may cross responsibility lanes while avoiding their title strips and contained shapes. Correcting that restriction removes the refund/handover crossing without ELK, leaving one overview crossing. The five details remain crossing-free. A regression assertion protects this behavior.

## Overview results

| Layout | Crossings | Size (model pixels) | Bends | Total route length | Backward links |
| --- | --- | --- | --- | --- | --- |
| Original current | 2 | 1779 × 1058 | 12 | 4487 | 0 |
| Corrected current | 1 | 1779 × 1058 | 14 | 4487 | 0 |
| Best tested zero-crossing ELK hybrid | 0 | 1322 × 1497 | 36 | 12298 | 3 |

The ELK candidate preserves process semantics and has no measured shape/text collisions, but its normal start appears below the handover outcome. Long routes wrap around the diagram; at a fixed screen height, fitting the taller picture reduces the reading scale. Backward links are a readability concern, not a BPMN syntax error.

The original intersections were:

- Readiness deadline / client withdrawal message (`F_Expired` / `M_Withdrawal`): remains in the corrected current view. The tested ELK hybrid removes it through repositioning and a longer outside message route.
- No-refund branch / return from handover acceptance (`F_NoRefund` / `F_AcceptClose`): removed by the lane-body routing correction. A control that only increased the router's search cap retained both crossings.

## Detail views

| View | Current crossings | Representative ELK hybrid crossings |
| --- | --- | --- |
| Check handover pack | 0 | 1 |
| Coordinate readiness | 0 | 0 |
| Clear order — Finance | 0 | 0 |
| Agree plan — Delivery | 0 | 2 |
| Verify workspace access | 0 | 0 |

The overview row uses the best tested compound variant, with seed 23. Details use one consistent flat-layered adapter configuration. They were not individually tuned to their best possible result.

## Method and limits

ELK computes graph geometry rather than BPMN diagrams. Direct compound output reduces crossings but does not by itself produce full-width, non-overlapping BPMN lane bands. The direct bridge was rejected for overlapping lane frames and text.

The accepted hybrids use ELK placement followed by explicit horizontal BPMN responsibility bands, attached-event positioning and the existing orthogonal router/label repair. They are not pure ELK results. Variants exercise compound/flat graphs, fixed-position/fixed-side ports and deterministic seeds. ELK's compound graph coordinates are converted using each edge's reported container.

The hybrid router was allowed a 120,000-point grid during the experiment; production retains its 30,000-point bound. Separate high-cap and lane-correction controls identify which change helped. Increasing the cap alone did not remove either original crossing.

Verification compares non-DI XML with the source view, retains IDs and role memberships, checks event attachment, applies the same native geometry metrics, and inspects actual browser text rectangles, path/text intersections and clipping. Current and candidate diagrams were visually inspected. The saved project and evidence are unchanged. These checks do not establish formal soundness, process-owner approval, general LLM accuracy or a globally optimal drawing.

Local generated comparison bundles include source views, ELK input/output graphs, candidate BPMN/SVG/PNG files, measurements, experiment scripts and their report. The repository deliberately does not bundle the temporary ELK installation or those generated artifacts. To repeat the case, use the committed synthetic fixture and a separate elkjs 0.12.0 installation; do not treat a rejected direct-layout artifact as a production model.

Primary references: [ELK Layered](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html), [hierarchy handling](https://eclipse.dev/elk/reference/options/org-eclipse-elk-hierarchyHandling.html), [port constraints](https://eclipse.dev/elk/reference/options/org-eclipse-elk-portConstraints.html), [hierarchical crossing minimization](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-crossingMinimization-greedySwitch-type.html), and [elkjs](https://github.com/kieler/elkjs). The comparison numbers come from this experiment, not the documentation.
