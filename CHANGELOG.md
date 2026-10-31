# Changelog

## Unreleased

- The command, agent skill and local data folder are now all named `senda` (previously `process-scribe`). An existing `.process-scribe` data folder and project databases are renamed the first time Senda opens them. Environment variables now start with `SENDA_`.
- `npm run install:skill` installs the skill for Claude Code and Codex, and removes a link left by an earlier install under the old name.
- Connector results end with a one-line readable summary, such as the saved revision and its review link.
- The hosted app offers a built-in agent alongside connected agents, with Free and Pro plans.

## 0.3.0

- Turn a transcript into a BPMN model and revise it through rounds of clarification, using the command line, the JavaScript API, a connected agent or the hosted app.
- Record the audience and process owner, stakeholder coverage, the basis and attribution of each piece of evidence, conflicts, intentional simplifications, written walkthroughs and example cases for review.
- Model descriptive BPMN with the `dumas-conceptual-v2` profile, including incomplete drafts. Ordinary paths, simplified subprocesses and compensation are assessed separately.
- Reject imports that produce parser warnings, so no content is dropped without notice.
- Keep event and ad hoc subprocesses as drafts until they can be finalized under the profile.
- Private hosted projects with source uploads, agent sign-in and access control, a shared service API, revision history, automatic refresh and browser tools through WebMCP.
- Separate As-is and To-be models, with the To-be model tied to the As-is revision it started from.
- Deploy on Cloudflare Workers with D1, private R2 storage, passwordless sign-in emails and optional Google sign-in.
- Offline review bundles with scoped diagrams, outside participants, subprocess navigation, zoom, search, message links and evidence, plus static SVG views.
- **Download BPMN** includes the improved layout as standard BPMN diagram data. **Download this view** offers an SVG or a standalone BPMN file of one view. Bundles keep the exact saved XML as `model-original.bpmn`.
- Projects from version 0.1 open without rewriting their history. New revisions use format 2.
