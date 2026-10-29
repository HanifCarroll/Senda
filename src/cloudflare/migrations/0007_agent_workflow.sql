ALTER TABLE senda_agent_runs ADD COLUMN started INTEGER NOT NULL DEFAULT 0;
ALTER TABLE senda_agent_runs ADD COLUMN progress TEXT;
ALTER TABLE senda_agent_runs ADD COLUMN response TEXT;
-- Existing request-bound runs may already have contacted the provider.
UPDATE senda_agent_runs SET started=1 WHERE status='running';
