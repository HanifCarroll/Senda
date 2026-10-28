import test from "node:test";
import assert from "node:assert/strict";
import { accountEmail } from "../server/account-email.js";

const origin = "https://senda.example";

test("a sign-in email preserves the complete signed return query without consuming its token", () => {
  const query = "?token=signed-token&callbackURL=https%3A%2F%2Fsenda.example%2Fconsent%3Fsig%3Dx%26client_id%3Dy&errorCallbackURL=https%3A%2F%2Fsenda.example%2Fsign-in",
    message = accountEmail({ kind: "magic", origin, url: origin + "/api/auth/magic-link/verify" + query }),
    confirmation = origin + "/sign-in/confirm" + query;
  assert.ok(message.text.includes(confirmation));
  assert.ok(!message.html.includes("/api/auth/magic-link/verify"));
  const visibleAction = message.html.match(/<a class="action" href="([^"]+)"/)[1];
  assert.equal(visibleAction.replaceAll("&amp;", "&"), confirmation);
  const outlookAction = message.html.match(/<v:roundrect href="([^"]+)"/)[1];
  assert.equal(outlookAction, visibleAction);
});

test("account emails reject foreign destinations, credential URLs and unknown message types", () => {
  for (const url of [
    "https://elsewhere.example/verify?token=secret",
    "https://senda.example.attacker.test/verify",
    "https://user:secret@senda.example/verify",
    "javascript:alert(1)",
  ]) assert.throws(() => accountEmail({ kind: "magic", origin, url }), /Invalid account email link/);
  assert.throws(() => accountEmail({ kind: "unexpected", origin, url: origin }), /Unknown account email/);
  assert.throws(() => accountEmail({ kind: "toString", origin, url: origin }), /Unknown account email/);
});

test("verification and password recovery retain their destination and escape HTML attributes", () => {
  for (const kind of ["verify", "reset"]) {
    const url = origin + "/api/auth/" + kind + "?token=one'two&callbackURL=%2Fapp",
      { text, html } = accountEmail({ kind, origin, url });
    assert.ok(text.includes(url));
    assert.ok(html.includes("one&#39;two&amp;callbackURL="));
    assert.ok(!html.includes("/sign-in/confirm"));
  }
});
