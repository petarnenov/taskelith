-- Up Migration

-- The verified webhook events of each SCM integration, one per delivery
-- identifier (G3 item 20e); no foreign key, as integrations are not stored.
CREATE TABLE scm_webhook_deliveries (
  integration_id text NOT NULL,
  delivery_id text NOT NULL CHECK (length(delivery_id) BETWEEN 1 AND 1024),
  kind text NOT NULL CHECK (kind IN ('change-request', 'commit-status', 'push', 'other')),
  repository text NOT NULL CHECK (length(repository) BETWEEN 1 AND 1024),
  change_request text CHECK (length(change_request) BETWEEN 1 AND 1024),
  commit_id text CHECK (length(commit_id) BETWEEN 1 AND 1024),
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (integration_id, delivery_id)
);

-- Down Migration

DROP TABLE scm_webhook_deliveries;
