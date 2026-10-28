# Billing integration

Billing is being prepared for the optional built-in agent. Plan prices and usage
allowances are pending the owner's requested review with Claude. Checkout and
paid entitlements are not enabled yet.

## Stripe foundation

[`src/server/billing/stripe.js`](../src/server/billing/stripe.js) uses the official
Stripe SDK, pinned to API version `2026-09-30.endive`. Its fetch transport and
asynchronous Web Crypto verification support Cloudflare Workers and Node.

Webhook callers must pass the original request body and the endpoint's signing
secret, expected Stripe account and explicit live/sandbox mode. Signature errors
return a generic error without retaining request contents. The SDK enforces a
five-minute signature timestamp tolerance. Transactional event deduplication is
still required in the eventual webhook handler.

Subscription, invoice and Checkout notifications resolve through Stripe resource
IDs. Refund, dispute and fraud notifications traverse PaymentIntent → all paid
InvoicePayment pages → Invoice → Subscription. They do not use metadata to
identify an owner. The resulting subscriptions are retrieved again from Stripe
so delayed notifications use current provider state. The application must map
their customer IDs to its own account records before updating entitlements.

[`test/billing.test.js`](../test/billing.test.js) covers original-body signature
verification, tampering, expired signatures, environment separation, delayed
events, payment/invoice traversal and unrelated payments.

## Remaining integration

- Confirm the paid plan and hosted-agent allowance with Claude.
- Create isolated sandbox catalog and portal configuration; provision a
  service-specific restricted key and signing secret in Workers secrets.
- Add authenticated Checkout/portal routes, transactional payment-event handling
  and usage reservations with spending limits before enabling the hosted agent.
- Cover renewals, cancellation, failed payments, refunds, disputes and fraud
  signals, including event retries and out-of-order delivery.
- Verify tax settings and registrations separately from payment activation.
- Exercise the full sandbox flow, then configure and verify production.

References: [Stripe subscription events](https://docs.stripe.com/billing/subscriptions/webhooks),
[subscription Checkout](https://docs.stripe.com/billing/subscriptions/build-subscriptions),
and [customer portal](https://docs.stripe.com/customer-management/integrate-customer-portal).
