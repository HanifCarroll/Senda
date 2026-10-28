import test from "node:test";
import assert from "node:assert/strict";
import { fetchClientMetadataResource } from "../cloudflare/cimd.js";
import { authOptions } from "../server/auth-options.js";

test("Worker CIMD fails closed without the public-network boundary", async () => {
  const original = globalThis.Cloudflare;
  try {
    delete globalThis.Cloudflare;
    await assert.rejects(
      fetchClientMetadataResource("https://example.com/client.json"),
      /strictly-public/,
    );
  } finally {
    globalThis.Cloudflare = original;
  }
});
test("Worker CIMD rejects non-public resources and never forwards credentials or follows redirects", async () => {
  const original = globalThis.Cloudflare,
    realFetch = globalThis.fetch;
  const calls = [];
  globalThis.Cloudflare = { compatibilityFlags: { global_fetch_strictly_public: true } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json({});
  };
  try {
    for (const url of [
      "http://example.com/a",
      "https://127.0.0.1/a",
      "https://[::1]/a",
      "https://10.0.0.1/a",
      "https://169.254.169.254/a",
      "https://localhost/a",
      "https://user:secret@example.com/a",
      "https://example.com/a#fragment",
    ])
      await assert.rejects(fetchClientMetadataResource(url));
    await assert.rejects(
      fetchClientMetadataResource("https://example.com/a", { method: "POST", body: "private" }),
    );
    assert.equal(calls.length, 0);
    await fetchClientMetadataResource("https://example.com/client.json", {
      headers: { authorization: "private", cookie: "private", "if-none-match": '"prior"' },
    });
    const { options } = calls[0];
    assert.equal(options.redirect, "manual");
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "omit");
    assert.equal(options.headers.get("authorization"), null);
    assert.equal(options.headers.get("cookie"), null);
    assert.equal(options.headers.get("if-none-match"), '"prior"');
    assert.ok(options.signal instanceof AbortSignal);
    globalThis.fetch = async () =>
      new Response(null, { status: 302, headers: { location: "https://elsewhere.example/" } });
    await assert.rejects(
      fetchClientMetadataResource("https://example.com/client.json", { redirect: "error" }),
      /redirects are not allowed/,
    );
  } finally {
    globalThis.Cloudflare = original;
    globalThis.fetch = realFetch;
  }
});
test("passwordless accounts use hashed expiring links and verified Google emails", async () => {
  const sent = [];
  const options = authOptions({
    origin: "https://senda.example",
    passwordless: true,
    sendEmail: (...args) => sent.push(args),
    projects: {},
    google: { clientId: "test-client", clientSecret: "test-secret" },
  });
  assert.equal(options.emailAndPassword.enabled, false);
  assert.equal(options.socialProviders.google.requireEmailVerification, true);
  const magic = options.plugins.find((p) => p.id === "magic-link");
  assert.equal(magic.options.expiresIn, 600);
  assert.equal(magic.options.storeToken, "hashed");
  await magic.options.sendMagicLink({
    email: "owner@example.test",
    url: "https://senda.example/link",
  });
  assert.equal(sent[0][2], "magic");
  assert.equal(sent[0][0].email, "owner@example.test");
});
