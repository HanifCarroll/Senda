import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { openHostedProjects } from "../src/server/projects.js";
import { createApplication } from "../src/server/application.js";
import { Project } from "../src/core/service.js";
import { onboardingProposals } from "../examples/complex-onboarding/proposals.js";

const owner = { userId: "project-owner" },
  other = { userId: "another-owner" },
  agent = { ...owner, clientId: "connected-agent" },
  sevenDays = 7 * 24 * 60 * 60 * 1000;
const input = (name = "Orders") => ({
  name,
  purpose: "Understand how orders are handled",
  perspective: "Operations team",
  source: {
    id: "Interview",
    title: "Order interview",
    kind: "transcript",
    text: "Ana checks each order and sends it to Finance.",
  },
});
const code = (expected) => (error) => error.code === expected;

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "senda-node-delete-"));
  let service = await openHostedProjects(directory, options);
  t.after(async () => {
    service.close();
    await rm(directory, { recursive: true, force: true });
  });
  return {
    directory,
    get service() { return service; },
    async reopen() {
      service.close();
      service = await openHostedProjects(directory, options);
      return service;
    },
  };
}

test("Node deletion frees a slot, revokes grants and only the owner can restore", async (t) => {
  const time = Date.parse("2026-10-31T12:00:00Z");
  const { service } = await fixture(t, { now: () => time, projectLimit: async () => 3 });
  const first = await service.create(owner, input("Orders"));
  await service.create(owner, input("Invoices"));
  await service.create(owner, input("Returns"));
  service.grant(owner.userId, agent.clientId, first.id);

  const removed = await service.delete(agent, first.id);
  assert.deepEqual(removed, {
    id: first.id, name: "Orders", deleted: true,
    deletedAt: "2026-10-31T12:00:00.000Z",
    restoreUntil: "2026-11-07T12:00:00.000Z",
  });
  assert.equal(service.list(owner).length, 2);
  assert.deepEqual(service.list(agent), []);
  assert.equal(service.db.prepare("SELECT COUNT(*) AS n FROM grants WHERE project=?").get(first.id).n, 0);
  assert.throws(() => service.authorize(agent, first.id), (e) =>
    e.code === "PROJECT_DELETED" && e.message === "This project was deleted.");
  assert.throws(() => service.authorize(other, first.id), code("NOT_FOUND"));
  assert.equal(service.deleted(other).length, 0);
  assert.throws(() => service.deleted(agent), code("FORBIDDEN"));
  await assert.rejects(service.restore(agent, first.id), code("FORBIDDEN"));
  await assert.rejects(service.restore(other, first.id), code("NOT_FOUND"));

  const replacement = await service.create(owner, input("Replacement"));
  assert.equal(service.list(owner).length, 3);
  await assert.rejects(service.create(owner, input("Too many")), code("PROJECT_LIMIT"));
  await assert.rejects(service.restore(owner, first.id), (e) =>
    e.code === "PROJECT_LIMIT" && /Delete another project.*Pro/.test(e.message));
  assert.equal(service.deleted(owner).length, 1);
  await service.delete(owner, replacement.id);
  assert.deepEqual(await service.restore(owner, first.id), { id: first.id, name: "Orders", restored: true });
  assert.equal(service.list(owner).length, 3);
  assert.throws(() => service.authorize(agent, first.id), code("NOT_FOUND"), "restore does not reshare a project");
  assert.equal(service.authorize(owner, first.id).name, "Orders");
});

test("Node restore preserves both model databases, evidence and independent revisions; expiry purges them", async (t) => {
  let time = Date.parse("2026-10-31T12:00:00Z");
  const f = await fixture(t, { now: () => time });
  const { proposals, texts } = await onboardingProposals();
  let service = f.service;
  const project = await service.create(owner, {
    ...input("Client onboarding"),
    source: { id: "Source_Transcript", title: "Interview", kind: "transcript", text: texts.Source_Transcript },
  });
  await service.apply(owner, project.id, proposals[0]);
  await service.createToBe(owner, project.id, { baselineRevision: 2, brief: "Plan automated invoice delivery." });
  const current = await service.withProject(owner, project.id, p => p.read()),
    future = await service.withProject(owner, project.id, p => p.read(), "to-be"),
    models = await service.models(owner, project.id),
    futureId = service.db.prepare("SELECT model_id FROM project_plans WHERE project_id=?").get(project.id).model_id;
  const untouched = await service.create(other, input("Private to another account"));
  service.grant(owner.userId, agent.clientId, project.id);
  await service.delete(owner, project.id);
  for (const model of ["as-is", "to-be"])
    await assert.rejects(service.read(owner, project.id, undefined, model), code("PROJECT_DELETED"));
  time += sevenDays - 1;
  service = await f.reopen();
  assert.equal(service.deleted(owner)[0].id, project.id);
  await service.restore(owner, project.id);
  assert.deepEqual(await service.withProject(owner, project.id, p => p.read()), current);
  assert.deepEqual(await service.withProject(owner, project.id, p => p.read(), "to-be"), future);
  assert.deepEqual(await service.models(owner, project.id), models);

  await service.delete(owner, project.id);
  time += sevenDays;
  assert.deepEqual(service.deleted(owner), []);
  await assert.rejects(service.restore(owner, project.id), code("NOT_FOUND"));
  await service.purgeDeleted();
  const directories = await readdir(path.join(f.directory, "projects"));
  assert.ok(!directories.includes(project.id));
  assert.ok(!directories.includes(futureId));
  assert.ok(directories.includes(untouched.id));
  assert.equal(service.db.prepare("SELECT COUNT(*) AS n FROM project_plans WHERE project_id=?").get(project.id).n, 0);
  const tombstone = service.db.prepare("SELECT name,state FROM projects WHERE id=?").get(project.id);
  assert.equal(tombstone.name, "");
  assert.equal(tombstone.state, "purged");
  assert.equal(service.db.prepare("SELECT COUNT(*) AS n FROM grants WHERE project=?").get(project.id).n, 0);
  await assert.rejects(service.read(owner, project.id), code("PROJECT_DELETED"));
  await service.purgeDeleted();
  assert.equal((await service.read(other, untouched.id)).name, "Private to another account");
});

test("Node permanent deletion keeps its tombstone on a filesystem failure and retries safely", async (t) => {
  let time = Date.parse("2026-10-31T12:00:00Z");
  const { service, directory } = await fixture(t, { now: () => time });
  const project = await service.create(owner, input());
  await service.delete(owner, project.id);
  time += sevenDays;
  const projectsDirectory = path.join(directory, "projects"), saved = path.join(directory, "saved-projects");
  await rename(projectsDirectory, saved);
  await writeFile(projectsDirectory, "temporary filesystem obstruction");
  await assert.rejects(service.purgeDeleted());
  assert.throws(() => service.authorize(owner, project.id), code("PROJECT_DELETED"));
  await assert.rejects(service.restore(owner, project.id), code("NOT_FOUND"));
  await rm(projectsDirectory);
  await rename(saved, projectsDirectory);
  await service.purgeDeleted();
  assert.equal(service.db.prepare("SELECT state FROM projects WHERE id=?").get(project.id).state, "purged");
  assert.deepEqual(await readdir(projectsDirectory), []);
});

test("Node catalogs from before deletion support reopen without losing saved work", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "senda-node-legacy-delete-")), id = randomUUID();
  const catalog = new DatabaseSync(path.join(directory, "catalog.sqlite"));
  catalog.exec("CREATE TABLE projects (id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,created TEXT NOT NULL)");
  catalog.prepare("INSERT INTO projects VALUES (?,?,?,?)").run(id, owner.userId, "Existing orders", "2026-10-30T00:00:00.000Z");
  catalog.close();
  await mkdir(path.join(directory, "projects"));
  const { source, ...legacyInput } = input("Existing orders");
  const project = await Project.create(path.join(directory, "projects", id), {
    ...legacyInput, sources: [source], mode: "current",
  });
  project.close();
  let service = await openHostedProjects(directory);
  t.after(async () => { service.close(); await rm(directory, { recursive: true, force: true }); });
  const saved = await service.withProject(owner, id, p => p.read());
  assert.equal(service.list(owner)[0].id, id);
  await service.delete(owner, id);
  service.close();
  service = await openHostedProjects(directory);
  assert.equal(service.deleted(owner)[0].id, id);
  await service.restore(owner, id);
  assert.deepEqual(await service.withProject(owner, id, p => p.read()), saved);
});

test("Node creates and restores cannot exceed a shared project limit", async (t) => {
  const { service } = await fixture(t, { projectLimit: async () => 3 });
  const deleted = await service.create(owner, input("Recoverable orders"));
  await service.delete(owner, deleted.id);
  const creating = await Promise.allSettled(Array.from({ length: 4 }, (_, i) => service.create(owner, input(`Orders ${i}`))));
  assert.equal(creating.filter(x => x.status === "fulfilled").length, 3);
  assert.equal(creating.find(x => x.status === "rejected").reason.code, "PROJECT_LIMIT");
  assert.equal(service.list(owner).length, 3);
  await service.delete(owner, service.list(owner)[0].id);
  const race = await Promise.allSettled([service.restore(owner, deleted.id), service.create(owner, input("New order process"))]);
  assert.equal(race.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(race.find(x => x.status === "rejected").reason.code, "PROJECT_LIMIT");
  assert.equal(service.list(owner).length, 3);
});

test('Node rejects a source write that was still preparing when the project was deleted',async t=>{
  const {service}=await fixture(t),p=await service.create(owner,input());
  const pending=service.addSource(owner,p.id,{expectedRevision:1,source:{id:'Late',kind:'document',title:'Late notes',text:'Private late notes'}});
  await service.delete(owner,p.id);await assert.rejects(pending,code('PROJECT_DELETED'));
  await service.restore(owner,p.id);assert.equal((await service.read(owner,p.id)).revision,1);
});

test('Node restoration does not authorize a prepared change from before deletion',async t=>{
  const {service}=await fixture(t),p=await service.create(owner,input());
  const prepared=await service.preview(owner,p.id,{expectedRevision:1,summary:'Late notes',sources:[{id:'Late',kind:'document',title:'Late notes',text:'Private late notes'}]});
  await service.delete(owner,p.id);await service.restore(owner,p.id);
  await assert.rejects(service.applyPreview(owner,p.id,prepared),code('STALE_PROJECT'));
  assert.equal((await service.read(owner,p.id)).revision,1);
});

test('Node delete and restore cancel an earlier To-be creation before publication',async t=>{
  const {service}=await fixture(t),{proposals,texts}=await onboardingProposals();
  const p=await service.create(owner,{...input(),source:{id:'Source_Transcript',kind:'transcript',title:'Interview',text:texts.Source_Transcript}});await service.apply(owner,p.id,proposals[0]);
  const open=service.withProject.bind(service);let first=true,resume,entered;
  const ready=new Promise(resolve=>{entered=resolve}),gate=new Promise(resolve=>{resume=resolve});
  service.withProject=async(...args)=>{const value=await open(...args);if(first){first=false;entered();await gate}return value};
  const pending=service.createToBe(owner,p.id,{baselineRevision:2,brief:'Private proposed process'});await ready;
  await service.delete(owner,p.id);await service.restore(owner,p.id);resume();
  await assert.rejects(pending,code('STALE_PROJECT'));
  assert.equal(service.db.prepare('SELECT COUNT(*) AS n FROM project_plans WHERE project_id=?').get(p.id).n,0);
});

test("Node application startup purges expired projects before serving requests", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "senda-node-delete-startup-"));
  const projects = await openHostedProjects(directory, { now: () => Date.now() - sevenDays });
  const project = await projects.create(owner, input());
  await projects.delete(owner, project.id);
  projects.close();
  const application = await createApplication({
    origin: "http://127.0.0.1:3000", directory,
    secret: "node-deletion-test-auth-secret-at-least-thirty-two-characters",
  });
  t.after(async () => { application.close(); await rm(directory, { recursive: true, force: true }); });
  assert.deepEqual(await readdir(path.join(directory, "projects")), []);
  const catalog = new DatabaseSync(path.join(directory, "catalog.sqlite"));
  try {
    assert.equal(catalog.prepare("SELECT state,name FROM projects WHERE id=?").get(project.id).state, "purged");
    assert.equal(catalog.prepare("SELECT state,name FROM projects WHERE id=?").get(project.id).name, "");
  } finally { catalog.close(); }
});
