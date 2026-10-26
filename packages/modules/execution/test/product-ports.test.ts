import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANSWERING_ROLES,
  BOARD_COLUMNS,
  ESCALATION_REASONS,
  EVIDENCE_FRESHNESS,
  MAX_INPUT_ANSWER_BYTES,
  MERGE_GATE_STATES,
  NEEDS_YOU_KINDS,
  SESSION_ACTIVITIES,
  SPEC_APPROVERS,
  STANDING_RULE_OPERATIONS,
  STANDING_RULE_ORIGINS,
  WAITING_REASONS,
  WORK_TYPES,
} from '@taskelith/execution';

// The values the product ports contract fixes; a change here is a contract
// change and needs the contract and the wire schemas updated with it.
const CONTRACT_VALUES = [
  ['BOARD_COLUMNS', BOARD_COLUMNS, ['propose', 'specify', 'implement', 'verify', 'review', 'archived']],
  ['WORK_TYPES', WORK_TYPES, ['feature', 'bug', 'improvement', 'documentation', 'maintenance', 'emergency']],
  [
    'MERGE_GATE_STATES',
    MERGE_GATE_STATES,
    [
      'not-ready',
      'awaiting-manual-merge',
      'queued',
      'merging',
      'resolving-conflict',
      'returned-to-specify',
      'escalated',
      'integrated',
    ],
  ],
  [
    'SESSION_ACTIVITIES',
    SESSION_ACTIVITIES,
    [
      'none',
      'working',
      'waiting-for-person',
      'waiting-for-admission',
      'stopped',
      'worker-unreachable',
      'process-uncertain',
    ],
  ],
  ['WAITING_REASONS', WAITING_REASONS, ['person', 'stage-admission', 'reviewer', 'capacity', 'merge-queue']],
  ['EVIDENCE_FRESHNESS', EVIDENCE_FRESHNESS, ['current', 'stale', 'missing']],
  ['NEEDS_YOU_KINDS', NEEDS_YOU_KINDS, ['permission-request', 'input-request', 'spec-approval', 'escalation']],
  ['ESCALATION_REASONS', ESCALATION_REASONS, ['conflict-budget-spent', 'spec-reconciliation-failed', 'no-reviewer']],
  ['ANSWERING_ROLES', ANSWERING_ROLES, ['project-operator', 'project-maintainer']],
  ['STANDING_RULE_OPERATIONS', STANDING_RULE_OPERATIONS, ['push-to-task-branch']],
  ['STANDING_RULE_ORIGINS', STANDING_RULE_ORIGINS, ['maintainer', 'auto-merge']],
  ['SPEC_APPROVERS', SPEC_APPROVERS, ['delegated-reviewer', 'project-maintainer']],
] as const;

for (const [name, actual, expected] of CONTRACT_VALUES) {
  test(`${name} holds the contract's values, frozen`, () => {
    assert.deepEqual([...actual], expected);
    assert.ok(Object.isFrozen(actual));
  });
}

test('an input answer is bounded at 64 KiB', () => {
  assert.equal(MAX_INPUT_ANSWER_BYTES, 65_536);
});
