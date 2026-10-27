-- Up Migration

-- The rotation cursor of the placement passes (capacity reservation section
-- 13): one row per installation, none before the first move.
CREATE TABLE placement_rotation (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  project_id text NOT NULL
);

-- Down Migration

DROP TABLE placement_rotation;
