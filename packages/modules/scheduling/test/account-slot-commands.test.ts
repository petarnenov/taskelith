import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { inspect } from 'node:util';
import {
  InMemoryTaskRepository,
  claimOwnership,
  openAttempt,
  openTask,
  type AssignmentId,
  type AttemptId,
  type HarnessPluginId,
  type LaunchRecords,
  type Task,
  type WorkerId,
} from '@taskelith/execution';
import { MAX_IDENTIFIER_LENGTH, instantFromEpochMilliseconds, ok, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import {
  FIRST_SLOT_REVISION,
  InMemoryAccountSlots,
  InMemoryAssignmentRepository,
  InMemoryCapacityLedger,
  InMemoryInstallationGuard,
  InMemoryPlacementWorkers,
  InMemoryQuotaSettings,
  InMemorySlotCredentials,
  InMemoryTaskLineage,
  ROOT_LINK,
  SLOT_CREDENTIAL_SWEEP_MINIMUM_GRACE_MILLISECONDS,
  SlotSecret,
  parseAccountSlot,
  parseResourceRequest,
  parseSlotCredentialVersion,
  placeInTransaction,
  reinstateAccountSlot,
  removeAccountSlot,
  revokeAccountSlot,
  rotateSlotCredential,
  sweepSlotCredentials,
  updateAccountSlot,
  type AccountSlot,
  type CapacityStore,
  type InvalidationTransaction,
  type ProjectId,
  type ProviderCredentialId,
  type ReservationId,
  type SlotCredentialVersion,
  type SlotRevocationPorts,
  type SlotRevocationStore,
  type SubscriptionMechanismId,
} from '@taskelith/scheduling';
import {
  FIRST_OWNERSHIP_GENERATION,
  InMemoryAdmissionRepository,
  InMemoryOutbox,
  admitPlanningTask,
  beginWorkflowProgress,
  parseWorkflowDefinition,
  parseWorkflowRunBinding,
  useAdmission,
  type TaskAdmission,
} from '@taskelith/sdlc';
import { failed, id, value } from '@taskelith/testing';

const AT = value(parseInstant('2026-10-29T10:00:00.000Z'));
const PROJECT = ROOT_LINK.projectId as ProjectId;
const OTHER_PROJECT = id('ProjectId', 'project-2') as ProjectId;
const HARNESS = id('HarnessPluginId', 'harness-1') as HarnessPluginId;
const SLOT = id('ProviderCredentialId', 'slot-1') as ProviderCredentialId;
const UNKNOWN = id('ProviderCredentialId', 'slot-unknown') as ProviderCredentialId;
const ATTEMPT = id('AttemptId', 'attempt-1') as AttemptId;
const ASSIGNMENT = id('AssignmentId', 'assignment-1') as AssignmentId;
const CORRELATION = id('CorrelationId', 'correlation-revoke');
// Fixture values, never real credentials.
const OLD_TEXT = 'fixture-old-slot-token';
const NEW_TEXT = 'fixture-new-slot-token';

const version = (number: number): SlotCredentialVersion => value(parseSlotCredentialVersion(number));
const secret = (text: string): SlotSecret => value(SlotSecret.of(text));

function admission(): TaskAdmission {
  const definition = value(parseWorkflowDefinition({
    id: 'slot-workflow', version: '1',
    stages: [
      { id: 'specs', obligations: ['intake', 'specification'], origin: 'native', dependsOn: [] },
      { id: 'apply', obligations: ['implementation', 'review', 'verification', 'closure'], origin: 'native', dependsOn: ['specs'] },
    ],
  }));
  const binding = value(parseWorkflowRunBinding({
    pluginId: 'plugin', pluginVersion: '1.0.0', upstreamToolVersion: '1.0.0', workflowId: 'slot-workflow', workflowVersion: '1',
    workflowDigest: `sha256:${'ee'.repeat(32)}`, configurationRevision: 'config-1', policyRevision: 'policy-1',
  }));
  const admitted = value(admitPlanningTask({ id: 'admission-1', taskId: ROOT_LINK.taskId, stageId: 'specs' }, {
    binding, progress: beginWorkflowProgress(definition, AT),
  }, [], AT));
  return value(useAdmission(admitted, admitted.generation, AT, FIRST_OWNERSHIP_GENERATION));
}

function placedTask(used: TaskAdmission): Task {
  const opened = value(openTask(used, AT));
  const attempt = value(openAttempt(opened, opened.ownershipGeneration, { id: ATTEMPT }, AT));
  return value(claimOwnership(attempt, attempt.ownershipGeneration, ATTEMPT, AT));
}

// No grant is ever recorded here; PostgreSQL tests cover launched attempts.
const NO_GRANTS = { liveGrants: async () => ok([]) } as unknown as LaunchRecords;

interface Fixture {
  readonly tx: InvalidationTransaction;
  readonly store: CapacityStore & SlotRevocationStore;
  readonly slots: InMemoryAccountSlots;
  readonly outbox: InMemoryOutbox;
  readonly task: Task;
}

async function fixture(): Promise<Fixture> {
  const tasks = new InMemoryTaskRepository();
  const lineage = new InMemoryTaskLineage();
  const admissions = new InMemoryAdmissionRepository();
  const assignments = new InMemoryAssignmentRepository();
  const used = admission();
  const task = placedTask(used);
  value(await tasks.add(task));
  value(await lineage.add(ROOT_LINK));
  value(await admissions.add(used));
  const slots = new InMemoryAccountSlots();
  const outbox = new InMemoryOutbox();
  const worker = {
    workerId: id('WorkerId', 'worker-1') as WorkerId, enrolled: true, revoked: false, draining: false, reachable: true,
    slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, controls: [], protocolVersion: 1, admitted: true,
  };
  const tx: InvalidationTransaction = {
    assignments, admissions, tasks, lineage, outbox, accountSlots: slots, launches: NO_GRANTS,
    workers: new InMemoryPlacementWorkers([worker], () => assignments.all()),
    installation: new InMemoryInstallationGuard(false), quotas: new InMemoryQuotaSettings(),
    ledger: new InMemoryCapacityLedger(() => assignments.all(), lineage),
    now: async () => AT,
  };
  const store = { transaction: <Value>(work: (transaction: InvalidationTransaction) => Promise<Result<Value>>) => work(tx) };
  return { tx, store, slots, outbox, task };
}

function slotRecord(overrides: Partial<AccountSlot> = {}): AccountSlot {
  return value(parseAccountSlot({
    id: SLOT, harnessId: HARNESS, mechanismId: id('SubscriptionMechanismId', 'mechanism-1') as SubscriptionMechanismId,
    credentialVersion: version(1), allowedProjects: [PROJECT], concurrencyLimit: 4, state: 'active', health: 'healthy',
    revision: FIRST_SLOT_REVISION, ...overrides,
  }));
}

async function withSlot(overrides: Partial<AccountSlot> = {}): Promise<Fixture> {
  const made = await fixture();
  value(await made.slots.add(slotRecord(overrides)));
  return made;
}

// A bounded digest of the assignment, as the composition derives it.
function revocationEventId(assignmentId: AssignmentId): string {
  return `slot-revoked.${createHash('sha256').update(assignmentId).digest('hex')}`;
}

function revocation(store: SlotRevocationStore): SlotRevocationPorts {
  return { store, commandIdFor: (assignmentId) => id('EventId', revocationEventId(assignmentId)) };
}

async function stored(slots: InMemoryAccountSlots): Promise<AccountSlot> {
  return value(await slots.get(SLOT));
}

// A placement of the fixture's attempt that holds the slot.
async function holdSlot({ tx, task }: Fixture, assignmentId = ASSIGNMENT): Promise<void> {
  const placed = value(await placeInTransaction(tx, {
    assignmentId, reservationId: id('ReservationId', 'reservation-1') as ReservationId,
    commandId: id('EventId', 'offer-1'), correlationId: id('CorrelationId', 'correlation-1'), taskId: task.id, attemptId: ATTEMPT,
    ownershipGeneration: task.ownershipGeneration, workerId: id('WorkerId', 'worker-1') as WorkerId,
    requested: value(parseResourceRequest({ cpuMillicores: 1000, memoryMebibytes: 2048, hardControls: [] })),
    slotRequest: { projectId: PROJECT, kind: 'new-session', harnessId: HARNESS, whenNoSlot: 'wait' },
  }));
  assert.equal(placed.kind, 'placed');
}

test('an update changes the allowed projects and the concurrency limit by one revision', async () => {
  const { store, slots } = await withSlot();
  const updated = value(await updateAccountSlot(store, { id: SLOT, allowedProjects: [PROJECT, OTHER_PROJECT], concurrencyLimit: 2 }));
  assert.deepEqual([updated.allowedProjects, updated.concurrencyLimit, updated.revision], [[PROJECT, OTHER_PROJECT], 2, 2]);
  assert.deepEqual(await stored(slots), updated);
  const limitOnly = value(await updateAccountSlot(store, { id: SLOT, concurrencyLimit: 3 }));
  assert.deepEqual([limitOnly.allowedProjects, limitOnly.concurrencyLimit, limitOnly.revision], [[PROJECT, OTHER_PROJECT], 3, 3]);
});

test('an update to the stored settings changes nothing and answers the current revision', async () => {
  const { store, slots } = await withSlot();
  const repeated = value(await updateAccountSlot(store, { id: SLOT, allowedProjects: [PROJECT], concurrencyLimit: 4 }));
  assert.equal(repeated.revision, 1);
  assert.equal((await stored(slots)).revision, 1);
});

test('an update naming the stored projects in another order changes nothing', async () => {
  const { store, slots } = await withSlot({ allowedProjects: [PROJECT, OTHER_PROJECT] });
  const repeated = value(await updateAccountSlot(store, { id: SLOT, allowedProjects: [OTHER_PROJECT, PROJECT] }));
  assert.deepEqual([repeated.allowedProjects, repeated.revision], [[PROJECT, OTHER_PROJECT], 1]);
  assert.equal((await stored(slots)).revision, 1);
});

test('an update is invalid without a change or with a bad value, a conflict on a revoked slot, and not found on a removed or unknown one', async () => {
  const { store } = await withSlot();
  assert.equal(failed(await updateAccountSlot(store, { id: SLOT })).code, 'invalid');
  assert.equal(failed(await updateAccountSlot(store, { id: SLOT, concurrencyLimit: 0 })).code, 'invalid');
  assert.equal(failed(await updateAccountSlot(store, { id: SLOT, allowedProjects: [] })).code, 'invalid');
  assert.equal(failed(await updateAccountSlot(store, { id: UNKNOWN, concurrencyLimit: 2 })).code, 'not-found');
  assert.equal(failed(await updateAccountSlot((await withSlot({ state: 'revoked' })).store, { id: SLOT, concurrencyLimit: 2 })).code, 'conflict');
  assert.equal(failed(await updateAccountSlot((await withSlot({ state: 'removed' })).store, { id: SLOT, concurrencyLimit: 2 })).code, 'not-found');
});

test('a revocation takes the slot out of its pools, and a repeat changes nothing', async () => {
  const { store, slots } = await withSlot();
  const revoked = value(await revokeAccountSlot(revocation(store), { id: SLOT, correlationId: CORRELATION }));
  assert.deepEqual([revoked.state, revoked.revision], ['revoked', 2]);
  assert.deepEqual(await slots.pool(PROJECT, HARNESS), []);
  const repeated = value(await revokeAccountSlot(revocation(store), { id: SLOT, correlationId: CORRELATION }));
  assert.deepEqual(repeated, revoked);
  assert.equal(failed(await revokeAccountSlot(revocation(store), { id: UNKNOWN, correlationId: CORRELATION })).code, 'not-found');
  const removed = await withSlot({ state: 'removed' });
  assert.equal(failed(await revokeAccountSlot(revocation(removed.store), { id: SLOT, correlationId: CORRELATION })).code, 'not-found');
});


for (const [name, assignmentId] of [
  ['', ASSIGNMENT],
  [' of the longest identifier', id('AssignmentId', 'a'.repeat(MAX_IDENTIFIER_LENGTH)) as AssignmentId],
] as const) {
  test(`a revocation releases the reservation of an attempt without a launch and ends its assignment${name}`, async () => {
    const made = await withSlot();
    await holdSlot(made, assignmentId);
    assert.equal(await made.tx.ledger.heldForCredential(SLOT), 1);
    value(await revokeAccountSlot(revocation(made.store), { id: SLOT, correlationId: CORRELATION }));
    assert.equal(await made.tx.ledger.heldForCredential(SLOT), 0);
    const assignment = value(await made.tx.assignments.get(assignmentId));
    assert.deepEqual([assignment.state, assignment.end?.reason, assignment.reservation.state], ['ended', 'cancelled', 'released']);
    const ends = made.outbox.messages.filter((message) => message.metadata.eventType === 'execution.assignment.end');
    assert.deepEqual(ends.map((message) => message.metadata.eventId), [revocationEventId(assignmentId)]);
  });
}

test('a reinstatement returns the slot with its health and cooldown, and a repeat changes nothing', async () => {
  const cooldown = { until: value(parseInstant('2026-10-29T12:00:00.000Z')), source: 'default' as const };
  const { store, slots } = await withSlot({ state: 'revoked', health: 'unhealthy', cooldown });
  const reinstated = value(await reinstateAccountSlot(store, SLOT));
  assert.deepEqual([reinstated.state, reinstated.health, reinstated.cooldown, reinstated.revision], ['active', 'unhealthy', cooldown, 2]);
  assert.deepEqual(value(await reinstateAccountSlot(store, SLOT)), reinstated);
  assert.equal((await stored(slots)).revision, 2);
  assert.equal(failed(await reinstateAccountSlot(store, UNKNOWN)).code, 'not-found');
  assert.equal(failed(await reinstateAccountSlot((await withSlot({ state: 'removed' })).store, SLOT)).code, 'not-found');
});

test('a removal keeps a tombstone, destroys the credential, and a repeat is not found', async () => {
  const { store, slots } = await withSlot();
  const credentials = new InMemorySlotCredentials();
  await credentials.store(SLOT, secret(OLD_TEXT));
  const removed = value(await removeAccountSlot({ store, credentials }, SLOT));
  assert.deepEqual([removed.state, removed.revision], ['removed', 2]);
  assert.deepEqual(credentials.storedVersions(SLOT), []);
  assert.deepEqual(await stored(slots), removed);
  assert.equal(failed(await removeAccountSlot({ store, credentials }, SLOT)).code, 'not-found');
});

class RejectingCredentials extends InMemorySlotCredentials {
  rejectDestroy = false;
  rejectDiscard = false;
  override async destroy(slotId: ProviderCredentialId): Promise<void> {
    if (this.rejectDestroy) throw new Error('store unreachable');
    return super.destroy(slotId);
  }
  override async discardOlderThan(slotId: ProviderCredentialId, kept: SlotCredentialVersion): Promise<void> {
    if (this.rejectDiscard) throw new Error('store unreachable');
    return super.discardOlderThan(slotId, kept);
  }
}

test('a removal whose destroy fails still succeeds, and the sweep destroys the credential', async () => {
  const clock = { now: AT };
  const { store } = await withSlot();
  const credentials = new RejectingCredentials(() => clock.now);
  await credentials.store(SLOT, secret(OLD_TEXT));
  credentials.rejectDestroy = true;
  assert.equal(value(await removeAccountSlot({ store, credentials }, SLOT)).state, 'removed');
  assert.deepEqual(credentials.storedVersions(SLOT), [1]);
  credentials.rejectDestroy = false;
  const sweepStore = storeAt(store, minutesAfter(AT, 61));
  assert.equal(value(await sweepSlotCredentials({ store: sweepStore, credentials })), 1);
  assert.deepEqual(credentials.storedVersions(SLOT), []);
});

test('a rotation of a revoked slot switches it to the new version, healthy, and discards the older ones', async () => {
  const { store, slots } = await withSlot({ state: 'revoked', health: 'unhealthy' });
  const credentials = new InMemorySlotCredentials();
  await credentials.store(SLOT, secret(OLD_TEXT));
  const switched = value(await rotateSlotCredential({ store, credentials }, { id: SLOT, secret: secret(NEW_TEXT) }));
  assert.deepEqual([switched.credentialVersion, switched.health, switched.state, switched.revision], [2, 'healthy', 'revoked', 2]);
  assert.equal((await stored(slots)).revision, 3, 'the cleanup advance is a later revision');
  assert.deepEqual(credentials.storedVersions(SLOT), [2]);
  assert.equal(value(await credentials.reveal(SLOT, version(2))).reveal(), NEW_TEXT);
});

test('a rotation is refused while the slot is active or held, and not found for a removed or unknown slot', async () => {
  const active = await withSlot();
  const credentials = new InMemorySlotCredentials();
  assert.equal(failed(await rotateSlotCredential({ store: active.store, credentials }, { id: SLOT, secret: secret(NEW_TEXT) })).code, 'conflict');
  assert.deepEqual(credentials.storedVersions(SLOT), [], 'an active slot stores nothing');
  const held = await withSlot();
  await holdSlot(held);
  await held.slots.replace({ ...(await stored(held.slots)), state: 'revoked', revision: 3 }, 2);
  const refused = await rotateSlotCredential({ store: held.store, credentials }, { id: SLOT, secret: secret(NEW_TEXT) });
  assert.equal(failed(refused).code, 'conflict');
  assert.equal((await stored(held.slots)).credentialVersion, 1, 'the slot keeps its version');
  assert.deepEqual(credentials.storedVersions(SLOT), [1], 'the new version is an orphan for the sweep');
  assert.ok(!JSON.stringify(refused).includes(NEW_TEXT) && !inspect(refused).includes(NEW_TEXT));
  const removed = await withSlot({ state: 'removed' });
  assert.equal(failed(await rotateSlotCredential({ store: removed.store, credentials }, { id: SLOT, secret: secret(NEW_TEXT) })).code, 'not-found');
  assert.equal(failed(await rotateSlotCredential({ store: removed.store, credentials }, { id: UNKNOWN, secret: secret(NEW_TEXT) })).code, 'not-found');
});

type Interleaved = () => Promise<unknown>;

// Runs a command once at a point of a rotation: before or after its store,
// or before its cleanup.
class InterleavingCredentials extends InMemorySlotCredentials {
  beforeStore: Interleaved | undefined;
  between: Interleaved | undefined;
  beforeCleanup: Interleaved | undefined;
  override async store(slotId: ProviderCredentialId, stored: SlotSecret): Promise<SlotCredentialVersion> {
    await this.#once('beforeStore');
    const assigned = await super.store(slotId, stored);
    await this.#once('between');
    return assigned;
  }
  override async discardOlderThan(slotId: ProviderCredentialId, kept: SlotCredentialVersion): Promise<void> {
    await this.#once('beforeCleanup');
    return super.discardOlderThan(slotId, kept);
  }
  async #once(point: 'beforeStore' | 'between' | 'beforeCleanup'): Promise<void> {
    const command = this[point];
    this[point] = undefined;
    await command?.();
  }
}

for (const [name, between] of [
  ['a reinstatement', (made: Fixture) => reinstateAccountSlot(made.store, SLOT)],
  ['a removal', (made: Fixture) => made.store.transaction(async () => made.slots.replace(slotRecord({ state: 'removed', revision: 2 }), 1))],
] as const) {
  test(`${name} between a rotation's store and its switch makes the switch a conflict and keeps the version`, async () => {
    const made = await withSlot({ state: 'revoked' });
    const credentials = new InterleavingCredentials();
    await credentials.store(SLOT, secret(OLD_TEXT));
    credentials.between = () => between(made);
    assert.equal(failed(await rotateSlotCredential({ store: made.store, credentials }, { id: SLOT, secret: secret(NEW_TEXT) })).code, 'conflict');
    assert.equal((await stored(made.slots)).credentialVersion, 1);
    assert.deepEqual(credentials.storedVersions(SLOT), [1, 2]);
  });
}

const rotate = (made: Fixture, credentials: InMemorySlotCredentials, text: string) =>
  rotateSlotCredential({ store: made.store, credentials }, { id: SLOT, secret: secret(text) });

async function revealedText(credentials: InMemorySlotCredentials, slots: InMemoryAccountSlots): Promise<string> {
  return value(await credentials.reveal(SLOT, (await stored(slots)).credentialVersion)).reveal();
}

test('another rotation between a rotation\'s store and its switch wins, and the record names a kept version', async () => {
  const made = await withSlot({ state: 'revoked' });
  const credentials = new InterleavingCredentials();
  await credentials.store(SLOT, secret(OLD_TEXT));
  let inner: Result<AccountSlot> | undefined;
  credentials.between = async () => { inner = await rotate(made, credentials, 'fixture-inner-token'); };
  assert.equal(failed(await rotate(made, credentials, NEW_TEXT)).code, 'conflict');
  assert.equal(value(inner!).credentialVersion, 3);
  assert.deepEqual(credentials.storedVersions(SLOT), [3], 'the outer version went with the inner cleanup');
  assert.equal(await revealedText(credentials, made.slots), 'fixture-inner-token');
});

test('a rotation that switches before an earlier rotation\'s cleanup keeps its version deliverable', async () => {
  const made = await withSlot({ state: 'revoked' });
  const credentials = new InterleavingCredentials();
  await credentials.store(SLOT, secret(OLD_TEXT));
  let later: Result<AccountSlot> | undefined;
  credentials.beforeCleanup = async () => { later = await rotate(made, credentials, 'fixture-later-token'); };
  const earlier = value(await rotate(made, credentials, NEW_TEXT));
  assert.deepEqual([earlier.credentialVersion, value(later!).credentialVersion], [2, 3]);
  assert.deepEqual(credentials.storedVersions(SLOT), [3]);
  assert.deepEqual([(await stored(made.slots)).credentialVersion, (await stored(made.slots)).revision], [3, 4]);
  assert.equal(await revealedText(credentials, made.slots), 'fixture-later-token');
});

test('an orphan above the current version stays until the next successful rotation, which stores after it', async () => {
  const made = await withSlot({ state: 'revoked' });
  const credentials = new InterleavingCredentials();
  await credentials.store(SLOT, secret(OLD_TEXT));
  credentials.beforeStore = () => rotate(made, credentials, 'fixture-winner-token');
  assert.equal(failed(await rotate(made, credentials, 'fixture-orphan-token')).code, 'conflict');
  assert.equal((await stored(made.slots)).credentialVersion, 2);
  assert.deepEqual(credentials.storedVersions(SLOT), [2, 3], 'the higher orphan is kept');
  assert.equal(value(await rotate(made, credentials, NEW_TEXT)).credentialVersion, 4);
  assert.deepEqual(credentials.storedVersions(SLOT), [4]);
  assert.equal(await revealedText(credentials, made.slots), NEW_TEXT);
});

test('a rotation whose cleanup fails still answers the switch, and the sweep discards the replaced version', async () => {
  const { store, slots } = await withSlot({ state: 'revoked' });
  const credentials = new RejectingCredentials(() => AT);
  await credentials.store(SLOT, secret(OLD_TEXT));
  credentials.rejectDiscard = true;
  const switched = value(await rotateSlotCredential({ store, credentials }, { id: SLOT, secret: secret(NEW_TEXT) }));
  assert.deepEqual([switched.credentialVersion, switched.revision], [2, 2]);
  assert.equal((await stored(slots)).revision, 2, 'no advance without the discard');
  assert.deepEqual(credentials.storedVersions(SLOT), [1, 2]);
  credentials.rejectDiscard = false;
  value(await sweepSlotCredentials({ store: storeAt(store, minutesAfter(AT, 61)), credentials }));
  assert.deepEqual(credentials.storedVersions(SLOT), [2]);
});

function minutesAfter(start: Instant, minutes: number): Instant {
  return value(instantFromEpochMilliseconds(Date.parse(start) + minutes * 60_000));
}

// The same transaction with another database clock.
function storeAt(store: CapacityStore, now: Instant): CapacityStore {
  return { transaction: (work) => store.transaction((tx) => work({ ...tx, now: async () => now })) };
}

test('the sweep keeps versions younger than its grace age and refuses a grace age under an hour', async () => {
  const clock = { now: AT };
  const { store } = await fixture();
  const credentials = new InMemorySlotCredentials(() => clock.now);
  const orphan = id('ProviderCredentialId', 'slot-orphan') as ProviderCredentialId;
  await credentials.store(orphan, secret(OLD_TEXT));
  clock.now = minutesAfter(AT, 30);
  await credentials.store(orphan, secret(NEW_TEXT));
  assert.equal(value(await sweepSlotCredentials({ store: storeAt(store, minutesAfter(AT, 59)), credentials })), 0);
  assert.deepEqual(credentials.storedVersions(orphan), [1, 2]);
  assert.equal(value(await sweepSlotCredentials({ store: storeAt(store, minutesAfter(AT, 61)), credentials })), 1);
  assert.deepEqual(credentials.storedVersions(orphan), [2], 'the version within the grace age stays');
  const short = await sweepSlotCredentials({ store, credentials }, SLOT_CREDENTIAL_SWEEP_MINIMUM_GRACE_MILLISECONDS - 1);
  assert.equal(failed(short).code, 'invalid');
  assert.equal(SLOT_CREDENTIAL_SWEEP_MINIMUM_GRACE_MILLISECONDS, 3_600_000);
});

test('the sweep discards versions below the named one and keeps the named and higher versions', async () => {
  const { store } = await withSlot({ state: 'revoked', credentialVersion: version(2) });
  const credentials = new InMemorySlotCredentials(() => AT);
  for (const text of ['fixture-v1', 'fixture-v2', 'fixture-v3']) await credentials.store(SLOT, secret(text));
  assert.equal(value(await sweepSlotCredentials({ store: storeAt(store, minutesAfter(AT, 120)), credentials })), 1);
  assert.deepEqual(credentials.storedVersions(SLOT), [2, 3]);
});
