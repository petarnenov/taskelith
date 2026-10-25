import assert from 'node:assert/strict';
import test from 'node:test';
import { err, failure, ok, parseIdentifier, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import {
  DELEGATION_CAPACITY_WAIT_BOUND_MILLISECONDS,
  PLACEMENT_RETRY_ATTEMPTS,
  ResourceAdmissionService,
  decideDelegation,
  decidePlacement,
  fairPlacementOrder,
  isWaitingReason,
  parseResourceRequest,
  placementBackoff,
  type CapacityStore,
  type DelegationSnapshot,
  type PlacementRequest,
  type PlacementSnapshot,
  type ProjectId,
  type RunId,
  type TaskLineageLink,
} from '@taskelith/scheduling';
import type { TaskId } from '@taskelith/sdlc';

function value<T>(result: Result<T>): T {
  assert.ok(result.ok, result.ok ? '' : result.error.message);
  return result.value;
}

const id = <Kind extends string>(kind: Kind, text: string) => value(parseIdentifier(kind, text));
const at = (text: string): Instant => value(parseInstant(text));
const REQUEST = value(parseResourceRequest({ cpuMillicores: 1000, memoryMebibytes: 2048, hardControls: [] }));

function snapshot(overrides: Partial<PlacementSnapshot> = {}): PlacementSnapshot {
  return {
    quarantined: false,
    attempt: { reservable: true, holdsReservation: false },
    worker: {
      eligible: true, controls: ['memory-limit'], slots: 2, cpuMillicores: 3500, memoryMebibytes: 7680,
      held: { slots: 0, cpuMillicores: 0, memoryMebibytes: 0 },
    },
    request: REQUEST,
    quotas: [{ kind: 'project', limit: 4, held: 0 }, { kind: 'run', limit: 2, held: 0 }],
    credentials: [],
    charge: { alreadyCharged: false, treeAttempts: 0 },
    ...overrides,
  };
}

const reasonOf = (overrides: Partial<PlacementSnapshot>) => {
  const decision = decidePlacement(snapshot(overrides));
  return decision.fits ? 'fits' : decision.reason;
};

test('a placement that fits every budget fits', () => {
  assert.deepEqual(decidePlacement(snapshot()), { fits: true });
});

test('each failed check gives its reason, the first in contract order', () => {
  const full = { slots: 2, cpuMillicores: 0, memoryMebibytes: 0 };
  const worker = snapshot().worker!;
  const cases: [Partial<PlacementSnapshot>, string][] = [
    [{ quarantined: true, attempt: { reservable: false, holdsReservation: true } }, 'quarantined'],
    [{ attempt: { reservable: true, holdsReservation: true } }, 'attempt-already-reserved'],
    [{ attempt: { reservable: false, holdsReservation: false } }, 'attempt-not-reservable'],
    [{ request: value(parseResourceRequest({ cpuMillicores: 1, memoryMebibytes: 1, hardControls: ['spend-limit'] })) }, 'spend-limit-not-enforceable'],
    [{ request: value(parseResourceRequest({ cpuMillicores: 2001, memoryMebibytes: 1, hardControls: [] })) }, 'resource-ceiling-exceeded'],
    [{ request: value(parseResourceRequest({ cpuMillicores: 1, memoryMebibytes: 4097, hardControls: [] })) }, 'resource-ceiling-exceeded'],
    [{ worker: undefined }, 'worker-not-eligible'],
    [{ worker: { ...worker, eligible: false } }, 'worker-not-eligible'],
    [{ request: value(parseResourceRequest({ cpuMillicores: 1, memoryMebibytes: 1, hardControls: ['disk-limit'] })) }, 'control-not-enforceable'],
    [{ worker: { ...worker, held: full } }, 'worker-capacity-exhausted'],
    [{ worker: { ...worker, held: { slots: 0, cpuMillicores: 3000, memoryMebibytes: 0 } } }, 'worker-capacity-exhausted'],
    [{ worker: { ...worker, held: { slots: 0, cpuMillicores: 0, memoryMebibytes: 6000 } } }, 'worker-capacity-exhausted'],
    [{ quotas: [{ kind: 'project', limit: 4, held: 4 }] }, 'project-quota-exhausted'],
    [{ quotas: [{ kind: 'project', limit: 4, held: 3 }, { kind: 'run', limit: 2, held: 2 }] }, 'run-quota-exhausted'],
    [{ credentials: [{ limit: 4, held: 3 }, { limit: 4, held: 4 }] }, 'provider-concurrency-exhausted'],
    [{ credentials: [{ limit: 4, held: 3 }] }, 'fits'],
    [{ charge: { alreadyCharged: false, treeAttempts: 8 } }, 'delegation-budget-exhausted'],
    [{ charge: { alreadyCharged: false, treeAttempts: 1, retry: { uncertain: true, automaticRetriesUsed: 0 } } }, 'retry-budget-exhausted'],
    [{ charge: { alreadyCharged: false, treeAttempts: 1, retry: { uncertain: false, automaticRetriesUsed: 2 } } }, 'retry-budget-exhausted'],
    [{ charge: { alreadyCharged: false, treeAttempts: 1, retry: { uncertain: false, automaticRetriesUsed: 1 } } }, 'fits'],
    [{ charge: { alreadyCharged: true, treeAttempts: 8, retry: { uncertain: true, automaticRetriesUsed: 9 } } }, 'fits'],
  ];
  for (const [overrides, expected] of cases) assert.equal(reasonOf(overrides), expected, JSON.stringify(overrides));
});

test('waiting reasons leave a task queued, rejecting reasons end it', () => {
  assert.equal(isWaitingReason('project-quota-exhausted'), true);
  assert.equal(isWaitingReason('delegation-awaiting-capacity'), true);
  assert.equal(isWaitingReason('retry-budget-exhausted'), false);
});

type Chain = DelegationSnapshot['chain'];

const PROJECT = id('ProjectId', 'project-1') as ProjectId;
const RUN = id('RunId', 'run-1') as RunId;
const OTHER_RUN = id('RunId', 'run-2') as RunId;

function link(task: string, depth: number, runId: RunId = RUN, parent?: string): TaskLineageLink {
  return {
    taskId: id('TaskId', task) as TaskId,
    ...(parent === undefined ? {} : { parentTaskId: id('TaskId', parent) as TaskId }),
    rootTaskId: id('TaskId', 'root') as TaskId,
    depth,
    projectId: PROJECT,
    runId,
  };
}

// The runs the child charges, with quotas and waiting units per run.
function runs(quota: (runId: RunId) => number, waiting: (runId: RunId) => number = () => 1, childRunId: RunId = OTHER_RUN) {
  return (childRunId === RUN ? [RUN] : [childRunId, RUN]).map((runId) => ({ runId, quota: quota(runId), waitingAfter: waiting(runId) }));
}

function delegation(overrides: Partial<DelegationSnapshot> = {}): DelegationSnapshot {
  return {
    chain: [link('root', 0)],
    childRunId: OTHER_RUN,
    projectQuota: 4,
    runs: runs(() => 4),
    waitingAfter: { project: 1, slots: 1 },
    fleetSlots: 4,
    waitingSince: at('2026-10-25T09:00:00.000Z'),
    now: at('2026-10-25T09:00:00.000Z'),
    ...overrides,
  };
}

test('an admitted delegation links the child below its parent in the root project', () => {
  assert.deepEqual(decideDelegation(delegation({ chain: [link('root', 0), link('child', 1, RUN, 'root')] })), {
    outcome: 'admitted',
    link: { parentTaskId: 'child', rootTaskId: 'root', depth: 2, projectId: PROJECT, runId: OTHER_RUN },
  });
});

test('depth above three and chains larger than a quota are rejected at once', () => {
  const deep: Chain = [link('root', 0), link('a', 1, RUN, 'root'), link('b', 2, RUN, 'a'), link('c', 3, RUN, 'b')];
  assert.deepEqual(decideDelegation(delegation({ chain: deep })), { outcome: 'rejected', reason: 'delegation-depth-exceeded' });
  // Default run quota 2: a depth-2 child in the root's run never runs.
  const chain: Chain = [link('root', 0), link('a', 1, RUN, 'root')];
  const defaults = delegation({ chain, childRunId: RUN, runs: runs(() => 2, () => 1, RUN) });
  assert.deepEqual(decideDelegation(defaults), { outcome: 'rejected', reason: 'delegation-chain-exceeds-quota' });
  assert.equal(decideDelegation({ ...defaults, runs: runs(() => 4, () => 1, RUN) }).outcome, 'admitted');
  assert.deepEqual(decideDelegation(delegation({ chain, projectQuota: 2 })), { outcome: 'rejected', reason: 'delegation-chain-exceeds-quota' });
  // Another run is charged once; the root's run once per chain member.
  assert.equal(decideDelegation(delegation({ chain, runs: runs((runId) => (runId === RUN ? 3 : 2)) })).outcome, 'admitted');
  assert.equal(decideDelegation(delegation({ chain, runs: runs((runId) => (runId === RUN ? 2 : 4)) })).outcome, 'rejected');
});

test('a delegation that would leave no free unit waits up to the bound, then is rejected', () => {
  const full = [
    delegation({ waitingAfter: { project: 4, slots: 1 } }),
    delegation({ runs: runs(() => 4, (runId) => (runId === RUN ? 4 : 1)) }),
    delegation({ waitingAfter: { project: 1, slots: 4 } }),
  ];
  for (const snapshotWithoutRoom of full) {
    assert.deepEqual(decideDelegation(snapshotWithoutRoom), { outcome: 'waiting', reason: 'delegation-awaiting-capacity' });
  }
  const late = at(new Date(Date.parse('2026-10-25T09:00:00.000Z') + DELEGATION_CAPACITY_WAIT_BOUND_MILLISECONDS).toISOString());
  assert.deepEqual(decideDelegation({ ...full[0]!, now: late }), { outcome: 'rejected', reason: 'delegation-awaiting-capacity' });
});

test('waiting placements alternate between projects, oldest first in each', () => {
  const entry = (project: string, minute: number, item: string) => ({
    projectId: id('ProjectId', project) as ProjectId, waitingSince: at(`2026-10-25T09:0${minute}:00.000Z`), item,
  });
  const order = fairPlacementOrder([entry('a', 1, 'a1'), entry('a', 2, 'a2'), entry('a', 3, 'a3'), entry('b', 4, 'b1'), entry('c', 0, 'c1')]);
  assert.deepEqual(order, ['c1', 'a1', 'b1', 'a2', 'a3']);
  assert.deepEqual(fairPlacementOrder([]), []);
});

test('backoff doubles from five seconds, jitters, and never exceeds sixty', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 30].map((retry) => placementBackoff(retry, 0)), [5000, 10000, 20000, 40000, 60000, 60000]);
  assert.equal(placementBackoff(1, 0.999), 9995);
  assert.equal(placementBackoff(4, 0.5), 50000);
  for (const [retry, unit] of [[0, 0], [1.5, 0], [1, 1], [1, -0.1]]) assert.throws(() => placementBackoff(retry!, unit!), RangeError);
});

test('a transiently failing placement is retried with backoff up to the attempt limit', async () => {
  const unavailable = err(failure('unavailable', 'database down'));
  let calls = 0;
  const store: CapacityStore = { transaction: async () => { calls += 1; return unavailable; } };
  const pauses: number[] = [];
  const timing = { pause: async (milliseconds: number) => { pauses.push(milliseconds); }, draw: () => 0 };
  const service = new ResourceAdmissionService(store, timing);
  const result = await service.reserveWithRetry({} as PlacementRequest);
  assert.deepEqual(result, unavailable);
  assert.equal(calls, PLACEMENT_RETRY_ATTEMPTS);
  assert.deepEqual(pauses, [5000, 10000, 20000, 40000]);
  let attempts = 0;
  const recovering: CapacityStore = { transaction: async () => (++attempts < 3 ? unavailable : ok({ kind: 'waiting', reason: 'quarantined' }) as never) };
  assert.deepEqual(await new ResourceAdmissionService(recovering, timing).reserveWithRetry({} as PlacementRequest), {
    ok: true, value: { kind: 'waiting', reason: 'quarantined' },
  });
  const silent = { pause: async () => assert.fail('no pause expected'), draw: () => 0 };
  const rejected: CapacityStore = { transaction: async () => err(failure('conflict', 'raced')) };
  assert.equal((await new ResourceAdmissionService(rejected, silent).reserveWithRetry({} as PlacementRequest)).ok, false);
  // A commit whose outcome is unknown may have placed the attempt already.
  const unknown: CapacityStore = { transaction: async () => err(failure('unavailable', 'lost commit', { outcome: 'unknown' })) };
  assert.equal((await new ResourceAdmissionService(unknown, silent).reserveWithRetry({} as PlacementRequest)).ok, false);
});
