-- Up Migration

-- Item 21c. A retired journal is refused until a new incarnation replaces
-- it; the highest inventory snapshot received filters delayed ones.
ALTER TABLE producer_cursors
  ADD COLUMN retired_at timestamptz,
  ADD COLUMN reported_snapshot bigint NOT NULL DEFAULT 0 CHECK (reported_snapshot >= 0);

-- The latest inventory request of each worker and its bound.
CREATE TABLE inventory_requests (
  worker_id text PRIMARY KEY,
  request_id text NOT NULL,
  requested_at timestamptz NOT NULL,
  bound text NOT NULL
);

-- The parts of snapshots that cannot be applied yet.
CREATE TABLE inventory_report_parts (
  report_id text NOT NULL,
  part integer NOT NULL CHECK (part >= 1),
  parts integer NOT NULL CHECK (parts >= 1),
  worker_id text NOT NULL,
  journal_id text NOT NULL,
  request_id text,
  snapshot bigint NOT NULL CHECK (snapshot >= 1),
  through_sequence bigint NOT NULL CHECK (through_sequence >= 0),
  assignments text NOT NULL,
  executions text NOT NULL,
  PRIMARY KEY (report_id, part)
);
CREATE INDEX inventory_report_parts_by_journal ON inventory_report_parts (worker_id, journal_id);

-- Where each applied acceptance came from; no backfill, so an assignment
-- accepted earlier has none and its omission stays unclassified.
ALTER TABLE assignments
  ADD COLUMN accepted_journal_id text,
  ADD COLUMN accepted_sequence bigint CHECK (accepted_sequence >= 1);
CREATE INDEX assignments_unfinished_by_worker ON assignments (worker_id) WHERE state <> 'ended';

-- Down Migration

DROP INDEX assignments_unfinished_by_worker;
ALTER TABLE assignments
  DROP COLUMN accepted_sequence,
  DROP COLUMN accepted_journal_id;
DROP TABLE inventory_report_parts;
DROP TABLE inventory_requests;
ALTER TABLE producer_cursors
  DROP COLUMN reported_snapshot,
  DROP COLUMN retired_at;
