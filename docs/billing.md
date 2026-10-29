# Billing integration

Billing is being prepared for the optional built-in agent. The requested review
with Claude Opus 5.5 agreed proposed commercial numbers: US$15/month with a
US$3 monthly allowance on the fixed rate card, a separate US$3 absorbed-cost
ceiling, and a temporary US$0.35 minimum remaining allowance to start a turn.
This agreement is conditional on qualification; it is not a launched price.
Checkout and paid entitlements are not enabled yet.

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
Both real release flags remain off during qualification.

An explicitly named sandbox-only $1 monthly qualification price and an isolated
Senda portal configuration have been created in HC Studio LLC's approved sandbox.
That amount is not a proposed commercial price. The portal allows payment-method
updates, invoices and cancellation at period end, with plan switching disabled.
A real hosted Checkout session using Stripe's published test card completed with
`livemode=false`, a paid invoice and an active flexible subscription. This is
provider-side evidence; application key provisioning and signed end-to-end
webhook/entitlement tests are still outstanding.

## Remaining qualification

- Confirm the paid plan and hosted-agent allowance with Claude.
- Provision a service-specific restricted key and signing secret in Workers secrets.
- Cover renewals, cancellation, failed payments, refunds, disputes and fraud
  signals, including event retries and out-of-order delivery.
- Verify tax settings and registrations separately from payment activation.
- Exercise the full sandbox flow, then configure and verify production.

References: [Stripe subscription events](https://docs.stripe.com/billing/subscriptions/webhooks),
[subscription Checkout](https://docs.stripe.com/billing/subscriptions/build-subscriptions),
and [customer portal](https://docs.stripe.com/customer-management/integrate-customer-portal).
