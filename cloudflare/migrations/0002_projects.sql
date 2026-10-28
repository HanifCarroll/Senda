CREATE TABLE senda_projects (id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, created TEXT NOT NULL);
CREATE INDEX senda_projects_owner ON senda_projects(owner,created);
CREATE TABLE senda_models (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES senda_projects(id), kind TEXT NOT NULL CHECK(kind IN ('as-is','to-be')), UNIQUE(project_id,kind));
CREATE TABLE senda_grants (owner TEXT NOT NULL, client TEXT NOT NULL, project TEXT NOT NULL REFERENCES senda_projects(id), PRIMARY KEY(owner,client,project));
CREATE TABLE senda_agent_epochs (owner TEXT PRIMARY KEY, epoch INTEGER NOT NULL DEFAULT 0);
CREATE TABLE senda_project_plans (project_id TEXT PRIMARY KEY REFERENCES senda_projects(id), model_id TEXT UNIQUE NOT NULL REFERENCES senda_models(id), baseline_revision INTEGER NOT NULL, baseline_digest TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE senda_revisions (model_id TEXT NOT NULL REFERENCES senda_models(id), revision INTEGER NOT NULL, parent INTEGER, created TEXT NOT NULL, summary TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, digest TEXT NOT NULL, content_hash TEXT NOT NULL, PRIMARY KEY(model_id,revision));
CREATE TRIGGER senda_revisions_immutable_update BEFORE UPDATE ON senda_revisions BEGIN SELECT RAISE(ABORT, 'Revisions are immutable'); END;
CREATE TRIGGER senda_revisions_immutable_delete BEFORE DELETE ON senda_revisions BEGIN SELECT RAISE(ABORT, 'Revisions are immutable'); END;
