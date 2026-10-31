# GPT-6 Luna workflow qualification — 29 October 2026

The candidate passed an independently inspected six-turn business workflow through the actual local Cloudflare Worker and chat UI. The separate [diagram readability audit](diagram-readability-2026-10-29.md) records the rendering fixes and varied-view checks. This report establishes model qualification; it does not itself establish a production deployment.

## Configuration

Vercel AI SDK `7.0.156`, direct `@ai-sdk/openai` provider `4.0.104`, OpenAI Responses model `gpt-6-luna`, medium reasoning, Standard service, `store: false` and explicit 30-minute implicit caching. The application settles measured usage before executing model-requested mutations. A denied reservation dispatches no request; these boundaries have intercepted real-SDK regression tests.

The application meters a conservative ceiling of $0.125 per million input tokens and $0.50 per million output tokens, including reasoning. Cache reads can make the provider invoice lower. These are the configured rates from the [Luna model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna) and [API pricing](https://developers.openai.com/api/docs/pricing), not an invoice reconciliation.

## Development and controls

The untuned model produced incomplete or insufficiently explained drafts. Iteration improved complete-proposal batching, evidence links, inherited To-be support, the first overview, timer and cancellation scope, and parent-level outcomes of summarized stages. A prior museum workflow completed all chat replies but failed independent inspection: a known early-closing outcome still flowed into later work. That failure is retained; it was not counted as qualification.

The final semantic controls comprise 20 curated cases repeated three times: deterministic opaque ID renamings, case-order variations and reversed graph arrays. They are not 60 independent business scenarios or three independently randomized graph permutations.

- All 33 negative observations were rejected. One was blocked by the mechanically checked factual audit rather than a normal review verdict.
- 26 of 27 positive observations were accepted. One first-overview case received a conservative rejection over a deferred exception missing from its outcomes list even though it remained in the reason.
- There were 58 normal correct verdicts, one protected rejection and one positive rejection. This is not a perfect control-suite result or proof of universal model reliability.

An earlier private harness shared metadata objects across candidates, undermining some ID-renaming results. Those records are preserved and superseded. The corrected fixtures clone metadata and validate every XML and evidence reference before dispatch. CPU tests now prevent the same fixture defect. Their complete candidate arrays match the recorded inputs to all 60 final calls.

The reusable fixtures are in `evals/hosted-agent/cases.js`. The opt-in benchmark is `scripts/eval-agent-semantics.js`; it does not run in normal CI. It requires `SENDA_TEST_LIVE_AGENT=1` and `OPENAI_API_KEY`, allows at most 60 bounded requests with no retries, and returns nonzero for any mismatch. Its current conservative dispatch ceiling is $1.20. Do not treat partial artifacts as completed qualification. The new CLI has not itself been run against the live provider; the recorded results came from the corrected private harness using the same candidate inputs and production review implementation.

## Unseen business workflow

Harbor Works office memberships was frozen before exposure. Its five original prompts remained verbatim. An ordinary business clarification was inserted after the agent asked whether software should send revised offers as well as the initial offer. This made six turns. It supplied no BPMN or implementation instructions, and the engine was not tuned during the journey.

Independent assertions inspected the saved graphs, rather than the chat's claims:

- Unknown initial ordering stayed unspecified. After clarification, Finance and Facilities start in parallel and the offer waits for both results. Finance's missing-information request, reply and recheck loop is preserved.
- Withdrawal during document collection terminates the application before billing or desk planning can start. Detailed revisions no longer retain the previous overview's deferred closing path.
- A single `P5D` non-interrupting timer attaches to the applicant response wait. Its reminder branch ends without creating another waiting token or an automatic deadline.
- Requested changes complete the old response wait, lead through human revision and offer sending, then start a new response wait and reminder clock.
- The separate future version automates initial offers, revised offers and reminders. Billing checks, desk planning, revision, correction and activation remain human.
- Wrong-email outcomes for both offer sends lead through correction and retry of the appropriate offer. Only successful delivery reaches the response wait. Other delivery problems remain an open question.

All six replies completed without a continuation fallback. All nine stored snapshots passed raw digest, source hash, exact quote, reference and draft-state checks. The current model remained byte-for-byte unchanged through all future revisions; its fixed baseline and separate history chains were verified. Four nonempty historical/current exports passed canonical semantic identity and BPMN parsing with DI.

Actual browser downloads of As-is revision 4, To-be revision 2 and To-be revision 5 also passed: 26,536 / 26,548 / 31,899 bytes, three planes each, no parser warnings, and canonical identity with the saved snapshots. Reload during a running turn and navigation through subprocess search and mobile evidence returned to the same conversation without replay: six submitted turns produced six runs.

## Cost, latency and limits

The six completed turns used 1,447,176 input tokens and 84,932 output tokens across their calls. The aggregate application ceiling was **$0.223363**, including reviews and repairs. This local Worker trial did not retain the provider's cache breakdown, so this figure is an application ceiling, not the exact invoice.

At this observed workload, a full $200 grant would cover about **895 six-message journeys**, or **5,370 analyst messages**, at the conservative ceiling. The existing $100 monthly service cap limits service capacity to about **448 similar journeys** until deliberately changed. A $6 customer allowance would cover about 26 complete similar journeys, subject to daily caps and admission reserves. Source length, process complexity, repair attempts and later revisions change these projections; unsuccessful attempts also consume service capacity.

Backend processing took 134 / 172 / 92 / 114 / 60 / 255 seconds, totaling 13 minutes 48 seconds across six separate turns; median 124 seconds. These exclude tester pauses. The UI remained usable during processing, and a warm mobile model switch exposed its download control in 206 ms. This is a local observation, not a production latency distribution or a matched speed comparison with Terra.

Free hosted AI remains disabled. Operator and paid-account access rules, the agreed plans, the $6 allowance, daily/service caps and no-overage policy are unchanged. No real Stripe test charge, extra Claude usage, credit purchase or automatic recharge was used.

## Release verification

The separate renderer changes reserve activity interiors, keep attached events docked and improve the future retry route. The varied-diagram audit checks actual browser text bounds rather than relying on the old zero-clash metrics. The chat composer overlap is fixed and verified on desktop/mobile, with reader scroll preserved across unchanged polls. Final release evidence must identify the pushed commit, automatic Cloudflare deployment, migrations and production checks before describing Luna as live.
