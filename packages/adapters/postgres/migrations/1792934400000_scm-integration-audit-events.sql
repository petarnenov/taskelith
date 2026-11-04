-- Up Migration

-- Who created or changed an SCM integration (G3 item 11b2): the changed
-- field and secret names, never a value; rows never change.
CREATE TABLE scm_integration_audit_events (
  position bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  integration_id text NOT NULL REFERENCES scm_integrations (integration_id),
  kind text NOT NULL CHECK (kind IN ('created', 'updated', 'secret-changed')),
  actor text NOT NULL,
  reason text NOT NULL,
  changed_fields text[] NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  occurred_at timestamptz NOT NULL
);

CREATE TRIGGER scm_integration_audit_events_immutable BEFORE UPDATE OR DELETE ON scm_integration_audit_events
  FOR EACH ROW EXECUTE FUNCTION refuse_audit_change();

-- Down Migration

DROP TRIGGER scm_integration_audit_events_immutable ON scm_integration_audit_events;
DROP TABLE scm_integration_audit_events;
