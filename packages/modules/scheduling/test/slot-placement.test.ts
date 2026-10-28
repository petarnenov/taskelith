import assert from 'node:assert/strict';
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
  type Task,
  type WorkerId,
} from '@taskelith/execution';
import { err, failure, parseInstant, type Result } from '@taskelith/kernel';
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
  SlotSecret,
  StaticAdmittedDeliveries,
  addAccountSlot,
  createAssignment,
  parseAccountSlot,
  parseResourceRequest,
  parseSlotCredentialVersion,
  placeInTransaction,
  type AccountSlot,
  type AddAccountSlotInput,
  type CapacityStore,
  type CapacityTransaction,
  type PlacementOutcome,
  type PlacementRequest,
  type ProjectId,
  type ReservationId,
  type SlotRequest,
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
import { id, value } from '@taskelith/testing';

const AT = value(parseInstant('2026-10-29T10:00:00.000Z'));
const PROJECT = ROOT_LINK.projectId as ProjectId;
const HARNESS = id('HarnessPluginId', 'harness-1') as HarnessPluginId;
const MECHANISM = id('SubscriptionMechanismId', 'mechanism-1') as SubscriptionMechanismId;
const ATTEMPT = id('AttemptId', 'attempt-1') as AttemptId;
const NEW_SESSION: SlotRequest = { projectId: PROJECT, kind: 'new-session', harnessId: HARNESS, whenNoSlot: 'wait' };

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
  const run = { binding, progress: beginWorkflowProgress(definition, AT) };
  const admitted = value(admitPlanningTask({ id: 'admission-1', taskId: ROOT_LINK.taskId, stageId: 'specs' }, run, [], AT));
  return value(useAdmission(admitted, admitted.generation, AT, FIRST_OWNERSHIP_GENERATION));
}

function placedTask(used: TaskAdmission): Task {
  const opened = value(openTask(used, AT));
  const attempt = value(openAttempt(opened, opened.ownershipGeneration, { id: ATTEMPT }, AT));
  return value(claimOwnership(attempt, attempt.ownershipGeneration, ATTEMPT, AT));
}

interface Fixture {
  readonly tx: CapacityTransaction;
  readonly task: Task;
  readonly slots: InMemoryAccountSlots;
  readonly assignments: InMemoryAssignmentRepository;
  readonly outbox: InMemoryOutbox;
}

// One worker per entry, with that many free slots.
async function fixture(workerSlots: readonly number[]): Promise<Fixture> {
  const tasks = new InMemoryTaskRepository();
  const lineage = new InMemoryTaskLineage();
  const admissions = new InMemoryAdmissionRepository();
  const assignments = new InMemoryAssignmentRepository();
  const used = admission();
  const task = placedTask(used);
  value(await tasks.add(task));
  value(await lineage.add(ROOT_LINK));
  value(await admissions.add(used));
  const workers = workerSlots.map((slots, index) => ({
    workerId: id('WorkerId', `worker-${index + 1}`) as WorkerId, enrolled: true, revoked: false, draining: false, reachable: true,
    slots, cpuMillicores: 4000, memoryMebibytes: 8192, controls: [], protocolVersion: 1, admitted: true,
  }));
  const slots = new InMemoryAccountSlots();
  const quotas = new InMemoryQuotaSettings();
  const outbox = new InMemoryOutbox();
  return {
    task, slots, assignments, outbox,
    tx: {
      assignments, admissions, tasks, lineage, outbox, accountSlots: slots,
      workers: new InMemoryPlacementWorkers(workers, () => assignments.all()),
      installation: new InMemoryInstallationGuard(false), quotas,
      ledger: new InMemoryCapacityLedger(() => assignments.all(), lineage),
      now: async () => AT,
    },
  };
}

function slotRecord(name: string, overrides: Partial<AccountSlot> = {}): AccountSlot {
  return value(parseAccountSlot({
    id: id('ProviderCredentialId', name), harnessId: HARNESS, mechanismId: MECHANISM, credentialVersion: value(parseSlotCredentialVersion(1)),
    allowedProjects: [PROJECT], concurrencyLimit: 4, state: 'active', health: 'healthy', revision: FIRST_SLOT_REVISION, ...overrides,
  }));
}

function request(task: Task, workerId: string, slotRequest: SlotRequest | undefined, name = 'a'): PlacementRequest {
  return {
    assignmentId: id('AssignmentId', `assignment-${name}`) as AssignmentId,
    reservationId: id('ReservationId', `reservation-${name}`) as ReservationId,
    commandId: id('EventId', `offer-${name}`), correlationId: id('CorrelationId', `correlation-${name}`),
    taskId: task.id, attemptId: ATTEMPT, ownershipGeneration: task.ownershipGeneration, workerId: id('WorkerId', workerId) as WorkerId,
    requested: value(parseResourceRequest({ cpuMillicores: 1000, memoryMebibytes: 2048, hardControls: [] })),
    ...(slotRequest === undefined ? {} : { slotRequest }),
  };
}

const kindOf = (outcome: PlacementOutcome) => (outcome.kind === 'placed' ? 'placed' : `${outcome.kind}:${outcome.reason}`);

// Held reservations of other projects' attempts that name the slot.
async function holdSlot(tx: CapacityTransaction, slotId: string, count: number): Promise<void> {
  for (let index = 0; index < count; index++) {
    value(await tx.assignments.add(createAssignment({
      id: id('AssignmentId', `held-${index}`), attemptId: id('AttemptId', `other-${index}`), workerId: id('WorkerId', 'worker-9'),
      ownershipGeneration: FIRST_OWNERSHIP_GENERATION, offerCommandId: id('EventId', `held-offer-${index}`),
      reservation: {
        id: id('ReservationId', `held-reservation-${index}`),
        scope: { projectId: id('ProjectId', 'project-9'), runId: id('RunId', 'run-9'), taskId: id('TaskId', `other-${index}`), rootTaskId: id('TaskId', `other-${index}`) },
        requested: value(parseResourceRequest({ cpuMillicores: 1, memoryMebibytes: 1, hardControls: [] })),
        providerCredentials: [id('ProviderCredentialId', slotId)],
      },
    }, AT)));
  }
}

test('a placement reserves the selected slot, records it, and writes the slot once', async () => {
  const { tx, task, slots } = await fixture([2]);
  value(await slots.add(slotRecord('slot-1')));
  const placed = value(await placeInTransaction(tx, request(task, 'worker-1', NEW_SESSION)));
  assert.ok(placed.kind === 'placed');
  assert.deepEqual(placed.assignment.reservation.providerCredentials, ['slot-1']);
  const stored = value(await slots.get(id('ProviderCredentialId', 'slot-1')));
  assert.deepEqual([stored.revision, stored.lastReservedAt], [2, AT]);
});

test('a slot whose limit is not the default admits exactly its limit', async () => {
  const { tx, task, slots } = await fixture([2]);
  value(await slots.add(slotRecord('slot-1', { concurrencyLimit: 8 })));
  await holdSlot(tx, 'slot-1', 7);
  assert.equal(kindOf(value(await placeInTransaction(tx, request(task, 'worker-1', NEW_SESSION)))), 'placed');
  const limited = await fixture([2]);
  value(await limited.slots.add(slotRecord('slot-1', { concurrencyLimit: 8 })));
  await holdSlot(limited.tx, 'slot-1', 8);
  const waiting = value(await placeInTransaction(limited.tx, request(limited.task, 'worker-1', NEW_SESSION)));
  assert.equal(kindOf(waiting), 'waiting:provider-concurrency-exhausted');
});

test('a candidate declined for its worker leaves no slot write', async () => {
  const { tx, task, slots } = await fixture([0, 2]);
  value(await slots.add(slotRecord('slot-1')));
  assert.equal(kindOf(value(await placeInTransaction(tx, request(task, 'worker-1', NEW_SESSION)))), 'waiting:worker-capacity-exhausted');
  assert.equal(value(await slots.get(id('ProviderCredentialId', 'slot-1'))).revision, 1);
  assert.equal(kindOf(value(await placeInTransaction(tx, request(task, 'worker-2', NEW_SESSION, 'b')))), 'placed');
  assert.equal(value(await slots.get(id('ProviderCredentialId', 'slot-1'))).revision, 2);
});

test('a rejecting policy rejects with no-eligible-slot only after the worker check', async () => {
  const reject: SlotRequest = { ...NEW_SESSION, whenNoSlot: 'reject' };
  const { tx, task } = await fixture([0, 2]);
  assert.equal(kindOf(value(await placeInTransaction(tx, request(task, 'worker-1', reject)))), 'waiting:worker-capacity-exhausted');
  assert.equal(kindOf(value(await placeInTransaction(tx, request(task, 'worker-2', reject, 'b')))), 'rejected:no-eligible-slot');
});

test('an attempt without a slot request reserves no provider credential', async () => {
  const { tx, task } = await fixture([2]);
  const placed = value(await placeInTransaction(tx, request(task, 'worker-1', undefined)));
  assert.ok(placed.kind === 'placed');
  assert.deepEqual(placed.assignment.reservation.providerCredentials, []);
});

test('a slot request for another project than the task\'s is invalid and reserves nothing', async () => {
  const { tx, task, slots, assignments, outbox } = await fixture([2]);
  const other = id('ProjectId', 'other-project') as ProjectId;
  value(await slots.add(slotRecord('slot-1', { allowedProjects: [other] })));
  const placed = await placeInTransaction(tx, request(task, 'worker-1', { ...NEW_SESSION, projectId: other }));
  assert.ok(!placed.ok);
  assert.equal(placed.error.code, 'invalid');
  assert.deepEqual([assignments.all(), outbox.messages], [[], []]);
  assert.equal(value(await slots.get(id('ProviderCredentialId', 'slot-1'))).revision, 1);
});

const PINNED = { harnessId: HARNESS, slotId: id('ProviderCredentialId', 'slot-1') };

const NOT_SELECTED_BEFORE_12B: readonly (readonly [string, SlotRequest])[] = [
  ['resumed-session', { projectId: PROJECT, kind: 'resumed-session', pinned: PINNED }],
  ['after-limit', { projectId: PROJECT, kind: 'after-limit', limited: PINNED, alternatives: [] }],
];

for (const [kind, slotRequest] of NOT_SELECTED_BEFORE_12B) {
  test(`a ${kind} request fails the placement with invalid before sub-change 12b`, async () => {
    const { tx, task, slots } = await fixture([2]);
    value(await slots.add(slotRecord('slot-1')));
    const placed = await placeInTransaction(tx, request(task, 'worker-1', slotRequest));
    assert.ok(!placed.ok);
    assert.equal(placed.error.code, 'invalid');
    assert.deepEqual(placed.error.details, { kind });
    assert.equal(value(await slots.get(PINNED.slotId)).revision, 1);
  });
}

// Runs each transaction at once on one shared state, as one writer would.
function serialStore(tx: CapacityTransaction): CapacityStore {
  return { transaction: (work) => work(tx) };
}

const PAIR = { harnessId: HARNESS, mechanismId: MECHANISM, delivery: 'subscription-token' as const };
const SECRET_TEXT = 'test-material-without-shape';

async function commandFixture(slotLimit?: number) {
  const { tx, slots } = await fixture([2]);
  const credentials = new InMemorySlotCredentials();
  const deliveries = new StaticAdmittedDeliveries([{ ...PAIR, ...(slotLimit === undefined ? {} : { slotLimit }) }]);
  return { slots, credentials, ports: { store: serialStore(tx), credentials, deliveries } };
}

function input(name: string, overrides: Partial<AddAccountSlotInput> = {}): AddAccountSlotInput {
  return {
    id: id('ProviderCredentialId', name), harnessId: HARNESS, mechanismId: MECHANISM, allowedProjects: [PROJECT],
    secret: value(SlotSecret.of(SECRET_TEXT)), ...overrides,
  };
}

function expectInvalidWithoutSecret(result: Result<AccountSlot>): void {
  assert.equal(!result.ok && result.error.code, 'invalid');
  for (const form of [JSON.stringify(result), inspect(result, { depth: 5 })]) assert.ok(!form.includes(SECRET_TEXT), form);
}

test('adding a slot stores its credential and a record that names its version', async () => {
  const { slots, credentials, ports } = await commandFixture();
  const added = value(await addAccountSlot(ports, input('slot-1', { concurrencyLimit: 2 })));
  assert.deepEqual([added.state, added.health, added.revision, added.concurrencyLimit], ['active', 'healthy', 1, 2]);
  assert.deepEqual(value(await slots.get(added.id)), added);
  assert.equal(value(await credentials.reveal(added.id, added.credentialVersion)).reveal(), SECRET_TEXT);
  assert.equal(value(await addAccountSlot(ports, input('slot-2'))).concurrencyLimit, 4);
});

test('a mechanism without an admitted delivery stores neither a slot nor a credential', async () => {
  const { slots, credentials, ports } = await commandFixture();
  const other = id('SubscriptionMechanismId', 'mechanism-2') as SubscriptionMechanismId;
  expectInvalidWithoutSecret(await addAccountSlot(ports, input('slot-1', { mechanismId: other })));
  assert.equal((await slots.get(id('ProviderCredentialId', 'slot-1'))).ok, false);
  assert.deepEqual(credentials.storedVersions(id('ProviderCredentialId', 'slot-1')), []);
});

test('an invalid record stores no credential', async () => {
  const { credentials, ports } = await commandFixture();
  expectInvalidWithoutSecret(await addAccountSlot(ports, input('slot-1', { allowedProjects: [] })));
  assert.deepEqual(credentials.storedVersions(id('ProviderCredentialId', 'slot-1')), []);
});

test('a slot beyond its pair limit is invalid and its stored version is discarded', async () => {
  const { slots, credentials, ports } = await commandFixture(1);
  const first = value(await addAccountSlot(ports, input('slot-1')));
  expectInvalidWithoutSecret(await addAccountSlot(ports, input('slot-2')));
  assert.deepEqual(credentials.storedVersions(id('ProviderCredentialId', 'slot-2')), []);
  value(await slots.replace({ ...first, state: 'revoked', revision: 2 }, 1));
  expectInvalidWithoutSecret(await addAccountSlot(ports, input('slot-2')));
  value(await slots.replace({ ...first, state: 'removed', revision: 3 }, 2));
  assert.equal((await addAccountSlot(ports, input('slot-2'))).ok, true);
});

test('an add whose commit outcome is unknown keeps its stored version', async () => {
  const { slots, credentials, ports } = await commandFixture();
  const lostReply: CapacityStore = {
    transaction: async (work) => {
      const committed = await ports.store.transaction(work);
      return committed.ok ? err(failure('unavailable', 'the commit outcome is unknown', { outcome: 'unknown' })) : committed;
    },
  };
  const added = await addAccountSlot({ ...ports, store: lostReply }, input('slot-1'));
  assert.equal(!added.ok && added.error.code, 'unavailable');
  const stored = value(await slots.get(id('ProviderCredentialId', 'slot-1')));
  assert.deepEqual(credentials.storedVersions(stored.id), [stored.credentialVersion]);
});

test('a duplicate slot is a conflict and keeps the existing credential only', async () => {
  const { credentials, ports } = await commandFixture();
  const first = value(await addAccountSlot(ports, input('slot-1')));
  const again = await addAccountSlot(ports, input('slot-1'));
  assert.equal(!again.ok && again.error.code, 'conflict');
  assert.deepEqual(credentials.storedVersions(first.id), [first.credentialVersion]);
});
