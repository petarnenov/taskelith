-- Up Migration

-- A session's held output tail (G3 item 13d): only its AES-256-GCM
-- ciphertext, written in the session timeline transaction of its output.
CREATE TABLE agent_session_output_tails (
  session_id text PRIMARY KEY REFERENCES agent_sessions (session_id),
  turn_id text NOT NULL,
  generation bigint NOT NULL CHECK (generation >= 1),
  version bigint NOT NULL CHECK (version >= 1),
  nonce bytea NOT NULL,
  sealed bytea NOT NULL
);

-- Down Migration

DROP TABLE agent_session_output_tails;
