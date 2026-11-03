import type { Result } from '@taskelith/kernel';
import type { IdempotencyKey } from '../domain/identifiers.js';
import type { NeedsYouItem, NeedsYouItemId } from './needs-you.js';

// The first outcome of an answer under its key, which is scoped to its item;
// `digest` is the keyed digest of the answer before redaction.
export interface InboxAnswerKey {
  readonly itemId: NeedsYouItemId;
  readonly key: IdempotencyKey;
  readonly digest: string;
  readonly outcome: NeedsYouItem;
}

// The control plane's answer keys (product ports section 4.2); a key that
// the item already holds is `conflict` `idempotency-key-reused`.
export interface InboxAnswerKeys {
  find(itemId: NeedsYouItemId, key: IdempotencyKey): Promise<Result<InboxAnswerKey | undefined>>;
  record(answer: InboxAnswerKey): Promise<Result<void>>;
}

// The reconciliation source's resolved items, their audit record: a second
// resolution is `conflict` `already-answered`, any other item `invalid`.
export interface ReconciliationAnswers {
  get(itemId: NeedsYouItemId): Promise<Result<NeedsYouItem | undefined>>;
  record(item: NeedsYouItem): Promise<Result<void>>;
}

export type ResolvedReconciliation = Extract<NeedsYouItem, { readonly kind: 'reconciliation'; readonly state: 'resolved' }>;

export function isResolvedReconciliation(item: NeedsYouItem): item is ResolvedReconciliation {
  return item.kind === 'reconciliation' && item.state === 'resolved';
}
