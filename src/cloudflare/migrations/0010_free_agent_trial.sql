CREATE TABLE senda_agent_trials (
 owner TEXT PRIMARY KEY,
 chat TEXT NOT NULL UNIQUE,
 project TEXT UNIQUE,
 limit_usd REAL NOT NULL CHECK(limit_usd>0 AND limit_usd<=1),
 created TEXT NOT NULL
);
ALTER TABLE senda_agent_runs ADD COLUMN trial_owner TEXT;
CREATE INDEX senda_agent_runs_trial ON senda_agent_runs(trial_owner);
