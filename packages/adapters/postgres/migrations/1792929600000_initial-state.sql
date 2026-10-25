-- Up Migration

-- Each aggregate is one row: its id, the generation that compare-and-set
-- checks, query columns, and the record as JSON.
CREATE TABLE workflow_runs (
  id text PRIMARY KEY,
  generation bigint NOT NULL CHECK (generation >= 1),
  record jsonb NOT NULL
);

CREATE TABLE gates (
  id text PRIMARY KEY,
  run_id text NOT NULL,
  generation bigint NOT NULL CHECK (generation >= 1),
  record jsonb NOT NULL
);
CREATE INDEX gates_by_run ON gates (run_id);

CREATE TABLE admissions (
  id text PRIMARY KEY,
  generation bigint NOT NULL CHECK (generation >= 1),
  state text NOT NULL,
  artifact_ids text[] NOT NULL,
  record jsonb NOT NULL
);
CREATE INDEX admissions_unused_by_artifact ON admissions USING gin (artifact_ids) WHERE state = 'admitted';

CREATE TABLE tasks (
  id text PRIMARY KEY,
  admission_id text NOT NULL,
  generation bigint NOT NULL CHECK (generation >= 1),
  record jsonb NOT NULL
);
CREATE INDEX tasks_by_admission ON tasks (admission_id);

CREATE TABLE assignments (
  id text PRIMARY KEY,
  attempt_id text NOT NULL,
  worker_id text NOT NULL,
  reservation_state text NOT NULL CHECK (reservation_state IN ('held', 'released')),
  generation bigint NOT NULL CHECK (generation >= 1),
  record jsonb NOT NULL
);
-- Capacity contract section 4: one held reservation per attempt.
CREATE UNIQUE INDEX assignments_one_held_reservation ON assignments (attempt_id) WHERE reservation_state = 'held';
CREATE INDEX assignments_held_by_worker ON assignments (worker_id) WHERE reservation_state = 'held';

-- Messages in commit order; the publisher marks each one it sent.
CREATE TABLE outbox (
  position bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  subject text NOT NULL,
  message jsonb NOT NULL,
  appended_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX outbox_unpublished ON outbox (position) WHERE published_at IS NULL;

CREATE TABLE inbox (
  consumer text NOT NULL,
  message_id text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, message_id)
);

-- Down Migration

DROP TABLE inbox;
DROP TABLE outbox;
DROP TABLE assignments;
DROP TABLE tasks;
DROP TABLE admissions;
DROP TABLE gates;
DROP TABLE workflow_runs;
