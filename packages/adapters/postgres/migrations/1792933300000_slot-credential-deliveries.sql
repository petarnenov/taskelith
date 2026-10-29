-- Up Migration

-- The executions that had a slot credential delivery (account pool
-- contract section 7, G3 sub-change 12c); never the credential itself.
CREATE TABLE slot_credential_deliveries (
  task_id text NOT NULL,
  execution_id text NOT NULL,
  slot_id text NOT NULL,
  attempt_id text NOT NULL,
  worker_id text NOT NULL,
  credential_version integer NOT NULL CHECK (credential_version > 0),
  first_delivered_at timestamptz NOT NULL,
  last_delivered_at timestamptz NOT NULL CHECK (last_delivered_at >= first_delivered_at),
  deliveries integer NOT NULL CHECK (deliveries > 0),
  PRIMARY KEY (task_id, execution_id, slot_id)
);

-- Down Migration

DROP TABLE slot_credential_deliveries;
