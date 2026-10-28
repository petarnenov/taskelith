-- Up Migration

-- Operator principals of the Access module (G3 item 10); a later delegated
-- kind is an added value of the check (ADR 0014).
CREATE TABLE principals (
  principal_id text PRIMARY KEY CHECK (principal_id ~ '^u[0-9a-f]{32}$'),
  kind text NOT NULL CHECK (kind IN ('operator')),
  login_name text NOT NULL UNIQUE CHECK (login_name ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  password_hash text,
  created_at timestamptz NOT NULL,
  disabled_at timestamptz
);

CREATE TABLE installation_roles (
  principal_id text PRIMARY KEY REFERENCES principals (principal_id),
  role text NOT NULL CHECK (role = 'installation-owner'),
  granted_at timestamptz NOT NULL
);

-- The one principal that the operator credential authenticates.
CREATE TABLE operator_principal (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  principal_id text NOT NULL UNIQUE REFERENCES principals (principal_id)
);

-- At most one role per principal and project; item 11 adds the foreign
-- key to its projects table.
CREATE TABLE project_roles (
  project_id text NOT NULL,
  principal_id text NOT NULL REFERENCES principals (principal_id),
  role text NOT NULL CHECK (role IN ('project-maintainer', 'project-operator', 'project-viewer')),
  assigned_at timestamptz NOT NULL,
  PRIMARY KEY (project_id, principal_id)
);
CREATE INDEX project_roles_principal ON project_roles (principal_id);

-- Server-side sessions, stored by the SHA-256 of their identifier only.
CREATE TABLE browser_sessions (
  id_hash text PRIMARY KEY,
  csrf_token text NOT NULL,
  principal_id text REFERENCES principals (principal_id),
  created_at timestamptz NOT NULL,
  authenticated_at timestamptz,
  last_seen_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  ended_at timestamptz
);
CREATE INDEX browser_sessions_idle_expiry ON browser_sessions (idle_expires_at);
CREATE INDEX browser_sessions_principal ON browser_sessions (principal_id);
CREATE INDEX browser_sessions_anonymous ON browser_sessions (created_at) WHERE principal_id IS NULL;

-- Apart from audit_events, whose rows name a credential generation.
CREATE TABLE access_audit_events (
  position bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL,
  -- Null only on a refused bootstrap of an installation with no owner.
  principal_id text,
  project_id text,
  role text,
  actor text NOT NULL,
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL
);

CREATE TRIGGER access_audit_events_immutable BEFORE UPDATE OR DELETE ON access_audit_events
  FOR EACH ROW EXECUTE FUNCTION refuse_audit_change();

-- Down Migration

DROP TABLE access_audit_events;
DROP TABLE browser_sessions;
DROP TABLE project_roles;
DROP TABLE operator_principal;
DROP TABLE installation_roles;
DROP TABLE principals;
