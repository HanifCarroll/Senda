-- Attribute the entire turn to the Stripe period that admitted it. Operator
-- preview runs intentionally have no billing period and never use a paid meter.
ALTER TABLE senda_agent_runs ADD COLUMN billing_context TEXT;
ALTER TABLE senda_agent_runs ADD COLUMN billing_subscription TEXT;
ALTER TABLE senda_agent_runs ADD COLUMN billing_period_start TEXT;
ALTER TABLE senda_agent_runs ADD COLUMN billing_period_end TEXT;
CREATE INDEX senda_agent_runs_period ON senda_agent_runs(owner,billing_context,billing_subscription,billing_period_start);
