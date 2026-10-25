import assert from 'node:assert/strict';
import test from 'node:test';
import { PlacementService, RetrySchedule, type ControlPlaneStore } from '@taskelith/control-plane';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';

// A controlled clock and a fixed jitter draw of one half: the first delay
// is 7.5 s, the second 15 s.
function timing() {
  const clock = { at: 0 };
  return { clock, timing: { now: () => clock.at, draw: () => 0.5 } };
}

const UNPLACED = err(failure('precondition-failed', 'no candidate accepted it'));
const DOWN = err(failure('unavailable', 'the store is down'));

// Answers the waiting read and each placement transaction from scripts,
// counting both; the transactions themselves run in the integration tests.
function scriptedStore(placements: Result<unknown>[]) {
  const state = {
    waiting: ['task-1'], candidates: ['worker-a'], excluded: [] as string[][], reads: 0, opened: 0, read: ok(undefined) as Result<void>,
  };
  const placementOf = (taskId: string) => ({ projectId: 'project-1', waitingSince: '2026-10-25T09:00:00.000Z', item: taskId });
  const store = {
    readCommitted: async (work: (tx: unknown) => Promise<unknown>) => {
      state.reads++;
      if (!state.read.ok) return state.read;
      return work({
        workers: { candidates: async () => state.candidates },
        placements: {
          waiting: async (_limit: number, excluding: readonly string[]) => {
            state.excluded.push([...excluding]);
            return state.waiting.filter((taskId) => !excluding.includes(taskId)).map(placementOf);
          },
        },
      });
    },
    transaction: async () => {
      state.opened++;
      return placements.shift() ?? UNPLACED;
    },
  } as unknown as ControlPlaneStore;
  return { state, store };
}

test('a task that is not placed backs off exponentially and is reset once placed', async () => {
  const { clock, timing: controlled } = timing();
  const { state, store } = scriptedStore([UNPLACED, UNPLACED, ok({})]);
  const service = new PlacementService(store, controlled);
  assert.deepEqual(value(await service.placeWaiting()), { waiting: 1, placed: 0 });
  clock.at = 7_499;
  value(await service.placeWaiting());
  assert.equal(state.opened, 1, 'skipped before its next try');
  clock.at = 7_500;
  value(await service.placeWaiting());
  clock.at = 22_499;
  value(await service.placeWaiting());
  assert.equal(state.opened, 2, 'the second delay doubles');
  clock.at = 22_500;
  assert.deepEqual(value(await service.placeWaiting()), { waiting: 1, placed: 1 });
  value(await service.placeWaiting());
  assert.equal(state.opened, 4, 'a placed task has no delay left');
});

test('a task that backs off is excluded from the waiting read until due', async () => {
  const { clock, timing: controlled } = timing();
  const { state, store } = scriptedStore([UNPLACED]);
  const service = new PlacementService(store, controlled);
  value(await service.placeWaiting());
  assert.deepEqual(value(await service.placeWaiting()), { waiting: 0, placed: 0 });
  clock.at = 7_500;
  assert.deepEqual(value(await service.placeWaiting()), { waiting: 1, placed: 0 });
  assert.deepEqual(state.excluded, [[], ['task-1'], []]);
});

test('without a candidate no transaction is opened and the tasks back off', async () => {
  const { clock, timing: controlled } = timing();
  const { state, store } = scriptedStore([ok({})]);
  state.candidates = [];
  const service = new PlacementService(store, controlled);
  assert.deepEqual(value(await service.placeWaiting()), { waiting: 1, placed: 0 });
  state.candidates = ['worker-a'];
  value(await service.placeWaiting());
  assert.equal(state.opened, 0);
  clock.at = 7_500;
  assert.deepEqual(value(await service.placeWaiting()), { waiting: 1, placed: 1 });
});

test('after an outage the passes back off, and a successful pass resets them', async () => {
  const { clock, timing: controlled } = timing();
  const { state, store } = scriptedStore([DOWN]);
  const service = new PlacementService(store, controlled);
  assert.equal(failed(await service.placeWaiting()).code, 'unavailable');
  clock.at = 7_499;
  assert.deepEqual(value(await service.placeWaiting()), { waiting: 0, placed: 0 });
  assert.equal(state.reads, 1, 'a pass in backoff reads nothing');
  clock.at = 7_500;
  state.read = err(failure('internal', 'the read failed'));
  assert.equal(failed(await service.placeWaiting()).code, 'internal');
  clock.at = 22_499;
  value(await service.placeWaiting());
  assert.equal(state.reads, 2);
  clock.at = 22_500;
  state.read = ok(undefined);
  value(await service.placeWaiting());
  value(await service.placeWaiting());
  assert.equal(state.reads, 4, 'no delay after a successful pass');
});

test('a schedule delays a failed key from its draw', () => {
  const clock = { at: 1_000 };
  const draws = [0, 0.999];
  const schedule = new RetrySchedule<string>({ now: () => clock.at, draw: () => draws.shift()! });
  schedule.failed('a');
  schedule.failed('b');
  clock.at = 5_999;
  assert.deepEqual([schedule.due('a'), schedule.due('b')], [false, false]);
  clock.at = 6_000;
  assert.deepEqual([schedule.due('a'), schedule.due('b')], [true, false]);
  assert.deepEqual(schedule.notDue(), ['b']);
});

test('a schedule keeps a key failing within the longest delay and forgets one due before it', () => {
  const clock = { at: 0 };
  const schedule = new RetrySchedule<string>({ now: () => clock.at, draw: () => 0.5 });
  schedule.failed('a');
  schedule.failed('b');
  clock.at = 7_500 + 60_000;
  schedule.forgetStale();
  schedule.failed('a');
  clock.at = 7_501 + 60_000;
  schedule.forgetStale();
  assert.deepEqual(schedule.notDue(), ['a'], 'a keeps its second, 15 s delay until 82.5 s');
  schedule.failed('b');
  clock.at += 7_500;
  assert.deepEqual([schedule.due('a'), schedule.due('b')], [false, true], 'b starts again from the first delay');
});
