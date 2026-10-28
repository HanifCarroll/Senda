import { randomUUID } from "node:crypto";
import { ProjectCore, initialSnapshot } from "../core/project-core.js";
import { contentHash } from "../core/hash.js";
import { parseModel } from "../core/model.js";
import { requireThat, ScribeError } from "../core/errors.js";
import { UUID, ModelKind, Create, Plan } from "../server/contracts.js";
import { renderReview } from "../server/review.js";
import { CloudStore, prepareSnapshot } from "./store.js";

import { ProjectModels } from "../server/project-models.js";

export class CloudProjects extends ProjectModels {
  revokesAuthTokens = true;
  constructor(db, bucket) {
    super();
    Object.assign(this, { db, bucket });
  }
  async authorize(actor, id) {
    UUID.parse(id);
    const row = await this.db
      .prepare("SELECT * FROM senda_projects WHERE id=? AND owner=?")
      .bind(id, actor.userId)
      .first();
    requireThat(row, "NOT_FOUND", "This project is not available.");
    if (actor.clientId)
      requireThat(
        await this.db
          .prepare(
            "SELECT 1 FROM senda_grants WHERE owner=? AND client=? AND project=?",
          )
          .bind(actor.userId, actor.clientId, id)
          .first(),
        "NOT_FOUND",
        "This project is not available to this connection.",
      );
    return row;
  }
  async epoch(owner) {
    return Number(
      (
        await this.db
          .prepare("SELECT epoch FROM senda_agent_epochs WHERE owner=?")
          .bind(owner)
          .first()
      )?.epoch || 0,
    );
  }
  async list(actor) {
    const sql = actor.clientId
      ? "SELECT p.id,p.name,p.created FROM senda_projects p JOIN senda_grants g ON g.project=p.id AND g.owner=p.owner WHERE p.owner=? AND g.client=? ORDER BY p.created DESC"
      : "SELECT id,name,created FROM senda_projects WHERE owner=? ORDER BY created DESC";
    return (
      await this.db
        .prepare(sql)
        .bind(
          ...(actor.clientId ? [actor.userId, actor.clientId] : [actor.userId]),
        )
        .all()
    ).results;
  }
  async create(actor, input) {
    const data = Create.parse(input);
    requireThat(
      (await this.list({ userId: actor.userId })).length < 100,
      "LIMIT",
      "The account has reached its project limit.",
    );
    const id = randomUUID(),
      sources = data.source ? [data.source] : [];
    this.checkSources(sources);
    const snapshot = await initialSnapshot({
      name: data.name,
      purpose: data.purpose,
      perspective: data.perspective,
      sources,
      mode: "current",
    });
    const prepared = await prepareSnapshot(
      this.bucket,
      id,
      0,
      snapshot,
      "Initialize process discovery",
    );
    const statements = [
      this.db
        .prepare("INSERT INTO senda_projects VALUES (?,?,?,?)")
        .bind(id, actor.userId, data.name, prepared.snapshot.createdAt),
      this.db
        .prepare("INSERT INTO senda_models VALUES (?,?,?)")
        .bind(id, id, "as-is"),
      this.insertInitial(prepared),
    ];
    if (actor.clientId)
      statements.push(
        this.db
          .prepare("INSERT INTO senda_grants VALUES (?,?,?)")
          .bind(actor.userId, actor.clientId, id),
      );
    await this.db.batch(statements);
    return { id, name: data.name, revision: 1 };
  }
  insertInitial(prepared) {
    return this.db
      .prepare(
        "INSERT INTO senda_revisions (model_id,revision,parent,created,summary,object_key,digest,content_hash) VALUES (?,?,?,?,?,?,?,?)",
      )
      .bind(...prepared.values);
  }
  async open(actor, id, model = "as-is", revision) {
    await this.authorize(actor, id);
    ModelKind.parse(model);
    const row = await this.db
      .prepare("SELECT id FROM senda_models WHERE project_id=? AND kind=?")
      .bind(id, model)
      .first();
    requireThat(
      row,
      "NOT_FOUND",
      "This project has no To-be model yet. Start a plan from an As-is revision.",
    );
    return new ProjectCore(
      await CloudStore.open(this.db, this.bucket, row.id, revision),
    );
  }
  async models(actor, id) {
    const project = await this.authorize(actor, id),
      asIs = await this.open(actor, id);
    const plan = await this.db
      .prepare("SELECT * FROM senda_project_plans WHERE project_id=?")
      .bind(id)
      .first();
    return {
      projectId: id,
      name: project.name,
      asIs: { revision: asIs.read().revision, history: asIs.history() },
      toBe: plan
        ? {
            revision: (await this.head(actor, id, "to-be")).revision,
            baseline: {
              revision: plan.baseline_revision,
              digest: plan.baseline_digest,
              created: plan.created,
            },
          }
        : null,
    };
  }
  async createToBe(actor, id, input) {
    await this.authorize(actor, id);
    const data = Plan.parse(input);
    requireThat(
      !(await this.db
        .prepare("SELECT 1 FROM senda_project_plans WHERE project_id=?")
        .bind(id)
        .first()),
      "MODEL_EXISTS",
      "A To-be model already exists. Revise the existing plan instead.",
    );
    const baseline = (
      await this.open(actor, id, "as-is", data.baselineRevision)
    ).read(data.baselineRevision);
    requireThat(
      (await parseModel(baseline.xml)).elements.some((e) =>
        e.$instanceOf?.("bpmn:FlowNode"),
      ),
      "INVALID_REQUEST",
      "Create an As-is diagram before starting a To-be plan.",
    );
    const modelId = randomUUID();
    const snapshot = await initialSnapshot(
      {
        name: baseline.name,
        mode: "proposed",
        purpose:
          `Plan the future process: ${baseline.discovery.context.purpose}`.slice(
            0,
            8000,
          ),
        perspective: baseline.discovery.context.perspective,
        sources: [
          {
            id: "Design_Brief",
            kind: "document",
            title: "To-be design brief",
            text: data.brief,
            origin: `as-is:revision-${baseline.revision}`,
          },
        ],
      },
      { baselineXml: baseline.xml },
    );
    const prepared = await prepareSnapshot(
      this.bucket,
      modelId,
      0,
      snapshot,
      `Start To-be planning from As-is revision ${baseline.revision}`,
    );
    try {
      await this.db.batch([
        this.db
          .prepare("INSERT INTO senda_models VALUES (?,?,?)")
          .bind(modelId, id, "to-be"),
        this.insertInitial(prepared),
        this.db
          .prepare("INSERT INTO senda_project_plans VALUES (?,?,?,?,?)")
          .bind(
            id,
            modelId,
            baseline.revision,
            contentHash(baseline),
            prepared.snapshot.createdAt,
          ),
      ]);
    } catch (e) {
      if (
        await this.db
          .prepare("SELECT 1 FROM senda_project_plans WHERE project_id=?")
          .bind(id)
          .first()
      )
        throw new ScribeError(
          "MODEL_EXISTS",
          "A To-be model already exists. Revise the existing plan instead.",
        );
      throw e;
    }
    return {
      id,
      model: "to-be",
      revision: 1,
      baselineRevision: baseline.revision,
    };
  }
  async head(actor, id, model = "as-is") {
    await this.authorize(actor, id);
    ModelKind.parse(model);
    const row = await this.db
      .prepare(
        "SELECT MAX(r.revision) AS revision FROM senda_models m JOIN senda_revisions r ON r.model_id=m.id WHERE m.project_id=? AND m.kind=?",
      )
      .bind(id, model)
      .first();
    requireThat(row?.revision, "NOT_FOUND", "This model is not available.");
    return { id, model, revision: row.revision };
  }
  async withProject(actor, id, work, model = "as-is", revision) {
    const project = await this.open(actor, id, model, revision);
    try {
      return await work(project);
    } finally {
      project.close();
    }
  }
  async review(actor, id, revision, model = "as-is") {
    const p = await this.open(actor, id, model, revision),
      snapshot = p.read(revision);
    const prior = p.store.records.findLast(
      (r) =>
        r.revision < snapshot.revision &&
        r.content_hash !== contentHash(snapshot),
    );
    if (prior) await p.store.load(prior.revision);
    return renderReview(p, id, revision, model, {
      previousRevision: prior?.revision ?? null,
    });
  }
  // Connection consent can precede the first project grant.
  async grant(owner, client, id) {
    if (id) await this.authorize({ userId: owner }, id);
    requireThat(
      typeof client === "string" && client.length <= 2048,
      "INVALID_REQUEST",
      "Choose a valid agent connection.",
    );
    await this.db.batch([
      this.db
        .prepare("INSERT OR IGNORE INTO senda_agent_connections(owner,client) VALUES (?,?)")
        .bind(owner, client),
      ...(id ? [
        this.db.prepare("INSERT OR IGNORE INTO senda_grants VALUES (?,?,?)").bind(owner, client, id),
      ] : []),
    ]);
  }
  async connections(owner) {
    return (
      await this.db
        .prepare(
          "SELECT g.client,p.id,p.name FROM senda_grants g JOIN senda_projects p ON p.id=g.project AND p.owner=g.owner WHERE g.owner=? UNION ALL SELECT c.client,NULL AS id,'No projects shared yet' AS name FROM senda_agent_connections c WHERE c.owner=? AND NOT EXISTS (SELECT 1 FROM senda_grants g WHERE g.owner=c.owner AND g.client=c.client) ORDER BY client,name",
        )
        .bind(owner, owner)
        .all()
    ).results;
  }
  async revokeAll(owner) {
    await this.db.batch([
      this.db
        .prepare('DELETE FROM "oauthAccessToken" WHERE "userId"=?')
        .bind(owner),
      this.db
        .prepare('DELETE FROM "oauthRefreshToken" WHERE "userId"=?')
        .bind(owner),
      this.db
        .prepare('DELETE FROM "oauthConsent" WHERE "userId"=?')
        .bind(owner),
      this.db.prepare("DELETE FROM senda_grants WHERE owner=?").bind(owner),
      this.db.prepare("DELETE FROM senda_agent_connections WHERE owner=?").bind(owner),
      this.db
        .prepare(
          "INSERT INTO senda_agent_epochs VALUES (?,1) ON CONFLICT(owner) DO UPDATE SET epoch=epoch+1",
        )
        .bind(owner),
    ]);
    return { revoked: true };
  }
  close() {}
}
