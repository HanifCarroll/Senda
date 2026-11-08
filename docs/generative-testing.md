# Generative testing

The three libraries exercise different boundaries. Fast-check generates inputs and action histories against real project storage and billing SQL. Jazzer.js mutates evidence schemas and BPMN imports/edits. Schemathesis sends generated HTTP requests through the real application with temporary accounts and SQLite databases.

## Workflow coverage

| Workflow | Tool and executable coverage | Required invariant |
| --- | --- | --- |
| Evidence, sources, answered questions | fast-check: `test/input-properties.test.js`; Jazzer: `test/fuzz/target.js` | Accepted evidence survives serialization; supported claims have evidence; answer citations stay on the answer source. |
| Edit, preview, human review, retry, reopen | fast-check: `test/workflow-properties.test.js` | Previews and rejected/stale batches leave history unchanged; successful edits append once; old snapshots stay immutable; edits invalidate prior reviews. |
| BPMN import, edit, portable export, reimport | fast-check workflow suite; Jazzer: `test/fuzz/model-target.js` | Task names and control flow survive real edits and export/import; existing exports cannot be overwritten; accepted XML survives serialization. |
| As-is and To-be planning | fast-check workflow suite | Both models retain independent revisions and the original pinned baseline after reopening. |
| Sharing, revocation, delete, restore | fast-check workflow suite | Other owners cannot read or mutate a project; deletion removes grants; restoring never reshares; saved work survives restoration. |
| Payment notifications and entitlement | fast-check: `test/billing-properties.test.js` | Signed replays are processed once; canonical subscription facts decide access; payload ownership cannot redirect entitlement. Uses the production billing service and SQL with a synthetic Stripe client. |
| Agent reservation and settlement | fast-check billing suite | Generated measured, rejected and unknown call histories conserve reserved funds, obey the turn ceiling and cannot settle twice. Unknown calls retain their reservation without adding a customer charge. |
| HTTP create, read, revise, add source/answer, delete, restore, tool discovery | Schemathesis: `test/fuzz/api.js` and `test/fuzz/openapi.json` | Real authenticated writes succeed and persist the expected result; rejected writes preserve storage; anonymous and cross-account writes fail; malformed JSON returns 400. |

These generated suites complement the ordinary tests for OAuth scopes, concurrent planning, deletion expiry, trial and paid allowance limits, refund/dispute holds, finalization, and agent/provider recovery. They do not replace those regressions.

## Run locally

Use Node.js 24, npm, Python 3.10+ and [uv](https://docs.astral.sh/uv/getting-started/installation/). `mise install` provides the pinned Node.js and uv.
The lockfile pins `fast-check@4.10.2` and `@jazzer.js/core@4.0.0`. The API runner installs `schemathesis==4.32.7` through uv's isolated cache. To install its CLI separately, run `uv tool install schemathesis==4.32.7`.

```sh
npm ci --ignore-scripts
npm run test:generative
npm run test:property     # 10 properties, with bounded action histories
npm run test:fuzz         # 10,000 schema mutations + 1,000 BPMN mutations
npm run test:api          # 11 HTTP operations, up to 100 generated cases each
```

Property tests also run in `npm test`. GitHub Actions runs all three tools on pushes and pull requests and retains reports, corpora and failures for seven days. No deployment is part of this workflow.

## Isolation and limits

[Jazzer.js](https://github.com/CodeIntelligenceTesting/jazzer.js) is Jazzer's JavaScript implementation. Node instruments the original ESM source. XML syntax failures and declared import-validation errors are expected rejections; unexpected exceptions, timeouts and violated invariants fail the campaign. Inputs are limited to 4 KiB, with five seconds per input. The model corpus includes valid flows, branching, parallelism, extension attributes and escaped labels, so mutation starts inside useful code paths.

The HTTP adapter binds an ephemeral loopback port and invokes production handlers. Each write case starts from the same real stored revision; the fixture restores its synthetic storage after checking the outcome. Required successful writes and anonymous/cross-account denials run before generation, preventing an all-rejected campaign from masquerading as workflow coverage. The local OpenAPI file describes this selected surface, not a complete public API specification. Response checks cover server errors, status codes, content types, headers and schemas; storage assertions add semantic checks. The schema deliberately bounds generated bodies, so it does not use a global rule that every value outside this narrower test schema must be rejected by the application.

Provider credentials are removed from child environments. Stripe responses are synthetic, and no paid model, payment, email or remote database call is made. Runtime output remains under ignored `tmp/fuzz/`; temporary project databases are removed after each run. The runner accepts no external URL.

Remaining separate validation includes real Stripe/provider behavior, deployed Cloudflare bindings and concurrency, browser interaction, full OAuth/MCP transport, and large BPMN graphs beyond the bounded corpus. No finite campaign establishes exhaustive coverage.

## Reproduce and extend

The default seed is `20261031`. Fast-check reports minimized counterexamples and replay paths. Run `FC_SEED=123 npm run test:property` for a new seed, or put a reported path in that property's `fc.assert` options.

```sh
node scripts/run-fuzz.mjs jazzer -runs=100000 -seed=123
node node_modules/@jazzer.js/core/dist/cli.js test/fuzz/target.js tmp/fuzz/artifacts/crash-HASH --sync -- -runs=1
node node_modules/@jazzer.js/core/dist/cli.js test/fuzz/model-target.js tmp/fuzz/artifacts/crash-HASH -- -runs=1
```

Keep minimized failures as ordinary regression tests and reviewed corpus inputs. Schemathesis retains its failure database at `tmp/fuzz/hypothesis` and its JUnit report at `tmp/fuzz/schemathesis.xml`. Extend the contract, local fixture, and success assertions together.

## Verification

On 2026-10-31, the 10 properties, 10,000 schema mutations and 1,000 BPMN mutations passed. Schemathesis passed 811 cases across 11 operations, plus six required successful write workflows and their anonymous/cross-account denials. The malformed-JSON property first reproduced a 500 response with the single-character body `!`; the request handler now returns 400 without writing data.
