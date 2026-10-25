-- Up Migration

-- The control-plane hashes of a worker's current and predecessor generations,
-- copied from its record, so a bearer finds its worker by an index.
ALTER TABLE workers
  ADD COLUMN control_plane_hash text UNIQUE,
  ADD COLUMN previous_control_plane_hash text UNIQUE;

-- As in the signals migration: a hash is hexadecimal, so masking every
-- escape, which jsonb may reject in a host name, leaves the hashes intact.
CREATE FUNCTION pg_temp.enrollment_record(record text) RETURNS jsonb
  LANGUAGE sql IMMUTABLE
  AS $$ SELECT regexp_replace(regexp_replace(record, '\\\\', '_', 'g'), '\\u[0-9a-fA-F]{4}', '_', 'g')::jsonb $$;

UPDATE workers SET
  control_plane_hash = pg_temp.enrollment_record(enrollment) #>> '{credentials,current,controlPlaneHash}',
  previous_control_plane_hash = pg_temp.enrollment_record(enrollment) #>> '{credentials,previous,controlPlaneHash}'
WHERE enrollment IS NOT NULL;

-- Down Migration

ALTER TABLE workers
  DROP COLUMN previous_control_plane_hash,
  DROP COLUMN control_plane_hash;
