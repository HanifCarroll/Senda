# Application state machines

Senda uses **XState 6.0.0-alpha.71** and **@xstate/react 7.0.0-alpha.6**. Both are pinned prereleases. The app uses native v6 transitions, queued effects and actor logic; it has no v5 compatibility layer. Upgrade both packages together and run the full verification suite before changing the pins.

State machines own ordered phases, cancellation and decisions that previously depended on several flags or callbacks. They do not replace the database or a provider's records. Actors are not persisted, and there is no external inspector sending private project context elsewhere.

## Coverage

| Workflow | Machine responsibility | Durable authority |
| --- | --- | --- |
| Built-in chat | Open/create conversation; submit, receive and resume replies; incomplete/error states; cancel stale work on navigation | Saved chat and run records; route identifies the conversation |
| Account access | Email and Google sign-in; password/register/verification/reset; consent selection and submission; connection fetch/revoke | Better Auth sessions and tokens, owner grants |
| Plan screen | Checkout/portal request; bounded reconciliation after payment return, independently of another pending action | Stripe and the webhook projection in D1 |
| Project screens | Create/restore and other mutations; current versus historical review loading; latest polling; failure recovery and stale-response suppression | Project/model revisions and URL selection |
| Hosted agent execution | Admission and queue uncertainty; claim, completion, failure and interruption; mutation review before commit | Conditional D1 writes, generation checks and Cloudflare Workflow execution |
| Provider accounting | Reserve before dispatch; measured settlement; known rejection versus unknown outcome | Usage ledger, conservative reservations and service limits |
| Project lifecycle | Active, deleted, purging and purged transitions; seven-day restore eligibility | Stored project lifecycle and generation, atomic quota and ownership checks |
| Snapshot publication | Prepare, upload, publish, reject or preserve an ambiguous result | Immutable snapshots and conditional revision/model publication |
| Checkout coordination | Hold check, canonical customer/subscription lookup, open-session reuse, attempt rotation and session creation | D1 account lease/idempotency attempt and Stripe |
| Hosted diagram gestures | Press, pan, pointer release/cancel and click suppression | Camera coordinates remain ordinary view data |

The source modules sit with their owners: web machines in `src/web/lib`, agent protocols in `src/server/agent/protocol-machines.js` and `src/cloudflare/agent-machines.js`, project lifecycle in `src/core/project-lifecycle.js`, publication in `src/server/publication-machine.js`, and Checkout in `src/server/billing/checkout-machine.js`. Browser services are injected so SSR does not access `window`. Effects run through v6's effect queue or invoked logic, never through transition inspection.

## Boundaries kept outside actors

- Trial balances, approval freshness, content digests, immutable As-is/To-be relationships and cache identities are derived facts or stored invariants. A second actor copy would introduce disagreement.
- Stripe, Better Auth and Cloudflare Workflow own their internal lifecycles. Local machines coordinate calls without pretending to make those external transactions atomic.
- Disclosure toggles, selection values, marketing playback, camera coordinates and one-claim notification delivery do not need another lifecycle model.
- The exported offline BPMN viewer remains dependency-free. Its local gestures do not require bundling the application's actor runtime.

Stopping a browser actor suppresses stale UI results; it cannot undo an external request already accepted. Server ownership, project generations, expected parent revisions, leases and idempotency keys still enforce that boundary. Transport disconnection does not imply a successful provider turn and never automatically retries it.

## Verification

`npm test` covers transitions, cancellation, out-of-order results, accounting ambiguity, project deletion/restoration and publication races. `npm run typecheck`, `npm run check`, both builds, the complex workflow and actual local Worker/browser suites cover integration. The browser suite includes desktop/phone layouts, authentication, cold review loads, polling recovery, histories, exports and reversed restore/list responses. A passing build or actor test alone is not a production release check.

See the [v6 documentation](https://stately.ai/docs/xstate/v6/faq) and [v5-to-v6 migration guide](https://stately.ai/docs/xstate/v6/xstate-v5-to-v6) for the prerelease API contract.
