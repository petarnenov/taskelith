-- Up Migration

-- Each task's last placement try that did not place it (capacity
-- reservation sections 11 and 13, "Recorded outcome"), at most one.
CREATE TABLE placement_outcomes (
  task_id text PRIMARY KEY,
  attempt_id text,
  disposition text NOT NULL CHECK (disposition IN ('waiting', 'rejected')),
  reason text NOT NULL,
  source text NOT NULL CHECK (source IN ('scheduler')),
  recorded_at timestamptz NOT NULL
);

-- Down Migration

DROP TABLE placement_outcomes;
