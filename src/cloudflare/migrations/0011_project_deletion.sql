ALTER TABLE senda_projects ADD COLUMN state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','deleted','purging','purged'));
ALTER TABLE senda_projects ADD COLUMN deleted_at TEXT;
ALTER TABLE senda_projects ADD COLUMN generation INTEGER NOT NULL DEFAULT 0;
CREATE INDEX senda_projects_cleanup ON senda_projects(state,deleted_at);
CREATE TABLE senda_model_candidates (
  model_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES senda_projects(id)
);
CREATE INDEX senda_model_candidates_project ON senda_model_candidates(project_id);
CREATE INDEX senda_agent_chats_project ON senda_agent_chats(project);
CREATE INDEX senda_agent_runs_chat_status ON senda_agent_runs(chat,status);

DROP TRIGGER senda_revisions_immutable_delete;
CREATE TRIGGER senda_revisions_immutable_delete BEFORE DELETE ON senda_revisions
WHEN NOT EXISTS (
  SELECT 1 FROM senda_models m JOIN senda_projects p ON p.id=m.project_id
  WHERE m.id=OLD.model_id AND p.state='purging'
)
BEGIN SELECT RAISE(ABORT, 'Revisions are immutable'); END;
