import assert from 'node:assert/strict';
import test from 'node:test';
import { PLACEMENT_BATCH, PlacementService, RetrySchedule, type ControlPlaneStore } from '@taskelith/control-plane';
import type { Task } from '@taskelith/execution';
import { err, failure, ok, parseInstant, type Result } from '@taskelith/kernel';
import { InMemoryPlacementQueue, InMemoryTaskLineage, type ProjectId, type RunId } from '@taskelith/scheduling';
import { FIRST_GENERATION, parseOwnershipGeneration, type AdmissionId, type TaskId } from '@taskelith/sdlc';
import { failed, value } from '@taskelith/testing';

// A controlled clock and a fixed jitter draw of one half: the first delay
// is 7.5 s, the second 15 s.
function timing() {
  const clock = { at: 0 };
  return { clock, timing: { now: () => clock.at, draw: () => 0.5 } };
}

const UNPLACED = err(failure('precondition-failed', 'no candidate accepted it'));
const DOWN = err(failure('unavailable', 'the store is down'));
const GONE = err(failure('precondition-failed', 'it does not wait', { reason: 'not-waiting' }));

// Answers the waiting read and each placement transaction from scripts,
// counting both; the transactions themselves run in the integration tests.
function scriptedStore(placements: Result<unknown>[]) {
  const state = {
    waiting: ['task-1'], candidates: ['worker-a'], excluded: [] as string[][], checked: [] as string[][],
    reads: 0, opened: 0, read: ok(undefined) as Result<void>,
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
          stillWaiting: async (taskIds: readonly string[]) => {
            state.checked.push([...taskIds]);
            return state.waiting.filter((taskId) => taskIds.includes(taskId));
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

test('a schedule answers the keys past due and forgets a key only when told', () => {
  const clock = { at: 0 };
  const schedule = new RetrySchedule<string>({ now: () => clock.at, draw: () => 0.5 });
  schedule.failed('a');
  schedule.failed('b');
  clock.at = 7_500;
  assert.deepEqual(schedule.pastDue(), ['a', 'b']);
  schedule.forget('a');
  clock.at = 600_000;
  assert.deepEqual(schedule.pastDue(), ['b'], 'age alone forgets nothing');
  schedule.failed('b');
  clock.at += 14_999;
  assert.deepEqual(schedule.notDue(), ['b'], 'b keeps its second, 15 s delay');
});

test('a backoff at its cap survives an outage longer than the cap', async () => {
  const clock = { at: 0 };
  const { state, store } = scriptedStore([]);
  const service = new PlacementService(store, { now: () => clock.at, draw: () => 0 });
  for (const at of [0, 5_000, 15_000, 35_000, 75_000]) {
    clock.at = at;
    value(await service.placeWaiting());
  }
  assert.equal(state.opened, 5, 'five failures reach the 60 s delay, due at 135 s');
  clock.at = 135_000;
  state.read = DOWN;
  failed(await service.placeWaiting());
  clock.at = 196_000;
  state.read = ok(undefined);
  value(await service.placeWaiting());
  assert.equal(state.opened, 6, 'tried again after the outage');
  clock.at = 255_999;
  value(await service.placeWaiting());
  assert.equal(state.opened, 6, 'the next delay is still 60 s');
  clock.at = 256_000;
  value(await service.placeWaiting());
  assert.equal(state.opened, 7);
});

test('the backoff of a task the queue no longer reads as waiting is forgotten', async () => {
  const { clock, timing: controlled } = timing();
  const { state, store } = scriptedStore([]);
  const service = new PlacementService(store, controlled);
  value(await service.placeWaiting());
  state.waiting = [];
  clock.at = 7_499;
  value(await service.placeWaiting());
  clock.at = 7_500;
  value(await service.placeWaiting());
  value(await service.placeWaiting());
  assert.deepEqual(state.checked, [['task-1']], 'checked once due, then forgotten');
});

test('the backoff of a task its transaction finds not waiting is forgotten', async () => {
  const { state, store } = scriptedStore([GONE]);
  const service = new PlacementService(store, timing().timing);
  value(await service.placeWaiting());
  value(await service.placeWaiting());
  assert.deepEqual(state.excluded, [[], []]);
  assert.equal(state.opened, 2);
});

const BLOCKED_PROJECTS = 1_200;
const PLACEABLE = `task-${BLOCKED_PROJECTS + 1}`;

// A task per project, each a second younger than the one before; only the
// last is placeable, as if each other project's quota were zero.
async function blockedProjectsStore(): Promise<ControlPlaneStore> {
  const lineage = new InMemoryTaskLineage();
  const tasks: Task[] = [];
  for (let index = 1; index <= BLOCKED_PROJECTS + 1; index++) {
    const taskId = `task-${index}` as TaskId;
    const projectId = `project-${String(index).padStart(4, '0')}` as ProjectId;
    tasks.push(Object.freeze({
      id: taskId, admissionId: `admission-${index}` as AdmissionId, ownershipGeneration: value(parseOwnershipGeneration(1)),
      attempts: [], generation: FIRST_GENERATION, changedAt: value(parseInstant(new Date(index * 1_000).toISOString())),
    }));
    value(await lineage.add({ taskId, rootTaskId: taskId, depth: 0, projectId, runId: 'run-1' as RunId }));
  }
  const placements = new InMemoryPlacementQueue(() => tasks, lineage, () => []);
  return {
    readCommitted: (work) => work({ workers: { candidates: async () => ['worker-a'] }, placements } as never),
    // Places the placeable task only; the others stay blocked.
    transaction: async (work) => {
      const asked: string[] = [];
      await work({ tasks: { get: async (taskId: string) => (asked.push(taskId), UNPLACED) } } as never);
      return (asked.includes(PLACEABLE) ? ok({}) : UNPLACED) as never;
    },
  };
}

test('a placeable task after 1200 older blocked projects is placed within a bounded number of passes', async () => {
  const clock = { at: 0 };
  const service = new PlacementService(await blockedProjectsStore(), { now: () => clock.at, draw: () => 0 });
  const bound = BLOCKED_PROJECTS / PLACEMENT_BATCH + 3;
  let passes = 0;
  let placed = 0;
  while (placed === 0 && passes < 10 * bound) {
    placed = value(await service.placeWaiting()).placed;
    passes++;
    clock.at += 5_000;
  }
  assert.equal(placed, 1);
  assert.ok(passes <= bound, `placed after ${passes} passes`);
});
