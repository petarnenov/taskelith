import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { inspect } from 'node:util';
import { after, beforeEach, test } from 'node:test';
import { ok, err, failure, type Result } from '@taskelith/kernel';
import { endAttempt, recordNotStarted, type AssignmentId, type ExecutionId, type HarnessPluginId, type RecoveryEpoch, type Task, type WorkerId } from '@taskelith/execution';
import { PostgresDatabase, PostgresSlotCredentials, type PostgresTransaction } from '@taskelith/postgres';
import {
  ROOT_LINK,
  ResourceAdmissionService,
  SlotSecret,
  checkDeliveredSlot,
  checkSlotDeliveryOwnership,
  nextDeliveryRecord,
  parseAccountSlot,
  parseResourceRequest,
  parseSlotCredentialVersion,
  releaseInTransaction,
  removeAccountSlot,
  revokeAccountSlot,
  rotateSlotCredential,
  sweepSlotCredentials,
  type AccountSlot,
  type CapacityStore,
  type PlacementOutcome,
  type PlacementRequest,
  type ProviderCredentialId,
  type SlotCredentialVersion,
  type SlotDeliveryRecord,
  type SlotDeliveryRequest,
  type SlotRequest,
  type SubscriptionMechanismId,
  type TaskLineageLink,
} from '@taskelith/scheduling';
import { AesGcmSlotCredentialCipher } from '@taskelith/secrets';
import { id, value } from '@taskelith/testing';
import { authorizedUnder, placedTask, seedWorker, usedAdmission } from './capacity-fixtures.ts';
import { gatedFirstCall, gatedStore, rendezvous, type GatedRead, type GatedTransactions } from './gated-transactions.ts';
import { createMigratedDatabase, query, truncateAll } from './test-database.ts';

const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
after(() => database.close());

const NO_WAIT = { pause: async () => {}, draw: () => 0 };
const PROJECT = ROOT_LINK.projectId;
const HARNESS = id('HarnessPluginId', 'harness-1') as HarnessPluginId;
const SLOT = id('ProviderCredentialId', 'slot-1') as ProviderCredentialId;
const WORKER = id('WorkerId', 'worker-1') as WorkerId;
const REQUESTED = value(parseResourceRequest({ cpuMillicores: 1000, memoryMebibytes: 2048, hardControls: [] }));
const NEW_SESSION: SlotRequest = { projectId: PROJECT, kind: 'new-session', harnessId: HARNESS, whenNoSlot: 'wait' };
const CORRELATION = id('CorrelationId', 'correlation-revoke');

beforeEach(async () => {
  await truncateAll(url);
  await query(url, 'INSERT INTO installation (quarantined, recovery_epoch) VALUES (false, 1)');
  await seedWorker(url, {
    workerId: WORKER, enrolled: true, revoked: false, draining: false, reachable: true, slots: 4, cpuMillicores: 8000,
    memoryMebibytes: 16384, controls: [], protocolVersion: 1, admitted: true,
  });
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

async function addSlot(overrides: Partial<AccountSlot> = {}): Promise<void> {
  const slot = value(parseAccountSlot({
    id: SLOT, harnessId: HARNESS, mechanismId: id('SubscriptionMechanismId', 'mechanism-1') as SubscriptionMechanismId,
    credentialVersion: value(parseSlotCredentialVersion(1)), allowedProjects: [PROJECT], concurrencyLimit: 2,
    state: 'active', health: 'healthy', revision: 1, ...overrides,
  }));
  value(await database.transaction((tx) => tx.accountSlots.add(slot)));
}

function placement(task: Task, index: number): PlacementRequest {
  return {
    assignmentId: id('AssignmentId', `assignment-${index}`) as AssignmentId, reservationId: id('ReservationId', `reservation-${index}`),
    commandId: id('EventId', `offer-${index}`), correlationId: id('CorrelationId', `correlation-${index}`),
    taskId: task.id, attemptId: task.attempts.at(-1)!.id, ownershipGeneration: task.ownershipGeneration,
    workerId: WORKER, requested: REQUESTED, slotRequest: NEW_SESSION,
  };
}

const reserve = (store: CapacityStore, task: Task, index: number) => new ResourceAdmissionService(store, NO_WAIT).reserve(placement(task, index));
// A bounded digest of the assignment, as the composition derives it.
const commandIdFor = (assignmentId: AssignmentId) => id('EventId', `slot-revoked.${createHash('sha256').update(assignmentId).digest('hex')}`);
const revoke = (store: GatedTransactions) => revokeAccountSlot({ store, commandIdFor }, { id: SLOT, correlationId: CORRELATION });

function kind(result: Result<PlacementOutcome>): string {
  const outcome = value(result);
  return outcome.kind === 'placed' ? 'placed' : `${outcome.kind}:${outcome.reason}`;
}

async function slotState(): Promise<{ state: string; revision: number }> {
  const [row] = await query<{ state: string; revision: number }>(url, 'SELECT state, revision FROM account_slots WHERE slot_id = $1', [SLOT]);
  return row!;
}

async function heldOnSlot(): Promise<number> {
  return value(await database.transaction(async (tx) => ok(await tx.ledger.heldForCredential(SLOT))));
}

async function commandTypes(): Promise<string[]> {
  const rows = await query<{ event_type: string }>(url, 'SELECT event_type FROM outbox');
  return rows.map((row) => row.event_type).sort();
}

const READ_SLOT = (arrive: () => Promise<void>): GatedRead => ({ member: 'accountSlots', method: 'get', arrive });
const READ_HELD = (arrive: () => Promise<void>): GatedRead => ({ member: 'ledger', method: 'heldForCredential', arrive });

test('a revocation racing a placement on its slot commits only in a serial order and leaves no held reservation', async () => {
  await addSlot();
  const task = await rootTask('task-1');
  // Both first attempts read the active slot before either writes it.
  const arrive = rendezvous(2);
  const revoking = gatedStore(database, READ_SLOT(arrive));
  const placing = gatedStore(database, READ_HELD(arrive));
  const [revoked, placed] = await Promise.all([revoke(revoking.store), reserve(placing.store, task, 0)]);
  assert.equal(value(revoked).state, 'revoked');
  assert.equal(await heldOnSlot(), 0);
  if (kind(placed) === 'placed') {
    assert.ok(revoking.attempts() >= 2, 'the revocation after the placement was not retried');
    assert.deepEqual(await slotState(), { state: 'revoked', revision: 3 });
    assert.deepEqual(await commandTypes(), ['execution.assignment.end', 'execution.assignment.offer']);
  } else {
    assert.equal(kind(placed), 'waiting:provider-concurrency-exhausted');
    assert.ok(placing.attempts() >= 2, 'the placement after the revocation was not retried');
    assert.deepEqual(await slotState(), { state: 'revoked', revision: 2 });
    assert.deepEqual(await commandTypes(), []);
  }
});

// A placed attempt with an authorized execution and an earlier delivery.
async function launchedOnSlot(): Promise<{ task: Task; assignmentId: AssignmentId; executionId: ExecutionId }> {
  await addSlot();
  const task = await rootTask('task-1');
  assert.equal(kind(await reserve(database, task, 0)), 'placed');
  const assignmentId = id('AssignmentId', 'assignment-0') as AssignmentId;
  const authorized = authorizedUnder(task, assignmentId, WORKER);
  const executionId = authorized.attempts.at(-1)!.executions[0]!.id;
  value(await database.transaction(async (tx) => {
    const replaced = await tx.tasks.replace(authorized, task.generation);
    if (!replaced.ok) return replaced;
    await tx.slotCredentialDeliveries.record(nextDeliveryRecord(undefined, {
      taskId: task.id, executionId, slotId: SLOT, attemptId: task.attempts.at(-1)!.id, workerId: WORKER,
      credentialVersion: value(parseSlotCredentialVersion(1)),
    }, await tx.now()));
    return ok(undefined);
  }));
  return { task: authorized, assignmentId, executionId };
}

// The checks and the record of a re-delivery (account pool section 7.3),
// as the control plane's delivery transaction makes them.
async function redeliver(tx: PostgresTransaction, request: SlotDeliveryRequest): Promise<Result<SlotDeliveryRecord>> {
  const assignment = (await tx.assignments.listByAttempt(request.attemptId)).find((candidate) => candidate.state !== 'ended');
  const task = assignment === undefined ? undefined : value(await tx.tasks.get(assignment.reservation.scope.taskId));
  const earlierDelivery = task && await tx.slotCredentialDeliveries.find(task.id, request.executionId, request.slotId);
  const now = await tx.now();
  const refused = checkSlotDeliveryOwnership(request, {
    installation: { quarantined: false, recoveryEpoch: 1 as RecoveryEpoch }, workerAuthorized: true, now,
    ...(assignment === undefined ? {} : { assignment }), ...(task === undefined ? {} : { task }),
    ...(earlierDelivery === undefined ? {} : { earlierDelivery }),
  });
  if (refused !== undefined) return err(failure('precondition-failed', refused.message, { reason: refused.reason }));
  const slot = value(await tx.accountSlots.get(request.slotId));
  const withdrawn = checkDeliveredSlot(slot, true);
  if (withdrawn !== undefined) return err(failure('precondition-failed', withdrawn.message, { reason: withdrawn.reason }));
  const { executionId, slotId, attemptId, workerId } = request;
  const record = nextDeliveryRecord(earlierDelivery, { taskId: task!.id, executionId, slotId, attemptId, workerId, credentialVersion: slot.credentialVersion }, now);
  await tx.slotCredentialDeliveries.record(record);
  return ok(record);
}

test('a revocation racing a re-delivery commits only in a serial order', async () => {
  const { task, executionId } = await launchedOnSlot();
  const request: SlotDeliveryRequest = {
    workerId: WORKER, recoveryEpoch: 1 as RecoveryEpoch, attemptId: task.attempts.at(-1)!.id, ownershipGeneration: task.ownershipGeneration,
    executionId, slotId: SLOT,
  };
  const arrive = rendezvous(2);
  const revoking = gatedStore(database, READ_SLOT(arrive));
  const delivering = gatedStore(database, READ_SLOT(arrive));
  const [revoked, delivered] = await Promise.all([revoke(revoking.store), delivering.store.transaction((tx) => redeliver(tx, request))]);
  assert.equal(value(revoked).state, 'revoked');
  const [record] = await query<{ deliveries: number }>(url, 'SELECT deliveries FROM slot_credential_deliveries');
  if (delivered.ok) {
    // No cycle: the delivery writes nothing the revocation reads, so both
    // commit with the delivery first, and the revocation cancels its attempt.
    assert.equal(record!.deliveries, 2);
  } else {
    assert.ok(['attempt-not-launchable', 'revoked'].includes(String(delivered.error.details.reason)));
    assert.ok(delivering.attempts() >= 2, 'the refused re-delivery was not retried');
    assert.equal(record!.deliveries, 1);
  }
  const attempt = value(await database.transaction((tx) => tx.tasks.get(task.id))).attempts.at(-1)!;
  assert.ok(attempt.cancellation !== undefined, 'the revocation did not cancel the attempt');
  assert.equal(attempt.executions[0]!.grants.at(-1)!.state, 'revoked');
  const after = await database.transaction((tx) => redeliver(tx, request));
  assert.equal(!after.ok && after.error.details.reason, 'attempt-not-launchable');
});

test('a revocation of a slot with a launched attempt revokes its grant, sends its cancellation, and keeps the reservation', async () => {
  const { task } = await launchedOnSlot();
  const [before] = await query<{ state: string }>(url, 'SELECT state FROM assignments');
  value(await revoke(database));
  assert.equal(await heldOnSlot(), 1, 'the reservation waits for the terminal fact');
  assert.deepEqual(await commandTypes(), ['execution.assignment.offer', 'execution.cancellation.request']);
  const attempt = value(await database.transaction((tx) => tx.tasks.get(task.id))).attempts.at(-1)!;
  assert.equal(attempt.executions[0]!.grants.at(-1)!.state, 'revoked');
  const [assignment] = await query<{ state: string; reservation_state: string }>(url, 'SELECT state, reservation_state FROM assignments');
  assert.equal(assignment!.reservation_state, 'held');
  assert.equal(assignment!.state, before!.state, 'the assignment ends with the terminal fact, not the revocation');
});

const credentials = () => new PostgresSlotCredentials((work) => database.transaction(work), value(AesGcmSlotCredentialCipher.of(randomBytes(32))));
const sentinel = () => value(SlotSecret.of(`sentinel-${randomBytes(16).toString('hex')}`));

async function storedVersions(slotId: string): Promise<number[]> {
  const rows = await query<{ version: number }>(url, 'SELECT version FROM slot_credentials WHERE slot_id = $1 ORDER BY version', [slotId]);
  return rows.map((row) => row.version);
}

test('the sweep discards only versions older than its grace age by the database clock', async () => {
  await addSlot({ state: 'revoked', credentialVersion: value(parseSlotCredentialVersion(2)) });
  const store = credentials();
  for (let index = 0; index < 3; index++) await store.store(SLOT, sentinel());
  const orphan = id('ProviderCredentialId', 'slot-orphan') as ProviderCredentialId;
  await store.store(orphan, sentinel());
  await store.store(orphan, sentinel());
  await query(url, "UPDATE slot_credentials SET stored_at = now() - interval '61 minutes' WHERE NOT (slot_id = 'slot-orphan' AND version = 2)");
  await query(url, "UPDATE slot_credentials SET stored_at = now() - interval '59 minutes' WHERE slot_id = 'slot-orphan' AND version = 2");
  assert.deepEqual(value(await sweepSlotCredentials({ store: database, credentials: store })), { sweptSlots: [SLOT, orphan], failedSlots: [] });
  assert.deepEqual(await storedVersions(SLOT), [2, 3]);
  assert.deepEqual(await storedVersions(orphan), [2], 'the orphan version within the grace age stays');
});

test('a rotation on PostgreSQL switches the slot, discards the replaced version, and fails without the credential', async () => {
  await addSlot({ state: 'revoked' });
  const store = credentials();
  await store.store(SLOT, sentinel());
  const next = sentinel();
  const switched = value(await rotateSlotCredential({ store: database, credentials: store }, { id: SLOT, secret: next }));
  assert.deepEqual([switched.credentialVersion, switched.revision], [2, 2]);
  assert.deepEqual(await slotState(), { state: 'revoked', revision: 3 });
  assert.deepEqual(await storedVersions(SLOT), [2]);
  value(await database.transaction((tx) => tx.accountSlots.replace({ ...switched, state: 'active', revision: 4 }, 3)));
  const refused = await rotateSlotCredential({ store: database, credentials: store }, { id: SLOT, secret: next });
  assert.equal(!refused.ok && refused.error.code, 'conflict');
  assert.ok(!JSON.stringify(refused).includes(next.reveal()) && !inspect(refused).includes(next.reveal()));
});

async function revealed(store: PostgresSlotCredentials, version: number): Promise<string> {
  return value(await store.reveal(SLOT, value(parseSlotCredentialVersion(version)))).reveal();
}

async function slotVersion(): Promise<number> {
  const [row] = await query<{ credential_version: number }>(url, 'SELECT credential_version FROM account_slots WHERE slot_id = $1', [SLOT]);
  return row!.credential_version;
}

test('of two rotations that read the same revision the first switch wins and the record names a kept version', async () => {
  await addSlot({ state: 'revoked' });
  const store = credentials();
  await store.store(SLOT, sentinel());
  // Both switches read the slot and its held count before either writes.
  const arrive = rendezvous(2);
  const racers = [gatedFirstCall(database, READ_HELD(arrive)), gatedFirstCall(database, READ_HELD(arrive))];
  const secrets = [sentinel(), sentinel()];
  const results = await Promise.all(racers.map((racer, index) => rotateSlotCredential({ store: racer.store, credentials: store }, { id: SLOT, secret: secrets[index]! })));
  const winner = results.findIndex((result) => result.ok);
  const loser = 1 - winner;
  assert.notEqual(winner, -1);
  assert.equal(!results[loser]!.ok && results[loser]!.error.code, 'conflict');
  assert.ok(racers[loser]!.retried(), 'the losing switch was not retried');
  const won = value(results[winner]!).credentialVersion;
  assert.equal(await slotVersion(), won);
  assert.equal(await revealed(store, won), secrets[winner]!.reveal());
  const orphan = 5 - won;
  assert.deepEqual(await storedVersions(SLOT), orphan > won ? [won, orphan] : [won], 'only a higher orphan is kept');
  assert.deepEqual(await slotState(), { state: 'revoked', revision: 3 });
});

// Runs a command once before the first cleanup of a rotation.
class CleanupInterleaving extends PostgresSlotCredentials {
  beforeCleanup: (() => Promise<unknown>) | undefined;
  override async discardOlderThan(slotId: ProviderCredentialId, kept: SlotCredentialVersion): Promise<void> {
    const command = this.beforeCleanup;
    this.beforeCleanup = undefined;
    await command?.();
    return super.discardOlderThan(slotId, kept);
  }
}

test('a rotation that switches before an earlier rotation\'s cleanup keeps its version deliverable on PostgreSQL', async () => {
  await addSlot({ state: 'revoked' });
  const store = new CleanupInterleaving((work) => database.transaction(work), value(AesGcmSlotCredentialCipher.of(randomBytes(32))));
  await store.store(SLOT, sentinel());
  const later = sentinel();
  let laterResult: Result<AccountSlot> | undefined;
  store.beforeCleanup = async () => { laterResult = await rotateSlotCredential({ store: database, credentials: store }, { id: SLOT, secret: later }); };
  const earlier = value(await rotateSlotCredential({ store: database, credentials: store }, { id: SLOT, secret: sentinel() }));
  assert.deepEqual([earlier.credentialVersion, value(laterResult!).credentialVersion], [2, 3]);
  assert.deepEqual(await storedVersions(SLOT), [3]);
  assert.deepEqual([await slotVersion(), (await slotState()).revision], [3, 4]);
  assert.equal(await revealed(store, 3), later.reveal());
});

test('a removal of a reserved active slot destroys the credential, cancels nothing, and keeps the reservation until the terminal fact', async () => {
  const { task, assignmentId, executionId } = await launchedOnSlot();
  const store = credentials();
  await store.store(SLOT, sentinel());
  const removed = value(await removeAccountSlot({ store: database, credentials: store }, SLOT));
  assert.equal(removed.state, 'removed');
  assert.deepEqual(await storedVersions(SLOT), []);
  assert.deepEqual(await commandTypes(), ['execution.assignment.offer'], 'the removal writes no command of its own');
  assert.equal(await heldOnSlot(), 1);
  const attempt = value(await database.transaction((tx) => tx.tasks.get(task.id))).attempts.at(-1)!;
  assert.equal(attempt.cancellation, undefined, 'the attempt is left to be drained');
  const request: SlotDeliveryRequest = {
    workerId: WORKER, recoveryEpoch: 1 as RecoveryEpoch, attemptId: attempt.id, ownershipGeneration: task.ownershipGeneration, executionId, slotId: SLOT,
  };
  const refused = await database.transaction((tx) => redeliver(tx, request));
  assert.equal(!refused.ok && refused.error.details.reason, 'removed');
  // The drain: the terminal fact, the attempt's end, and the release commit
  // in one transaction (item 21).
  const released = value(await database.transaction(async (tx) => {
    const stored = value(await tx.tasks.get(task.id));
    const at = await tx.now();
    const sealed = value(recordNotStarted(stored, { workerId: WORKER, executionId }, at)).task;
    value(await tx.tasks.replace(sealed, stored.generation));
    const drained = endAttempt(sealed, attempt.id, at);
    if (!drained.ok) return drained;
    const replaced = await tx.tasks.replace(drained.value, sealed.generation);
    if (!replaced.ok) return replaced;
    return releaseInTransaction(tx, { assignmentId, commandId: id('EventId', 'release-0'), correlationId: id('CorrelationId', 'correlation-release') });
  }));
  assert.equal(released.outcome, 'released');
  assert.equal(await heldOnSlot(), 0);
  assert.deepEqual(await commandTypes(), ['execution.assignment.end', 'execution.assignment.offer']);
});
