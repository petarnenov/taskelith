-- Up Migration

-- Item 19. Evidence metadata (architecture section 8), written once; the
-- content lives on the evidence volume under its digest.
CREATE TABLE evidence (
  position bigint GENERATED ALWAYS AS IDENTITY,
  evidence_id text PRIMARY KEY,
  task_id text NOT NULL,
  content_digest text NOT NULL,
  record text NOT NULL
);
CREATE INDEX evidence_by_task ON evidence (task_id, position);
CREATE INDEX evidence_by_digest ON evidence (content_digest);

-- Down Migration

DROP TABLE evidence;
