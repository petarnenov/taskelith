import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INBOX_ANSWER_KEYS_CONFORMANCE,
  InMemoryInboxAnswerKeys,
  InMemoryReconciliationAnswers,
  RECONCILIATION_ANSWERS_CONFORMANCE,
} from '@taskelith/execution';

for (const conformance of INBOX_ANSWER_KEYS_CONFORMANCE) {
  test(`in-memory inbox answer keys: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check(new InMemoryInboxAnswerKeys()), []);
  });
}

for (const conformance of RECONCILIATION_ANSWERS_CONFORMANCE) {
  test(`in-memory reconciliation answers: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check(new InMemoryReconciliationAnswers()), []);
  });
}
