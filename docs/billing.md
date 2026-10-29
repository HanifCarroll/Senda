# Billing integration

Launch plans were reviewed from first principles with Claude Opus 5.5 on
28 October 2026. Free permits creation of 3 saved cloud projects; Pro costs
US$29/month for up to 100 saved projects and built-in chat with a US$6 monthly
allowance. Existing projects stay readable, editable through a connected agent,
and exportable after a lapse. Creation is enforced atomically across UI, MCP
and built-in agent. There is currently no archive/delete UI. Annual plans,
trials, top-ups, overages and allowance rollover are not offered.

The fixed rate card is documented in [hosted agent limits](hosted-agent.md).
Paid operating limits are US$3/day, US$1/turn and a US$0.35 admission minimum.
Unsuccessful/incomplete turns use no customer allowance; a separate US$3
absorbed-cost limit can pause service until renewal. Shared admission budgets
include all accounts, operators, pending and unknown outcomes: US$10/UTC day
and US$100/calendar month. Migration 0009 adds the service window and deduplicated
operator alerts. A running turn conservatively moves its full reservation into
the current service window before another provider call; this is a safety
accounting rule, not a provider invoice report. Alerts fire at 60% capacity,
at paid allowances exceeding 80% of monthly capacity, and on the first real
paid Checkout. No automatic funding or spending-limit increase occurs.
Customers can request a manual prorated refund for an interrupting service pause.

The public [usage policy](../src/web/routes/usage.tsx) and pricing page describe
these limits. Release remains gated on actual sandbox lifecycle qualification,
then exact live account/catalog/secret checks and an unpaid live Checkout expiry.
Real test charges are forbidden. A push or a paid redirect alone is not proof
of a working deployment or entitlement.

## Stripe foundation

[`src/server/billing/stripe.js`](../src/server/billing/stripe.js) uses the official
Stripe SDK, pinned to API version `2026-09-30.endive`. Its fetch transport and
asynchronous Web Crypto verification support Cloudflare Workers and Node.

Webhook callers pass the original request body and the endpoint's signing
secret, expected Stripe account and explicit live/sandbox mode. Signature errors
return a generic error without retaining request contents. The SDK enforces a
five-minute signature timestamp tolerance. The Cloudflare handler deduplicates
event IDs and reconciles current Stripe resources under an account lease.

Subscription, invoice and Checkout notifications resolve through Stripe resource
IDs. Refund, dispute and fraud notifications traverse PaymentIntent → all paid
InvoicePayment pages → Invoice → Subscription. They do not use metadata to
identify an owner. The resulting subscriptions are retrieved again from Stripe
so delayed notifications use current provider state. The application must map
their customer IDs to its own account records before updating entitlements.

[`test/billing.test.js`](../test/billing.test.js) covers original-body signature
verification, tampering, expired signatures, environment separation, delayed
events, payment/invoice traversal and unrelated payments.

## Gated application integration

`src/cloudflare/billing.js` provides authenticated Checkout and portal routes,
exact account/mode/catalog checks, idempotent customer and checkout creation,
signed webhook reconciliation and period-bound paid entitlement. Customers and
owners are mapped server-side; browser data cannot choose a customer or price.
The success redirect does not grant access. Full refunds, disputes and early
fraud warnings hold hosted access for operator handling; partial refunds retain
access pending review. Existing data and connected-agent access are preserved.
Holds cover the Senda account, so replacing a subscription cannot bypass review.
Winning a dispute does not clear an existing hold automatically. After reviewing
the canonical Stripe resource, an operator can explicitly clear that resource's
hold in D1 and reconcile the subscription; unrelated notifications cannot clear it.

The allowance meter uses the fixed, versioned peak rate card described in
[hosted agent limits](hosted-agent.md). Each provider call reserves atomically
against the daily cap, turn ceiling and current paid period. No overage charge
or automatic purchase occurs. Both ledgers retain the Stripe subscription and
period that admitted the entire turn, including calls after a renewal boundary.
Running reservations block admission but are not displayed as used allowance.
Completed known call charges are capped at each call's reservation. Failed or
incomplete turns settle no customer charge; their known and unknown operational
costs count against the separate absorbed-cost ceiling. Financial-review holds
override daily and period resets. Distinct messages explain each pause.
No metered Stripe price is created. The paid feature requires both
`BILLING_ENABLED=1` and `PAID_AGENT_ENABLED=1`, the exact approved Stripe account,
an application key, signing secret, monthly price and bounded included allowance.
Both real release flags remain off during qualification. Live mode also requires the
operator notification recipient to match an operator allowlist entry, the exact
US$29 monthly catalog price and the US$6 allowance.

An explicitly named sandbox-only $1 monthly qualification price and an isolated
Senda portal configuration have been created in HC Studio LLC's approved sandbox.
That amount is not a proposed commercial price. The portal allows payment-method
updates, invoices and cancellation at period end, with plan switching disabled.
A real hosted Checkout session using Stripe's published test card completed with
`livemode=false`, a paid invoice and an active flexible subscription. This is
provider-side evidence. A service-specific restricted application key and isolated
webhook were then provisioned, and signed application lifecycle qualification
passed in the isolated sandbox.

## Release verification

- Keep the agreed plan and customer policy aligned with enforced limits.
- Recheck renewals, cancellation, failed payments, refunds, disputes and fraud
  signals when changing reconciliation, including retries and delayed events.
- Verify tax settings and registrations separately from payment activation.
- Exercise the full sandbox flow before configuring production. Verify an unpaid
  live Checkout expiry and its signed receipt, then the deployed purchase UI.

References: [Stripe subscription events](https://docs.stripe.com/billing/subscriptions/webhooks),
[subscription Checkout](https://docs.stripe.com/billing/subscriptions/build-subscriptions),
and [customer portal](https://docs.stripe.com/customer-management/integrate-customer-portal).


## Isolated sandbox qualification

The `senda-billing-qa` Worker uses its own D1 database and private R2 bucket.
It has no inference credential or Workflow until the paid-account gate is
verified. `PAID_AGENT_ALLOWED_EMAILS`, when set, restricts paid inference without
granting operator bypass; production leaves it unset. This prevents public
sandbox subscriptions from spending real inference funds.

A server-only `BILLING_SANDBOX_CLOCK_OFFSET_SECONDS` can align the app with
Stripe Test Clocks for renewal qualification. It is accepted only when
`STRIPE_LIVEMODE=false`; live mode always uses wall time, with regression coverage.
Never expose this value as a client option. Operational service windows remain
real UTC time even during simulated billing periods.

## Qualification on 28 October 2026

The isolated Worker completed an actual app Checkout using Stripe's published
sandbox card, signed subscription/invoice notifications, natural Test Clock
renewal, a failed renewal, payment recovery and a fresh allowance period.
The account completed five built-in-agent turns from an ordinary interview:
two clarification rounds, a separate To-be model, and a later To-be revision.
Eleven immutable snapshots passed independent hashes, evidence-quote/reference,
history and BPMN checks. Three actual authenticated HTTP BPMN exports matched
the saved semantics, included geometry and parsed without warnings. Those five
turns used US$0.4733049 on the fixed peak rate card, not a promised per-process cost.

Partial/full refunds, a dispute, a winning dispute and an actionable early-fraud
warning reached the actual application. Review holds blocked replacement Checkout
and hosted work while preserving saved models. A previously failed, old paid
Checkout notification was manually resent by Stripe after the newer holds;
canonical reconciliation preserved the holds. Replaying the same signed event
retained one receipt. Account-lease contention can return 503 to concurrent
notifications; Stripe retries these events. The qualification also exercised
explicit operator review of the known sandbox fixtures before restoring access.

Cancellation through the app-created portal retained access to the paid end
date. After simulated expiry, two parallel project creations filled the remaining
Free slots and three excess attempts were rejected. Existing edits and BPMN
exports continued to work. Unit tests cover global admission races, unknown
operating costs, billing-period attribution, quota races, sandbox-clock isolation,
notification deduplication and paid access. Real Worker/MCP and browser checks
cover desktop/mobile, slow loading, reloads, first-account sign-in and purchase
intent through sign-in.

Known external limitations remain explicit: ChatGPT can save changes while its
consumer UI fails to display the reply; automated browser download observation
can time out despite verified HTTP attachments. The Stripe sandbox portal's
embedded card-update form was blank in the controlled browser. Portal identity,
invoices and cancellation were verified, and failed-payment recovery was
completed through Stripe's Dashboard with the existing sandbox card. Card-update
form interaction is not claimed as passed. The hosted Checkout itself completed.
No real test charge was made. The owned sandbox billing customer was removed to invalidate its temporary
portal addresses. The QA webhook and public endpoint are disabled after testing;
saved model evidence is retained in private storage.

## Production activation on 28 October 2026

The paid release passed GitHub verification and automatic Cloudflare deployment,
with all nine D1 migrations independently checked in production. The live webhook
and both release flags were then enabled for HC Studio LLC's US$29 monthly price.
Production leaves the optional paid-account email restriction and sandbox clock
offset unset; paid access requires the verified subscription entitlement.

A regular account followed the actual production purchase UI into live Stripe
Checkout. The page displayed Senda Pro at US$29 per month. The exact app-created
session was expired unpaid, without a payment intent or subscription. Stripe's
real signed `checkout.session.expired` notification was recorded by production.
Independent authenticated checks before and after expiry confirmed Free's
three-project limit, no subscription, denied built-in chat, private-project
isolation and rejection of an invalid webhook signature. No real test charge was
made. The live Checkout and signed expiry verify production wiring; completed
payment and entitlement lifecycle evidence comes from the isolated sandbox.

The [29 October follow-up research](limitations-research-2026-10-29.md) includes
a fresh successful zero-charge sandbox card update, resolving the earlier
unverified form interaction in the in-app browser. Normal Chrome form rendering
was checked separately. It also records the remaining download and ChatGPT work.
