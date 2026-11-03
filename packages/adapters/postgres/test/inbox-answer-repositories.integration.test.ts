import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import {
  INBOX_ANSWER_KEYS_CONFORMANCE,
  RECONCILIATION_ANSWERS_CONFORMANCE,
  type InboxAnswerKeys,
  type ReconciliationAnswers,
} from '@taskelith/execution';
import { PostgresDatabase } from '@taskelith/postgres';
import { createMigratedDatabase, truncateAll } from './test-database.ts';

const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
after(() => database.close());
beforeEach(() => truncateAll(url));

// Each call commits alone, as the conformance cases expect.
const keys: InboxAnswerKeys = {
  find: (itemId, key) => database.readOnly((tx) => tx.inboxAnswerKeys.find(itemId, key)),
  record: (answer) => database.transaction((tx) => tx.inboxAnswerKeys.record(answer)),
};

const answers: ReconciliationAnswers = {
  get: (itemId) => database.readOnly((tx) => tx.reconciliationAnswers.get(itemId)),
  record: (item) => database.transaction((tx) => tx.reconciliationAnswers.record(item)),
};

for (const conformance of INBOX_ANSWER_KEYS_CONFORMANCE) {
  test(`PostgreSQL inbox answer keys: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check(keys), []);
  });
}

for (const conformance of RECONCILIATION_ANSWERS_CONFORMANCE) {
  test(`PostgreSQL reconciliation answers: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check(answers), []);
  });
}
