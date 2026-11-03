-- Up Migration

-- The cards of the board (G3 item 15): a root run with its title and work
-- type, which task intake writes; a run without a row is not a card.
CREATE TABLE cards (
  run_id text PRIMARY KEY,
  project_id text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200 AND title !~ '[\x01-\x1f\x7f-\x9f]'),
  work_type text NOT NULL CHECK (work_type IN (
    'feature', 'bug', 'improvement', 'documentation', 'maintenance', 'emergency'
  )),
  created_at timestamptz NOT NULL,
  -- The card as its last `card-changed` carried it, null before any.
  projection text
);

CREATE INDEX cards_project ON cards (project_id, created_at, run_id COLLATE "C");

-- The workers online that each project's last `board-changed` carried.
CREATE TABLE board_projections (
  project_id text PRIMARY KEY,
  workers_online integer NOT NULL CHECK (workers_online >= 0)
);

-- The order in which tasks were admitted, total and stable but not commit
-- order; a task's INSERT takes the next value, existing ones their id order.
CREATE SEQUENCE tasks_admission_seq AS bigint;
ALTER TABLE tasks ADD COLUMN admission_seq bigint;
ALTER SEQUENCE tasks_admission_seq OWNED BY tasks.admission_seq;
UPDATE tasks SET admission_seq = ordered.seq
  FROM (SELECT id, row_number() OVER (ORDER BY id COLLATE "C") AS seq FROM tasks) AS ordered
  WHERE tasks.id = ordered.id;
SELECT setval('tasks_admission_seq', coalesce(max(admission_seq), 0) + 1, false) FROM tasks;
ALTER TABLE tasks
  ALTER COLUMN admission_seq SET DEFAULT nextval('tasks_admission_seq'),
  ALTER COLUMN admission_seq SET NOT NULL;

-- What a writer's transaction changed, for the card projector: a run, a
-- task, an admission, a session, a project, a worker, or the fleet.
CREATE TABLE card_touches (
  touch_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject text NOT NULL CHECK (subject IN ('run', 'task', 'admission', 'session', 'project', 'worker', 'fleet')),
  subject_id text NOT NULL
);

-- Arguments: the subject and the column of the row that names it.
CREATE FUNCTION touch_card() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO card_touches (subject, subject_id) VALUES (
    TG_ARGV[0], to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END) ->> TG_ARGV[1]
  );
  RETURN NULL;
END
$$;

-- The fleet's capacity or state, which every waiting card reads; the
-- subject names the table that changed.
CREATE FUNCTION touch_fleet() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO card_touches (subject, subject_id) VALUES ('fleet', TG_TABLE_NAME);
  RETURN NULL;
END
$$;

CREATE TRIGGER cards_touch AFTER INSERT ON cards
  FOR EACH ROW EXECUTE FUNCTION touch_card('run', 'run_id');
-- Every watched table but the cards also touches on a delete.
CREATE TRIGGER workflow_runs_touch AFTER INSERT OR UPDATE OR DELETE ON workflow_runs
  FOR EACH ROW EXECUTE FUNCTION touch_card('run', 'id');
CREATE TRIGGER gates_touch AFTER INSERT OR UPDATE OR DELETE ON gates
  FOR EACH ROW EXECUTE FUNCTION touch_card('run', 'run_id');
CREATE TRIGGER task_lineage_touch AFTER INSERT OR DELETE ON task_lineage
  FOR EACH ROW EXECUTE FUNCTION touch_card('task', 'task_id');
CREATE TRIGGER tasks_touch AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION touch_card('task', 'id');
CREATE TRIGGER admissions_touch AFTER INSERT OR UPDATE OR DELETE ON admissions
  FOR EACH ROW EXECUTE FUNCTION touch_card('admission', 'id');
CREATE TRIGGER assignments_touch AFTER INSERT OR UPDATE OR DELETE ON assignments
  FOR EACH ROW EXECUTE FUNCTION touch_card('task', 'task_id');
-- A reservation held or released changes a worker's free slots.
CREATE TRIGGER assignments_fleet_touch_insert AFTER INSERT ON assignments
  FOR EACH ROW WHEN (NEW.reservation_state = 'held') EXECUTE FUNCTION touch_fleet();
CREATE TRIGGER assignments_fleet_touch_update AFTER UPDATE ON assignments
  FOR EACH ROW WHEN (OLD.reservation_state IS DISTINCT FROM NEW.reservation_state OR OLD.worker_id IS DISTINCT FROM NEW.worker_id)
  EXECUTE FUNCTION touch_fleet();
CREATE TRIGGER assignments_fleet_touch_delete AFTER DELETE ON assignments
  FOR EACH ROW WHEN (OLD.reservation_state = 'held') EXECUTE FUNCTION touch_fleet();
CREATE TRIGGER placement_outcomes_touch AFTER INSERT OR UPDATE OR DELETE ON placement_outcomes
  FOR EACH ROW EXECUTE FUNCTION touch_card('task', 'task_id');
CREATE TRIGGER agent_sessions_touch AFTER INSERT OR UPDATE OR DELETE ON agent_sessions
  FOR EACH ROW EXECUTE FUNCTION touch_card('task', 'task_id');
CREATE TRIGGER session_inbox_items_touch AFTER INSERT OR UPDATE OR DELETE ON session_inbox_items
  FOR EACH ROW EXECUTE FUNCTION touch_card('session', 'session_id');
CREATE TRIGGER auto_merge_settings_touch AFTER INSERT OR UPDATE OR DELETE ON auto_merge_settings
  FOR EACH ROW EXECUTE FUNCTION touch_card('project', 'project_id');
CREATE TRIGGER workers_touch AFTER INSERT OR DELETE ON workers
  FOR EACH ROW EXECUTE FUNCTION touch_card('worker', 'worker_id');
-- A worker's placement record and whether it is enrolled, read through the
-- row, so an earlier down migration can still drop a column.
CREATE FUNCTION worker_board_fields(worker jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'enrolled', worker -> 'enrolled', 'revoked', worker -> 'revoked', 'draining', worker -> 'draining',
    'reachable', worker -> 'reachable', 'pressure', worker -> 'admission_pressure_since',
    'refused', worker -> 'capacity_refused_since', 'slots', worker -> 'slots', 'cpu', worker -> 'cpu_millicores',
    'memory', worker -> 'memory_mebibytes', 'controls', worker -> 'controls', 'protocol', worker -> 'protocol_version',
    'admission', worker -> 'worker_admission', 'enrollment', worker ->> 'enrollment' IS NOT NULL
  )
$$;
-- Only those touch; a contact time alone changes no card.
CREATE TRIGGER workers_touch_update AFTER UPDATE ON workers
  FOR EACH ROW WHEN (worker_board_fields(to_jsonb(OLD)) IS DISTINCT FROM worker_board_fields(to_jsonb(NEW)))
  EXECUTE FUNCTION touch_card('worker', 'worker_id');

CREATE TRIGGER installation_touch AFTER INSERT OR DELETE ON installation
  FOR EACH ROW EXECUTE FUNCTION touch_fleet();
CREATE TRIGGER installation_touch_update AFTER UPDATE ON installation
  FOR EACH ROW WHEN (OLD.quarantined IS DISTINCT FROM NEW.quarantined OR OLD.recovery_epoch IS DISTINCT FROM NEW.recovery_epoch)
  EXECUTE FUNCTION touch_fleet();

-- Down Migration

-- CASCADE drops every trigger of the function, also on a table that an
-- earlier down migration already removed with its triggers.
DROP FUNCTION touch_fleet() CASCADE;
DROP FUNCTION touch_card() CASCADE;
DROP FUNCTION worker_board_fields(jsonb);
DROP TABLE card_touches;
DROP TABLE board_projections;
DROP TABLE cards;
-- The column owns its sequence, so dropping it drops the sequence.
ALTER TABLE tasks DROP COLUMN admission_seq;
