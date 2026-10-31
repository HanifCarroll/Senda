# GPT-6.1 Terra trial — 29 October 2026

**Decision: hold production promotion.** Terra works through the direct OpenAI provider and produced the requested business behavior in the final saved diagrams. This first qualification run also exposed incomplete-reply handling, evidence classification and label-fit problems. Its reviewer did not accept the expected positive control. DeepSeek Flash remains Senda's production provider and existing customer metering is unchanged.

## What actually ran

The trial used Vercel AI SDK **7.0.156**, **@ai-sdk/openai 4.0.104**, and **gpt-6.1-terra** through the **Responses API**, at Standard service tier and medium reasoning effort. Requests used `store: false` and disabled parallel tool calls. An endpoint guard allowed only OpenAI Responses requests. The main agent and semantic reviewer both used Terra.

The approved trial key was created once through the encrypted native setup flow and saved privately in ignored `.env.local`, with owner-only permissions. Temporary key-delivery material was removed after successful use. Credentials are excluded from this report and the evidence files.

The OpenAI provider was installed only inside ignored trial storage. Root dependencies, production agent code, provider secrets and paid-plan rate cards were unchanged. The trial injected generation hooks into the existing Senda agent, retaining its actual operation schemas, preview validation, source checks, semantic review, persistence and export code. It used a fresh local HostedProjects store on the Pro.

A first smoke request successfully called an addition tool and returned 5: 312 input tokens, 26 output tokens, 4.387 seconds, approximately $0.000442.

## Five ordinary analyst rounds

The workflow reused the same five fictional Maple Cycle prompts from the earlier DeepSeek qualification. They describe bicycle repair, clarify approval reminders and parts handling, request a separate future model, then revise failed estimate delivery. The prompts contain no tool instructions or prescribed model operations.

| Round | Saved result | Time | Observed outcome |
| --- | --- | ---: | --- |
| Transcript only | As-is revision 2 | 61.7 s | Overview saved; a subsequent evidence edit was rejected. The reply ended with `incomplete: true` without explaining that rejected work. |
| Approval reminder and decline | As-is revision 4 | 121.9 s | Finished after one rejected non-verbatim source was corrected. |
| Parts, one reminder and repeat road tests | As-is revision 5 | 58.5 s | Finished without tool errors. |
| Separate proposed automation | To-be revision 2 | 64.4 s | Finished; fixed As-is revision 5 baseline. |
| Failed estimate, contact correction and retry | To-be revision 4 | 84.8 s | Finished; As-is remained unchanged. |

There were 43 provider requests, including seven independent preview reviews. Every HTTP response was 200. Total elapsed time across the five rounds was 391.232 seconds. This records one run, including its failed first-round completion result; it is not a reliability estimate.

## Independent artifact checks

All nine saved snapshots were read from storage independently of the agent's final replies. Source hashes and exact quoted segments matched; referenced graph elements existed; To-be claims remained in proposed state. All records retained draft status with no fabricated human approvals.

The final As-is hash exactly matched the unchanged planning baseline after both future-process rounds. As-is and To-be had separate histories. Both final BPMN exports had drawing geometry, no parser warnings, and identical canonical business semantics to their respective saved snapshots.

Independent graph assertions passed for:

- A single `P7D` non-interrupting reminder attached to the customer wait, whose own branch ends without restarting that wait.
- Decline leading to return and closure without repair.
- Missing parts being ordered and awaited before repair.
- Failed road tests returning to repair and another road test.
- The unknown non-response policy remaining open, with no invented deadline.
- Exactly three automated notices in the future model.
- Incorrect contact details leading to correction and estimate retry; only successful delivery starts the approval wait and reminder clock.

Automated layout metrics reported no crossings, shape overlaps, missing drawings or label collisions. **Manual inspection still found label-fit defects:** long collection labels extend beyond their task box, and service-task icons compete with text. The flat future drawing is 2,914 pixels wide. The metric result does not establish readable diagrams.

The final As-is had no uncovered elements. Four retained future-process claims were marked `inferred`, leaving 27 elements outside supported evidence coverage despite the preserved baseline and explicit retention brief. Those classifications require correction with appropriate provenance; changing a label to `supported` alone would not establish evidence.

## Reviewer control

Two additional live requests reviewed an existing onboarding fixture. The deliberately wrong walkthrough says payment-window withdrawal can cancel workspace setup that starts only after payment. Terra correctly identified that contradiction.

After correcting that sentence, the expected supported verdict still failed. Terra raised separate objections about explicit role assignments and the opaque pack-resolution outcome. The fixture retains baseline evidence for those responsibilities and client correction, while its future exception detail remains intentionally incomplete. This is an unresolved baseline/partial-model interpretation disagreement, not proof that every reviewer objection is wrong. The positive control must be agreed and passed before promotion.

## Measured usage and monthly projection

The five-round workflow used **1,070,956 input tokens** and **26,344 output tokens**, including preview reviews and retries. Input usage included 271,271 cache reads and 799,556 cache writes. The largest individual request had 37,315 input tokens, below the long-context pricing threshold.

At the documented default 30-minute cache policy, the workflow costs approximately **$1.144858**. The smoke test plus workflow plus two reviewer-control requests total approximately **$1.187660**. These are usage-based calculations, not a separately reconciled billing invoice. The trial's reservation ledger deliberately used the more expensive cache-write rate as an upper bound: **$2.204103**, below its $8 guard.

With the same token workload, the observed cache mix projects to about **175 five-round attempts / 875 analyst messages per $200 billing cycle**. Charging every input token as a new default cache write gives a more conservative **136 attempts / 680 messages**. These are workload projections, including the observed unfinished round, rather than promises of completed projects. More revisions, qualification reruns or larger documents consume additional credits. The earlier $1.65 estimate repriced a DeepSeek token trace; this estimate uses Terra's own measured tokens.

Current official references: [Terra pricing and Responses tool calling](https://developers.openai.com/api/docs/models/gpt-6.1-terra), [cache policy and write pricing](https://developers.openai.com/api/docs/guides/prompt-caching), [Vercel's direct OpenAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai).

## Promotion requirements

Resolve rejected-edit completion handling, preserve supported baseline provenance in To-be claims, address generated-label fit, and pass an agreed reviewer positive control. Then repeat the complete journey without incomplete replies or unexplained evidence gaps.

Cloudflare execution with Terra, actual chat UI streaming/reload/mobile behavior, durable-workflow retries and Terra-specific paid usage reservations remain unqualified. The current production meter uses DeepSeek prices and cannot be reused to charge Terra usage. Any hosted Terra trial needs its own correct rate card and operator restriction before wider access.

Private local evidence is under `tmp/terra-qualification-2026-10-29/`: the raw usage ledger, per-turn tool/review records, original snapshots, independent metadata/export proof, business assertions, reviewer-control results, exported BPMN and rendered diagrams. These ignored files remain on the Pro. The durable owner progress note records their locations and outcome. No continuation worker was created.
