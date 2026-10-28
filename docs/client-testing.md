# Testing the connected-agent experience

Use separate evidence for protocol checks and realistic user journeys. An
explicit tool-by-tool script can verify an integration without establishing that
a business analyst can use it naturally.

## Business analyst journey

Start a fresh conversation in each actual client with Senda connected. Provide
the interview and an ordinary request, for example:

> I’m documenting client onboarding. Here are my interview notes. Could you map
> the current process in Senda? Ask me about anything that’s unclear.

The agent must discover the method and available operations itself. Keep tool
names, schemas, internal IDs, revision arguments and implementation instructions
out of the simulated user's messages.

Include first-time setup with an empty account. The user can authorize New
projects and give the transcript directly to the agent; a placeholder project
must not be required. Also check clients that connect with read-only access and
request write permission later. Other existing projects must remain private.

Continue as the process owner or analyst would:

1. Answer the questions the agent actually asks. Provide business facts in small
   rounds rather than prescribing how to save or redraw them.
2. Correct a detail: “Finance and Delivery actually start together. Setup waits
   for both of them.” Confirm the existing project changes.
3. Add an exception or deadline in another message. Check that earlier answers
   remain represented and that uncertainty stays visible.
4. Request a future process: “Could we automate the completeness check? Keep the
   current process so we can compare them.” Confirm separate models and history.
5. Revise that future process in ordinary language. Confirm the current process
   and the future plan's original baseline remain intact.
6. Ask what changed, revisit an earlier version, and request a BPMN download.

Assess the actual saved diagram, sources, open questions and histories alongside
the conversation. Check that the agent asks about missing business information,
uses the discovery method, selects the right model and communicates clearly.
Record permission prompts, recovery steps, display failures and remaining
modeling gaps. Distinguish client presentation failures from failed model saves.
An inaccessible response is still a user-journey problem even if the backend
operation succeeded.

## Protocol and failure checks

Use the automated suites and a clearly labeled integration test for complete tool
coverage, stale writes, invalid references, project isolation and other deliberate
failures. Technical instructions are appropriate in those checks. Keep their
results separate from the business analyst journey; do not use a prescribed
sequence of tool calls as evidence that the agent chose that sequence unaided.

For usage estimates, measure the realistic journey with the intended provider.
Include repeated context, reasoning, tool results, repair attempts and failed
runs. Consumer-plan usage limits do not establish DeepSeek API costs.

## Observed results, 28 October 2026

The ChatGPT browser client completed a fresh business-language onboarding
journey: an interview draft, clarification of parallel work and setup conditions,
deadlines and cancellations, a separate future model, future reminders and a
manual fallback, and a later current-process correction. Updating the current
model preserved the future plan's original baseline. The agent retrieved an
earlier revision and compared the two versions without being given tool names or
operation arguments.

Inspecting the exported BPMN revealed that unpaid-deposit cancellation initially
ended Finance's branch without stopping parallel Delivery work. A further
business clarification corrected both models. Their resulting exports parsed
without warnings, retained the parallel split and join, distinguished the manual
and automated checks, and contained the process-scope terminate event. This is
artifact verification, not proof of general soundness; the withdrawal event
subprocess still requires scenario review.

Several early ChatGPT replies displayed “This response couldn’t load” even though
the sources and revisions saved and the replies were present in the conversation
record. Later replies rendered normally. Treat the journey as having a client
presentation problem, not as an unqualified UX pass. Downloading through the
browser automation also timed out; connector exports were independently
retrieved and inspected. Do not describe that as a verified browser download.

Separate technical ChatGPT checks exercised all 14 tools, rejected stale and
invalid writes without advancing the model, and rejected access to the other
client's test project. Claude's technical connection and first clarification
worked, including incremental write consent; its remaining tests and fresh
business-language journey await the account's usage reset. No extra usage was
purchased. Keep these partial results distinct from completed client coverage.
