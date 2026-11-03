-- Up Migration

-- The idempotency keys of inbox answers (G3 item 15b): a key is scoped to
-- the item it answers and keeps the keyed digest and the first outcome.
CREATE TABLE inbox_answer_keys (
  item_id text NOT NULL,
  idempotency_key text NOT NULL,
  digest text NOT NULL,
  outcome text NOT NULL,
  PRIMARY KEY (item_id, idempotency_key)
);

-- The resolved items of the reconciliation source, its audit record; a
-- row is never changed or removed.
CREATE TABLE reconciliation_answers (
  item_id text PRIMARY KEY,
  reconciliation_reason text NOT NULL CHECK (reconciliation_reason IN ('unknown-execution', 'unrecorded-process')),
  item text NOT NULL,
  resolved_at timestamptz NOT NULL
);

-- Its own function, so an earlier down migration can drop its functions.
CREATE FUNCTION refuse_reconciliation_answer_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'reconciliation answers are immutable';
END
$$;

CREATE TRIGGER reconciliation_answers_immutable BEFORE UPDATE OR DELETE ON reconciliation_answers
  FOR EACH ROW EXECUTE FUNCTION refuse_reconciliation_answer_change();

-- The reconciliation items as their last inbox-item-changed carried them,
-- for the card projector, and when it first recorded each one closed.
CREATE TABLE reconciliation_item_projections (
  item_id text PRIMARY KEY,
  projection text NOT NULL,
  closed_at timestamptz
);

-- An unrecorded process opens an installation item, which no card names.
ALTER TABLE card_touches DROP CONSTRAINT card_touches_subject_check;
ALTER TABLE card_touches ADD CONSTRAINT card_touches_subject_check CHECK (subject IN (
  'run', 'task', 'admission', 'session', 'project', 'worker', 'fleet', 'unrecorded-process'
));

CREATE FUNCTION touch_unrecorded_process() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO card_touches (subject, subject_id) VALUES ('unrecorded-process', NEW.worker_id);
  RETURN NULL;
END
$$;

CREATE TRIGGER unrecorded_processes_touch AFTER INSERT ON unrecorded_processes
  FOR EACH ROW EXECUTE FUNCTION touch_unrecorded_process();

-- The processes recorded before this migration open their items, too.
INSERT INTO card_touches (subject, subject_id)
  SELECT DISTINCT 'unrecorded-process', worker_id FROM unrecorded_processes;

-- Down Migration

-- CASCADE drops the trigger also where an earlier down migration ran.
DROP FUNCTION touch_unrecorded_process() CASCADE;
-- The board migration's down migration may have dropped the touches.
DO $$
BEGIN
  IF to_regclass('card_touches') IS NOT NULL THEN
    DELETE FROM card_touches WHERE subject = 'unrecorded-process';
    ALTER TABLE card_touches DROP CONSTRAINT card_touches_subject_check;
    ALTER TABLE card_touches ADD CONSTRAINT card_touches_subject_check CHECK (subject IN (
      'run', 'task', 'admission', 'session', 'project', 'worker', 'fleet'
    ));
  END IF;
END
$$;
DROP TABLE reconciliation_item_projections;
DROP TABLE reconciliation_answers;
DROP FUNCTION refuse_reconciliation_answer_change();
DROP TABLE inbox_answer_keys;
