-- Up Migration

-- Session timelines of G3 item 13: each session as JSON text without its
-- output entries, which have rows of their own (postgres-state spec).
CREATE TABLE agent_sessions (
  session_id text PRIMARY KEY,
  task_id text NOT NULL,
  version bigint NOT NULL CHECK (version >= 1),
  record text NOT NULL
);
CREATE INDEX agent_sessions_task ON agent_sessions (task_id);

-- The retained output window, one JSON entry per position; an append
-- deletes the rows that leave the window in its own transaction.
CREATE TABLE agent_session_output (
  session_id text NOT NULL REFERENCES agent_sessions (session_id),
  position bigint NOT NULL CHECK (position >= 1),
  record text NOT NULL,
  PRIMARY KEY (session_id, position)
);

-- An attempt binds to at most one session across all sessions.
CREATE TABLE agent_session_attempts (
  attempt_id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES agent_sessions (session_id),
  task_id text NOT NULL
);

-- Held keys with the keyed digest of the unredacted input; the outcome
-- is null where the scope names it, as for a response.
CREATE TABLE session_idempotency_keys (
  session_id text NOT NULL REFERENCES agent_sessions (session_id),
  scope text NOT NULL,
  key text NOT NULL,
  digest text NOT NULL,
  outcome text,
  PRIMARY KEY (session_id, scope, key)
);

-- Down Migration

DROP TABLE session_idempotency_keys;
DROP TABLE agent_session_attempts;
DROP TABLE agent_session_output;
DROP TABLE agent_sessions;
