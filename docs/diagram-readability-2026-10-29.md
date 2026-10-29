# Diagram readability audit — 29 October 2026

Activities now reserve separate space for task icons, complete labels, step badges and bottom markers. Labels retain a 12-pixel font, explicit line breaks, Unicode and unbroken identifiers; the activity grows instead of dropping wording. The adapter preserves task types, loop and multi-instance markers, collapsed/call activities, transactions, event subprocesses, compensation, ad-hoc work and DI colors. Its adapted glyphs and font metrics retain [MIT attribution](../THIRD_PARTY_NOTICES.md).

Sizing changes disposable DI. Edges are redocked, supported layout operations repack the view, boundary events and labels are positioned relative to their owners, and a bounded routing pass checks the final geometry. The drawing and portable BPMN export use the same final positions. Original model semantics, sources, evidence and independent histories remain unchanged.

Fresh app views open at actual size or larger. Explicit Fit and saved camera choices remain available and survive reload. The homepage illustration uses a vertical layout through tablet widths so lettering does not shrink into a miniature horizontal diagram. Its task icons, number badges, text and branch labels have separate space; all connectors meet the resized shapes. Public example drawings and evidence/clarification previews were regenerated and their asset URLs versioned.

## Verification

- 137 unit tests, typecheck, publication checks and Node/Cloudflare builds passed. The focused rendering suite passed 13 tests; the dense drawing remained below its unchanged 15-second bound.
- Eighteen cases produced 31 scoped views: simple decisions, parallel work, pools/messages, nested subprocesses, compensation, dense invoices, all task/marker types, escaped text, explicit line breaks, CJK/emoji, long identifiers, multiple timers, current/future workflow models and the user-reported saved diagram.
- All whole-model exports retained canonical semantic identity after removing DI, all source files remained unchanged during each audit, and exported BPMN parsed without warnings. Thirty visible boundary-event instances stayed on their host borders.
- Independent browser bounds covered 183 activity labels. None crowded a border, icon or marker; there were no text-to-text or wrapped-line overlaps across all 31 views. This checks actual browser font/layout results as well as the application's heuristics.
- Homepage browser regressions at 320, 390, 1024 and 1440 pixels verified at least 12 physical pixels for activity/branch lettering, complete annotations, no page overflow, badge/border clearance and annotation clearance from every connector segment. Those checks caught mobile scaling and annotation placement defects before release.
- Actual app checks exercised fresh 100% zoom, explicit Fit, reload persistence, actual-size reset, subprocess navigation, search and the mobile evidence sheet. The full browser regression also passed account sign-in/return, slow-loading behavior, chat recovery and reader scroll, separate saved revisions, actual BPMN/SVG downloads, signed-out download return and plan selection.

Review found an additional composition defect: a short collapsed ad-hoc activity with parallel/compensation markers could push one bottom timer outside its host. The new regression first failed with timer center 74 outside host 80..220. Marker-aware sizing and ordered slots now cover one, two and three timers, preserve sibling order and all markers, and keep SVG and both BPMN exports aligned. Existing proof tests and routing/acceptance budgets were not weakened.

## Limits

The dense fixture and some multi-part examples still have crossing or long-route advisories. These remain visible rather than being treated as clean text-clearance results. The reported saved diagram has a long corrected-pack return advisory; its text, attached timers and connection crossings passed the checks. This audit is a varied regression set, not a guarantee about every possible imported BPMN model or every user-selected zoom level. Production deployment and provider behavior require separate release verification.
