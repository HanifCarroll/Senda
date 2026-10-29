CREATE TABLE senda_billing_customers (
 context TEXT NOT NULL, owner TEXT NOT NULL, customer TEXT,
 checkout_id TEXT, checkout_attempt TEXT NOT NULL,
 lock_id TEXT, lock_until INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(context,owner), UNIQUE(context,customer)
);
CREATE TABLE senda_billing_subscriptions (
 context TEXT NOT NULL, id TEXT NOT NULL, owner TEXT NOT NULL,
 status TEXT NOT NULL, eligible INTEGER NOT NULL DEFAULT 0,
 period_start INTEGER NOT NULL DEFAULT 0, period_end INTEGER NOT NULL DEFAULT 0,
 cancel_at INTEGER, updated TEXT NOT NULL,
 PRIMARY KEY(context,id)
);
CREATE INDEX senda_billing_access ON senda_billing_subscriptions(context,owner,eligible,period_end);
CREATE TABLE senda_billing_events (
 context TEXT NOT NULL, id TEXT NOT NULL, type TEXT NOT NULL, processed TEXT NOT NULL,
 PRIMARY KEY(context,id)
);
CREATE TABLE senda_billing_risks (
 context TEXT NOT NULL, subscription TEXT NOT NULL, resource TEXT NOT NULL,
 kind TEXT NOT NULL, active INTEGER NOT NULL,
 PRIMARY KEY(context,subscription,resource)
);
