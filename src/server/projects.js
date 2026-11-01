import { renderReview } from "./review.js";
import { DatabaseSync } from "node:sqlite";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Project } from "../core/service.js";
import { Store, contentHash } from "../core/store.js";
import { ProjectCore } from '../core/project-core.js';
import { parseModel } from "../core/model.js";
import { ScribeError, requireThat } from "../core/errors.js";

import { UUID, ModelKind, Plan, Create } from "./contracts.js";
import { ProjectModels } from "./project-models.js";
import { nextProjectState, projectIsActive, PROJECT_RETENTION_MS as retention } from '../core/project-lifecycle.js';
import { publishModelContent } from './publication-machine.js';

const fullWorkspace = "Your workspace is full. Delete another project or choose Senda Pro for more room.";
const deletionInfo = (row) => ({
  id: row.id,
  name: row.name,
  deletedAt: row.deleted_at,
  restoreUntil: new Date(Date.parse(row.deleted_at) + retention).toISOString(),
});

class AuthorizedStore extends Store {
  constructor(directory, authorize, generation) {
    super(directory);
    Object.assign(this, { authorize, generation });
  }
  append(...args) {
    this.authorize();
    return super.append(...args);
  }
}

/** All transports resolve an authenticated actor here before opening a project. */
export class HostedProjects extends ProjectModels {
  constructor(directory, { now = Date.now, projectLimit = () => 100 } = {}) {
    super();
    this.directory = directory;
    Object.assign(this, { now, projectLimit });
    this.db = new DatabaseSync(path.join(directory, "catalog.sqlite"));
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS grants (owner TEXT NOT NULL, client TEXT NOT NULL, project TEXT NOT NULL, PRIMARY KEY(owner,client,project));
      CREATE TABLE IF NOT EXISTS agent_connections (owner TEXT NOT NULL, client TEXT NOT NULL, PRIMARY KEY(owner,client));
      INSERT OR IGNORE INTO agent_connections(owner,client) SELECT DISTINCT owner,client FROM grants;
      CREATE TABLE IF NOT EXISTS agent_epochs (owner TEXT PRIMARY KEY, epoch INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS project_plans (project_id TEXT PRIMARY KEY, model_id TEXT UNIQUE NOT NULL, baseline_revision INTEGER NOT NULL, baseline_digest TEXT NOT NULL, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS model_candidates (model_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id));
      CREATE INDEX IF NOT EXISTS model_candidates_project ON model_candidates(project_id);`);
    const columns = this.db.prepare("PRAGMA table_info(projects)").all();
    if (!columns.some((column) => column.name === "state"))
      this.db.exec("ALTER TABLE projects ADD COLUMN state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','deleted','purging','purged'))");
    if (!columns.some((column) => column.name === "deleted_at"))
      this.db.exec("ALTER TABLE projects ADD COLUMN deleted_at TEXT");
    if (!columns.some((column) => column.name === 'generation'))
      this.db.exec('ALTER TABLE projects ADD COLUMN generation INTEGER NOT NULL DEFAULT 0');
  }
  epoch(owner) {
    return Number(
      this.db.prepare("SELECT epoch FROM agent_epochs WHERE owner=?").get(owner)
        ?.epoch || 0,
    );
  }
  authorize(actor, id, generation) {
    UUID.parse(id);
    const row = this.db
      .prepare("SELECT * FROM projects WHERE id=? AND owner=?")
      .get(id, actor.userId);
    requireThat(row, "NOT_FOUND", "This project is not available.");
    requireThat(projectIsActive(row), "PROJECT_DELETED", "This project was deleted.");
    requireThat(generation === undefined || row.generation === generation, 'STALE_PROJECT', 'This project was deleted or restored after this operation started. Open it again before continuing.');
    if (actor.clientId)
      requireThat(
        this.db
          .prepare(
            "SELECT 1 FROM grants WHERE owner=? AND client=? AND project=?",
          )
          .get(actor.userId, actor.clientId, id),
        "NOT_FOUND",
        "This project is not available to this connection.",
      );
    return row;
  }
  list(actor) {
    return this.db
      .prepare(
        actor.clientId
          ? "SELECT p.id,p.name,p.created FROM projects p JOIN grants g ON g.project=p.id AND g.owner=p.owner WHERE p.owner=? AND g.client=? AND p.state='active' ORDER BY p.created DESC"
          : "SELECT id,name,created FROM projects WHERE owner=? AND state='active' ORDER BY created DESC",
      )
      .all(
        ...(actor.clientId ? [actor.userId, actor.clientId] : [actor.userId]),
      );
  }
  async create(actor, input) {
    const data = Create.parse(input);
    const limit = await this.allowance(actor);
    requireThat(
      this.list({ userId: actor.userId }).length < limit,
      "PROJECT_LIMIT",
      fullWorkspace,
    );
    if (data.source) this.checkSources([data.source]);
    const id = randomUUID(),
      directory = path.join(this.directory, "projects", id);
    const discard = async error => {
      await rm(directory, { recursive: true, force: true });
      throw error;
    };
    await publishModelContent({
      prepare: async () => {
        const project = await Project.create(directory, {
          name: data.name,
          purpose: data.purpose,
          perspective: data.perspective,
          sources: data.source ? [data.source] : [],
          mode: 'current',
        });
        project.close();
        return { directory };
      },
      publish: () => {
        const inserted = this.db
          .prepare("INSERT INTO projects(id,owner,name,created) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM projects WHERE owner=? AND state='active')<?")
          .run(id, actor.userId, data.name, new Date(this.now()).toISOString(), actor.userId, limit);
        if (inserted.changes && actor.clientId) this.grant(actor.userId, actor.clientId, id);
        return inserted;
      },
      accepted: result => result.changes === 1,
      reject: () => discard(new ScribeError('PROJECT_LIMIT', fullWorkspace)),
      reconcile: (_, error) => discard(error),
    });
    return { id, name: data.name, revision: 1 };
  }
  async allowance(actor) {
    const limit = await this.projectLimit(actor);
    requireThat(Number.isSafeInteger(limit) && limit > 0 && limit <= 100,
      "LIMIT", "The project allowance is not available.");
    return limit;
  }
  deleted(actor) {
    requireThat(!actor.clientId, "FORBIDDEN", "Open Senda to restore a deleted project.");
    return this.db.prepare("SELECT id,name,deleted_at FROM projects WHERE owner=? AND state='deleted' AND deleted_at>? ORDER BY deleted_at DESC")
      .all(actor.userId, new Date(this.now() - retention).toISOString()).map(deletionInfo);
  }
  async delete(actor, id) {
    const row = this.authorize(actor, id), deletedAt = new Date(this.now()).toISOString();
    const state = nextProjectState(row, 'DELETE', this.now());
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const changed = this.db.prepare("UPDATE projects SET state=?,deleted_at=?,generation=generation+1 WHERE id=? AND owner=? AND state='active' AND generation=?")
        .run(state, deletedAt, id, actor.userId, row.generation);
      requireThat(changed.changes === 1, 'STALE_PROJECT', 'The project changed. Open it again before continuing.');
      this.db.prepare("DELETE FROM grants WHERE project=?").run(id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { ...deletionInfo({ ...row, deleted_at: deletedAt }), deleted: true };
  }
  async restore(actor, id) {
    requireThat(!actor.clientId, "FORBIDDEN", "Open Senda to restore a deleted project.");
    UUID.parse(id);
    const row = this.db.prepare("SELECT * FROM projects WHERE id=? AND owner=?").get(id, actor.userId);
    const state = nextProjectState(row, 'RESTORE', this.now());
    requireThat(state,
      "NOT_FOUND", "This deleted project is no longer available to restore.");
    const limit = await this.allowance(actor), cutoff = new Date(this.now() - retention).toISOString();
    const restored = this.db.prepare("UPDATE projects SET state=?,deleted_at=NULL WHERE id=? AND owner=? AND state='deleted' AND generation=? AND deleted_at>? AND (SELECT COUNT(*) FROM projects WHERE owner=? AND state='active')<?")
      .run(state, id, actor.userId, row.generation, cutoff, actor.userId, limit);
    if (!restored.changes) {
      const latest = this.db.prepare("SELECT state,deleted_at,generation FROM projects WHERE id=? AND owner=?").get(id, actor.userId);
      requireThat(latest?.generation === row.generation, 'STALE_PROJECT', 'The project changed. Open it again before continuing.');
      requireThat(latest?.state === "deleted" && latest.deleted_at > cutoff,
        "NOT_FOUND", "This deleted project is no longer available to restore.");
      requireThat(false, "PROJECT_LIMIT", fullWorkspace);
    }
    return { id, name: row.name, restored: true };
  }
  async purgeDeleted() {
    const cutoff = new Date(this.now() - retention).toISOString();
    const rows = this.db.prepare("SELECT id,state,deleted_at FROM projects WHERE state IN ('deleted','purging') AND deleted_at<=?").all(cutoff);
    let purged = 0;
    for (const row of rows) {
      const { id } = row, state = nextProjectState(row, 'BEGIN_PURGE', this.now());
      if (!state) continue;
      const claimed = this.db.prepare("UPDATE projects SET state=? WHERE id=? AND state IN ('deleted','purging') AND deleted_at<=?").run(state, id, cutoff);
      if (!claimed.changes) continue;
      const models = this.db.prepare('SELECT ? AS model_id UNION SELECT model_id FROM project_plans WHERE project_id=? UNION SELECT model_id FROM model_candidates WHERE project_id=?').all(id,id,id);
      for (const {model_id:modelId} of models)
        await rm(path.join(this.directory, "projects", modelId), { recursive: true, force: true });
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.prepare("DELETE FROM grants WHERE project=?").run(id);
        this.db.prepare("DELETE FROM project_plans WHERE project_id=?").run(id);
        this.db.prepare('DELETE FROM model_candidates WHERE project_id=?').run(id);
        this.db.prepare("UPDATE projects SET state=?,name='' WHERE id=? AND state='purging'").run(nextProjectState({ ...row, state }, 'FINISH_PURGE', this.now()), id);
        this.db.exec("COMMIT");
        purged++;
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    }
    return { purged };
  }
  async withProject(actor, id, work, model = "as-is") {
    const record = this.authorize(actor, id);
    ModelKind.parse(model);
    const plan =
      model === "to-be" &&
      this.db.prepare("SELECT * FROM project_plans WHERE project_id=?").get(id);
    requireThat(
      model === "as-is" || plan,
      "NOT_FOUND",
      "This project has no To-be model yet. Start a plan from an As-is revision.",
    );
    const project = new ProjectCore(new AuthorizedStore(
      path.join(this.directory, "projects", plan ? plan.model_id : id),
      () => this.authorize(actor,id,record.generation), record.generation,
    ));
    try {
      const result = await work(project);
      const name = model === 'as-is' ? project.read().name : record.name;
      if (name !== record.name) {
        this.db.prepare("UPDATE projects SET name=? WHERE id=? AND owner=? AND state='active' AND generation=?")
          .run(name, id, actor.userId, record.generation);
      }
      return result;
    } finally {
      project.close();
    }
  }
  async models(actor, id) {
    const project = this.authorize(actor, id);
    const current = await this.withProject(actor, id, (p) => ({
      revision: p.read().revision,
      history: p.history(),
    }));
    const plan = this.db
      .prepare("SELECT * FROM project_plans WHERE project_id=?")
      .get(id);
    return {
      projectId: id,
      name: project.name,
      asIs: current,
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
    const project = this.authorize(actor, id);
    const data = Plan.parse(input);
    requireThat(
      !this.db
        .prepare("SELECT 1 FROM project_plans WHERE project_id=?")
        .get(id),
      "MODEL_EXISTS",
      "A To-be model already exists. Revise the existing plan instead.",
    );
    const baseline = await this.withProject(actor, id, (p) =>
      p.read(data.baselineRevision),
    );
    requireThat(
      (await parseModel(baseline.xml)).elements.some((e) =>
        e.$instanceOf?.("bpmn:FlowNode"),
      ),
      "INVALID_REQUEST",
      "Create an As-is diagram before starting a To-be plan.",
    );
    const modelId = randomUUID(),
      directory = path.join(this.directory, "projects", modelId);
    const registered = this.db.prepare("INSERT INTO model_candidates(model_id,project_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM projects WHERE id=? AND state='active' AND generation=?)").run(modelId,id,id,project.generation);
    if (!registered.changes) this.authorize(actor,id,project.generation);
    const discard = async error => {
      await rm(directory, { recursive: true, force: true });
      if (this.db.prepare('SELECT 1 FROM project_plans WHERE project_id=?').get(id))
        throw new ScribeError('MODEL_EXISTS', 'A To-be model already exists. Revise the existing plan instead.');
      throw error;
    };
    await publishModelContent({
      prepare: async () => {
        try {
          const p = await Project.create(
            directory,
            {
              name: baseline.name,
              mode: 'proposed',
              purpose:
                `Plan the future process: ${baseline.discovery.context.purpose}`.slice(0, 8000),
              perspective: baseline.discovery.context.perspective,
              sources: [{
                id: 'Design_Brief',
                kind: 'document',
                title: 'To-be design brief',
                text: data.brief,
                origin: `as-is:revision-${baseline.revision}`,
              }],
            },
            {
              baselineXml: baseline.xml,
              summary: `Start To-be planning from As-is revision ${baseline.revision}`,
            },
          );
          p.close();
          return { directory };
        } catch (error) { return discard(error); }
      },
      publish: () => {
        this.authorize(actor, id, project.generation);
        return this.db
          .prepare("INSERT INTO project_plans SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM projects WHERE id=? AND state='active' AND generation=?)")
          .run(
            id,
            modelId,
            baseline.revision,
            contentHash(baseline),
            new Date().toISOString(),
            id,
            project.generation,
          );
      },
      accepted: result => result.changes === 1,
      reject: () => discard(new ScribeError('STALE_PROJECT', 'The project changed. Open it again before continuing.')),
      reconcile: (_, error) => discard(error),
    });
    return {
      id,
      model: "to-be",
      revision: 1,
      baselineRevision: baseline.revision,
    };
  }
  async head(actor, id, model = "as-is") {
    return this.withProject(
      actor,
      id,
      (p) => ({ id, model, revision: p.read().revision }),
      model,
    );
  }
  async review(actor, id, revision, model = "as-is") {
    return this.withProject(
      actor,
      id,
      (p) => renderReview(p, id, revision, model),
      model,
    );
  }
  // Connection consent can precede the first project grant.
  grant(owner, client, id) {
    if (id) this.authorize({ userId: owner }, id);
    requireThat(
      typeof client === "string" && client.length <= 2048,
      "INVALID_REQUEST",
      "Choose a valid agent connection.",
    );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT OR IGNORE INTO agent_connections(owner,client) VALUES (?,?)")
        .run(owner, client);
      if (id)
        this.db
          .prepare("INSERT OR IGNORE INTO grants VALUES (?,?,?)")
          .run(owner, client, id);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  connections(owner) {
    return this.db
      .prepare(
        "SELECT g.client,p.id,p.name FROM grants g JOIN projects p ON p.id=g.project AND p.owner=g.owner WHERE g.owner=? UNION ALL SELECT c.client,NULL AS id,'No projects shared yet' AS name FROM agent_connections c WHERE c.owner=? AND NOT EXISTS (SELECT 1 FROM grants g WHERE g.owner=c.owner AND g.client=c.client) ORDER BY client,name",
      )
      .all(owner, owner);
  }
  revokeAll(owner) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("DELETE FROM grants WHERE owner=?").run(owner);
      this.db.prepare("DELETE FROM agent_connections WHERE owner=?").run(owner);
      this.db
        .prepare(
          "INSERT INTO agent_epochs VALUES (?,1) ON CONFLICT(owner) DO UPDATE SET epoch=epoch+1",
        )
        .run(owner);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return { revoked: true };
  }
  close() {
    this.db.close();
  }
}

export async function openHostedProjects(directory, options) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return new HostedProjects(directory, options);
}
