import type { Instant } from '@taskelith/kernel';
import { expectCode, expectRead, expectSuccess, type ConformanceCase, type EvidenceReference } from '@taskelith/sdlc';
import type { IdempotencyKey, PrincipalId, WorkerId } from '../domain/identifiers.js';
import type { JournalId, ObservationId } from '../domain/observation-sequence.js';
import type { InboxAnswerKey, InboxAnswerKeys, ReconciliationAnswers } from './inbox-answers.js';
import type { NeedsYouItem, NeedsYouItemId, NeedsYouSourceId } from './needs-you.js';

const AT = '2026-11-03T10:00:00.000Z' as Instant;
const ITEM = 'r-item-1' as NeedsYouItemId;
const OTHER_ITEM = 'r-item-2' as NeedsYouItemId;
const KEY = 'key-1' as IdempotencyKey;

const PROCESS_FIELDS = {
  sourceId: 'reconciliation' as NeedsYouSourceId, kind: 'reconciliation', reconciliationReason: 'unrecorded-process',
  subject: { scope: 'installation', workerId: 'worker-1' as WorkerId, journalId: 'journal-1' as JournalId, observationId: 'observation-1' as ObservationId },
  title: 'A worker reported a process that no journal records', createdAt: AT, answerableBy: 'installation-owner',
  containment: 'cgroup taskelith/unknown', processCount: 2,
} as const;

function openProcess(id: NeedsYouItemId): NeedsYouItem {
  return { ...PROCESS_FIELDS, id, state: 'open' };
}

function resolvedProcess(id: NeedsYouItemId, reason = 'Stopped by hand'): NeedsYouItem {
  const answer = {
    kind: 'reconciliation', decision: 'acknowledge-process', evidence: 'incident-7' as EvidenceReference, reason,
  } as const;
  return { ...PROCESS_FIELDS, id, state: 'resolved', resolution: { resolvedBy: 'owner-1' as PrincipalId, resolvedAt: AT, answer } };
}

function keyOf(itemId: NeedsYouItemId, key: IdempotencyKey, digest = 'digest-1'): InboxAnswerKey {
  return { itemId, key, digest, outcome: resolvedProcess(itemId) };
}

export const INBOX_ANSWER_KEYS_CONFORMANCE: readonly ConformanceCase<InboxAnswerKeys>[] = Object.freeze([
  {
    name: 'a key is recorded once per item with its digest and first outcome',
    async check(keys) {
      const problems: string[] = [];
      expectRead(problems, 'unknown', await keys.find(ITEM, KEY), undefined);
      expectSuccess(problems, 'record', await keys.record(keyOf(ITEM, KEY)));
      expectRead(problems, 'read', await keys.find(ITEM, KEY), keyOf(ITEM, KEY));
      expectCode(problems, 'again', await keys.record(keyOf(ITEM, KEY, 'digest-2')), 'conflict');
      expectRead(problems, 'unchanged', await keys.find(ITEM, KEY), keyOf(ITEM, KEY));
      expectSuccess(problems, 'other item', await keys.record(keyOf(OTHER_ITEM, KEY, 'digest-2')));
      expectRead(problems, 'scoped', await keys.find(OTHER_ITEM, KEY), keyOf(OTHER_ITEM, KEY, 'digest-2'));
      expectRead(problems, 'other key', await keys.find(ITEM, 'key-2' as IdempotencyKey), undefined);
      return problems;
    },
  },
]);

export const RECONCILIATION_ANSWERS_CONFORMANCE: readonly ConformanceCase<ReconciliationAnswers>[] = Object.freeze([
  {
    name: 'a resolved reconciliation item is recorded once, and no other item',
    async check(answers) {
      const problems: string[] = [];
      expectRead(problems, 'unknown', await answers.get(ITEM), undefined);
      expectCode(problems, 'open', await answers.record(openProcess(ITEM)), 'invalid');
      expectSuccess(problems, 'record', await answers.record(resolvedProcess(ITEM)));
      expectRead(problems, 'read', await answers.get(ITEM), resolvedProcess(ITEM));
      expectCode(problems, 'again', await answers.record(resolvedProcess(ITEM, 'Another reason')), 'conflict');
      expectRead(problems, 'unchanged', await answers.get(ITEM), resolvedProcess(ITEM));
      expectRead(problems, 'other', await answers.get(OTHER_ITEM), undefined);
      return problems;
    },
  },
]);
