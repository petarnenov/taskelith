// Journal format 1: the records of the worker journal contract, section 5.
export const JOURNAL_SCHEMA = `
CREATE TABLE journal_meta (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  journal_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  recovery_epoch INTEGER NOT NULL,
  next_sequence INTEGER NOT NULL,
  created_at TEXT NOT NULL
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
  admission_generation INTEGER NOT NULL
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
  uncertain_count INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE authorization_request (
  operation_id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES execution (execution_id),
  position INTEGER NOT NULL,
  expected TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('pending', 'granted', 'rejected-retryable', 'rejected-final')),
  launch_auth_id TEXT,
  grant_values TEXT,
  rejection_reason TEXT,
  UNIQUE (execution_id, position)
) STRICT;

CREATE TABLE outbox (
  sequence INTEGER PRIMARY KEY,
  observation_id TEXT NOT NULL UNIQUE,
  fact TEXT NOT NULL,
  recorded_at TEXT NOT NULL
) STRICT;
`;
