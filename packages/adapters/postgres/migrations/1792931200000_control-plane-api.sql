-- Up Migration

-- Item 16. The run's project and creation time, which the API returns, and
-- the run an admission belongs to, which reading it checks.
ALTER TABLE workflow_runs
  ADD COLUMN project_id text,
  ADD COLUMN created_at timestamptz;
ALTER TABLE admissions ADD COLUMN run_id text;

-- The protocol version a worker shares with the control plane, from its
-- enrollment; placement needs one (execution wire contracts, section 3).
ALTER TABLE workers ADD COLUMN protocol_version integer CHECK (protocol_version >= 1);

-- Down Migration

ALTER TABLE workers DROP COLUMN protocol_version;
ALTER TABLE admissions DROP COLUMN run_id;
ALTER TABLE workflow_runs
  DROP COLUMN created_at,
  DROP COLUMN project_id;
