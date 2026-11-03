-- Up Migration

-- The verified webhook events of each SCM integration, one per delivery
-- identifier (G3 item 20e); no foreign key, as integrations are not stored.

-- The port's identifiers are any 1 to 1024 UTF-16 code units, NUL and
-- unpaired surrogates included, so they are stored as UTF-16LE bytes.
CREATE TABLE scm_webhook_deliveries (
  integration_id text NOT NULL,
  delivery_id bytea NOT NULL CHECK (octet_length(delivery_id) BETWEEN 2 AND 2048 AND octet_length(delivery_id) % 2 = 0),
  kind text NOT NULL CHECK (kind IN ('change-request', 'commit-status', 'push', 'other')),
  repository bytea NOT NULL CHECK (octet_length(repository) BETWEEN 2 AND 2048 AND octet_length(repository) % 2 = 0),
  change_request bytea CHECK (octet_length(change_request) BETWEEN 2 AND 2048 AND octet_length(change_request) % 2 = 0),
  commit_id bytea CHECK (octet_length(commit_id) BETWEEN 2 AND 2048 AND octet_length(commit_id) % 2 = 0),
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (integration_id, delivery_id)
);

-- Down Migration

DROP TABLE scm_webhook_deliveries;
