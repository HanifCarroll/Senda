# Agent latency and ChatGPT display investigation

## Built-in agent latency

The main cost is model processing across multiple tool and review calls. In one measured local SDK baseline, provider calls occupied 91.811 of 92.129 seconds. This excludes production queue or network timing and must not be generalized to every request. Diagram generation and validation took milliseconds in the sampled cases.

The built-in agent previously received complete generic method, CLI, installation, OAuth and reference material in addition to the complete editing-operation schema on every step. Its instructions were reduced from 55,008 bytes to about 12,500 bytes. The editing schema, five-stage method, independent semantic review, evidence checks, atomic edits and model validation remain. Connected consumer agents retain access to the full discovery method.

One matched initial-draft experiment produced:

| Configuration | Time | Provider calls | Input tokens | Output tokens |
| --- | ---: | ---: | ---: | ---: |
| Original instructions | 92.129 s | 9 | 184,448 | 8,165 |
| Compact instructions | 49.546 s | 6 | 87,816 | 4,406 |
| Compact, lower main reasoning | 72.912 s | 9 | 128,397 | 5,299 |

The lower-reasoning experiment was rejected. Main and independent review both retain medium reasoning. These are single samples, not a general percentage speed guarantee.

The six-round live UI trial completed with correct saved behavior, but a detailed clarification took 282 seconds when the model proposed incompatible retyping and referenced an incident flow that removal had already deleted. Short operation-specific guidance and error hints now explain compatible type families, explicit replacement and removal cascades. Engine rules and atomic rejection are unchanged. A replay completed in 172 seconds without those two errors, but still needed two metadata repairs. It is not evidence that complex revisions are uniformly fast.

Safe timing metadata now separates queue, reservation, provider, settlement, tool, checkpoint and whole-turn phases. Provider counters include input, output, cache and reasoning tokens. Diagnostic failure cannot delay or alter the original action. No prompts, source contents or credentials are logged. Tool spans that include review contain the nested provider time and should not be added to provider spans.

Two private experiment capture failures occurred after successful model execution: an export helper used an inspection result without XML, and an in-memory database helper returned the wrong shape for batched SELECT results. Both were corrected without replaying the already completed call merely to recover artifacts. The affected attempts are retained and excluded from speed comparisons.

Production timing from the three-turn Free trial confirms the remaining variation:

| Turn | Queue | Execution | Provider time | Provider calls |
| --- | ---: | ---: | ---: | ---: |
| First draft | 5.670 s | 58.024 s | 53.178 s | 8 |
| Detailed clarification | 3.798 s | 233.017 s | 225.580 s | 12 |
| Separate future model | 2.767 s | 62.223 s | 56.688 s | 7 |

The detailed revision needed repairs for dangling evidence and claims that mislocated a human availability check or treated unconfirmed reply types as exhaustive. Those proposals were rejected before saving. The final saved behavior passed independent checks. Model processing and repairs still dominate; the optimization does not make every reply fast.

## ChatGPT consumer response display

The original affected conversation still contains five assistant cards saying “This response couldn’t load,” including after reload. Its visible fallback is in ChatGPT's `DilRenderer`. React hydration warnings were observed, but do not establish the cause. The precise historical-message rendering failure remains unconfirmed.

Fresh GPT-5.6 Sol Medium conversations successfully displayed a small project-list response, compact discovery material, full discovery material and schema, and a normal paragraph with bullets summarizing an existing saved project. All survived reload. Their reported work times were 6–16 seconds. GPT-6 was not tested in these controls because the consumer account showed a usage limit.

Correlated production tool results completed successfully, including full method/schema results of 134,443 and 102,678 bytes. A read-only saved-project recovery used successful project-list, model-list and project-read results of 831, 1,643 and 36,529 bytes. Direct protocol and actual SDK controls also passed. Neither result size nor MCP server failure has been established as the cause of the historical display issue.

The tested recovery is to open a fresh ChatGPT conversation and ask it to read the already saved Senda project. Do not repeat old creation or edit requests merely to recover a missing reply: the earlier tool action may already have succeeded. Senda's built-in chat is a separate interface.

MCP diagnostics now correlate generated server call IDs with result and response-stream completion, cancellation or error. They preserve status, bytes, backpressure and cancellation behavior and exclude request bodies, arguments, headers, client IDs and error text. Stream completion proves server handoff, not that ChatGPT displayed the result. These diagnostics are not represented as a fix for old ChatGPT history. The connector remains a beta.

A private, sanitized support report records the affected conversation and message IDs, comparison controls and screenshots. It has not been sent to a third party. Raw browser archives, credentials and customer sources are not needed for that report. Private investigation artifacts are under `tmp/chatgpt-display-2026-10-29/` and `tmp/luna-speed-2026-10-29/`.

After deployment, a fresh read-only project-list response displayed in ChatGPT and survived reload. Its correlated server delivery completed with status 200, 977 bytes and 128 ms. This verifies the new instrumentation and that individual response; it does not repair the affected historical cards.
