import { hash } from "../core/hash.js";

// Derived, private review data. Ownership and project grants are checked by
// CloudProjects before this cache is consulted. Canonical revisions are untouched.
export class ReviewCache {
  constructor(bucket, version) {
    Object.assign(this, { bucket, version });
  }
  key({ modelId, record }) {
    return this.version
      ? `review-cache/${this.version}/${modelId}/${record.digest}.json`
      : null;
  }
  async get(context) {
    const key = this.key(context);
    if (!key) return null;
    try {
      const object = await this.bucket.get(key);
      if (!object || object.customMetadata?.source !== context.record.digest) return null;
      const text = await object.text();
      if (object.customMetadata.checksum !== hash(text)) return null;
      const value = JSON.parse(text);
      return value.projectId === context.projectId &&
        value.modelKind === context.model && value.revision === context.record.revision
        ? value : null;
    } catch {
      return null; // A cache miss or outage must not hide the saved model.
    }
  }
  async put(context, value) {
    const key = this.key(context);
    if (!key) return;
    const text = JSON.stringify(value);
    await this.bucket.put(key, text, {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { source: context.record.digest, checksum: hash(text) },
    }).catch(() => {});
  }
}

export function cacheResult(value, status) {
  // HTTP diagnostics only; never serialize implementation details into the review.
  return Object.defineProperty(value, "cacheStatus", { value: status });
}
