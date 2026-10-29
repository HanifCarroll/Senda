CREATE TABLE senda_agent_chats (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, project TEXT,
 created TEXT NOT NULL, updated TEXT NOT NULL,
 messages TEXT NOT NULL DEFAULT '[]', display TEXT NOT NULL DEFAULT '[]',
 lock_id TEXT, lock_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX senda_agent_chats_owner ON senda_agent_chats(owner,updated);
CREATE TABLE senda_agent_runs (
 id TEXT PRIMARY KEY, chat TEXT NOT NULL, owner TEXT NOT NULL,
 day TEXT NOT NULL, status TEXT NOT NULL, reserved_usd REAL NOT NULL,
 cost_usd REAL, input_tokens INTEGER, output_tokens INTEGER, created TEXT NOT NULL
);
CREATE INDEX senda_agent_runs_budget ON senda_agent_runs(owner,day);
