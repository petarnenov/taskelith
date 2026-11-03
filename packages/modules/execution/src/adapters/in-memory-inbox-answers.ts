import { err, failure, ok, type Result } from '@taskelith/kernel';
import { ALREADY_ANSWERED, KEY_REUSED } from '../application/session-timeline-service.js';
import type { IdempotencyKey } from '../domain/identifiers.js';
import {
  isResolvedReconciliation,
  type InboxAnswerKey,
  type InboxAnswerKeys,
  type ReconciliationAnswers,
} from '../ports/inbox-answers.js';
import type { NeedsYouItem, NeedsYouItemId } from '../ports/needs-you.js';

// Keeps the answer keys in process memory; a read is a copy.
export class InMemoryInboxAnswerKeys implements InboxAnswerKeys {
  readonly #keys = new Map<string, InboxAnswerKey>();

  async find(itemId: NeedsYouItemId, key: IdempotencyKey): Promise<Result<InboxAnswerKey | undefined>> {
    return ok(copyOf(this.#keys.get(keyOf(itemId, key))));
  }

  async record(answer: InboxAnswerKey): Promise<Result<void>> {
    const held = keyOf(answer.itemId, answer.key);
    if (this.#keys.has(held)) return err(failure('conflict', `item ${answer.itemId} already holds the key ${answer.key}`, { reason: KEY_REUSED }));
    this.#keys.set(held, structuredClone(answer));
    return ok(undefined);
  }
}

// Keeps the resolved reconciliation items in process memory; a read is a
// copy, so a reader cannot change the audit record.
export class InMemoryReconciliationAnswers implements ReconciliationAnswers {
  readonly #items = new Map<NeedsYouItemId, NeedsYouItem>();

  async get(itemId: NeedsYouItemId): Promise<Result<NeedsYouItem | undefined>> {
    return ok(copyOf(this.#items.get(itemId)));
  }

  async record(item: NeedsYouItem): Promise<Result<void>> {
    if (!isResolvedReconciliation(item)) return err(failure('invalid', `item ${item.id} is not a resolved reconciliation item`));
    if (this.#items.has(item.id)) return err(failure('conflict', `item ${item.id} is resolved`, { reason: ALREADY_ANSWERED }));
    this.#items.set(item.id, structuredClone(item));
    return ok(undefined);
  }
}

function copyOf<Value>(held: Value | undefined): Value | undefined {
  return held === undefined ? undefined : structuredClone(held);
}

function keyOf(itemId: NeedsYouItemId, key: IdempotencyKey): string {
  return JSON.stringify([itemId, key]);
}
