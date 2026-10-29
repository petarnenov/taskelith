-- Up Migration

-- The inbox items of native requests (G3 item 13b): one row per request
-- and kind, written in the session timeline transaction that changes it.
CREATE TABLE session_inbox_items (
  item_id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES agent_sessions (session_id),
  kind text NOT NULL CHECK (kind IN ('permission-request', 'input-request', 'delivery-acknowledgement')),
  generation bigint NOT NULL CHECK (generation >= 1),
  native_request_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('open', 'resolved', 'closed')),
  record text NOT NULL,
  UNIQUE (session_id, generation, native_request_id, kind)
);
CREATE INDEX session_inbox_items_open ON session_inbox_items (item_id COLLATE "C") WHERE state = 'open';

-- Who acknowledged an uncertain delivery; rows never change.
CREATE TABLE session_audit_events (
  position bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL,
  item_id text NOT NULL REFERENCES session_inbox_items (item_id),
  actor text NOT NULL,
  occurred_at timestamptz NOT NULL
);

CREATE TRIGGER session_audit_events_immutable BEFORE UPDATE OR DELETE ON session_audit_events
  FOR EACH ROW EXECUTE FUNCTION refuse_audit_change();

-- Down Migration

DROP TRIGGER session_audit_events_immutable ON session_audit_events;
DROP TABLE session_audit_events;
DROP TABLE session_inbox_items;
