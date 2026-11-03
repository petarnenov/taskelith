-- Up Migration

-- The event log of the control-plane streams (G3 item 14): a change's
-- transaction inserts its entries without a position; the assigner numbers
-- them from `ui_event_sequence`, in `entry_id` order, once their
-- transaction is below the oldest open one.
CREATE TABLE ui_events (
  entry_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  position bigint UNIQUE CHECK (position >= 1),
  numbered_at timestamptz,
  kind text NOT NULL CHECK (kind IN ('event', 'principal-change')),
  -- An event's project, null for the installation scope; null for a change.
  project_id text,
  -- A change's principal; null for an event.
  principal_id text,
  record text NOT NULL,
  -- The inserting transaction, which the assigner waits for.
  inserted_by xid8 NOT NULL DEFAULT pg_current_xact_id(),
  CONSTRAINT ui_events_numbered_pair CHECK ((position IS NULL) = (numbered_at IS NULL)),
  CONSTRAINT ui_events_principal_kind CHECK ((kind = 'event') = (principal_id IS NULL))
);

CREATE INDEX ui_events_unnumbered ON ui_events (entry_id) WHERE position IS NULL;
CREATE INDEX ui_events_project ON ui_events (project_id, position) WHERE position IS NOT NULL;
CREATE INDEX ui_events_principal ON ui_events (principal_id, position) WHERE position IS NOT NULL;
CREATE INDEX ui_events_numbered_at ON ui_events (position, numbered_at) WHERE position IS NOT NULL;

-- One row: the head, the highest assigned position, and the retention
-- floor, the highest position whose entries were pruned.
CREATE TABLE ui_event_sequence (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  head bigint NOT NULL CHECK (head >= 0),
  floor bigint NOT NULL CHECK (floor >= 0),
  CONSTRAINT ui_event_sequence_floor CHECK (floor <= head)
);

INSERT INTO ui_event_sequence (head, floor) VALUES (0, 0);

-- Down Migration

DROP TABLE ui_event_sequence;
DROP TABLE ui_events;
