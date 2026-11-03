import assert from 'node:assert/strict';
import test from 'node:test';
import { boardReadsOf } from '@taskelith/control-plane';
import { err, failure, ok } from '@taskelith/kernel';

const DOWN = err(failure('unavailable', 'down'));

test('the board reads pass a store failure on, and skip a worker with no record', async () => {
  const reads = boardReadsOf({
    uiEvents: { bounds: async () => DOWN },
    fleet: { activeWorkerIds: async () => DOWN },
    access: { projects: { autoMergeSetting: async () => DOWN } },
  } as never);
  assert.deepEqual([await reads.head(), await reads.fleet.workers(), await reads.autoMergeEnabled('alpha' as never)], [DOWN, DOWN, DOWN]);
  const known = boardReadsOf({
    fleet: { activeWorkerIds: async () => ok(['w-1', 'w-2']) },
    workers: { get: async (workerId: string) => (workerId === 'w-1' ? { workerId } : undefined) },
    installation: { quarantined: async () => true, recoveryEpoch: async () => 1 },
    access: { projects: { autoMergeSetting: async () => ok(undefined) } },
  } as never);
  assert.deepEqual(await known.fleet.workers(), ok([{ workerId: 'w-1' }]));
  assert.equal(await known.fleet.quarantined(), true);
  assert.deepEqual(await known.autoMergeEnabled('alpha' as never), ok(true), 'auto-merge starts on');
});
