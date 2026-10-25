-- Up Migration

-- jsonb rejects NUL and lone surrogates; an escaped backslash becomes \u005c
-- first, so only real escapes are replaced, and identifiers stay exact.
CREATE FUNCTION pg_temp.placement_record(record text) RETURNS jsonb
  LANGUAGE sql IMMUTABLE
  AS $$ SELECT regexp_replace(replace(record, '\\', '\u005c'), '\\u(0000|[dD][89a-fA-F][0-9a-fA-F]{2})', '_', 'g')::jsonb $$;

-- Item 21a. The placement queue's columns, as placementNeed derives them
-- from the record; a waiting task waits since its last change.
ALTER TABLE tasks
  ADD COLUMN awaits_placement boolean NOT NULL DEFAULT false,
  ADD COLUMN active_attempt_id text,
  ADD COLUMN placement_waiting_since timestamptz,
  ADD CHECK (awaits_placement = (placement_waiting_since IS NOT NULL));
WITH parsed AS (
  SELECT id, task, jsonb_path_query_first(task, '$.attempts[*] ? (!(exists(@.outcome)))') AS attempt
  FROM (SELECT id, pg_temp.placement_record(record) AS task FROM tasks) AS records
), needs AS (
  SELECT id, task, attempt, jsonb_array_length(task -> 'attempts') = 0 OR (
    attempt IS NOT NULL AND NOT attempt ? 'cancellation'
    AND NOT jsonb_path_exists(attempt, '$.executions[*] ? (@.state != "exited" && @.state != "not-started")')
  ) AS waits
  FROM parsed
)
UPDATE tasks SET
  awaits_placement = needs.waits,
  active_attempt_id = needs.attempt ->> 'id',
  placement_waiting_since = CASE WHEN needs.waits THEN (needs.task ->> 'changedAt')::timestamptz END
FROM needs WHERE tasks.id = needs.id;
CREATE INDEX tasks_awaiting_placement ON tasks (placement_waiting_since, id) WHERE awaits_placement;

-- Each delegation request under the worker's delegationId; the record holds
-- its values, outcome, and the start of its wait.
CREATE TABLE delegation_requests (
  id text PRIMARY KEY,
  attempt_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('admitted', 'awaiting-capacity', 'rejected')),
  generation bigint NOT NULL CHECK (generation >= 1),
  record text NOT NULL
);

-- Down Migration

DROP TABLE delegation_requests;
DROP INDEX tasks_awaiting_placement;
ALTER TABLE tasks
  DROP COLUMN placement_waiting_since,
  DROP COLUMN active_attempt_id,
  DROP COLUMN awaits_placement;
