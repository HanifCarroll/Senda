# Built-in agent

Senda uses Vercel AI SDK with the direct `@ai-sdk/openai` Responses provider and
`gpt-6-luna`. Requests run in the existing Cloudflare Worker. No Vercel
hosting, gateway account, or Workers AI model is needed.

The agent invokes the same server operations as the MCP integration. Each chat
is owned by the authenticated account and restricted to one project; an initial
transcript can create that project. The discovery skill, actual operation
schemas, evidence validation and optimistic revision checks apply equally to
As-is and To-be. Models keep separate histories and a fixed planning baseline.
The first draft is a small overview. Its trusted review phase also applies to metadata repairs during the same first turn, provided the diagram is still compact; later detailed revisions retain the full semantic checks. Uncertain work stays in an opaque stage
until the user clarifies it. Later turns expand the supported details. Before
diagram changes are saved, a separate bounded provider call compares the
candidate's actual graph with the sources. Structural and evidence validation
run first; a rejected candidate never appends a revision. This consistency
check does not replace process-owner review.
Claims, abstraction contracts and written walkthrough changes pass the same
consistency check, including revisions that change only those explanations.
The checker must return a factual finding for every claim, walkthrough step and
abstraction; missing or contradictory check results cannot authorize a save.
Event attachments, interruption flags and reachable boundary-branch flow targets are derived from that graph. The reviewer must return the same facts in its structured audit; a misread target cannot authorize a save.
Its bounded request keeps the complete candidate graph and all source text,
and excludes the historical diagram so old event definitions cannot be mistaken for the candidate. The previous graph is used locally to identify the first overview, and the fixed As-is planning baseline remains available for To-be evidence.

D1 holds conversations, per-chat run locks and usage reservations. Successful
tool steps are checkpointed. Each new turn starts from saved user-facing conversation
and fresh tool reads; previous internal tool traffic and reasoning do not accumulate
in the next turn’s prompt. R2 continues to hold immutable project snapshots
and derived review caches. The browser receives progress labels and final prose,
not reasoning or credentials. Refreshing a chat reloads its saved conversation.
Generation runs in the `senda-agent-turns` Cloudflare Workflow, independently of
the browser request. The response stream observes saved progress in D1. Closing
or reloading it does not abort generation. Each run has one atomic execution
claim and no automatic provider retry; duplicate job delivery cannot start the
same provider turn again. Interrupted jobs show an incomplete reply when their
lease expires, with saved revisions retained.

## Configuration

Keep `OPENAI_API_KEY` in an ignored, owner-readable `.env.local`. For local Worker
runs put the key and local auth settings in a private `.dev.vars`. Use a separate configuration directory and state for live-provider qualification.
Production uses a Cloudflare Worker secret. Never use a `VITE_` variable for keys.

Built-in chat requires a current paid entitlement or an exact operator email
in the `AGENT_ALLOWED_EMAILS` Worker secret, plus the provider key and Workflow.
Operator access stays separate from paid access. Free accounts retain their
connected-agent workflow; there is no public free AI tier.

Each upcoming main call reserves US$0.05; each consistency check reserves US$0.02.
Turns permit at most sixteen main calls (240 KB of instructions, conversation and
tool schemas; 32,000 output tokens per call) and six checks (60 KB; 16,000 output
tokens). A model middleware boundary awaits the atomic reservation before HTTP dispatch and settles usage before tool execution or another provider call. SDK notification hooks are not used to enforce spending because they swallow callback errors.
Each call must fit within the remaining US$1 turn ceiling and the daily
account limit (US$3 paid, US$2 operator; UTC) before it starts. Measured calls release unused reservations,
so repair calls can use that room without raising either ceiling. The rate card is
`gpt-6-luna-2026-10-29-30m-ceiling`: US$0.125/million input tokens and US$0.50/million
output tokens, including reasoning. Input is conservatively metered as a new 30-minute cache write; cache reads cost less at the provider. Every request explicitly uses Standard service, medium reasoning, `store: false` and a 30-minute implicit cache TTL. New runs record this rate card; historical DeepSeek rows keep their original accounting.
Each call settles to conservative measured usage. An uncertain call retains only
its own reservation. Concurrent conversations share atomic limits, checked before
every provider call. Operational spend stays recorded separately from the paid
allowance; failed or incomplete turns consume no customer allowance even when
partial progress was saved. Unknown call reservations remain operational only;
a completed turn uses measured usage on the fixed rate card. A run
expires after nine minutes; a stale lock can be recovered after ten. Changing
provider rates or model limits requires reviewing the reservation calculation.

Launch pricing was agreed with Claude Opus 5.5 after a first-principles review:
US$29/month, US$6 monthly allowance, Free3/Pro100 saved projects. Operator access
stays separate from paid entitlement. Shared service admission budgets are
US$10/UTC day and US$100/calendar month, including operators and unknown outcomes.
The absorbed-cost limit is US$3 per paid period. No automatic overage, funding
or limit increase occurs. See [billing](billing.md) and the public usage policy.
Sandbox payment and entitlement checks passed before live purchasing was enabled. Production payment checks do not make real test charges.

## Verification

`npm test` includes access, project isolation, actor binding, context limits and
per-call cost, failed-turn allowance, and semantic rejection checks.
`scripts/test-hosted-agent.js` is a separately opted-in
live-provider test; it creates a local magic-link account, drafts and clarifies
As-is, creates and revises To-be, verifies independent histories and parses both
BPMN exports. Set `SENDA_TEST_LIVE_AGENT=1` explicitly; CI never spends API credits.

The standard Cloudflare workflow/browser checks cover authentication, private
storage, MCP, historical revisions, navigation and the simplified workspace.
