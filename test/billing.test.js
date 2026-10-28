import test from "node:test";
import assert from "node:assert/strict";
import {
  createStripeClient,
  verifyStripeEvent,
  affectedSubscriptions,
} from "../src/server/billing/stripe.js";

const stripe = createStripeClient("test-fixture-not-an-api-key");
const config = {
  webhookSecret: "unit-test-webhook-signing-secret",
  accountId: "acct_fixture",
  livemode: false,
};
const event = (type, object) => ({
  id: "evt_fixture",
  object: "event",
  api_version: "2026-09-30.endive",
  created: Math.floor(Date.now() / 1000),
  livemode: false,
  type,
  data: { object },
});
const sign = (payload, timestamp) => stripe.webhooks.generateTestHeaderString({
  payload,
  secret: config.webhookSecret,
  ...(timestamp === undefined ? {} : { timestamp }),
});

test("Stripe verifies the original signed body and separates live and sandbox events", async () => {
  const original = event("invoice.paid", { id: "in_fixture" });
  const raw = JSON.stringify(original);
  assert.deepEqual(await verifyStripeEvent(stripe, raw, sign(raw), config), original);
  for (const [body, header] of [
    [raw.replace("in_fixture", "in_tampered"), sign(raw)],
    [raw, ""],
    [raw, sign(raw, Math.floor(Date.now() / 1000) - 600)],
  ]) {
    await assert.rejects(verifyStripeEvent(stripe, body, header, config), {
      code: "BAD_SIGNATURE",
    });
  }
  for (const other of [
    { ...original, livemode: true },
    { ...original, account: "acct_other" },
  ]) {
    const body = JSON.stringify(other);
    await assert.rejects(verifyStripeEvent(stripe, body, sign(body), config), {
      code: "BILLING_CONTEXT_MISMATCH",
    });
  }
});

test("delayed subscription events resolve to Stripe's current state", async () => {
  const fetched = [];
  const client = {
    subscriptions: {
      async retrieve(id) {
        fetched.push(id);
        return { id, status: "canceled", customer: "cus_actual" };
      },
    },
  };
  const result = await affectedSubscriptions(client, event("customer.subscription.updated", {
    id: "sub_actual",
    status: "active",
    metadata: { owner: "untrusted_owner", subscription: "sub_untrusted" },
  }));
  assert.deepEqual(fetched, ["sub_actual"]);
  assert.equal(result[0].status, "canceled");
});

test("risk events traverse all invoice-payment pages and avoid metadata ownership claims", async () => {
  const fetchedInvoices = [], fetchedSubscriptions = [];
  const client = {
    charges: {
      async retrieve(id) {
        assert.equal(id, "ch_actual");
        return { payment_intent: "pi_actual" };
      },
    },
    invoicePayments: {
      async *list(parameters) {
        assert.deepEqual(parameters, {
          payment: { type: "payment_intent", payment_intent: "pi_actual" },
          status: "paid", limit: 100,
        });
        yield { invoice: "in_one" };
        yield { invoice: { id: "in_two" } };
        yield { invoice: "in_one" };
        yield { invoice: "in_unrelated" };
      },
    },
    invoices: {
      async retrieve(id) {
        fetchedInvoices.push(id);
        return id === "in_unrelated" ? { parent: null } : {
          parent: { type: "subscription_details", subscription_details: {
            subscription: { id: id === "in_one" ? "sub_one" : "sub_two" },
          } },
        };
      },
    },
    subscriptions: {
      async retrieve(id) {
        fetchedSubscriptions.push(id);
        return { id, customer: "cus_actual" };
      },
    },
  };
  const result = await affectedSubscriptions(client, event("charge.dispute.created", {
    id: "dp_fixture", charge: "ch_actual", payment_intent: null,
    metadata: { subscription: "sub_untrusted", owner: "untrusted_owner" },
  }));
  assert.deepEqual(fetchedInvoices, ["in_one", "in_two", "in_unrelated"]);
  assert.deepEqual(fetchedSubscriptions, ["sub_one", "sub_two"]);
  assert.equal(result.length, 2);
});

test("ordinary one-off payments and unrelated notifications grant no subscription", async () => {
  const client = {
    charges: { async retrieve() { return { payment_intent: null }; } },
    invoices: { async retrieve() { return { parent: null }; } },
  };
  assert.deepEqual(await affectedSubscriptions(client, event("charge.refunded", {
    id: "ch_legacy", payment_intent: null,
  })), []);
  assert.deepEqual(await affectedSubscriptions(client, event("invoice.paid", {
    id: "in_one_off",
  })), []);
  assert.deepEqual(await affectedSubscriptions(client, event("customer.updated", {
    id: "cus_unrelated",
  })), []);
});
