import Stripe from "stripe";
import { requireThat, ScribeError } from "../../core/errors.js";

export const STRIPE_API_VERSION = "2026-09-30.endive";

export function createStripeClient(apiKey) {
  requireThat(apiKey, "BILLING_UNAVAILABLE", "Billing is not configured.");
  return new Stripe(apiKey, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    timeout: 20_000,
  });
}

// The caller supplies the untouched request body, before any JSON parsing.
// Verification works with Workers' Web Crypto and Node's Web Crypto alike.
export async function verifyStripeEvent(client, rawBody, signature, config) {
  requireThat(
    config.webhookSecret && config.accountId && typeof config.livemode === "boolean",
    "BILLING_UNAVAILABLE",
    "Billing notifications are not configured.",
  );
  let event;
  try {
    event = await client.webhooks.constructEventAsync(
      rawBody,
      signature || "",
      config.webhookSecret,
      300,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    throw new ScribeError("BAD_SIGNATURE", "Stripe could not verify this notification.");
  }
  requireThat(
    event.livemode === config.livemode &&
      (!event.account || event.account === config.accountId),
    "BILLING_CONTEXT_MISMATCH",
    "This notification belongs to a different billing environment.",
  );
  requireThat(
    typeof event.id === "string" &&
      typeof event.type === "string" &&
      event.data?.object &&
      Number.isSafeInteger(event.created),
    "INVALID_REQUEST",
    "This billing notification is incomplete.",
  );
  return event;
}

const idOf = (value) => (typeof value === "string" ? value : value?.id);

function invoiceSubscription(invoice) {
  return invoice.parent?.type === "subscription_details"
    ? idOf(invoice.parent.subscription_details?.subscription)
    : undefined;
}

const riskEvents = new Set([
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
  "radar.early_fraud_warning.created",
]);

// Resolve through Stripe's resource relationships, never user-editable metadata.
// One payment can settle several invoices; inspect every page and deduplicate.
export async function affectedSubscriptions(client, event) {
  const object = event.data.object;
  const subscriptions = new Set();
  if (event.type.startsWith("customer.subscription.")) {
    subscriptions.add(object.id);
  } else if (event.type.startsWith("checkout.session.")) {
    const id = idOf(object.subscription);
    if (id) subscriptions.add(id);
  } else if (event.type.startsWith("invoice.")) {
    const invoice = await client.invoices.retrieve(object.id);
    const id = invoiceSubscription(invoice);
    if (id) subscriptions.add(id);
  } else if (riskEvents.has(event.type)) {
    let paymentIntent = idOf(object.payment_intent);
    if (!paymentIntent) {
      const chargeId = event.type === "charge.refunded" ? object.id : idOf(object.charge);
      if (chargeId)
        paymentIntent = idOf((await client.charges.retrieve(chargeId)).payment_intent);
    }
    if (paymentIntent) {
      const invoices = new Set();
      for await (const payment of client.invoicePayments.list({
        payment: { type: "payment_intent", payment_intent: paymentIntent },
        status: "paid",
        limit: 100,
      })) {
        const invoiceId = idOf(payment.invoice);
        if (invoiceId) invoices.add(invoiceId);
      }
      for (const invoiceId of invoices) {
        const id = invoiceSubscription(await client.invoices.retrieve(invoiceId));
        if (id) subscriptions.add(id);
      }
    }
  }
  // Fetch current state so a delayed webhook cannot restore an old active state.
  // Entitlement changes and event deduplication belong in the transactional store.
  return Promise.all([...subscriptions].map((id) => client.subscriptions.retrieve(id)));
}
