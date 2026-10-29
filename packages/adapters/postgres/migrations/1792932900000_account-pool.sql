-- Up Migration

-- True for a one-dimensional array without NULL or a repeated element.
CREATE FUNCTION account_slot_distinct_projects(projects text[]) RETURNS boolean
  LANGUAGE sql IMMUTABLE
  AS $$ SELECT array_ndims(projects) = 1 AND
    (SELECT count(DISTINCT project) FROM unnest(projects) AS project) = cardinality(projects) $$;

-- Account slots of G3 item 12 (account pool contract section 3.1); a
-- removed slot stays as a tombstone.
CREATE TABLE account_slots (
  slot_id text PRIMARY KEY,
  harness_id text NOT NULL,
  mechanism_id text NOT NULL,
  credential_version integer NOT NULL CHECK (credential_version > 0),
  allowed_projects text[] NOT NULL
    CHECK (cardinality(allowed_projects) > 0 AND account_slot_distinct_projects(allowed_projects)),
  concurrency_limit integer NOT NULL CHECK (concurrency_limit > 0),
  state text NOT NULL CHECK (state IN ('active', 'revoked', 'removed')),
  health text NOT NULL CHECK (health IN ('healthy', 'unhealthy')),
  cooldown_until timestamptz,
  cooldown_source text CHECK (cooldown_source IN ('reported-reset', 'default')),
  usage_fraction double precision CHECK (usage_fraction >= 0 AND usage_fraction <= 1),
  usage_window_ends_at timestamptz,
  last_reserved_at timestamptz,
  revision integer NOT NULL CHECK (revision > 0),
  CHECK ((cooldown_until IS NULL) = (cooldown_source IS NULL)),
  CHECK ((usage_fraction IS NULL) = (usage_window_ends_at IS NULL))
);
CREATE INDEX account_slots_pool ON account_slots (harness_id) WHERE state = 'active';
CREATE INDEX account_slots_not_removed ON account_slots (harness_id) WHERE state <> 'removed';

-- Per-slot version counter of the encrypted credentials; it outlives a
-- destroy, so a version is never reused (contract section 6.2).
CREATE TABLE slot_credential_counters (
  slot_id text PRIMARY KEY,
  last_version integer NOT NULL CHECK (last_version >= 0),
  destroyed boolean NOT NULL
);

-- AES-256-GCM ciphertext and tag; the key is in control-plane/, never here.
CREATE TABLE slot_credentials (
  slot_id text NOT NULL REFERENCES slot_credential_counters (slot_id),
  version integer NOT NULL CHECK (version > 0),
  nonce bytea NOT NULL,
  sealed bytea NOT NULL,
  PRIMARY KEY (slot_id, version)
);

-- Down Migration

DROP TABLE slot_credentials;
DROP TABLE slot_credential_counters;
DROP TABLE account_slots;
DROP FUNCTION account_slot_distinct_projects(text[]);
