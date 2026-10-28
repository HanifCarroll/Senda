import test from "node:test";
import assert from "node:assert/strict";
import { accountEmail } from "../server/account-email.js";
import { emailForDelivery } from "../cloudflare/email.js";
import { readFile } from "node:fs/promises";

test("Workers receives the original PNG bytes, not encoded text", async () => {
  const message = accountEmail({ kind: "magic", origin: "https://senda.example", url: "https://senda.example/api/auth/magic-link/verify?token=fixture" });
  const delivery = emailForDelivery(message);
  assert.ok(delivery.attachments[0].content instanceof ArrayBuffer);
  assert.deepEqual(Buffer.from(delivery.attachments[0].content), await readFile(new URL("../public/brand/email-logo.png", import.meta.url)));
  assert.equal(typeof message.attachments[0].content, "string", "The preview and test outbox retain the portable representation.");
  assert.equal(delivery.html, message.html);
  assert.equal(delivery.attachments[0].contentId, "senda-logo");
});

const origin = "https://senda.example";

test("the branded email logo is an embedded PNG with a matching Content-ID", () => {
  const message = accountEmail({ kind: "magic", origin, url: origin + "/api/auth/magic-link/verify?token=preview" });
  const cid = message.html.match(/<img src="cid:([^"]+)"/)[1];
  const image = message.attachments.find(attachment => attachment.contentId === cid);
  assert.ok(image);
  assert.equal(image.type, "image/png");
  assert.equal(image.disposition, "inline");
  const bytes = Buffer.from(image.content, "base64");
  assert.equal(bytes.subarray(1, 4).toString(), "PNG");
  assert.ok(bytes.length > 1000);
  assert.ok(!/<(?:img|script)[^>]+src="https?:/i.test(message.html));
});

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
