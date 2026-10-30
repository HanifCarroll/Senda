import test from "node:test";
import assert from "node:assert/strict";
import { accountEmail } from "../src/server/account-email.js";
import { emailForDelivery } from "../src/cloudflare/email.js";

test("Workers receives the account email without attachments", () => {
  const message = accountEmail({ origin: "https://senda.example", url: "https://senda.example/api/auth/magic-link/verify?token=fixture" });
  const delivery = emailForDelivery(message);
  assert.deepEqual(delivery.attachments, []);
  assert.equal(delivery.html, message.html);
  assert.equal(delivery.text, message.text);
});

const origin = "https://senda.example";

test("account emails use a text wordmark without embedded or remote images", () => {
  const message = accountEmail({ origin, url: origin + "/api/auth/magic-link/verify?token=preview" });
  assert.deepEqual(message.attachments, []);
  assert.match(message.html, /class="wordmark"[^>]*>Senda<\/p>/);
  assert.ok(!/<(?:img|svg|script)\b|\bcid:|\bdata:image\//i.test(message.html));
});

test("a sign-in email preserves the complete signed return query without consuming its token", () => {
  const query = "?token=signed-token&callbackURL=https%3A%2F%2Fsenda.example%2Fconsent%3Fsig%3Dx%26client_id%3Dy&errorCallbackURL=https%3A%2F%2Fsenda.example%2Fsign-in",
    message = accountEmail({ origin, url: origin + "/api/auth/magic-link/verify" + query }),
    confirmation = origin + "/sign-in/confirm" + query;
  assert.ok(message.text.includes(confirmation));
  assert.ok(!message.html.includes("/api/auth/magic-link/verify"));
  const visibleAction = message.html.match(/<a class="action" href="([^"]+)"/)[1];
  assert.equal(visibleAction.replaceAll("&amp;", "&"), confirmation);
  const outlookAction = message.html.match(/<v:roundrect href="([^"]+)"/)[1];
  assert.equal(outlookAction, visibleAction);
});

test("account emails reject foreign destinations and credential URLs", () => {
  for (const url of [
    "https://elsewhere.example/verify?token=secret",
    "https://senda.example.attacker.test/verify",
    "https://user:secret@senda.example/verify",
    "javascript:alert(1)",
  ]) assert.throws(() => accountEmail({ origin, url }), /Invalid account email link/);
});
