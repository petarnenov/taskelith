import assert from 'node:assert/strict';
import test from 'node:test';
import { isQuarantineEvidence } from '@taskelith/execution';
import { EPOCH, epoch } from './fixtures.ts';

const CURRENT = { recoveryEpoch: EPOCH, quarantined: false };

test('an observation at the current epoch outside quarantine is not quarantine evidence', () => {
  assert.equal(isQuarantineEvidence(EPOCH, CURRENT), false);
});

test('an observation at an older or a newer epoch is quarantine evidence', () => {
  assert.equal(isQuarantineEvidence(EPOCH, { ...CURRENT, recoveryEpoch: epoch(2) }), true);
  assert.equal(isQuarantineEvidence(epoch(2), CURRENT), true);
});

test('an observation at the current epoch received in quarantine is quarantine evidence', () => {
  assert.equal(isQuarantineEvidence(EPOCH, { ...CURRENT, quarantined: true }), true);
});
