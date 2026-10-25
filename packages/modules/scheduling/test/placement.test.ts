import assert from 'node:assert/strict';
import test from 'node:test';
import type { AttemptId, WorkerId } from '@taskelith/execution';
import {
  DEFAULT_ATTEMPT_REQUEST,
  REJECTING_REASONS,
  STANDING_REASONS,
  WAITING_REASONS,
  isAwaitingCapacity,
  isSameDelegation,
  recordDelegation,
  redecideDelegation,
  triesNextCandidate,
  type DelegationId,
  type DelegationValues,
  type RunId,
} from '@taskelith/scheduling';
import type { Instant } from '@taskelith/kernel';
import type { OwnershipGeneration } from '@taskelith/sdlc';

const WORKER = 'worker-1' as WorkerId;
const VALUES: DelegationValues = {
  attemptId: 'attempt-1' as AttemptId,
  ownershipGeneration: 2 as OwnershipGeneration,
  runId: 'run-1' as RunId,
  child: { taskId: 'task-child', kind: 'planning', stageId: 'specs', workItem: { id: 'w', nativeReference: 'r' } },
};

test('only a reason about the worker moves placement to the next candidate', () => {
  const next = [...WAITING_REASONS, ...STANDING_REASONS, ...REJECTING_REASONS].filter(triesNextCandidate);
  assert.deepEqual(next, ['worker-not-eligible', 'worker-capacity-exhausted', 'control-not-enforceable']);
});

test('the default attempt request is 1 vCPU and 2 GiB without hard controls', () => {
  assert.deepEqual(DEFAULT_ATTEMPT_REQUEST, { cpuMillicores: 1000, memoryMebibytes: 2048, hardControls: [] });
  assert.ok(Object.isFrozen(DEFAULT_ATTEMPT_REQUEST));
});

test('a delegation repeat is the same only for the same worker and values, in any key order', () => {
  const record = recordDelegation({ delegationId: 'delegation-1' as DelegationId, workerId: WORKER, values: VALUES, waitingSince: 'T' as Instant }, {
    state: 'awaiting-capacity',
  });
  const reordered = { ...VALUES, child: { workItem: { nativeReference: 'r', id: 'w' }, stageId: 'specs', kind: 'planning', taskId: 'task-child' } };
  assert.equal(isSameDelegation(record, WORKER, reordered), true);
  assert.equal(isSameDelegation(record, 'worker-2' as WorkerId, VALUES), false);
  assert.equal(isSameDelegation(record, WORKER, { ...VALUES, child: { ...VALUES.child, taskId: 'task-other' } }), false);
  assert.equal(isAwaitingCapacity(record), true);
  const rejected = redecideDelegation(record, { state: 'rejected', reason: 'delegation-awaiting-capacity' });
  assert.deepEqual([rejected.generation, rejected.waitingSince, isAwaitingCapacity(rejected)], [record.generation + 1, record.waitingSince, false]);
  assert.ok(Object.isFrozen(rejected) && Object.isFrozen(rejected.outcome));
});
