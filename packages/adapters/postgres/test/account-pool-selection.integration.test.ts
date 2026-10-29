import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { parseInstant, type Instant, type Result } from '@taskelith/kernel';
import type { AssignmentId, HarnessPluginId, Task, WorkerId } from '@taskelith/execution';
import { PostgresDatabase } from '@taskelith/postgres';
import {
  ROOT_LINK,
  ResourceAdmissionService,
  applySlotLimitInTransaction,
  parseAccountSlot,
  parseDefaultCooldownMinutes,
  parseResourceRequest,
  parseSlotCredentialVersion,
  type AccountSlot,
  type CapacityStore,
  type HarnessLimitSignal,
  type PlacementOutcome,
  type PlacementRequest,
  type SlotRequest,
  type SubscriptionMechanismId,
  type TaskLineageLink,
} from '@taskelith/scheduling';
import { id, value } from '@taskelith/testing';
import { placedTask, seedWorker, usedAdmission } from './capacity-fixtures.ts';
import { gatedStore, rendezvous, type GatedRead } from './gated-transactions.ts';
import { createMigratedDatabase, query, truncateAll } from './test-database.ts';

const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
after(() => database.close());

const NO_WAIT = { pause: async () => {}, draw: () => 0 };
const PROJECT = ROOT_LINK.projectId;
const LIMITED = id('HarnessPluginId', 'harness-1') as HarnessPluginId;
const OTHER = id('HarnessPluginId', 'harness-2') as HarnessPluginId;
const WORKERS = ['worker-1', 'worker-2', 'worker-3'].map((name) => id('WorkerId', name) as WorkerId);
const REQUESTED = value(parseResourceRequest({ cpuMillicores: 1000, memoryMebibytes: 2048, hardControls: [] }));
const DEFAULT_COOLDOWN = value(parseDefaultCooldownMinutes(60));
const LIMIT: HarnessLimitSignal = { kind: 'account-signal', signal: 'limit' };

beforeEach(async () => {
  await truncateAll(url);
  await query(url, 'INSERT INTO installation (quarantined, recovery_epoch) VALUES (false, 1)');
  for (const workerId of WORKERS) {
    await seedWorker(url, {
      workerId, enrolled: true, revoked: false, draining: false, reachable: true, slots: 2, cpuMillicores: 3500,
      memoryMebibytes: 7680, controls: [], protocolVersion: 1, admitted: true,
    });
  }
  await query(url, "INSERT INTO capacity_quotas (scope, scope_id, quota) VALUES ('project', $1, 10), ('run', $2, 10)", [PROJECT, ROOT_LINK.runId]);
});

async function rootTask(name: string): Promise<Task> {
  const stored = placedTask(name, `${name}-attempt`);
  const link: TaskLineageLink = { ...ROOT_LINK, taskId: stored.id, rootTaskId: stored.id };
  value(await database.transaction(async (tx) => {
    const admitted = await tx.admissions.add(usedAdmission(stored.id));
    if (!admitted.ok) return admitted;
    const added = await tx.tasks.add(stored);
    return added.ok ? tx.lineage.add(link) : added;
  }));
  return stored;
}

async function addSlot(name: string, overrides: Partial<AccountSlot> = {}): Promise<AccountSlot> {
  const slot = value(parseAccountSlot({
    id: id('ProviderCredentialId', name), harnessId: LIMITED, mechanismId: id('SubscriptionMechanismId', 'mechanism-1') as SubscriptionMechanismId,
    credentialVersion: value(parseSlotCredentialVersion(1)), allowedProjects: [PROJECT], concurrencyLimit: 1,
    state: 'active', health: 'healthy', revision: 1, ...overrides,
  }));
  value(await database.transaction((tx) => tx.accountSlots.add(slot)));
  return slot;
}

function placement(task: Task, index: number, slotRequest: SlotRequest): PlacementRequest {
  return {
    assignmentId: id('AssignmentId', `assignment-${index}`) as AssignmentId, reservationId: id('ReservationId', `reservation-${index}`),
    commandId: id('EventId', `offer-${index}`), correlationId: id('CorrelationId', `correlation-${index}`),
    taskId: task.id, attemptId: task.attempts.at(-1)!.id, ownershipGeneration: task.ownershipGeneration,
    workerId: WORKERS[index % WORKERS.length]!, requested: REQUESTED, slotRequest,
  };
}

const reserve = (store: CapacityStore, task: Task, index: number, slotRequest: SlotRequest) =>
  new ResourceAdmissionService(store, NO_WAIT).reserve(placement(task, index, slotRequest));

function kind(result: Result<PlacementOutcome>): string {
  const outcome = value(result);
  return outcome.kind === 'placed' ? `placed:${outcome.assignment.reservation.providerCredentials.join(',')}` : `${outcome.kind}:${outcome.reason}`;
}

interface StoredSlot {
  readonly revision: number;
  readonly cooldown_until: Date | null;
  readonly cooldown_source: string | null;
  readonly reserved: boolean;
}

async function storedSlot(name: string): Promise<StoredSlot> {
  const [row] = await query<StoredSlot>(url, `SELECT revision, cooldown_until, cooldown_source, last_reserved_at IS NOT NULL AS reserved
    FROM account_slots WHERE slot_id = $1`, [name]);
  return row!;
}

const newSession = (harnessId = LIMITED): SlotRequest => ({ projectId: PROJECT, kind: 'new-session', harnessId, whenNoSlot: 'wait' });
const READ_HELD = (arrive: () => Promise<void>): GatedRead => ({ member: 'ledger', method: 'heldForCredential', arrive });
const READ_SLOT = (arrive: () => Promise<void>): GatedRead => ({ member: 'accountSlots', method: 'get', arrive });

test('a resumed session and a new one racing for the last unit of its slot reserve it once', async () => {
  await addSlot('slot-1');
  const tasks = [await rootTask('task-1'), await rootTask('task-2')];
  const resumed: SlotRequest = { projectId: PROJECT, kind: 'resumed-session', pinned: { harnessId: LIMITED, slotId: id('ProviderCredentialId', 'slot-1') } };
  // Both first attempts read the free unit before either reserves it.
  const arrive = rendezvous(2);
  const racers = [gatedStore(database, READ_HELD(arrive)), gatedStore(database, READ_HELD(arrive))];
  const results = await Promise.all([reserve(racers[0]!.store, tasks[0]!, 0, resumed), reserve(racers[1]!.store, tasks[1]!, 1, newSession())]);
  assert.deepEqual(results.map(kind).sort(), ['placed:slot-1', 'waiting:provider-concurrency-exhausted']);
  const waiting = results.findIndex((result) => kind(result).startsWith('waiting'));
  assert.ok(racers[waiting]!.attempts() >= 2, 'the waiting placement was not retried');
  assert.deepEqual(await storedSlot('slot-1'), { revision: 2, cooldown_until: null, cooldown_source: null, reserved: true });
});

test('two sessions after a limit racing for another harness\'s last unit never take the limited harness\'s other slot', async () => {
  const cooling = { cooldown: { until: value(instantIn(120)), source: 'reported-reset' as const } };
  await addSlot('slot-1', cooling);
  await addSlot('slot-2', { concurrencyLimit: 4 });
  await addSlot('slot-3', { harnessId: OTHER });
  const tasks = [await rootTask('task-1'), await rootTask('task-2')];
  const afterLimit: SlotRequest = {
    projectId: PROJECT, kind: 'after-limit', limited: { harnessId: LIMITED, slotId: id('ProviderCredentialId', 'slot-1') }, alternatives: [OTHER],
  };
  const arrive = rendezvous(2);
  const racers = [gatedStore(database, READ_HELD(arrive)), gatedStore(database, READ_HELD(arrive))];
  const results = await Promise.all(tasks.map((task, index) => reserve(racers[index]!.store, task, index, afterLimit)));
  assert.deepEqual(results.map(kind).sort(), ['placed:slot-3', 'waiting:provider-concurrency-exhausted']);
  const waiting = results.findIndex((result) => kind(result).startsWith('waiting'));
  assert.ok(racers[waiting]!.attempts() >= 2, 'the waiting placement was not retried');
  assert.deepEqual([(await storedSlot('slot-1')).revision, await storedSlot('slot-2')], [1, {
    revision: 1, cooldown_until: null, cooldown_source: null, reserved: false,
  }]);
});

test('a limit racing a placement that selects its slot commits only in a serial order', async () => {
  await addSlot('slot-1', { concurrencyLimit: 2 });
  const [limitedTask, next] = [await rootTask('task-1'), await rootTask('task-2')];
  assert.equal(kind(await reserve(database, limitedTask, 0, newSession())), 'placed:slot-1');
  const arrive = rendezvous(2);
  const signal = gatedStore(database, READ_SLOT(arrive));
  const placing = gatedStore(database, READ_HELD(arrive));
  const limitInput = { assignmentId: id('AssignmentId', 'assignment-0') as AssignmentId, signal: LIMIT, defaultCooldown: DEFAULT_COOLDOWN };
  const [cooled, placed] = await Promise.all([
    signal.store.transaction((tx) => applySlotLimitInTransaction(tx, limitInput)),
    reserve(placing.store, next, 1, newSession()),
  ]);
  assert.equal(value(cooled).cooldown?.source, 'default');
  const stored = await storedSlot('slot-1');
  assert.equal(stored.cooldown_source, 'default');
  if (kind(placed) === 'placed:slot-1') {
    assert.ok(signal.attempts() >= 2, 'the limit after the placement was not retried');
    assert.equal(stored.revision, 4);
  } else {
    assert.equal(kind(placed), 'waiting:provider-concurrency-exhausted');
    assert.ok(placing.attempts() >= 2, 'the placement after the limit was not retried');
    assert.equal(stored.revision, 3);
  }
});

test('two limits racing on one slot keep the later reported reset', async () => {
  await addSlot('slot-1', { concurrencyLimit: 2 });
  const tasks = [await rootTask('task-1'), await rootTask('task-2')];
  for (const [index, task] of tasks.entries()) assert.equal(kind(await reserve(database, task, index, newSession())), 'placed:slot-1');
  const resets = [value(instantIn(120)), value(instantIn(180))];
  const arrive = rendezvous(2);
  const racers = [gatedStore(database, READ_SLOT(arrive)), gatedStore(database, READ_SLOT(arrive))];
  const applied = await Promise.all(racers.map((racer, index) => racer.store.transaction((tx) => applySlotLimitInTransaction(tx, {
    assignmentId: id('AssignmentId', `assignment-${index}`) as AssignmentId,
    signal: { ...LIMIT, resetsAt: resets[index]! }, defaultCooldown: DEFAULT_COOLDOWN,
  }))));
  assert.ok(applied.every((result) => result.ok));
  const stored = await storedSlot('slot-1');
  assert.deepEqual([stored.cooldown_until?.toISOString(), stored.cooldown_source], [resets[1], 'reported-reset']);
  // The later reset written second makes revision 5; written first, the
  // earlier one's retry keeps it and writes nothing, so revision 4.
  const second = stored.revision === 5 ? 1 : 0;
  assert.equal(stored.revision, second === 1 ? 5 : 4);
  assert.ok(racers[second]!.attempts() >= 2, 'the limit that committed second was not retried');
});

// Minutes from the host clock, far enough ahead of the database clock.
function instantIn(minutes: number): Result<Instant> {
  return parseInstant(new Date(Date.now() + minutes * 60_000).toISOString());
}
