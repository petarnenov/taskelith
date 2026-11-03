import {
  KEY_REUSED,
  type IdempotencyKey,
  type InboxAnswerKeys,
  type InputDigest,
  type NeedsYouAnswer,
  type NeedsYouItem,
  type NeedsYouItemId,
  type NeedsYouScope,
  type NeedsYouSource,
  type PrincipalId,
} from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';

// What one answer reads and writes, in one SERIALIZABLE transaction that a
// lost serialization race runs again as a whole.
export interface InboxAnswerTransaction {
  readonly keys: InboxAnswerKeys;
  readonly sources: readonly NeedsYouSource[];
}

export interface InboxAnswerStore {
  transaction<Value>(work: (transaction: InboxAnswerTransaction) => Promise<Result<Value>>): Promise<Result<Value>>;
}

export interface InboxAnswerSubmission {
  readonly itemId: NeedsYouItemId;
  readonly responder: PrincipalId;
  readonly answer: NeedsYouAnswer;
  readonly idempotencyKey: IdempotencyKey;
}

interface LocatedItem {
  readonly source: NeedsYouSource;
  readonly item: NeedsYouItem;
}

// Wire contracts section 8: the item's scope is checked before its key, a
// repeated key never reaches the source, and all commit together.
export class InboxAnswers {
  readonly #store: InboxAnswerStore;
  readonly #digest: InputDigest;

  constructor(store: InboxAnswerStore, digest: InputDigest) {
    this.#store = store;
    this.#digest = digest;
  }

  // The item in any state, which the answer's role check reads first.
  item(scope: NeedsYouScope, itemId: NeedsYouItemId): Promise<Result<NeedsYouItem>> {
    return this.#store.transaction(async ({ sources }) => {
      const located = await locate(sources, scope, itemId);
      return located.ok ? ok(located.value.item) : located;
    });
  }

  answer(scope: NeedsYouScope, submission: InboxAnswerSubmission): Promise<Result<NeedsYouItem>> {
    const { itemId, idempotencyKey: key } = submission;
    const digest = this.#digest.digest(answerInput(submission));
    return this.#store.transaction(async ({ keys, sources }) => {
      const located = await locate(sources, scope, itemId);
      if (!located.ok) return located;
      const held = await keys.find(itemId, key);
      if (!held.ok) return held;
      if (held.value !== undefined) return held.value.digest === digest ? ok(held.value.outcome) : keyReused(itemId);
      const answered = await located.value.source.answer({ ...submission, scope });
      if (!answered.ok) return answered;
      const recorded = await keys.record({ itemId, key, digest, outcome: answered.value });
      return recorded.ok ? answered : recorded;
    });
  }
}

// The first source that holds the item in the scope owns it.
async function locate(sources: readonly NeedsYouSource[], scope: NeedsYouScope, itemId: NeedsYouItemId): Promise<Result<LocatedItem>> {
  for (const source of sources) {
    const item = await source.item(scope, itemId);
    if (!item.ok) return item;
    if (item.value !== undefined) return ok({ source, item: item.value });
  }
  return err(failure('not-found', `no inbox item ${itemId} in this inbox`));
}

// The answer before redaction and its responder, in a fixed field order,
// so the same answer always has the same digest (wire contracts section 7).
export function answerInput({ responder, answer }: Pick<InboxAnswerSubmission, 'responder' | 'answer'>): string {
  return JSON.stringify([responder, ...answerFields(answer)]);
}

function answerFields(answer: NeedsYouAnswer): readonly string[] {
  switch (answer.kind) {
    case 'input-request':
      return [answer.kind, answer.text];
    case 'spec-approval':
      return [answer.kind, answer.decision, answer.reason];
    case 'reconciliation':
      return [answer.kind, answer.decision, answer.evidence, answer.reason];
    default:
      return [answer.kind, answer.decision];
  }
}

function keyReused(itemId: NeedsYouItemId): Result<never> {
  return err(failure('conflict', `item ${itemId} holds the key with another answer`, { reason: KEY_REUSED }));
}
