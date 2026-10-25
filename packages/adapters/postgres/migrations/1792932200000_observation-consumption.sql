-- Up Migration

-- As in the placement migration: jsonb rejects NUL and lone surrogates; an
-- escaped backslash becomes \u005c first, so identifiers stay exact.
CREATE FUNCTION pg_temp.offer_record(record text) RETURNS jsonb
  LANGUAGE sql IMMUTABLE
  AS $$ SELECT regexp_replace(replace(record, '\\', '\u005c'), '\\u(0000|[dD][89a-fA-F][0-9a-fA-F]{2})', '_', 'g')::jsonb $$;

-- Item 21b. The cursor of each producer (workerId, journalId): the end of
-- the confirmed prefix and the applied sequences above it.
CREATE TABLE producer_cursors (
  worker_id text NOT NULL,
  journal_id text NOT NULL,
  confirmed_through bigint NOT NULL CHECK (confirmed_through >= 0),
  applied_above bigint[] NOT NULL,
  PRIMARY KEY (worker_id, journal_id)
);

-- The command that offered each assignment, which a protocol rejection
-- names; earlier offers are found in the outbox.
ALTER TABLE assignments ADD COLUMN offer_command_id text UNIQUE;
UPDATE assignments SET offer_command_id = offers.event_id
FROM (
  SELECT event_id, pg_temp.offer_record(message) #>> '{payload,payload,assignmentId}' AS assignment_id
  FROM outbox WHERE event_type = 'execution.assignment.offer'
) AS offers
WHERE assignments.id = offers.assignment_id;

-- First contact, a refusal for slots or capacity, which makes the worker
-- ineligible, and the last applied sequence of each fenced report.
ALTER TABLE workers
  ADD COLUMN last_contact_at timestamptz,
  ADD COLUMN capacity_sequence bigint NOT NULL DEFAULT 0 CHECK (capacity_sequence >= 0),
  ADD COLUMN pressure_sequence bigint NOT NULL DEFAULT 0 CHECK (pressure_sequence >= 0),
  ADD COLUMN capacity_refused_since timestamptz,
  ADD COLUMN capacity_refusal_sequence bigint NOT NULL DEFAULT 0 CHECK (capacity_refusal_sequence >= 0),
  ADD COLUMN protocol_sequence bigint NOT NULL DEFAULT 0 CHECK (protocol_sequence >= 0);

-- Down Migration

ALTER TABLE workers
  DROP COLUMN protocol_sequence,
  DROP COLUMN capacity_refusal_sequence,
  DROP COLUMN capacity_refused_since,
  DROP COLUMN pressure_sequence,
  DROP COLUMN capacity_sequence,
  DROP COLUMN last_contact_at;
ALTER TABLE assignments DROP COLUMN offer_command_id;
DROP TABLE producer_cursors;
