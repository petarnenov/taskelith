-- Up Migration

-- When each credential version was stored, by the database clock, so the
-- sweep keeps versions younger than its grace age (account pool 8.1).
ALTER TABLE slot_credentials ADD COLUMN stored_at timestamptz NOT NULL DEFAULT now();

-- Down Migration

ALTER TABLE slot_credentials DROP COLUMN stored_at;
