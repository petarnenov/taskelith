import assert from 'node:assert/strict';
import { test } from 'node:test';
import { operation } from './control-plane-document.ts';

// The answers of the slot commands as account pool contract section 8.1
// and the 12d decisions state them (12d B1, coordinator answer Q1).
const DESCRIPTIONS: ReadonlyArray<readonly [string, string, string]> = [
  ['updateAccountSlot', '409', 'The expected revision is not the current one, or the slot is revoked.'],
  ['revokeAccountSlot', '409', 'The expected revision is not the current one; a revoked slot at the current revision answers 200 unchanged.'],
  ['reinstateAccountSlot', '409', 'The expected revision is not the current one; an active slot at the current revision answers 200 unchanged.'],
  ['removeAccountSlot', '409', 'The expected revision is not the current one; a removed slot answers 404.'],
  [
    'rotateSlotCredential', '200',
    'The slot, healthy, on its new credential, as its switch committed it; the cleanup that follows may advance the revision once more (account pool contract section 8.1).',
  ],
];

for (const [operationId, status, description] of DESCRIPTIONS) {
  test(`the ${status} of ${operationId} states the answer of the slot command`, () => {
    assert.equal(operation(operationId).responses[status]?.description, description);
  });
}
