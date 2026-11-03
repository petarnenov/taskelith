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

-- Down Migration

DROP TABLE reconciliation_answers;
DROP FUNCTION refuse_reconciliation_answer_change();
DROP TABLE inbox_answer_keys;
