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
-- Producer authorization reads a worker's assignments for one attempt.
CREATE INDEX assignments_by_attempt_and_worker ON assignments (attempt_id, worker_id);

-- Down Migration

DROP INDEX assignments_by_attempt_and_worker;
DROP TABLE evidence;
