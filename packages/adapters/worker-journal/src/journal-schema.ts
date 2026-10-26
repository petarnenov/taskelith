// Journal format 3: the records of the worker journal contract, section 5.
export const JOURNAL_SCHEMA = `
CREATE TABLE journal_meta (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  journal_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  recovery_epoch INTEGER NOT NULL,
  next_sequence INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  declared_capacity TEXT,
  capacity_declarations INTEGER NOT NULL DEFAULT 0,
  inventory_snapshots INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE inbox (
  command_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  digest TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'rejected')),
  rejection_reason TEXT,
  recorded_at TEXT NOT NULL
) STRICT;

CREATE TABLE launch_intent (
  assignment_id TEXT PRIMARY KEY,
  command_id TEXT NOT NULL UNIQUE REFERENCES inbox (command_id),
  attempt_id TEXT NOT NULL,
  ownership_generation INTEGER NOT NULL,
  admission_id TEXT NOT NULL,
  admission_generation INTEGER NOT NULL,
  recovery_epoch INTEGER NOT NULL,
  cpu_millicores INTEGER NOT NULL,
  memory_mebibytes INTEGER NOT NULL,
  hard_controls TEXT NOT NULL
) STRICT;

CREATE TABLE assignment_end (
  assignment_id TEXT PRIMARY KEY,
  command_id TEXT NOT NULL UNIQUE REFERENCES inbox (command_id)
) STRICT;

CREATE TABLE cancellation_request (
  command_id TEXT PRIMARY KEY REFERENCES inbox (command_id),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('attempt', 'execution')),
  target_id TEXT NOT NULL,
  evidence_recorded INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE execution (
  execution_id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES launch_intent (assignment_id),
  state TEXT CHECK (state IN ('authorized', 'started', 'exited', 'not-started')),
  record_written INTEGER NOT NULL DEFAULT 0,
  uncertain_count INTEGER NOT NULL DEFAULT 0,
  terminal_sequence INTEGER,
  record_removed INTEGER NOT NULL DEFAULT 0,
  termination_unproven INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE authorization_request (
  operation_id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES execution (execution_id),
  position INTEGER NOT NULL,
  expected TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('pending', 'granted', 'rejected-retryable', 'rejected-final', 'expired')),
  launch_auth_id TEXT,
  grant_values TEXT,
  rejection_reason TEXT,
  UNIQUE (execution_id, position)
) STRICT;

CREATE TABLE cancellation_not_applied (
  command_id TEXT NOT NULL REFERENCES cancellation_request (command_id),
  execution_id TEXT NOT NULL REFERENCES execution (execution_id),
  PRIMARY KEY (command_id, execution_id)
) STRICT;

CREATE TABLE outbox (
  sequence INTEGER PRIMARY KEY,
  observation_id TEXT NOT NULL UNIQUE,
  fact TEXT NOT NULL,
  recorded_at TEXT NOT NULL
) STRICT;
`;

// Format 1 to 2 (contract section 10); a format 1 intent keeps no request
// and takes the journal's recovery epoch.
export const MIGRATION_FROM_FORMAT_1 = `
ALTER TABLE journal_meta ADD COLUMN declared_capacity TEXT;
ALTER TABLE journal_meta ADD COLUMN capacity_declarations INTEGER NOT NULL DEFAULT 0;
ALTER TABLE journal_meta ADD COLUMN inventory_snapshots INTEGER NOT NULL DEFAULT 0;
ALTER TABLE launch_intent ADD COLUMN recovery_epoch INTEGER NOT NULL DEFAULT 0;
UPDATE launch_intent SET recovery_epoch = (SELECT recovery_epoch FROM journal_meta);
ALTER TABLE launch_intent ADD COLUMN cpu_millicores INTEGER NOT NULL DEFAULT 0;
ALTER TABLE launch_intent ADD COLUMN memory_mebibytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE launch_intent ADD COLUMN hard_controls TEXT NOT NULL DEFAULT '[]';
CREATE TABLE assignment_end (
  assignment_id TEXT PRIMARY KEY,
  command_id TEXT NOT NULL UNIQUE REFERENCES inbox (command_id)
) STRICT;
`;

// Format 2 to 3 (contract section 10); only a rebuilt table widens the
// outcome CHECK, and a sealed execution's pending operation is expired.
export const MIGRATION_FROM_FORMAT_2 = `
ALTER TABLE execution ADD COLUMN terminal_sequence INTEGER;
ALTER TABLE execution ADD COLUMN record_removed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE execution ADD COLUMN termination_unproven INTEGER NOT NULL DEFAULT 0;
UPDATE execution SET terminal_sequence = COALESCE((SELECT outbox.sequence FROM outbox
  WHERE json_extract(outbox.fact, '$.executionId') = execution.execution_id
    AND json_extract(outbox.fact, '$.kind') IN ('execution-exited', 'execution-not-started')), 0)
  WHERE state IN ('exited', 'not-started');
CREATE TABLE authorization_request_3 (
  operation_id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES execution (execution_id),
  position INTEGER NOT NULL,
  expected TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('pending', 'granted', 'rejected-retryable', 'rejected-final', 'expired')),
  launch_auth_id TEXT,
  grant_values TEXT,
  rejection_reason TEXT,
  UNIQUE (execution_id, position)
) STRICT;
INSERT INTO authorization_request_3 SELECT * FROM authorization_request;
UPDATE authorization_request_3 SET outcome = 'expired' WHERE outcome = 'pending'
  AND execution_id IN (SELECT execution_id FROM execution WHERE state = 'not-started');
DROP TABLE authorization_request;
ALTER TABLE authorization_request_3 RENAME TO authorization_request;
CREATE TABLE cancellation_not_applied (
  command_id TEXT NOT NULL REFERENCES cancellation_request (command_id),
  execution_id TEXT NOT NULL REFERENCES execution (execution_id),
  PRIMARY KEY (command_id, execution_id)
) STRICT;
`;
