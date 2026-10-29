-- Keep aggregate admission accounting separate from the customer's immutable
-- billing-period attribution. A turn crossing UTC midnight moves its entire
-- reservation to the new service window, conservatively counting earlier work.
ALTER TABLE senda_agent_runs ADD COLUMN service_day TEXT;
UPDATE senda_agent_runs SET service_day=day;
CREATE INDEX senda_agent_runs_service ON senda_agent_runs(service_day);
CREATE TABLE senda_operational_alerts (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, created TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', sent TEXT
);
