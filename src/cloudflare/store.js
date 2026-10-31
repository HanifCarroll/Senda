import { randomUUID } from "node:crypto";
import { hash, contentHash } from "../core/hash.js";
import { requireThat } from "../core/errors.js";

export async function deleteObjects(bucket, prefix, include = () => true) {
  const keys = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, ...(cursor ? { cursor } : {}) });
    keys.push(...page.objects.filter(object => include(object.key)).map(object => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  for (let start = 0; start < keys.length; start += 1000)
    await bucket.delete(keys.slice(start, start + 1000));
}

// R2 holds immutable content. D1 publishes a revision with one conditional SQL
// insert, so competing writers cannot publish the same parent twice.
export class CloudStore {
  constructor(db, bucket, modelId, records, snapshots, generation) {
    Object.assign(this, { db, bucket, modelId, records, snapshots, generation });
  }
  static async open(db, bucket, modelId, revision, { load = true, generation = 0 } = {}) {
    const { results } = await db
      .prepare(
        "SELECT revision,parent,created AS createdAt,summary,object_key,digest,content_hash FROM senda_revisions WHERE model_id=? ORDER BY revision",
      )
      .bind(modelId)
      .all();
    requireThat(results.length, "NOT_FOUND", "This model is not available.");
    const store = new CloudStore(db, bucket, modelId, results, new Map(), generation);
    if (load) {
      await store.load(results.at(-1).revision);
      if (revision !== undefined) await store.load(revision);
    }
    return store;
  }
  async load(revision) {
    if (this.snapshots.has(revision)) return this.snapshots.get(revision);
    const row = this.records.find((r) => r.revision === revision);
    requireThat(
      row,
      "REVISION_NOT_FOUND",
      "The requested revision does not exist.",
    );
    const object = await this.bucket.get(row.object_key);
    requireThat(
      object,
      "CORRUPT_REVISION",
      "The saved revision is unavailable.",
    );
    const json = await object.text();
    requireThat(
      hash(json) === row.digest,
      "CORRUPT_REVISION",
      "The saved revision failed its integrity check.",
    );
    const snapshot = JSON.parse(json);
    requireThat(
      [1, 2].includes(snapshot.formatVersion) && snapshot.revision === revision,
      "UNSUPPORTED_PROJECT",
      "Unsupported project snapshot.",
    );
    this.snapshots.set(revision, snapshot);
    return snapshot;
  }
  read(revision = this.records.at(-1)?.revision) {
    const snapshot = this.snapshots.get(revision);
    requireThat(
      snapshot,
      "REVISION_NOT_FOUND",
      "Read the saved revision before using it.",
    );
    return snapshot;
  }
  history() {
    return this.records.map(({ revision, parent, createdAt, summary }) => ({
      revision,
      parent,
      createdAt,
      summary,
    }));
  }
  async append(expectedRevision, candidate, summary) {
    const prepared = await prepareSnapshot(
      this.bucket,
      this.modelId,
      expectedRevision,
      candidate,
      summary,
    );
    const result = await this.db
      .prepare(
        "INSERT INTO senda_revisions (model_id,revision,parent,created,summary,object_key,digest,content_hash) SELECT ?,?,?,?,?,?,?,? WHERE COALESCE((SELECT MAX(revision) FROM senda_revisions WHERE model_id=?),0)=? AND EXISTS(SELECT 1 FROM senda_models m JOIN senda_projects p ON p.id=m.project_id WHERE m.id=? AND p.state='active' AND p.generation=?)",
      )
      .bind(...prepared.values, this.modelId, expectedRevision, this.modelId, this.generation)
      .run();
    if (!result.meta.changes) {
      await this.bucket.delete(prepared.row.object_key).catch(() => {});
      const active = await this.db.prepare("SELECT p.generation FROM senda_models m JOIN senda_projects p ON p.id=m.project_id WHERE m.id=? AND p.state='active'").bind(this.modelId).first();
      requireThat(active, 'PROJECT_DELETED', 'This project was deleted.');
      requireThat(active.generation === this.generation, 'STALE_PROJECT', 'This project was deleted or restored after this operation started. Open it again before continuing.');
      requireThat(
        false,
        "STALE_REVISION",
        "The model changed. Read its latest revision and reconcile your proposal.",
      );
    }
    // Never delete a candidate blob after an ambiguous database/network error:
    // its conditional insert may already have committed. Unpublished blobs stay
    // private and can be reconciled separately without risking a saved revision.
    this.records.push(prepared.row);
    this.snapshots.set(prepared.snapshot.revision, prepared.snapshot);
    return prepared.snapshot;
  }
  close() {}
}

export async function prepareSnapshot(
  bucket,
  modelId,
  parent,
  candidate,
  summary,
) {
  const snapshot = {
    ...candidate,
    revision: parent + 1,
    createdAt: new Date().toISOString(),
  };
  const json = JSON.stringify(snapshot),
    key = `models/${modelId}/revisions/${snapshot.revision}-${randomUUID()}.json`;
  const row = {
    revision: snapshot.revision,
    parent: parent || null,
    createdAt: snapshot.createdAt,
    summary,
    object_key: key,
    digest: hash(json),
    content_hash: contentHash(snapshot),
  };
  await bucket.put(key, json, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json" },
  });
  return {
    snapshot,
    row,
    values: [
      modelId,
      row.revision,
      row.parent,
      row.createdAt,
      summary,
      key,
      row.digest,
      row.content_hash,
    ],
  };
}
