import {
  isResolvedReconciliation,
  type IdempotencyKey,
  type InboxAnswerKey,
  type InboxAnswerKeys,
  type NeedsYouItem,
  type NeedsYouItemId,
  type ReconciliationAnswers,
} from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { decodeRecord, encodeRecord } from './record-codec.js';
import type { Session } from './session.js';

interface KeyRow {
  readonly digest: string;
  readonly outcome: string;
}

// The table `inbox_answer_keys`; an item's key is its primary key.
export class PostgresInboxAnswerKeys implements InboxAnswerKeys {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async find(itemId: NeedsYouItemId, key: IdempotencyKey): Promise<Result<InboxAnswerKey | undefined>> {
    const { rows } = await this.#session.query<KeyRow>(
      'SELECT digest, outcome FROM inbox_answer_keys WHERE item_id = $1 AND idempotency_key = $2', [itemId, key],
    );
    const [row] = rows;
    return ok(row === undefined ? undefined : Object.freeze({ itemId, key, digest: row.digest, outcome: decodeRecord<NeedsYouItem>(row.outcome) }));
  }

  async record(answer: InboxAnswerKey): Promise<Result<void>> {
    const { rowCount } = await this.#session.query(
      `INSERT INTO inbox_answer_keys (item_id, idempotency_key, digest, outcome) VALUES ($1, $2, $3, $4)
       ON CONFLICT (item_id, idempotency_key) DO NOTHING`,
      [answer.itemId, answer.key, answer.digest, encodeRecord(answer.outcome)],
    );
    return rowCount === 1 ? ok(undefined) : err(failure('conflict', `item ${answer.itemId} already holds the key ${answer.key}`));
  }
}

// The table `reconciliation_answers`, whose rows a trigger keeps immutable.
export class PostgresReconciliationAnswers implements ReconciliationAnswers {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async get(itemId: NeedsYouItemId): Promise<Result<NeedsYouItem | undefined>> {
    const { rows } = await this.#session.query<{ item: string }>('SELECT item FROM reconciliation_answers WHERE item_id = $1', [itemId]);
    const [row] = rows;
    return ok(row === undefined ? undefined : decodeRecord<NeedsYouItem>(row.item));
  }

  async record(item: NeedsYouItem): Promise<Result<void>> {
    if (!isResolvedReconciliation(item)) {
      return err(failure('invalid', `item ${item.id} is not a resolved reconciliation item`));
    }
    const { rowCount } = await this.#session.query(
      `INSERT INTO reconciliation_answers (item_id, reconciliation_reason, item, resolved_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (item_id) DO NOTHING`,
      [item.id, item.reconciliationReason, encodeRecord(item), item.resolution.resolvedAt],
    );
    return rowCount === 1 ? ok(undefined) : err(failure('conflict', `item ${item.id} is resolved`));
  }
}
