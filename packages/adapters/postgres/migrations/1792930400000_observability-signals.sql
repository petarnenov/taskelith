-- Up Migration

-- Query columns for the G2 signals, copied from the record: the assignment
-- state and change time, and the unknown executions of each task.
ALTER TABLE assignments
  ADD COLUMN state text,
  ADD COLUMN changed_at timestamptz;
UPDATE assignments SET
  state = record::jsonb ->> 'state',
  changed_at = (record::jsonb ->> 'changedAt')::timestamptz;
ALTER TABLE assignments
  ALTER COLUMN state SET NOT NULL,
  ALTER COLUMN changed_at SET NOT NULL;
CREATE INDEX assignments_offered ON assignments (changed_at) WHERE state = 'offered';

-- An unknown execution is not terminal and carries evidence beside its state.
ALTER TABLE tasks ADD COLUMN unknown_executions integer NOT NULL DEFAULT 0 CHECK (unknown_executions >= 0);
UPDATE tasks SET unknown_executions = (
  SELECT count(*) FROM jsonb_path_query(
    record::jsonb,
    '$.attempts[*].executions[*] ? ((@.state == "authorized" || @.state == "started") && exists(@.evidence[*]))'
  )
);
CREATE INDEX tasks_with_unknown_executions ON tasks (id) WHERE unknown_executions > 0;

-- Down Migration

DROP INDEX tasks_with_unknown_executions;
ALTER TABLE tasks DROP COLUMN unknown_executions;
DROP INDEX assignments_offered;
ALTER TABLE assignments
  DROP COLUMN changed_at,
  DROP COLUMN state;
