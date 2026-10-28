-- Up Migration

-- Worker admission contract sections 5 and 6: the state placement reads,
-- the self-check fence, and the time of the last consumed report.
ALTER TABLE workers
  ADD COLUMN worker_admission text NOT NULL DEFAULT 'awaiting-self-check'
    CHECK (worker_admission IN ('awaiting-self-check', 'admitted', 'self-check-failed')),
  ADD COLUMN self_check_sequence bigint NOT NULL DEFAULT 0 CHECK (self_check_sequence >= 0),
  ADD COLUMN self_check_reported_at timestamptz;

-- The results of each worker's last consumed self-check report.
CREATE TABLE worker_self_check_results (
  worker_id text NOT NULL REFERENCES workers (worker_id) ON DELETE CASCADE,
  check_id text NOT NULL CHECK (check_id ~ '^[a-z][a-z0-9-]{0,63}$'),
  outcome text NOT NULL CHECK (outcome IN ('passed', 'failed', 'not-applicable')),
  details text[] NOT NULL,
  PRIMARY KEY (worker_id, check_id)
);

-- Down Migration

DROP TABLE worker_self_check_results;
ALTER TABLE workers
  DROP COLUMN self_check_reported_at,
  DROP COLUMN self_check_sequence,
  DROP COLUMN worker_admission;
