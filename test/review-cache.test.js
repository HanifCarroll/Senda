import test from "node:test";
import assert from "node:assert/strict";
import { ReviewCache, cacheResult } from "../src/cloudflare/review-cache.js";
import { hash } from "../src/core/hash.js";

function bucket() {
  const values = new Map();
  return {
    values,
    async get(key) {
      const value = values.get(key);
      return value ? { text: async () => value.text, customMetadata: value.metadata } : null;
    },
    async put(key, text, options) {
      values.set(key, { text, metadata: options.customMetadata });
    },
  };
}
const context = { projectId: "project-a", modelId: "model-a", model: "to-be", record: { revision: 3, digest: "saved-snapshot-digest" } };
const review = { projectId: "project-a", modelKind: "to-be", revision: 3, title: "Onboarding", views: [{ svg: "<svg />" }], discovery: { sources: [{ text: "Private transcript" }] } };

test("review cache survives new instances and isolates models, saved content and renderer versions", async () => {
  const storage = bucket();
  await new ReviewCache(storage, "renderer-a").put(context, review);
  const another = new ReviewCache(storage, "renderer-a");
  assert.deepEqual(await another.get(context), review);
  assert.equal(await another.get({ ...context, modelId: "different-model" }), null);
  assert.equal(await another.get({ ...context, model: "as-is" }), null);
  assert.equal(await another.get({ ...context, record: { revision: 4, digest: "new-snapshot" } }), null);
  assert.equal(await new ReviewCache(storage, "renderer-b").get(context), null);
});

test("damaged or mismatched review caches are treated as misses", async () => {
  const storage = bucket(), cache = new ReviewCache(storage, "renderer-a");
  await cache.put(context, review);
  const value = storage.values.get(cache.key(context));
  value.text = value.text.replace("Private transcript", "Changed transcript");
  assert.equal(await cache.get(context), null);
  value.text = JSON.stringify({ ...review, projectId: "another-project" });
  value.metadata.checksum = hash(value.text);
  assert.equal(await cache.get(context), null);
  value.text = "not JSON";
  value.metadata.checksum = hash(value.text);
  assert.equal(await cache.get(context), null);
});

test("cache failures do not block reviews and diagnostics stay out of serialized data", async () => {
  const broken = { get: async () => { throw new Error("Unavailable"); }, put: async () => { throw new Error("Unavailable"); } };
  const cache = new ReviewCache(broken, "renderer-a");
  assert.equal(await cache.get(context), null);
  await cache.put(context, review);
  const value = cacheResult(structuredClone(review), "miss");
  assert.equal(value.cacheStatus, "miss");
  assert.deepEqual(JSON.parse(JSON.stringify(value)), review);
});
