-- Up Migration

-- SCM integrations (G3 item 20f): the plugin, its non-secret settings, and
-- the allowed origin in its normalized form (wire contracts section 4.1).
CREATE TABLE scm_integrations (
  integration_id text PRIMARY KEY CHECK (integration_id ~ '^i[0-9a-f]{32}$'),
  plugin_id text NOT NULL CHECK (char_length(plugin_id) BETWEEN 1 AND 128),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 1024),
  allowed_origin text NOT NULL CHECK (char_length(allowed_origin) <= 300 AND allowed_origin
    ~ ('^https://[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*:'
    || '([1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$')),
  settings jsonb NOT NULL CHECK (jsonb_typeof(settings) = 'object'),
  revision integer NOT NULL CHECK (revision >= 1)
);

-- One AES-256-GCM ciphertext per integration and secret name, sealed under
-- a control-plane key outside the database, as slot_credentials are.
CREATE TABLE scm_integration_secrets (
  integration_id text NOT NULL REFERENCES scm_integrations (integration_id),
  name text NOT NULL CHECK (name ~ '^[a-z][a-z0-9-]{0,63}$'),
  nonce bytea NOT NULL,
  sealed bytea NOT NULL,
  PRIMARY KEY (integration_id, name)
);

-- Down Migration

DROP TABLE scm_integration_secrets;
DROP TABLE scm_integrations;
