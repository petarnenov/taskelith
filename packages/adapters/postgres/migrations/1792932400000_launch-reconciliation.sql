-- Up Migration

-- Item 21d. Each consumed unrecorded-process observation of a worker, for
-- an operator's reconciliation; never current work.
CREATE TABLE unrecorded_processes (
  worker_id text NOT NULL,
  observation_id text NOT NULL,
  journal_id text NOT NULL,
  containment text NOT NULL,
  process_count integer NOT NULL CHECK (process_count >= 0),
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (worker_id, observation_id)
);

-- Down Migration

DROP TABLE unrecorded_processes;
