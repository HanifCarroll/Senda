# Process Scribe

Turn a discovery conversation into a BPMN model whose activities, decisions and sequence can be traced back to evidence.

Process Scribe combines a reusable agent skill, a local CLI and a JavaScript library. The agent conducts discovery and interprets the source material. The application stores evidence and revisions, applies BPMN edits through [Miragon bpmn-cli](https://github.com/Miragon/bpmn-cli), and produces a review bundle. It does not make its own LLM calls or require an API key.

The discovery method follows Chapter 5 of *Fundamentals of Business Process Management*, second edition: boundaries → activities and events → resources and handoffs → control flow → relevant additional detail, with iteration and review throughout. [Read the original methodology summary](skills/process-scribe/references/methodology.md).

## Try the complete example

Requires **Node.js 24** and npm. Clone this repository, then run:

```sh
npm ci
npm test
npm run check
npm run demo
```

The demo creates a private workspace under the ignored `output/` directory and prints links to two local review pages. The first keeps ambiguous sequencing unresolved. The second uses a synthetic clarification to build the model. It reopens the saved database before exporting, demonstrating persistence across sessions. Human approvals remain pending.

Open the printed `after` path in a browser to see the diagram, questions, claims, source quotations and quality checks. The bundle includes BPMN, SVG and JSON files. All committed examples and tests are synthetic.

## Use it with an agent

```sh
npm run install:skill
```

This creates a symlink at `$CODEX_HOME/skills/process-scribe` (normally `~/.codex/skills/process-scribe`), pointing to this checkout. It refuses to replace a different existing skill. Keep the checkout in place. Start a new agent session if the skill is not yet listed.

An example request:

> Use $process-scribe to model this interview as the current process. Ask me about missing decisions and ordering, keep the evidence attached, and give me a diagram to review.

The skill uses the host agent's existing tools and model. It guides discovery; it is not a trained extraction model or a guarantee of semantic accuracy. The application checks evidence references and requires human review before finalization.

## CLI quickstart

These commands run from the checkout. `--project` selects a directory containing a persistent SQLite database. Use an ignored workspace or a private directory for real material.

```sh
node bin/process-scribe.js --project workspaces/booking init \
  --name "Project booking" \
  --purpose "Explain how accepted proposals become bookings" \
  --perspective "Freelancer" \
  --transcript examples/transcript.txt

node bin/process-scribe.js --project workspaces/booking apply --file examples/01-discover.json
node bin/process-scribe.js --project workspaces/booking inspect
node bin/process-scribe.js --project workspaces/booking apply --file examples/02-answer-and-model.json
node bin/process-scribe.js --project workspaces/booking validate
node bin/process-scribe.js --project workspaces/booking export
```

Every edit names the revision it was based on. A failed operation, invalid quote or stale revision leaves the previous snapshot intact. Sources cannot be overwritten. Changes to the model or discovery records invalidate prior reviews. Use `history` and `diff --from 1` to inspect the evolution.

`schema` prints the proposal schema and Miragon's operation schema; `--help` lists commands. [Command and proposal reference](skills/process-scribe/references/commands.md).

## What the quality report means

| Area | Implemented checks | Still requires judgment |
| --- | --- | --- |
| Structural verification | Miragon validation, parser diagnostics, scope and reference checks | Comprehensive BPMN XSD conformance is not claimed |
| Behavioral verification | Two narrow split/join mismatch patterns, including the negative deadlock fixture | General soundness, loops, events, message interactions, condition coverage |
| Semantic validation | Exact source quote existence, stable evidence links, open questions, current/proposed separation | Whether the evidence supports the claims and the model matches the real process completely |
| Readability | Layout metrics, branch labels, routing degree, decomposition suggestions | Wording, vocabulary, granularity, clear handoffs and comprehension by the intended reader |

**A structurally valid model can still be wrong.** Review records cover semantic, behavioral and pragmatic review separately. A human can record approval or request changes; the agent must not invent approval. Approvals are local records, not authenticated identities. `finalize` marks the exact content as **reviewed**, not proven sound, deployment-ready or executable.

Readability suggestions are advisory. They should never change real process behavior merely to improve appearance. The selected convention leaves split gateways unlabeled and labels outgoing conditions explicitly; Miragon's conflicting question-name advisory is retained in the report with an explanation of the override.

## Scope of version 0.1

- Local CLI, exported JavaScript API, durable revisions, evidence ledger, clarification workflow, review records and portable review bundles.
- Generic descriptive BPMN, with structural checks that allow incomplete drafts. Explicit starts, ends and graph paths are required by this application's finalization profile.
- Imports with parser warnings are rejected to avoid silent data loss. Engine-specific extensions need explicit compatibility work; no promise of arbitrary vendor round trips.
- Event and ad hoc subprocesses can remain drafts but need additional validation support before this profile will finalize them. Deployment configuration, collaboration servers, authentication and hosted MCP/HTTP services are not included.
- Layout checking does not certify the diagram. The renderer displays the first diagram in an imported multi-diagram file; the complete model remains in the BPMN export.

The automated suite exercises persistence, transactional failure, stale writes, evidence integrity, review invalidation, selected BPMN fixtures, the CLI and escaping in exported HTML. It is **not an independent LLM evaluation**. The next useful evaluation is a real discovery interview with a process owner and a subsequent revision round.

## Data and publication

Projects are local. Database files, `.env` files, workspaces, exports, output and PDFs are ignored by Git. Reports intentionally contain source quotations and full source text, so review the bundle before sharing it. An ignore file does not prevent someone from explicitly force-adding private material.

The textbook PDF, extracts, figures and private experiment notes are not in this repository. The public skill contains an original methodological summary with attribution.

## Implementation and attribution

[Architecture and backend decision](docs/architecture.md) · [Development instructions](CONTRIBUTING.md) · [MIT license](LICENSE)

The implementation pins `@miragon/bpmn-cli` 0.8.0. Third-party dependencies retain their respective licenses. Methodology reference: Marlon Dumas, Marcello La Rosa, Jan Mendling and Hajo A. Reijers (2018), *Fundamentals of Business Process Management*, 2nd ed., Springer, Chapter 5, §§5.3–5.4, pp. 177–193. [DOI](https://doi.org/10.1007/978-3-662-56509-4). This project is independent of the authors and Miragon.
