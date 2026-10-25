-- Up Migration

-- Query columns for occupancy: held reservations by project, run, root task,
-- and their requested CPU and memory, copied from the record.
ALTER TABLE assignments
  ADD COLUMN project_id text,
  ADD COLUMN run_id text,
  ADD COLUMN task_id text,
  ADD COLUMN root_task_id text,
  ADD COLUMN cpu_millicores integer,
  ADD COLUMN memory_mebibytes integer,
  ADD COLUMN provider_credentials text[] NOT NULL DEFAULT '{}';
UPDATE assignments SET
  project_id = record::jsonb #>> '{reservation,scope,projectId}',
  run_id = record::jsonb #>> '{reservation,scope,runId}',
  task_id = record::jsonb #>> '{reservation,scope,taskId}',
  root_task_id = record::jsonb #>> '{reservation,scope,rootTaskId}',
  cpu_millicores = (record::jsonb #>> '{reservation,requested,cpuMillicores}')::integer,
  memory_mebibytes = (record::jsonb #>> '{reservation,requested,memoryMebibytes}')::integer,
  provider_credentials = ARRAY(SELECT jsonb_array_elements_text(record::jsonb #> '{reservation,providerCredentials}'));
ALTER TABLE assignments
  ALTER COLUMN project_id SET NOT NULL,
  ALTER COLUMN run_id SET NOT NULL,
  ALTER COLUMN task_id SET NOT NULL,
  ALTER COLUMN root_task_id SET NOT NULL,
  ALTER COLUMN cpu_millicores SET NOT NULL,
  ALTER COLUMN memory_mebibytes SET NOT NULL;
CREATE INDEX assignments_held_by_project ON assignments (project_id) WHERE reservation_state = 'held';
CREATE INDEX assignments_held_by_run ON assignments (run_id) WHERE reservation_state = 'held';
CREATE INDEX assignments_held_by_root ON assignments (root_task_id) WHERE reservation_state = 'held';
CREATE INDEX assignments_held_by_credential ON assignments USING gin (provider_credentials) WHERE reservation_state = 'held';

-- Scheduling's own tables: parent links, consumption charges, and the
-- delegations whose parents wait for their children.
CREATE TABLE task_lineage (
  task_id text PRIMARY KEY,
  parent_task_id text,
  root_task_id text NOT NULL,
  depth integer NOT NULL CHECK (depth >= 0),
  project_id text NOT NULL,
  run_id text NOT NULL,
  CHECK ((parent_task_id IS NULL) = (depth = 0))
);
CREATE INDEX task_lineage_by_root ON task_lineage (root_task_id);
CREATE INDEX task_lineage_by_run ON task_lineage (run_id);

CREATE TABLE capacity_charges (
  attempt_id text PRIMARY KEY,
  task_id text NOT NULL,
  root_task_id text NOT NULL,
  automatic_retry boolean NOT NULL
);
CREATE INDEX capacity_charges_by_root ON capacity_charges (root_task_id);
CREATE INDEX capacity_charges_retries ON capacity_charges (task_id) WHERE automatic_retry;

CREATE TABLE delegations (
  child_task_id text PRIMARY KEY,
  parent_attempt_id text NOT NULL,
  admitted_at timestamptz NOT NULL,
  closed_at timestamptz
);
CREATE INDEX delegations_open_by_parent ON delegations (parent_attempt_id) WHERE closed_at IS NULL;

-- Quota settings; a missing row means the operational targets' default.
CREATE TABLE capacity_quotas (
  scope text NOT NULL CHECK (scope IN ('project', 'run')),
  scope_id text NOT NULL,
  quota integer NOT NULL CHECK (quota >= 0),
  PRIMARY KEY (scope, scope_id)
);

-- Minimal columns placement reads. Item 13 owns and extends these tables,
-- and every writer of them runs at SERIALIZABLE (capacity contract §4).
CREATE TABLE workers (
  worker_id text PRIMARY KEY,
  enrolled boolean NOT NULL,
  revoked boolean NOT NULL,
  draining boolean NOT NULL,
  reachable boolean NOT NULL,
  admission_pressure_since timestamptz,
  slots integer NOT NULL CHECK (slots >= 0),
  cpu_millicores integer NOT NULL CHECK (cpu_millicores >= 0),
  memory_mebibytes integer NOT NULL CHECK (memory_mebibytes >= 0),
  controls text[] NOT NULL
);

CREATE TABLE installation (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  quarantined boolean NOT NULL
);

-- Down Migration

DROP TABLE installation;
DROP TABLE workers;
DROP TABLE capacity_quotas;
DROP TABLE delegations;
DROP TABLE capacity_charges;
DROP TABLE task_lineage;
DROP INDEX assignments_held_by_credential;
DROP INDEX assignments_held_by_root;
DROP INDEX assignments_held_by_run;
DROP INDEX assignments_held_by_project;
ALTER TABLE assignments
  DROP COLUMN provider_credentials,
  DROP COLUMN memory_mebibytes,
  DROP COLUMN cpu_millicores,
  DROP COLUMN root_task_id,
  DROP COLUMN task_id,
  DROP COLUMN run_id,
  DROP COLUMN project_id;
