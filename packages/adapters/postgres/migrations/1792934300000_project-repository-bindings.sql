-- Up Migration

-- One repository binding per project (G3 item 11b1); the remote URL is the
-- one the integration's plugin resolved, in the `RemoteUrl` form.
CREATE TABLE project_repository_bindings (
  project_id text PRIMARY KEY REFERENCES projects (project_id),
  integration_id text NOT NULL REFERENCES scm_integrations (integration_id),
  repository text NOT NULL CHECK (char_length(repository) BETWEEN 1 AND 1024),
  remote_url text NOT NULL CHECK (char_length(remote_url) <= 2048 AND remote_url ~ '^https://[^/?#@[:space:]]+(/[^?#[:space:]]*)?$'),
  integration_branch text NOT NULL CHECK (char_length(integration_branch) BETWEEN 1 AND 1024),
  merge_method text NOT NULL CHECK (merge_method IN ('merge-commit', 'squash', 'rebase')),
  revision integer NOT NULL CHECK (revision >= 1)
);

-- Down Migration

DROP TABLE project_repository_bindings;
