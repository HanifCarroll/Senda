-- Keep operational spend separate from the customer's allowance. Unknown calls
-- retain their bounded reservation; a failed turn with no saved progress uses
-- no customer allowance. Historical runs retain their original accounting.
ALTER TABLE senda_agent_runs ADD COLUMN meter_usd REAL;
ALTER TABLE senda_agent_runs ADD COLUMN rate_card TEXT NOT NULL DEFAULT 'deepseek-flash-2026-10-28-peak';
