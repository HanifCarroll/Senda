-- An agent can connect before its first project exists. Project access remains
-- scoped by senda_grants; projects:write is still required to create a project.
CREATE TABLE senda_agent_connections (
  owner TEXT NOT NULL,
  client TEXT NOT NULL,
  PRIMARY KEY(owner,client)
);
INSERT INTO senda_agent_connections(owner,client) SELECT DISTINCT owner,client FROM senda_grants;
