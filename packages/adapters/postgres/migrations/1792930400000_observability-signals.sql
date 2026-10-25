-- Up Migration

-- The backfill reads only states and evidence, so string contents may change:
-- jsonb rejects NUL and lone surrogates, whose escapes the records may hold.
CREATE FUNCTION pg_temp.signal_record(record text) RETURNS jsonb
  LANGUAGE sql IMMUTABLE
  AS $$ SELECT regexp_replace(regexp_replace(record, '\\\\', '_', 'g'), '\\u[0-9a-fA-F]{4}', '_', 'g')::jsonb $$;

-- Query columns for the G2 signals, copied from the record: the assignment
-- state and change time, and the unknown executions of each task.
ALTER TABLE assignments
  ADD COLUMN state text,
  ADD COLUMN changed_at timestamptz;
UPDATE assignments SET
  state = pg_temp.signal_record(record) ->> 'state',
  changed_at = (pg_temp.signal_record(record) ->> 'changedAt')::timestamptz;
ALTER TABLE assignments
  ALTER COLUMN state SET NOT NULL,
  ALTER COLUMN changed_at SET NOT NULL;
CREATE INDEX assignments_offered ON assignments (changed_at) WHERE state = 'offered';

-- An unknown execution is not terminal and carries evidence beside its state;
-- the terminal states are those of EXECUTION_TRANSITIONS.
ALTER TABLE tasks ADD COLUMN unknown_executions integer NOT NULL DEFAULT 0 CHECK (unknown_executions >= 0);
UPDATE tasks SET unknown_executions = (
  SELECT count(*) FROM jsonb_path_query(
    pg_temp.signal_record(record),
    '$.attempts[*].executions[*] ? (@.state != "exited" && @.state != "not-started" && exists(@.evidence[*]))'
  )
);
CREATE INDEX tasks_with_unknown_executions ON tasks (unknown_executions) WHERE unknown_executions > 0;

-- Outbox lag reads the oldest append time, which need not be the lowest
-- position: `now()` is the time a transaction began.
CREATE INDEX outbox_unpublished_by_age ON outbox (appended_at) WHERE published_at IS NULL;

-- Down Migration

DROP INDEX outbox_unpublished_by_age;
DROP INDEX tasks_with_unknown_executions;
ALTER TABLE tasks DROP COLUMN unknown_executions;
DROP INDEX assignments_offered;
ALTER TABLE assignments
  DROP COLUMN changed_at,
  DROP COLUMN state;
