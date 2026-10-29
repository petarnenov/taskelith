import assert from 'node:assert/strict';
import test from 'node:test';
import type { Attempt, Execution, ExecutionId, LaunchGrant, RecoveryEpoch, Task, WorkerId } from '@taskelith/execution';
import { parseInstant, type Instant } from '@taskelith/kernel';
import {
  InMemorySlotCredentialDeliveries,
  SLOT_CREDENTIAL_DELIVERIES_CONFORMANCE,
  checkDeliveredSlot,
  checkSlotDeliveryOwnership,
  nextDeliveryRecord,
  parseAccountSlot,
  parseSlotCredentialVersion,
  type AccountSlot,
  type Assignment,
  type ProviderCredentialId,
  type SlotCredentialDeliveries,
  type SlotDeliveryOwnership,
  type SlotDeliveryRecord,
  type SlotDeliveryRequest,
  type SubscriptionMechanismId,
} from '@taskelith/scheduling';
import type { ConformanceCase, OwnershipGeneration, TaskId } from '@taskelith/sdlc';
import { id, value } from '@taskelith/testing';

const at = (text: string): Instant => value(parseInstant(text));
const ISSUED = at('2026-10-29T10:00:00.000Z');
const NOW = at('2026-10-29T10:00:10.000Z');
const EXPIRED = at('2026-10-29T10:00:30.000Z');
const SLOT = id('ProviderCredentialId', 'slot-1') as ProviderCredentialId;
const OTHER_SLOT = id('ProviderCredentialId', 'slot-2') as ProviderCredentialId;
const WORKER = id('WorkerId', 'worker-1') as WorkerId;
const EXECUTION = id('ExecutionId', 'execution-1') as ExecutionId;
const GENERATION = 3 as OwnershipGeneration;

const REQUEST: SlotDeliveryRequest = {
  workerId: WORKER, recoveryEpoch: 1 as RecoveryEpoch, attemptId: id('AttemptId', 'attempt-1'), ownershipGeneration: GENERATION,
  executionId: EXECUTION, slotId: SLOT,
};

function grant(state: 'granted' | 'revoked' = 'granted'): LaunchGrant {
  return { state, issuedAt: ISSUED, parameters: { ttlMilliseconds: 30_000, skewMilliseconds: 5_000 } } as unknown as LaunchGrant;
}

function execution(overrides: Partial<Execution> = {}): Execution {
  return {
    id: EXECUTION, assignmentId: id('AssignmentId', 'assignment-1'), workerId: WORKER, state: 'authorized', grants: [grant()],
    evidence: [], unauthorizedStarts: [], ...overrides,
  } as Execution;
}

function taskWith(attempt: Partial<Attempt> = {}, ownershipGeneration = GENERATION): Task {
  const attempted = { id: REQUEST.attemptId, executions: [execution()], ...attempt } as Attempt;
  return { id: id('TaskId', 'task-1') as TaskId, ownershipGeneration, attempts: [attempted] } as unknown as Task;
}

function assignmentWith(overrides: Partial<Assignment> = {}, reservation: object = {}): Assignment {
  return {
    id: id('AssignmentId', 'assignment-1'), attemptId: REQUEST.attemptId, workerId: WORKER, ownershipGeneration: GENERATION, state: 'accepted',
    reservation: { state: 'held', providerCredentials: [SLOT], ...reservation }, ...overrides,
  } as unknown as Assignment;
}

function context(overrides: Partial<SlotDeliveryOwnership> = {}): SlotDeliveryOwnership {
  return {
    installation: { quarantined: false, recoveryEpoch: 1 as RecoveryEpoch }, workerAuthorized: true,
    assignment: assignmentWith(), task: taskWith(), now: NOW, ...overrides,
  };
}

function reasonOf(request: SlotDeliveryRequest, checked: SlotDeliveryOwnership): string {
  return checkSlotDeliveryOwnership(request, checked)?.reason ?? 'delivered';
}

const EARLIER: SlotDeliveryRecord = {
  taskId: id('TaskId', 'task-1') as TaskId, executionId: EXECUTION, slotId: SLOT, attemptId: REQUEST.attemptId, workerId: WORKER,
  credentialVersion: value(parseSlotCredentialVersion(2)), firstDeliveredAt: ISSUED, lastDeliveredAt: ISSUED, deliveries: 1,
};

test('a first delivery to an authorized execution with a live grant passes the ownership checks', () => {
  assert.equal(reasonOf(REQUEST, context()), 'delivered');
  assert.equal(reasonOf(REQUEST, context({ task: taskWith({ executions: [execution({ state: 'started' })] }), now: EXPIRED })), 'delivered',
    'a started execution needs no live grant');
  assert.equal(reasonOf(REQUEST, context({ earlierDelivery: EARLIER, now: EXPIRED })), 'delivered', 'a re-delivery needs no live grant');
});

test('the installation and worker checks come first, in the contract order', () => {
  const quarantined = { quarantined: true, recoveryEpoch: 1 as RecoveryEpoch };
  assert.equal(reasonOf({ ...REQUEST, recoveryEpoch: 2 as RecoveryEpoch }, context({ installation: quarantined, workerAuthorized: false })), 'quarantined');
  assert.equal(reasonOf({ ...REQUEST, recoveryEpoch: 2 as RecoveryEpoch }, context({ workerAuthorized: false })), 'stale-recovery-epoch');
  assert.equal(reasonOf(REQUEST, context({ workerAuthorized: false, assignment: undefined })), 'worker-not-authorized');
});

test('an unknown, ended, or foreign assignment or execution is assignment-not-active', () => {
  const cases: Array<[string, Partial<SlotDeliveryOwnership>]> = [
    ['no assignment', { assignment: undefined }],
    ['no task', { task: undefined }],
    ['an ended assignment', { assignment: assignmentWith({ state: 'ended' }) }],
    ['another worker', { assignment: assignmentWith({ workerId: id('WorkerId', 'worker-2') as WorkerId }) }],
    ['another attempt', { assignment: assignmentWith({ attemptId: id('AttemptId', 'attempt-2') }) }],
    ['an unknown execution', { task: taskWith({ executions: [execution({ id: id('ExecutionId', 'execution-9') as ExecutionId })] }) }],
    ['an execution of another assignment', { task: taskWith({ executions: [execution({ assignmentId: id('AssignmentId', 'assignment-9') })] }) }],
    ['an execution of another worker', { task: taskWith({ executions: [execution({ workerId: id('WorkerId', 'worker-2') as WorkerId })] }) }],
  ];
  for (const [name, overrides] of cases) assert.equal(reasonOf(REQUEST, context(overrides)), 'assignment-not-active', name);
  assert.equal(reasonOf({ ...REQUEST, attemptId: id('AttemptId', 'attempt-9') }, context()), 'assignment-not-active', 'an unknown attempt');
});

test('a stale generation, then a cancelled or ended attempt, is refused before the execution', () => {
  const conflicting = taskWith({ executions: [execution({ state: 'exited' })] });
  assert.equal(reasonOf({ ...REQUEST, ownershipGeneration: 4 as OwnershipGeneration }, context({ task: conflicting })), 'stale-ownership-generation');
  assert.equal(reasonOf(REQUEST, context({ assignment: assignmentWith({ ownershipGeneration: 2 as OwnershipGeneration }) })), 'stale-ownership-generation');
  const cancelled = taskWith({ cancellation: {} as Attempt['cancellation'], executions: [execution({ grants: [grant('revoked')] })] });
  assert.equal(reasonOf(REQUEST, context({ task: cancelled })), 'attempt-not-launchable', 'before the revoked grant');
  assert.equal(reasonOf(REQUEST, context({ task: taskWith({ outcome: {} as Attempt['outcome'] }) })), 'attempt-not-launchable');
});

test('only the owning execution without a revoked grant passes, and a first delivery needs a live grant', () => {
  const owner = execution({ id: id('ExecutionId', 'execution-0') as ExecutionId, state: 'started' });
  assert.equal(reasonOf(REQUEST, context({ task: taskWith({ executions: [owner, execution()] }) })), 'execution-conflict', 'not the owner');
  assert.equal(reasonOf(REQUEST, context({ task: taskWith({ executions: [execution({ state: 'not-started' })] }) })), 'execution-conflict');
  const revoked = taskWith({ executions: [execution({ state: 'started', grants: [grant(), grant('revoked')] })] });
  assert.equal(reasonOf(REQUEST, context({ task: revoked, earlierDelivery: EARLIER })), 'execution-conflict', 'a revoked grant');
  assert.equal(reasonOf(REQUEST, context({ now: EXPIRED })), 'execution-conflict', 'an expired grant at the first delivery');
  assert.equal(reasonOf(REQUEST, context({ task: taskWith({ executions: [execution({ grants: [] })] }) })), 'execution-conflict', 'no grant');
});

test('a released reservation, or one that names another slot, is capacity-not-reserved', () => {
  assert.equal(reasonOf(REQUEST, context({ assignment: assignmentWith({}, { state: 'released' }) })), 'capacity-not-reserved');
  assert.equal(reasonOf(REQUEST, context({ assignment: assignmentWith({}, { providerCredentials: [OTHER_SLOT] }) })), 'capacity-not-reserved');
  assert.equal(reasonOf(REQUEST, context({ assignment: assignmentWith({}, { providerCredentials: [] }) })), 'capacity-not-reserved');
});

test('a revoked or removed slot, then one without an admitted delivery, reveals nothing', () => {
  const slot = (state: AccountSlot['state']): AccountSlot => value(parseAccountSlot({
    id: SLOT, harnessId: id('HarnessPluginId', 'harness-1') as never, mechanismId: id('SubscriptionMechanismId', 'mechanism-1') as SubscriptionMechanismId,
    credentialVersion: value(parseSlotCredentialVersion(1)), allowedProjects: [id('ProjectId', 'project-1')], concurrencyLimit: 1,
    state, health: 'healthy', revision: 1,
  }));
  assert.equal(checkDeliveredSlot(slot('revoked'), false)?.reason, 'revoked');
  assert.equal(checkDeliveredSlot(slot('removed'), true)?.reason, 'removed');
  assert.equal(checkDeliveredSlot(slot('active'), false)?.reason, 'delivery-not-admitted');
  assert.equal(checkDeliveredSlot(slot('active'), true), undefined);
});

test('a delivery record counts deliveries and keeps its first time and version', async () => {
  const delivery = { ...EARLIER, attemptId: REQUEST.attemptId };
  const first = nextDeliveryRecord(undefined, delivery, ISSUED);
  assert.deepEqual([first.firstDeliveredAt, first.lastDeliveredAt, first.deliveries], [ISSUED, ISSUED, 1]);
  const second = nextDeliveryRecord(first, delivery, NOW);
  assert.deepEqual([second.firstDeliveredAt, second.lastDeliveredAt, second.deliveries, second.credentialVersion], [ISSUED, NOW, 2, 2]);
  const records = new InMemorySlotCredentialDeliveries();
  await records.record({ ...second, slotId: OTHER_SLOT });
  await records.record(first);
  await records.record(second);
  assert.equal((await records.find(first.taskId, EXECUTION, SLOT))?.deliveries, 2);
  assert.equal(await records.find(first.taskId, id('ExecutionId', 'execution-9') as ExecutionId, SLOT), undefined);
  assert.deepEqual((await records.listByExecution(first.taskId, EXECUTION)).map((record) => record.slotId), [SLOT, OTHER_SLOT]);
  assert.doesNotMatch(JSON.stringify(second), /secret|token/i, 'a record holds identifiers, a version, and times only');
});

for (const conformance of SLOT_CREDENTIAL_DELIVERIES_CONFORMANCE) {
  test(`in-memory slot credential deliveries: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check(new InMemorySlotCredentialDeliveries()), []);
  });
}

// Keeps the first record of an execution and slot.
class FirstKeepingDeliveries extends InMemorySlotCredentialDeliveries {
  override async record(delivery: SlotDeliveryRecord): Promise<void> {
    if ((await this.find(delivery.taskId, delivery.executionId, delivery.slotId)) === undefined) await super.record(delivery);
  }
}

// Orders the slots of an execution by locale, not by code point.
class LocaleOrderedDeliveries extends InMemorySlotCredentialDeliveries {
  override async listByExecution(taskId: TaskId, executionId: ExecutionId): Promise<readonly SlotDeliveryRecord[]> {
    return [...await super.listByExecution(taskId, executionId)].sort((left, right) => left.slotId.localeCompare(right.slotId));
  }
}

// Keys records by execution and slot only, so tasks share them.
class TaskBlindDeliveries implements SlotCredentialDeliveries {
  readonly #records = new Map<string, SlotDeliveryRecord>();

  async find(_taskId: TaskId, executionId: ExecutionId, slotId: ProviderCredentialId): Promise<SlotDeliveryRecord | undefined> {
    return this.#records.get(`${executionId}\n${slotId}`);
  }

  async listByExecution(_taskId: TaskId, executionId: ExecutionId): Promise<readonly SlotDeliveryRecord[]> {
    return [...this.#records.values()].filter((stored) => stored.executionId === executionId)
      .sort((left, right) => (left.slotId < right.slotId ? -1 : 1));
  }

  async record(delivery: SlotDeliveryRecord): Promise<void> {
    this.#records.set(`${delivery.executionId}\n${delivery.slotId}`, delivery);
  }
}

async function failingCases<Port>(cases: readonly ConformanceCase<Port>[], port: () => Port): Promise<string[]> {
  const failing: string[] = [];
  for (const conformance of cases) if ((await conformance.check(port())).length > 0) failing.push(conformance.name);
  return failing;
}

test('the delivery record suite rejects an adapter that breaks replacement, order, or the composite key', async () => {
  const [byKey, replaces, ordered] = SLOT_CREDENTIAL_DELIVERIES_CONFORMANCE.map((conformance) => conformance.name);
  assert.deepEqual(await failingCases(SLOT_CREDENTIAL_DELIVERIES_CONFORMANCE, () => new FirstKeepingDeliveries()), [replaces]);
  assert.deepEqual(await failingCases(SLOT_CREDENTIAL_DELIVERIES_CONFORMANCE, () => new LocaleOrderedDeliveries()), [ordered]);
  assert.deepEqual(await failingCases(SLOT_CREDENTIAL_DELIVERIES_CONFORMANCE, () => new TaskBlindDeliveries()), [byKey, ordered]);
});
