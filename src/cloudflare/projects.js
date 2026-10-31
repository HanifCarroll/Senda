import { randomUUID } from "node:crypto";
import { ProjectCore, initialSnapshot } from "../core/project-core.js";
import { contentHash } from "../core/hash.js";
import { parseModel } from "../core/model.js";
import { requireThat, ScribeError } from "../core/errors.js";
import { UUID, ModelKind, Create, Plan } from "../server/contracts.js";
import { renderReview, reviewHistory } from "../server/review.js";
import { ReviewCache, cacheResult } from "./review-cache.js";
import { CloudStore, prepareSnapshot, deleteObjects } from "./store.js";

import { ProjectModels } from "../server/project-models.js";
import { nextProjectState, projectIsActive, PROJECT_RETENTION_MS as retention } from '../core/project-lifecycle.js';
import { publishModelContent } from '../server/publication-machine.js';

export class CloudProjects extends ProjectModels {
  revokesAuthTokens = true;
  constructor(db, bucket, { reviewVersion, projectLimit = async () => 100, now = Date.now } = {}) {
    super();
    Object.assign(this, { db, bucket });
    this.reviewCache = new ReviewCache(bucket, reviewVersion);
    this.projectLimit = projectLimit;
    this.now = now;
  }
  async authorize(actor, id, generation = actor.projectGeneration) {
    UUID.parse(id);
    const row = await this.db
      .prepare("SELECT * FROM senda_projects WHERE id=? AND owner=?")
      .bind(id, actor.userId)
      .first();
    requireThat(row, "NOT_FOUND", "This project is not available.");
    requireThat(projectIsActive(row), 'PROJECT_DELETED', 'This project was deleted.');
    requireThat(generation === undefined || row.generation === generation, 'STALE_PROJECT', 'This project was deleted or restored after this operation started. Open it again before continuing.');
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
      ? "SELECT p.id,p.name,p.created FROM senda_projects p JOIN senda_grants g ON g.project=p.id AND g.owner=p.owner WHERE p.owner=? AND g.client=? AND p.state='active' ORDER BY p.created DESC"
      : "SELECT id,name,created FROM senda_projects WHERE owner=? AND state='active' ORDER BY created DESC";
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
    const limit = await this.allowance(actor);
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
    await publishModelContent({
      prepare: () => prepareSnapshot(this.bucket, id, 0, snapshot, 'Initialize process discovery'),
      publish: prepared => {
        const statements = [
          this.db
            .prepare("INSERT INTO senda_projects(id,owner,name,created) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM senda_projects WHERE owner=? AND state='active')<?")
            .bind(id, actor.userId, data.name, prepared.snapshot.createdAt, actor.userId, limit),
          this.db
            .prepare("INSERT INTO senda_models SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM senda_projects WHERE id=? AND owner=?)")
            .bind(id, id, 'as-is', id, actor.userId),
          this.insertInitial(prepared),
        ];
        if (actor.clientId) statements.push(
          this.db
            .prepare("INSERT INTO senda_grants SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM senda_projects WHERE id=? AND owner=?)")
            .bind(actor.userId, actor.clientId, id, id, actor.userId),
        );
        return this.db.batch(statements);
      },
      accepted: results => results[0].meta.changes === 1,
      reject: async prepared => {
        await this.bucket.delete(prepared.row.object_key).catch(() => {});
        requireThat(false, 'PROJECT_LIMIT', limit === 3
          ? 'Free lets you keep up to 3 projects at a time. Delete a project to free a slot, or choose Senda Pro in Your plan.'
          : 'This account has reached its 100-project allowance. Your existing work stays available. Contact support if you need more room.');
      },
    });
    return { id, name: data.name, revision: 1 };
  }
  async delete(actor, id) {
    const project = await this.authorize(actor, id), deletedAt = new Date(this.now()).toISOString();
    const state = nextProjectState(project, 'DELETE', this.now());
    const [changed] = await this.db.batch([
      this.db.prepare("UPDATE senda_projects SET state=?,deleted_at=?,generation=generation+1 WHERE id=? AND owner=? AND state='active' AND generation=?")
        .bind(state, deletedAt, id, actor.userId, project.generation),
      this.db.prepare("DELETE FROM senda_grants WHERE project=? AND owner=? AND EXISTS(SELECT 1 FROM senda_projects WHERE id=? AND state='deleted')")
        .bind(id, actor.userId, id),
      ...this.settleDeletedRuns(id),
    ]);
    requireThat(changed.meta.changes === 1, 'PROJECT_DELETED', 'This project was deleted.');
    return { id, name: project.name, deleted: true, deletedAt, restoreUntil: new Date(Date.parse(deletedAt) + retention).toISOString() };
  }
  async deleted(actor) {
    requireThat(!actor.clientId, 'FORBIDDEN', 'Open the app to restore deleted projects.');
    const rows = (await this.db.prepare("SELECT id,name,deleted_at AS deletedAt FROM senda_projects WHERE owner=? AND state='deleted' AND deleted_at>? ORDER BY deleted_at DESC")
      .bind(actor.userId, new Date(this.now() - retention).toISOString()).all()).results;
    return rows.map(row => ({ ...row, restoreUntil: new Date(Date.parse(row.deletedAt) + retention).toISOString() }));
  }
  async restore(actor, id) {
    UUID.parse(id);
    requireThat(!actor.clientId, 'FORBIDDEN', 'Open the app to restore deleted projects.');
    const row = await this.db.prepare('SELECT * FROM senda_projects WHERE id=? AND owner=?').bind(id, actor.userId).first();
    requireThat(row, 'NOT_FOUND', 'This project is not available.');
    const limit = await this.allowance(actor);
    const cutoff = new Date(this.now() - retention).toISOString();
    const state = nextProjectState(row, 'RESTORE', this.now());
    requireThat(state, 'RESTORE_EXPIRED', 'The seven-day restore window has ended. This project cannot be restored.');
    const restored = await this.db.prepare("UPDATE senda_projects SET state=?,deleted_at=NULL WHERE id=? AND owner=? AND state='deleted' AND generation=? AND deleted_at>? AND (SELECT COUNT(*) FROM senda_projects WHERE owner=? AND state='active')<?")
      .bind(state, id, actor.userId, row.generation, cutoff, actor.userId, limit).run();
    requireThat(restored.meta.changes === 1, 'PROJECT_LIMIT', 'Your workspace is full. Delete another project to make room, or choose Pro, then restore this project.');
    return { id, name: row.name, restored: true };
  }
  async purgeDeleted() {
    await this.db.batch(this.settleDeletedRuns());
    const cutoff = new Date(this.now() - retention).toISOString();
    const rows = (await this.db.prepare("SELECT id,state,deleted_at FROM senda_projects WHERE state IN ('deleted','purging') AND deleted_at<=?").bind(cutoff).all()).results;
    for (const row of rows) {
      const { id } = row, state = nextProjectState(row, 'BEGIN_PURGE', this.now());
      if (!state) continue;
      const claim = await this.db.prepare("UPDATE senda_projects SET state=? WHERE id=? AND state IN ('deleted','purging') AND deleted_at<=?").bind(state, id, cutoff).run();
      if (!claim.meta.changes) continue;
      const models = (await this.db.prepare('SELECT id FROM senda_models WHERE project_id=? UNION SELECT model_id AS id FROM senda_model_candidates WHERE project_id=?').bind(id,id).all()).results;
      for (const model of models) await deleteObjects(this.bucket, `models/${model.id}/`);
      await this.reviewCache.removeModels(models.map(model => model.id));
      await this.db.batch([
        ...this.settleDeletedRuns(id),
        this.db.prepare('UPDATE senda_agent_runs SET response=NULL,progress=NULL WHERE chat IN (SELECT id FROM senda_agent_chats WHERE project=?)').bind(id),
        this.db.prepare('DELETE FROM senda_agent_chats WHERE project=?').bind(id),
        this.db.prepare('DELETE FROM senda_grants WHERE project=?').bind(id),
        this.db.prepare('DELETE FROM senda_revisions WHERE model_id IN (SELECT id FROM senda_models WHERE project_id=?)').bind(id),
        this.db.prepare('DELETE FROM senda_project_plans WHERE project_id=?').bind(id),
        this.db.prepare('DELETE FROM senda_models WHERE project_id=?').bind(id),
        this.db.prepare('DELETE FROM senda_model_candidates WHERE project_id=?').bind(id),
        this.db.prepare("UPDATE senda_projects SET state=?,name='' WHERE id=? AND state='purging'").bind(nextProjectState({ ...row, state }, 'FINISH_PURGE', this.now()), id),
      ]);
    }
  }
  settleDeletedRuns(projectId) {
    const runs = this.db.prepare(`UPDATE senda_agent_runs SET status='failed',cost_usd=CASE WHEN started=0 THEN 0 ELSE reserved_usd END,meter_usd=0,response=?,progress=NULL
      WHERE status='running' AND chat IN (
        SELECT c.id FROM senda_agent_chats c JOIN senda_projects p ON p.id=c.project
        WHERE p.state IN ('deleted','purging') AND (c.lock_until<=? OR p.state='purging' OR senda_agent_runs.started=0)${projectId ? ' AND p.id=?' : ''}
      )`).bind(JSON.stringify({type:'error',text:'This reply ended before finishing.'}),this.now(),...(projectId ? [projectId] : []));
    const chats = this.db.prepare(`UPDATE senda_agent_chats SET lock_id=NULL,lock_until=0
      WHERE project IN (SELECT id FROM senda_projects WHERE state IN ('deleted','purging'))
      AND EXISTS(SELECT 1 FROM senda_agent_runs WHERE id=senda_agent_chats.lock_id AND status='failed')${projectId ? ' AND project=?' : ''}`)
      .bind(...(projectId ? [projectId] : []));
    return [runs,chats];
  }
  async allowance(actor) {
    const limit = await this.projectLimit(actor);
    requireThat(Number.isSafeInteger(limit) && limit > 0 && limit <= 100, 'LIMIT', 'The project allowance is not available.');
    return limit;
  }
  insertInitial(prepared) {
    return this.db
      .prepare(
        "INSERT INTO senda_revisions (model_id,revision,parent,created,summary,object_key,digest,content_hash) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM senda_models WHERE id=?)",
      )
      .bind(...prepared.values, prepared.values[0]);
  }
  async open(actor, id, model = "as-is", revision, options) {
    const project = await this.authorize(actor, id);
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
      await CloudStore.open(this.db, this.bucket, row.id, revision, { ...options, generation: project.generation }),
    );
  }
  async models(actor, id) {
    const project = await this.authorize(actor, id);
    // Model switching and polling need metadata, not transcript blobs or parsing.
    const [revisions, plans] = await this.db.batch([
      this.db.prepare("SELECT m.kind,r.revision,r.parent,r.created AS createdAt,r.summary FROM senda_models m JOIN senda_revisions r ON r.model_id=m.id WHERE m.project_id=? ORDER BY m.kind,r.revision").bind(id),
      this.db.prepare("SELECT * FROM senda_project_plans WHERE project_id=?").bind(id),
    ]);
    const history = revisions.results.filter(r => r.kind === "as-is")
      .map(({ kind, ...record }) => record);
    const plan = plans.results[0];
    const future = revisions.results.filter(r => r.kind === "to-be");
    requireThat(history.length && (!plan || future.length), "NOT_FOUND", "This model is not available.");
    return {
      projectId: id,
      name: project.name,
      asIs: { revision: history.at(-1).revision, history },
      toBe: plan
        ? {
            revision: future.at(-1).revision,
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
    const project = await this.authorize(actor, id);
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
    const registered = await this.db.prepare("INSERT INTO senda_model_candidates(model_id,project_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM senda_projects WHERE id=? AND state='active' AND generation=?)")
      .bind(modelId,id,id,project.generation).run();
    if (!registered.meta.changes) await this.authorize(actor,id,project.generation);
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
    const reconcile = async (prepared, error) => {
      const plan = await this.db.prepare('SELECT model_id FROM senda_project_plans WHERE project_id=?').bind(id).first();
      if (plan) {
        if (plan.model_id !== modelId) await this.bucket.delete(prepared.row.object_key).catch(() => {});
        throw new ScribeError(
          'MODEL_EXISTS',
          'A To-be model already exists. Revise the existing plan instead.',
        );
      }
      throw error;
    };
    await publishModelContent({
      prepare: () => prepareSnapshot(this.bucket, modelId, 0, snapshot, `Start To-be planning from As-is revision ${baseline.revision}`),
      publish: prepared => this.db.batch([
        this.db
          .prepare("INSERT INTO senda_models SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM senda_projects WHERE id=? AND state='active' AND generation=?)")
          .bind(modelId, id, "to-be", id, project.generation),
        this.insertInitial(prepared),
        this.db
          .prepare("INSERT INTO senda_project_plans SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM senda_models WHERE id=?)")
          .bind(
            id,
            modelId,
            baseline.revision,
            contentHash(baseline),
            prepared.snapshot.createdAt,
            modelId,
          ),
      ]),
      accepted: result => result[0].meta.changes === 1,
      reject: async prepared => {
        await this.bucket.delete(prepared.row.object_key).catch(() => {});
        try {
          await this.authorize(actor, id, project.generation);
          requireThat(false, 'STALE_PROJECT', 'The project changed. Open it again before continuing.');
        } catch (error) { return reconcile(prepared, error); }
      },
      reconcile,
    });
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
    const p = await this.open(actor, id, model, revision, { load: false });
    const wanted = revision ?? p.store.records.at(-1).revision;
    const record = p.store.records.find(r => r.revision === wanted);
    requireThat(record, "REVISION_NOT_FOUND", "The requested revision does not exist.");
    const context = { projectId: id, modelId: p.store.modelId, model, record };
    const cached = await this.reviewCache.get(context);
    if (cached) {
      cached.history = reviewHistory({ name: cached.title, discovery: cached.discovery }, id, model, p.history());
      return cacheResult(cached, "hit");
    }
    const snapshot = await p.store.load(wanted);
    const prior = p.store.records.findLast(
      (r) =>
        r.revision < snapshot.revision &&
        r.content_hash !== contentHash(snapshot),
    );
    if (prior) await p.store.load(prior.revision);
    const value = await renderReview(p, id, wanted, model, {
      previousRevision: prior?.revision ?? null,
    });
    await this.reviewCache.put(context, value);
    return cacheResult(value, "miss");
  }
  // Connection consent can precede the first project grant.
  async grant(owner, client, id) {
    const project = id ? await this.authorize({ userId: owner }, id) : null;
    requireThat(
      typeof client === "string" && client.length <= 2048,
      "INVALID_REQUEST",
      "Choose a valid agent connection.",
    );
    const result = await this.db.batch([
      this.db
        .prepare("INSERT OR IGNORE INTO senda_agent_connections(owner,client) VALUES (?,?)")
        .bind(owner, client),
      ...(id ? [
        this.db.prepare("INSERT OR IGNORE INTO senda_grants SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM senda_projects WHERE id=? AND owner=? AND state='active' AND generation=?)").bind(owner, client, id, id, owner, project.generation),
      ] : []),
    ]);
    if (id && !result[1].meta.changes) await this.authorize({userId:owner},id,project.generation);
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
