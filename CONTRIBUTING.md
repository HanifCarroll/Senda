# Development

Use Node.js 24. Install with `npm ci`, then run `npm test`, `npm run check` and `npm run demo` after changes that affect the discovery workflow. Inspect the generated review page when changing exports or layout behavior.

Keep committed fixtures synthetic. Do not add source interviews, database files, credentials, proprietary process descriptions, textbook pages or extracted copyrighted material. Project and export directories are ignored by default.

Use stable BPMN IDs and preserve the atomic relationship between XML and evidence. Add regression tests for behavior changes that can lose information, misstate validation, or accept an invalid edit. Readability advice must remain distinguishable from structural errors, behavioral findings, human assertions and product conventions.

The skill lives at `skills/process-scribe/SKILL.md`. Its methodology reference is the canonical original summary of the textbook approach. If application behavior and the skill diverge, update both and demonstrate the affected user workflow.

No generated reports, dependencies or benchmark environments belong in the repository. GitHub Actions runs the same checks and the synthetic demo on Linux. A remote passing run does not replace human review of a real process model.
