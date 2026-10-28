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
