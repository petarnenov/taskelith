import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTO_MERGE_DEFAULT_ENABLED,
  CONFLICT_ATTEMPT_BUDGET,
  IN_FLIGHT_MERGE_STATES,
  MAX_INTAKE_BODY_BYTES,
  MAX_INTAKE_TITLE_LENGTH,
  MERGE_REQUEST_STATES,
  WITHDRAWAL_REASONS,
} from '@taskelith/integrations';

// The values the product ports contract fixes; a change here is a contract
// change and needs the contract and the wire schemas updated with it.
const CONTRACT_VALUES = [
  [
    'MERGE_REQUEST_STATES',
    MERGE_REQUEST_STATES,
    ['queued', 'merging', 'resolving-conflict', 'returned-to-specify', 'escalated', 'merged', 'withdrawn'],
  ],
  ['IN_FLIGHT_MERGE_STATES', IN_FLIGHT_MERGE_STATES, ['merging', 'resolving-conflict']],
  [
    'WITHDRAWAL_REASONS',
    WITHDRAWAL_REASONS,
    ['gate-not-passed', 'auto-merge-off', 'cancelled', 'manual-merge', 'maintainer-withdrew'],
  ],
] as const;

for (const [name, actual, expected] of CONTRACT_VALUES) {
  test(`${name} holds the contract's values, frozen`, () => {
    assert.deepEqual([...actual], expected);
    assert.ok(Object.isFrozen(actual));
  });
}

test('every in-flight state is a merge request state', () => {
  for (const state of IN_FLIGHT_MERGE_STATES) assert.ok(MERGE_REQUEST_STATES.includes(state));
});

test('auto-merge is on by default with a budget of three conflict attempts', () => {
  assert.equal(AUTO_MERGE_DEFAULT_ENABLED, true);
  assert.equal(CONFLICT_ATTEMPT_BUDGET, 3);
});

test('intake bounds are fixed', () => {
  assert.equal(MAX_INTAKE_TITLE_LENGTH, 200);
  assert.equal(MAX_INTAKE_BODY_BYTES, 262_144);
});
