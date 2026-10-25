-- Up Migration

-- Item 17: one row per grant, kept in step by the task repository; `live` is
-- an unrevoked grant whose execution is not terminal.
CREATE TABLE launch_authorizations (
  launch_auth_id text PRIMARY KEY,
  worker_id text NOT NULL,
  operation_id text NOT NULL,
  task_id text NOT NULL,
  attempt_id text NOT NULL,
  assignment_id text NOT NULL,
  execution_id text NOT NULL,
  run_id text,
  relied_on_gates text[] NOT NULL,
  artifact_ids text[] NOT NULL,
  live boolean NOT NULL,
  UNIQUE (worker_id, operation_id)
);
CREATE INDEX launch_authorizations_live_worker ON launch_authorizations (worker_id) WHERE live;
CREATE INDEX launch_authorizations_live_assignment ON launch_authorizations (assignment_id) WHERE live;
CREATE INDEX launch_authorizations_live_run ON launch_authorizations (run_id) WHERE live;
CREATE INDEX launch_authorizations_live_artifacts ON launch_authorizations USING gin (artifact_ids) WHERE live;
CREATE INDEX launch_authorizations_live_gates ON launch_authorizations USING gin (relied_on_gates) WHERE live;

-- A non-retryable rejection is final for its operation, with the values
-- it was requested with (launch authorization section 6).
CREATE TABLE launch_rejections (
  worker_id text NOT NULL,
  operation_id text NOT NULL,
  request text NOT NULL,
  rejection text NOT NULL,
  PRIMARY KEY (worker_id, operation_id)
);

-- The current revision of each artifact of a run; until a G3 writer exists,
-- the first task that binds an artifact seeds it (coordinator decision B2).
CREATE TABLE current_revisions (
  run_id text NOT NULL,
  artifact_id text NOT NULL,
  revision text NOT NULL,
  PRIMARY KEY (run_id, artifact_id)
);

-- Masks NUL and surrogate escapes, pairs too, which jsonb may reject; ASCII
-- identifiers hold none, and E'' keeps backslashes in any string setting.
CREATE FUNCTION pg_temp.launch_record(record text) RETURNS jsonb
  LANGUAGE sql IMMUTABLE
  AS $$ SELECT replace(regexp_replace(replace(record, E'\\\\', chr(1)), E'\\\\u(0000|[dD][89a-fA-F][0-9a-fA-F]{2})', '_', 'g'),
    chr(1), E'\\\\')::jsonb $$;

-- A grant's run is its assignment's, which every grant has.
INSERT INTO launch_authorizations (launch_auth_id, worker_id, operation_id, task_id, attempt_id, assignment_id, execution_id,
  run_id, relied_on_gates, artifact_ids, live)
SELECT
  grant_record ->> 'launchAuthId', grant_record ->> 'workerId', grant_record ->> 'operationId', tasks.id,
  grant_record ->> 'attemptId', grant_record ->> 'assignmentId', grant_record ->> 'executionId', assignments.run_id,
  ARRAY(SELECT jsonb_array_elements_text(grant_record -> 'reliedOnGates')),
  ARRAY(SELECT artifact ->> 'artifactId' FROM jsonb_array_elements(grant_record -> 'artifacts') AS artifact),
  grant_record ->> 'state' = 'granted' AND execution ->> 'state' NOT IN ('exited', 'not-started')
FROM tasks
  CROSS JOIN LATERAL jsonb_array_elements(pg_temp.launch_record(tasks.record) -> 'attempts') AS attempt
  CROSS JOIN LATERAL jsonb_array_elements(attempt -> 'executions') AS execution
  CROSS JOIN LATERAL jsonb_array_elements(execution -> 'grants') AS grant_record
  LEFT JOIN assignments ON assignments.id = grant_record ->> 'assignmentId';

-- Earlier tasks seed their runs' revisions. Admission identities are hashes,
-- so which one wins is arbitrary but fixed; another digest fails closed.
INSERT INTO current_revisions (run_id, artifact_id, revision)
SELECT DISTINCT ON (admissions.run_id, artifact ->> 'artifactId') admissions.run_id, artifact ->> 'artifactId', artifact::text
FROM admissions
  CROSS JOIN LATERAL jsonb_array_elements(pg_temp.launch_record(admissions.record) -> 'artifacts') AS artifact
WHERE admissions.run_id IS NOT NULL AND admissions.state = 'used'
ORDER BY admissions.run_id, artifact ->> 'artifactId', admissions.id;

-- Down Migration

DROP TABLE current_revisions;
DROP TABLE launch_rejections;
DROP TABLE launch_authorizations;
