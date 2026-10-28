import { renderReview } from "./review.js";
import { DatabaseSync } from "node:sqlite";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Project } from "../src/service.js";
import { contentHash } from "../src/store.js";
import { parseModel } from "../src/model.js";
import { ScribeError, requireThat } from "../src/errors.js";

import { UUID, ModelKind, Plan, Create } from "./contracts.js";
import { ProjectModels } from "./project-models.js";

/** All transports resolve an authenticated actor here before opening a project. */
export class HostedProjects extends ProjectModels {
  constructor(directory) {
    super();
    this.directory = directory;
    this.db = new DatabaseSync(path.join(directory, "catalog.sqlite"));
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS grants (owner TEXT NOT NULL, client TEXT NOT NULL, project TEXT NOT NULL, PRIMARY KEY(owner,client,project));
      CREATE TABLE IF NOT EXISTS agent_epochs (owner TEXT PRIMARY KEY, epoch INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS project_plans (project_id TEXT PRIMARY KEY, model_id TEXT UNIQUE NOT NULL, baseline_revision INTEGER NOT NULL, baseline_digest TEXT NOT NULL, created TEXT NOT NULL);`);
  }
  epoch(owner) {
    return Number(
      this.db.prepare("SELECT epoch FROM agent_epochs WHERE owner=?").get(owner)
        ?.epoch || 0,
    );
  }
  authorize(actor, id) {
    UUID.parse(id);
    const row = this.db
      .prepare("SELECT * FROM projects WHERE id=? AND owner=?")
      .get(id, actor.userId);
    requireThat(row, "NOT_FOUND", "This project is not available.");
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
          ? "SELECT p.id,p.name,p.created FROM projects p JOIN grants g ON g.project=p.id AND g.owner=p.owner WHERE p.owner=? AND g.client=? ORDER BY p.created DESC"
          : "SELECT id,name,created FROM projects WHERE owner=? ORDER BY created DESC",
      )
      .all(
        ...(actor.clientId ? [actor.userId, actor.clientId] : [actor.userId]),
      );
  }
  async create(actor, input) {
    const data = Create.parse(input);
    requireThat(
      this.list({ userId: actor.userId }).length < 100,
      "LIMIT",
      "The account has reached its project limit.",
    );
    if (data.source) this.checkSources([data.source]);
    const id = randomUUID(),
      directory = path.join(this.directory, "projects", id);
    const project = await Project.create(directory, {
      name: data.name,
      purpose: data.purpose,
      perspective: data.perspective,
      sources: data.source ? [data.source] : [],
      mode: "current",
    });
    project.close();
    try {
      this.db
        .prepare("INSERT INTO projects VALUES (?,?,?,?)")
        .run(id, actor.userId, data.name, new Date().toISOString());
      if (actor.clientId) this.grant(actor.userId, actor.clientId, id);
    } catch (e) {
      await rm(directory, { recursive: true, force: true });
      throw e;
    }
    return { id, name: data.name, revision: 1 };
  }
  async withProject(actor, id, work, model = "as-is") {
    this.authorize(actor, id);
    ModelKind.parse(model);
    const plan =
      model === "to-be" &&
      this.db.prepare("SELECT * FROM project_plans WHERE project_id=?").get(id);
    requireThat(
      model === "as-is" || plan,
      "NOT_FOUND",
      "This project has no To-be model yet. Start a plan from an As-is revision.",
    );
    const project = new Project(
      path.join(this.directory, "projects", plan ? plan.model_id : id),
    );
    try {
      return await work(project);
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
    this.authorize(actor, id);
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
    try {
      const p = await Project.create(
        directory,
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
        {
          baselineXml: baseline.xml,
          summary: `Start To-be planning from As-is revision ${baseline.revision}`,
        },
      );
      p.close();
      // The unique project key also prevents two concurrent requests from replacing a plan.
      this.db
        .prepare("INSERT INTO project_plans VALUES (?,?,?,?,?)")
        .run(
          id,
          modelId,
          baseline.revision,
          contentHash(baseline),
          new Date().toISOString(),
        );
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      if (
        this.db
          .prepare("SELECT 1 FROM project_plans WHERE project_id=?")
          .get(id)
      )
        throw new ScribeError(
          "MODEL_EXISTS",
          "A To-be model already exists. Revise the existing plan instead.",
        );
      throw error;
    }
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
  grant(owner, client, id) {
    this.authorize({ userId: owner }, id);
    requireThat(
      typeof client === "string" && client.length <= 2048,
      "INVALID_REQUEST",
      "Choose a valid agent connection.",
    );
    this.db
      .prepare("INSERT OR IGNORE INTO grants VALUES (?,?,?)")
      .run(owner, client, id);
  }
  connections(owner) {
    return this.db
      .prepare(
        "SELECT g.client,p.id,p.name FROM grants g JOIN projects p ON p.id=g.project AND p.owner=g.owner WHERE g.owner=? ORDER BY g.client,p.name",
      )
      .all(owner);
  }
  revokeAll(owner) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("DELETE FROM grants WHERE owner=?").run(owner);
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

export async function openHostedProjects(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return new HostedProjects(directory);
}
