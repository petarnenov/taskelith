import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANSWERING_ROLES,
  BOARD_COLUMNS,
  CARD_WAIT_KINDS,
  ESCALATION_REASONS,
  EVIDENCE_FRESHNESS,
  FLEET_OBSTACLE_REASONS,
  MAX_INPUT_ANSWER_BYTES,
  MERGE_GATE_STATES,
  NEEDS_YOU_KINDS,
  OBSTACLE_DISPOSITIONS,
  OBSTACLE_SOURCES,
  PLACEMENT_REJECTING_REASONS,
  PLACEMENT_WAITING_REASONS,
  RECONCILIATION_REASONS,
  RETRY_BACKOFF_REASON,
  SESSION_ACTIVITIES,
  SPEC_APPROVERS,
  STANDING_RULE_OPERATIONS,
  STANDING_RULE_ORIGINS,
  TASK_END_KINDS,
  WORK_TYPES,
  WORKER_REFUSAL_REASONS,
  type NeedsYouAnswer,
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
      'ready',
      'awaiting-manual-merge',
      'withdrawn',
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
  ['CARD_WAIT_KINDS', CARD_WAIT_KINDS, ['person', 'stage-admission', 'reviewer', 'capacity', 'merge-queue']],
  [
    'PLACEMENT_WAITING_REASONS',
    PLACEMENT_WAITING_REASONS,
    [
      'quarantined',
      'worker-not-eligible',
      'worker-capacity-exhausted',
      'project-quota-exhausted',
      'run-quota-exhausted',
      'provider-concurrency-exhausted',
      'control-not-enforceable',
      'delegation-awaiting-capacity',
      'no-candidate',
    ],
  ],
  [
    'PLACEMENT_REJECTING_REASONS',
    PLACEMENT_REJECTING_REASONS,
    [
      'resource-ceiling-exceeded',
      'spend-limit-not-enforceable',
      'delegation-depth-exceeded',
      'delegation-chain-exceeds-quota',
      'delegation-budget-exhausted',
      'retry-budget-exhausted',
      'no-eligible-slot',
      'session-slot-withdrawn',
    ],
  ],
  [
    'FLEET_OBSTACLE_REASONS',
    FLEET_OBSTACLE_REASONS,
    ['quarantined', 'worker-not-eligible', 'worker-capacity-exhausted', 'no-candidate'],
  ],
  [
    'WORKER_REFUSAL_REASONS',
    WORKER_REFUSAL_REASONS,
    [
      'worker-slots-exhausted',
      'worker-capacity-exhausted',
      'resource-ceiling-exceeded',
      'control-not-enforceable',
      'worker-admission-pressure',
      'worker-self-check-failed',
      'protocol-not-supported',
    ],
  ],
  ['OBSTACLE_SOURCES', OBSTACLE_SOURCES, ['scheduler', 'worker', 'fleet', 'automatic-retry']],
  ['OBSTACLE_DISPOSITIONS', OBSTACLE_DISPOSITIONS, ['waiting', 'rejected']],
  ['TASK_END_KINDS', TASK_END_KINDS, ['cancelled', 'rejected', 'retries-exhausted', 'uncertain-exit']],
  ['EVIDENCE_FRESHNESS', EVIDENCE_FRESHNESS, ['current', 'stale', 'missing']],
  [
    'NEEDS_YOU_KINDS',
    NEEDS_YOU_KINDS,
    ['permission-request', 'input-request', 'spec-approval', 'escalation', 'reconciliation', 'delivery-acknowledgement'],
  ],
  ['ESCALATION_REASONS', ESCALATION_REASONS, ['conflict-budget-spent', 'spec-reconciliation-failed', 'no-reviewer']],
  ['RECONCILIATION_REASONS', RECONCILIATION_REASONS, ['unknown-execution', 'unrecorded-process']],
  ['ANSWERING_ROLES', ANSWERING_ROLES, ['project-operator', 'project-maintainer', 'installation-owner']],
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

test('the fleet obstacle reasons are placement waiting reasons', () => {
  for (const reason of FLEET_OBSTACLE_REASONS) assert.ok(PLACEMENT_WAITING_REASONS.includes(reason), reason);
});

test('a placement reason is either waiting or rejecting, never both', () => {
  const rejecting: readonly string[] = PLACEMENT_REJECTING_REASONS;
  for (const reason of PLACEMENT_WAITING_REASONS) assert.ok(!rejecting.includes(reason), reason);
});

test('the retry backoff reason is no placement reason', () => {
  assert.equal(RETRY_BACKOFF_REASON, 'retry-backoff');
  const placement: readonly string[] = [...PLACEMENT_WAITING_REASONS, ...PLACEMENT_REJECTING_REASONS];
  assert.ok(!placement.includes(RETRY_BACKOFF_REASON));
});

test('an uncertain delivery is acknowledged as an inbox item of its own kind', () => {
  const acknowledgement: NeedsYouAnswer = { kind: 'delivery-acknowledgement', decision: 'acknowledge' };

  assert.ok(NEEDS_YOU_KINDS.includes(acknowledgement.kind));
});
