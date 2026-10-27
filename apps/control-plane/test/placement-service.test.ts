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
const PLACED = ok({ kind: 'placed' });
const ENDED = ok({ kind: 'ended' });

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
  const { state, store } = scriptedStore([UNPLACED, UNPLACED, PLACED]);
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

test('a task whose attempt a rejecting reason ended is not placed and keeps no backoff', async () => {
  const { state, store } = scriptedStore([ENDED, UNPLACED]);
  const service = new PlacementService(store, timing().timing);
  assert.deepEqual(value(await service.placeWaiting()), { waiting: 1, placed: 0 });
  value(await service.placeWaiting());
  assert.deepEqual([state.opened, state.excluded], [2, [[], []]], 'read again at once');
});

test('a retry that backs off is not read until its due time, and keeps no failure count', async () => {
  const { clock, timing: controlled } = timing();
  const { state, store } = scriptedStore([ok({ kind: 'backing-off', dueAt: 30_000 }), UNPLACED]);
  const service = new PlacementService(store, controlled);
  assert.deepEqual(value(await service.placeWaiting()), { waiting: 1, placed: 0 });
  clock.at = 29_999;
  assert.deepEqual(value(await service.placeWaiting()), { waiting: 0, placed: 0 });
  clock.at = 30_000;
  value(await service.placeWaiting());
  clock.at = 37_499;
  value(await service.placeWaiting());
  assert.deepEqual([state.opened, state.excluded.at(-1)], [2, ['task-1']], 'its first failure delays it 7.5 s');
});

test('without a candidate no transaction is opened and the tasks do not back off', async () => {
  const { state, store } = scriptedStore([PLACED]);
  state.candidates = [];
  const service = new PlacementService(store, timing().timing);
  assert.deepEqual(value(await service.placeWaiting()), { waiting: 1, placed: 0 });
  assert.equal(state.opened, 0);
  state.candidates = ['worker-a'];
  assert.deepEqual(value(await service.placeWaiting()), { waiting: 1, placed: 1 });
  assert.deepEqual(state.excluded, [[], []]);
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
      return (asked.includes(PLACEABLE) ? PLACED : UNPLACED) as never;
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

type Backlog = readonly (readonly [taskId: string, projectId: string, seconds: number])[];

// The nth read frees `slots[n]`, cycling, and a task without a free slot
// gets `full`; a task in `scripted` gets its result there once instead.
interface Fleet { slots: readonly number[]; candidates: string[]; full: Result<unknown>; scripted: Record<string, Result<unknown>> }

const FULL = err(failure('precondition-failed', 'every candidate is full', { reason: 'worker-capacity-exhausted' }));
const QUOTA_USED = err(failure('precondition-failed', 'the project quota is used', { reason: 'project-quota-exhausted' }));
const NONE_IN_TRANSACTION = err(failure('precondition-failed', 'no candidate accepted it', { reason: 'no-candidate' }));
const oneSlot = (): Fleet => ({ slots: [1], candidates: ['worker-a'], full: FULL, scripted: {} });

// Tasks waiting since their seconds; a placed task no longer waits, and the
// placed ones are appended to `placed` in the order they were placed.
async function fleetStore(backlog: Backlog, placed: string[], fleet: Fleet): Promise<ControlPlaneStore> {
  const lineage = new InMemoryTaskLineage();
  let waiting: Task[] = [];
  for (const [taskId, projectId, seconds] of backlog) {
    waiting.push(Object.freeze({
      id: taskId as TaskId, admissionId: `admission-${taskId}` as AdmissionId, ownershipGeneration: value(parseOwnershipGeneration(1)),
      attempts: [], generation: FIRST_GENERATION, changedAt: value(parseInstant(new Date(seconds * 1_000).toISOString())),
    }));
    value(await lineage.add({ taskId: taskId as TaskId, rootTaskId: taskId as TaskId, depth: 0, projectId: projectId as ProjectId, runId: 'run-1' as RunId }));
  }
  const placements = new InMemoryPlacementQueue(() => waiting, lineage, () => []);
  let reads = 0;
  let freeSlots = 0;
  return {
    readCommitted: (work) => {
      freeSlots = fleet.slots[reads++ % fleet.slots.length]!;
      return work({ workers: { candidates: async () => fleet.candidates }, placements } as never);
    },
    transaction: async (work) => {
      const asked: string[] = [];
      await work({ tasks: { get: async (taskId: string) => (asked.push(taskId), UNPLACED) } } as never);
      const scripted = asked.find((taskId) => taskId in fleet.scripted);
      if (scripted !== undefined) {
        const result = fleet.scripted[scripted]!;
        delete fleet.scripted[scripted];
        return result as never;
      }
      if (freeSlots === 0) return fleet.full as never;
      freeSlots--;
      placed.push(...asked);
      waiting = waiting.filter((task) => !asked.includes(task.id));
      return PLACED as never;
    },
  };
}

// Runs a pass, checks its result, and moves the clock a minute, past every
// task and pass backoff.
async function runPass(service: PlacementService, clock: { at: number }, check: (pass: Result<unknown>) => unknown): Promise<void> {
  check(await service.placeWaiting());
  clock.at += 60_000;
}

async function runPasses(service: PlacementService, clock: { at: number }, passes: number): Promise<void> {
  for (let pass = 0; pass < passes; pass++) await runPass(service, clock, value);
}

function serviceOf(store: ControlPlaneStore) {
  const clock = { at: 0 };
  return { clock, service: new PlacementService(store, { now: () => clock.at, draw: () => 0 }) };
}

const A_BACKLOG: Backlog = [['task-a1', 'p-a', 0], ['task-a2', 'p-a', 1], ['task-a3', 'p-a', 2]];
const B_BACKLOG: Backlog = [['task-b1', 'p-b', 5], ['task-b2', 'p-b', 6], ['task-b3', 'p-b', 7]];
const ALTERNATING = ['task-a1', 'task-b1', 'task-a2', 'task-b2', 'task-a3', 'task-b3'];

test('with one free slot, the next project is offered before the older backlog of the last one', async () => {
  const placed: string[] = [];
  const { clock, service } = serviceOf(await fleetStore([...A_BACKLOG, ['task-b1', 'p-b', 5]], placed, oneSlot()));
  await runPasses(service, clock, 4);
  assert.deepEqual(placed, ['task-a1', 'task-b1', 'task-a2', 'task-a3']);
});

test('with one free slot, two backlogs alternate across six passes', async () => {
  const placed: string[] = [];
  const { clock, service } = serviceOf(await fleetStore([...A_BACKLOG, ...B_BACKLOG], placed, oneSlot()));
  await runPasses(service, clock, 6);
  assert.deepEqual(placed, ALTERNATING);
});

test('a pass that finds the fleet full keeps the rotation cursor', async () => {
  const placed: string[] = [];
  const fleet: Fleet = { ...oneSlot(), slots: [1, 0] };
  const { clock, service } = serviceOf(await fleetStore([...A_BACKLOG, ...B_BACKLOG], placed, fleet));
  await runPasses(service, clock, 12);
  assert.deepEqual(placed, ALTERNATING);
});

test('a transaction that finds no candidate keeps the rotation cursor', async () => {
  const placed: string[] = [];
  const fleet: Fleet = { ...oneSlot(), slots: [1, 0], full: NONE_IN_TRANSACTION };
  const { clock, service } = serviceOf(await fleetStore([...A_BACKLOG, ...B_BACKLOG], placed, fleet));
  await runPasses(service, clock, 12);
  assert.deepEqual(placed, ALTERNATING);
});

const ONE_TASK_EACH: Backlog = [
  ['task-a1', 'p-a', 0], ['task-b1', 'p-b', 1], ['task-c1', 'p-c', 2], ['task-d1', 'p-d', 3], ['task-e1', 'p-e', 4],
];

// One task in each of 120 projects, more than one placement batch.
const BEYOND_ONE_BATCH: Backlog = Array.from({ length: 120 }, (_, index) => {
  const number = String(index).padStart(3, '0');
  return [`task-${number}`, `p-${number}`, index] as const;
});

test('a fleet that stays full keeps the cursor until capacity returns', async () => {
  const placed: string[] = [];
  const fleet = oneSlot();
  const { clock, service } = serviceOf(await fleetStore(BEYOND_ONE_BATCH, placed, fleet));
  await runPasses(service, clock, 1);
  fleet.slots = [0];
  for (let pass = 0; pass < 3; pass++) {
    await runPass(service, clock, (result) => assert.deepEqual(value(result), { waiting: 100, placed: 0 }));
  }
  fleet.slots = [1];
  await runPasses(service, clock, 1);
  assert.deepEqual(placed, ['task-000', 'task-001']);
});

// task-b1 finds the fleet full and the free slot appears after it.
test('a slot freed during a pass after a fleet capacity decline waits for the declined project', async () => {
  const placed: string[] = [];
  const fleet = oneSlot();
  const { clock, service } = serviceOf(await fleetStore(ONE_TASK_EACH, placed, fleet));
  await runPasses(service, clock, 1);
  fleet.scripted = { 'task-b1': FULL };
  await runPass(service, clock, (pass) => assert.deepEqual(value(pass), { waiting: 4, placed: 0 }));
  await runPasses(service, clock, 4);
  assert.deepEqual(placed, ['task-a1', 'task-b1', 'task-c1', 'task-d1', 'task-e1']);
});

test('a decline for a reason of its own does not end the pass', async () => {
  const placed: string[] = [];
  const fleet: Fleet = { ...oneSlot(), scripted: { 'task-a1': QUOTA_USED } };
  const { clock, service } = serviceOf(await fleetStore(ONE_TASK_EACH.slice(0, 2), placed, fleet));
  await runPass(service, clock, (pass) => assert.deepEqual(value(pass), { waiting: 2, placed: 1 }));
  assert.deepEqual(placed, ['task-b1']);
});

test('a full fleet costs one placement transaction per pass', async () => {
  const { state, store } = scriptedStore([FULL, FULL, FULL]);
  state.waiting = ['task-1', 'task-2', 'task-3'];
  assert.deepEqual(value(await new PlacementService(store, timing().timing).placeWaiting()), { waiting: 3, placed: 0 });
  assert.equal(state.opened, 1);
});

// Fifty tasks of `p-big`, then one of `p-small`, waiting in id order.
const BIG_AND_SMALL: Backlog = [
  ...Array.from({ length: 50 }, (_, index) => [`task-big-${String(index + 1).padStart(2, '0')}`, 'p-big', index] as const),
  ['task-small', 'p-small', 50],
];

test('a freed slot follows the rotation after a fleet capacity decline, not a backoff', async () => {
  const placed: string[] = [];
  const clock = { at: 0 };
  // A long jitter, were the fleet capacity decline to back off.
  const draws = [0.9];
  const timed = { now: () => clock.at, draw: () => draws.shift() ?? 0 };
  const service = new PlacementService(await fleetStore(BIG_AND_SMALL, placed, oneSlot()), timed);
  for (let pass = 0; pass < 3; pass++, clock.at += 5_000) value(await service.placeWaiting());
  assert.deepEqual(placed, ['task-big-01', 'task-small', 'task-big-02']);
});

test('a decline for a reason of its own backs the task off, a fleet capacity decline does not', async () => {
  const placed: string[] = [];
  const fleet: Fleet = { ...oneSlot(), slots: [0, 1] };
  fleet.scripted = { 'task-a1': QUOTA_USED };
  const { clock, service } = serviceOf(await fleetStore([['task-a1', 'p-a', 0], ['task-b1', 'p-b', 1]], placed, fleet));
  value(await service.placeWaiting());
  clock.at += 1_000;
  value(await service.placeWaiting());
  assert.deepEqual(placed, ['task-b1'], 'task-a1 waits, task-b1 does not');
});

test('a fleet capacity decline keeps the failure count of an own-reason backoff', async () => {
  const { clock, timing: controlled } = timing();
  const { state, store } = scriptedStore([UNPLACED, FULL, UNPLACED, PLACED]);
  const service = new PlacementService(store, controlled);
  value(await service.placeWaiting());
  clock.at = 7_500;
  value(await service.placeWaiting());
  value(await service.placeWaiting());
  assert.equal(state.opened, 3, 'the fleet decline set no new wait');
  clock.at = 22_499;
  value(await service.placeWaiting());
  assert.equal(state.opened, 3, 'the second own wait doubles to 15 s');
  clock.at = 22_500;
  assert.deepEqual(value(await service.placeWaiting()), { waiting: 1, placed: 1 });
});

test('after several placements in a pass, the next read starts after the last one', async () => {
  const placed: string[] = [];
  const backlog: Backlog = [...A_BACKLOG, ['task-a4', 'p-a', 3], ['task-b1', 'p-b', 5], ['task-b2', 'p-b', 6], ['task-c1', 'p-c', 7]];
  const { clock, service } = serviceOf(await fleetStore(backlog, placed, { ...oneSlot(), slots: [2] }));
  await runPasses(service, clock, 4);
  assert.deepEqual(placed, ['task-a1', 'task-b1', 'task-c1', 'task-a2', 'task-b2', 'task-a3', 'task-a4']);
});

test('a pass without a candidate worker keeps the rotation cursor', async () => {
  const placed: string[] = [];
  const fleet = oneSlot();
  const backlog: Backlog = [['task-a1', 'p-a', 0], ['task-a2', 'p-a', 1], ['task-b1', 'p-b', 5]];
  const { clock, service } = serviceOf(await fleetStore(backlog, placed, fleet));
  await runPasses(service, clock, 1);
  fleet.candidates = [];
  await runPasses(service, clock, 1);
  fleet.candidates = ['worker-a'];
  await runPasses(service, clock, 2);
  assert.deepEqual(placed, ['task-a1', 'task-b1', 'task-a2']);
});

test('after an outage stops a pass, the next read starts after its last placement', async () => {
  const placed: string[] = [];
  const backlog: Backlog = [
    ['task-a1', 'p-a', 0], ['task-b1', 'p-b', 1], ['task-c1', 'p-c', 2], ['task-d1', 'p-d', 3], ['task-b2', 'p-b', 4],
    ['task-a2', 'p-a', 5],
  ];
  const fleet: Fleet = { ...oneSlot(), slots: [4, 1], scripted: { 'task-b1': DOWN } };
  const { clock, service } = serviceOf(await fleetStore(backlog, placed, fleet));
  await runPass(service, clock, failed);
  assert.deepEqual(placed, ['task-a1']);
  fleet.slots = [1];
  await runPasses(service, clock, 5);
  assert.deepEqual(placed, ['task-a1', 'task-b1', 'task-c1', 'task-d1', 'task-a2', 'task-b2']);
});

test('an outage at the first offer of a pass keeps the rotation cursor', async () => {
  const placed: string[] = [];
  const fleet = oneSlot();
  const backlog: Backlog = [['task-a1', 'p-a', 0], ['task-a2', 'p-a', 1], ['task-b1', 'p-b', 2], ['task-c1', 'p-c', 3]];
  const { clock, service } = serviceOf(await fleetStore(backlog, placed, fleet));
  await runPasses(service, clock, 1);
  fleet.scripted = { 'task-b1': DOWN };
  await runPass(service, clock, failed);
  await runPasses(service, clock, 3);
  assert.deepEqual(placed, ['task-a1', 'task-b1', 'task-c1', 'task-a2']);
});
