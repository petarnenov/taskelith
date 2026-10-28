-- Up Migration

-- Item 13. The installation's copy of the record outside the database
-- (trust model §2); a start compares the two and fails closed on a mismatch.
ALTER TABLE installation
  ADD COLUMN installation_id text,
  ADD COLUMN recovery_epoch integer CHECK (recovery_epoch >= 1);

-- The installation-owner credential (D10 a): one current generation.
CREATE TABLE operator_credentials (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  generation integer NOT NULL CHECK (generation >= 1),
  secret_hash text NOT NULL,
  issued_at timestamptz NOT NULL
);

-- Who changed a credential, the operator's or a worker's (`subject`, G3
-- item 26c); rows never change.
CREATE TABLE audit_events (
  position bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL,
  subject text NOT NULL,
  generation integer NOT NULL CHECK (generation >= 1),
  actor text NOT NULL,
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL
);

CREATE FUNCTION refuse_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit events are immutable';
END
$$;

CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION refuse_audit_change();

-- Single-use enrollment tokens, stored only as hashes (trust model §4).
CREATE TABLE enrollment_tokens (
  secret_hash text PRIMARY KEY,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  constraints text NOT NULL,
  used_at timestamptz
);

-- An enrolled worker's record as JSON text; a journal enrolls one worker.
-- A predecessor's deadline and an unrenewed rotation's are query columns.
ALTER TABLE workers
  ADD COLUMN journal_id text UNIQUE,
  ADD COLUMN enrollment text,
  ADD COLUMN predecessor_valid_until timestamptz,
  ADD COLUMN rotation_deadline timestamptz;

-- Broker users to revoke, kept until the broker has the complete list;
-- every publication sends all of them (installation contract §6).
CREATE TABLE broker_revocations (
  user_key text PRIMARY KEY,
  worker_id text NOT NULL,
  revoked_at timestamptz NOT NULL,
  published boolean NOT NULL DEFAULT false
);

-- Down Migration

DROP TABLE broker_revocations;

ALTER TABLE workers
  DROP COLUMN rotation_deadline,
  DROP COLUMN predecessor_valid_until,
  DROP COLUMN enrollment,
  DROP COLUMN journal_id;
DROP TABLE enrollment_tokens;
DROP TRIGGER audit_events_immutable ON audit_events;
DROP FUNCTION refuse_audit_change();
DROP TABLE audit_events;
DROP TABLE operator_credentials;
ALTER TABLE installation
  DROP COLUMN recovery_epoch,
  DROP COLUMN installation_id;
