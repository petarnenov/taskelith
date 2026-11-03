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

CREATE INDEX cards_project ON cards (project_id, created_at, run_id);

-- The workers online that each project's last `board-changed` carried.
CREATE TABLE board_projections (
  project_id text PRIMARY KEY,
  workers_online integer NOT NULL CHECK (workers_online >= 0)
);

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
CREATE TRIGGER workflow_runs_touch AFTER INSERT OR UPDATE ON workflow_runs
  FOR EACH ROW EXECUTE FUNCTION touch_card('run', 'id');
CREATE TRIGGER gates_touch AFTER INSERT OR UPDATE ON gates
  FOR EACH ROW EXECUTE FUNCTION touch_card('run', 'run_id');
CREATE TRIGGER task_lineage_touch AFTER INSERT ON task_lineage
  FOR EACH ROW EXECUTE FUNCTION touch_card('task', 'task_id');
CREATE TRIGGER tasks_touch AFTER INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION touch_card('task', 'id');
CREATE TRIGGER admissions_touch AFTER INSERT OR UPDATE ON admissions
  FOR EACH ROW EXECUTE FUNCTION touch_card('admission', 'id');
CREATE TRIGGER assignments_touch AFTER INSERT OR UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION touch_card('task', 'task_id');
-- A reservation held or released changes a worker's free slots.
CREATE TRIGGER assignments_fleet_touch_insert AFTER INSERT ON assignments
  FOR EACH ROW WHEN (NEW.reservation_state = 'held') EXECUTE FUNCTION touch_fleet();
CREATE TRIGGER assignments_fleet_touch_update AFTER UPDATE ON assignments
  FOR EACH ROW WHEN (OLD.reservation_state IS DISTINCT FROM NEW.reservation_state OR OLD.worker_id IS DISTINCT FROM NEW.worker_id)
  EXECUTE FUNCTION touch_fleet();
CREATE TRIGGER placement_outcomes_touch AFTER INSERT OR UPDATE OR DELETE ON placement_outcomes
  FOR EACH ROW EXECUTE FUNCTION touch_card('task', 'task_id');
CREATE TRIGGER agent_sessions_touch AFTER INSERT OR UPDATE ON agent_sessions
  FOR EACH ROW EXECUTE FUNCTION touch_card('task', 'task_id');
CREATE TRIGGER session_inbox_items_touch AFTER INSERT OR UPDATE ON session_inbox_items
  FOR EACH ROW EXECUTE FUNCTION touch_card('session', 'session_id');
CREATE TRIGGER auto_merge_settings_touch AFTER INSERT OR UPDATE ON auto_merge_settings
  FOR EACH ROW EXECUTE FUNCTION touch_card('project', 'project_id');
CREATE TRIGGER workers_touch_insert AFTER INSERT ON workers
  FOR EACH ROW EXECUTE FUNCTION touch_card('worker', 'worker_id');
-- A contact time alone changes no card; reachability and the rest do.
CREATE TRIGGER workers_touch_update AFTER UPDATE ON workers
  FOR EACH ROW WHEN (to_jsonb(OLD) - 'last_contact_at' IS DISTINCT FROM to_jsonb(NEW) - 'last_contact_at')
  EXECUTE FUNCTION touch_card('worker', 'worker_id');

CREATE TRIGGER installation_touch_insert AFTER INSERT ON installation
  FOR EACH ROW EXECUTE FUNCTION touch_fleet();
CREATE TRIGGER installation_touch_update AFTER UPDATE ON installation
  FOR EACH ROW WHEN (OLD.quarantined IS DISTINCT FROM NEW.quarantined OR OLD.recovery_epoch IS DISTINCT FROM NEW.recovery_epoch)
  EXECUTE FUNCTION touch_fleet();

-- Down Migration

-- CASCADE drops every trigger of the function, also on a table that an
-- earlier down migration already removed with its triggers.
DROP FUNCTION touch_fleet() CASCADE;
DROP FUNCTION touch_card() CASCADE;
DROP TABLE card_touches;
DROP TABLE board_projections;
DROP TABLE cards;
