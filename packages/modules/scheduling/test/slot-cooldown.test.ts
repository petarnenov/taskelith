import assert from 'node:assert/strict';
import test from 'node:test';
import { inspect } from 'node:util';
import type { AssignmentId, HarnessPluginId } from '@taskelith/execution';
import { parseInstant, type Instant, type Result } from '@taskelith/kernel';
import {
  FIRST_SLOT_REVISION,
  InMemoryAccountSlots,
  InMemoryAssignmentRepository,
  InMemorySlotCredentials,
  SLOT_LIMIT_APPLICATIONS,
  SLOT_REPORTED_RESET_MAXIMUM_MINUTES,
  SlotSecret,
  applySlotLimitInTransaction,
  cooldownAfterLimit,
  createAssignment,
  parseAccountSlot,
  parseDefaultCooldownMinutes,
  parseResourceRequest,
  parseSlotCredentialVersion,
  type AccountSlot,
  type HarnessLimitSignal,
  type SlotCooldown,
  type SlotSignalTransaction,
  type SubscriptionMechanismId,
} from '@taskelith/scheduling';
import { FIRST_OWNERSHIP_GENERATION } from '@taskelith/sdlc';
import { id, value } from '@taskelith/testing';

const at = (text: string): Instant => value(parseInstant(text));
const NOW = at('2026-10-29T10:00:00.000Z');
const EARLIER = at('2026-10-29T09:30:00.000Z');
const IN_ONE_HOUR = at('2026-10-29T11:00:00.000Z');
const LATER = at('2026-10-29T11:30:00.000Z');
const LATEST = at('2026-10-29T12:00:00.000Z');
const IN_SEVEN_DAYS = at('2026-11-05T10:00:00.000Z');
const SIXTY = value(parseDefaultCooldownMinutes(60));
const SLOT = id('ProviderCredentialId', 'slot-1');
const ASSIGNMENT = id('AssignmentId', 'assignment-1') as AssignmentId;
const LIMIT: HarnessLimitSignal = { kind: 'account-signal', signal: 'limit' };
const limitUntil = (resetsAt: string): HarnessLimitSignal => ({ ...LIMIT, resetsAt });
const reported = (until: Instant): SlotCooldown => ({ until, source: 'reported-reset' });

test('the default cooldown is a whole number of minutes from 1 to 1440', () => {
  for (const minutes of [1, 60, 1440]) assert.equal(value(parseDefaultCooldownMinutes(minutes)), minutes);
  for (const minutes of [0, 1441, 1.5, Number.NaN]) assert.equal(parseDefaultCooldownMinutes(minutes).ok, false, String(minutes));
});

test('a limit cools until its reported reset after now, otherwise for the default', () => {
  assert.deepEqual(cooldownAfterLimit(undefined, { resetsAt: LATER }, NOW, SIXTY), reported(LATER));
  assert.deepEqual(cooldownAfterLimit(undefined, {}, NOW, SIXTY), { until: IN_ONE_HOUR, source: 'default' });
  for (const resetsAt of [NOW, EARLIER]) {
    assert.deepEqual(cooldownAfterLimit(undefined, { resetsAt }, NOW, SIXTY), { until: IN_ONE_HOUR, source: 'default' }, resetsAt);
  }
});

test('a later limit extends a cooldown and never shortens it', () => {
  const stored = reported(LATER);
  assert.deepEqual(cooldownAfterLimit(stored, { resetsAt: LATEST }, NOW, SIXTY), reported(LATEST));
  assert.equal(cooldownAfterLimit(stored, {}, NOW, SIXTY), stored);
  assert.equal(cooldownAfterLimit(stored, { resetsAt: LATER }, NOW, SIXTY), stored);
  const ended = reported(EARLIER);
  assert.deepEqual(cooldownAfterLimit(ended, {}, NOW, SIXTY), { until: IN_ONE_HOUR, source: 'default' });
});

test('a reported reset is capped at seven days after now', () => {
  assert.equal(SLOT_REPORTED_RESET_MAXIMUM_MINUTES, 10_080);
  assert.deepEqual(cooldownAfterLimit(undefined, { resetsAt: IN_SEVEN_DAYS }, NOW, SIXTY), reported(IN_SEVEN_DAYS));
  for (const resetsAt of [at('2026-11-05T10:00:00.001Z'), at('2027-10-29T10:00:00.000Z')]) {
    assert.deepEqual(cooldownAfterLimit(undefined, { resetsAt }, NOW, SIXTY), reported(IN_SEVEN_DAYS), resetsAt);
  }
});

function slotRecord(overrides: Partial<AccountSlot> = {}): AccountSlot {
  return value(parseAccountSlot({
    id: SLOT, harnessId: id('HarnessPluginId', 'harness-1') as HarnessPluginId,
    mechanismId: id('SubscriptionMechanismId', 'mechanism-1') as SubscriptionMechanismId,
    credentialVersion: value(parseSlotCredentialVersion(1)), allowedProjects: [id('ProjectId', 'project-1')],
    concurrencyLimit: 4, state: 'active', health: 'healthy', revision: FIRST_SLOT_REVISION, ...overrides,
  }));
}

function reservation(providerCredentials: readonly string[], assignmentId = ASSIGNMENT) {
  return createAssignment({
    id: assignmentId, attemptId: id('AttemptId', `attempt-${assignmentId}`), workerId: id('WorkerId', 'worker-1'),
    ownershipGeneration: FIRST_OWNERSHIP_GENERATION, offerCommandId: id('EventId', `offer-${assignmentId}`),
    reservation: {
      id: id('ReservationId', `reservation-${assignmentId}`),
      scope: { projectId: id('ProjectId', 'project-1'), runId: id('RunId', 'run-1'), taskId: id('TaskId', 'task-1'), rootTaskId: id('TaskId', 'task-1') },
      requested: value(parseResourceRequest({ cpuMillicores: 1, memoryMebibytes: 1, hardControls: [] })),
      providerCredentials: providerCredentials.map((name) => id('ProviderCredentialId', name)),
    },
  }, NOW);
}

async function signalFixture(slots = new InMemoryAccountSlots(), stored: AccountSlot = slotRecord()) {
  const assignments = new InMemoryAssignmentRepository();
  value(await assignments.add(reservation(['slot-1'])));
  value(await slots.add(stored));
  const tx: SlotSignalTransaction = { assignments, accountSlots: slots, now: async () => NOW };
  return { tx, slots, assignments };
}

const apply = (tx: SlotSignalTransaction, signal: HarnessLimitSignal = LIMIT, assignmentId = ASSIGNMENT) =>
  applySlotLimitInTransaction(tx, { assignmentId, signal, defaultCooldown: SIXTY });

test('a limit cools the slot that the reservation records, by one compare-and-set', async () => {
  const { tx, slots } = await signalFixture();
  const cooled = value(await apply(tx, limitUntil('2026-10-29T11:30:00Z')));
  assert.deepEqual([cooled.cooldown, cooled.revision], [reported(LATER), 2]);
  assert.deepEqual(value(await slots.get(SLOT)), cooled);
  const kept = value(await apply(tx));
  assert.deepEqual([kept.cooldown, kept.revision], [reported(LATER), 2]);
});

test('a reset inside a millisecond rounds up, so the cooldown never ends before it', async () => {
  const { tx } = await signalFixture();
  const cooled = value(await apply(tx, limitUntil('2026-10-29T11:30:00.000000001Z')));
  assert.equal(cooled.cooldown?.until, '2026-10-29T11:30:00.001Z');
  const exact = await signalFixture();
  assert.equal(value(await apply(exact.tx, limitUntil('2026-10-29T11:30:00.123000000Z'))).cooldown?.until, '2026-10-29T11:30:00.123Z');
});

// Moves the slot on before the first or every replace, as a concurrent
// writer would.
class InterleavedSlots extends InMemoryAccountSlots {
  writes = 0;
  readonly #interleave: (stored: AccountSlot) => AccountSlot;
  readonly #replaces: 'first' | 'every';

  constructor(interleave: (stored: AccountSlot) => AccountSlot, replaces: 'first' | 'every' = 'first') {
    super();
    this.#interleave = interleave;
    this.#replaces = replaces;
  }

  override async replace(slot: AccountSlot, expectedRevision: number): Promise<Result<void>> {
    this.writes += 1;
    if (this.writes === 1 || this.#replaces === 'every') this.write(this.#interleave(value(await this.get(slot.id))));
    return super.replace(slot, expectedRevision);
  }
}

test('a lost compare-and-set rereads the slot and keeps a longer cooldown written meanwhile', async () => {
  const longer = new InterleavedSlots((stored) => ({ ...stored, cooldown: reported(LATEST), revision: stored.revision + 1 }));
  const { tx } = await signalFixture(longer);
  const applied = value(await apply(tx, limitUntil('2026-10-29T11:30:00.000Z')));
  assert.deepEqual([applied.cooldown, applied.revision, longer.writes], [reported(LATEST), 2, 1]);
  const shorter = new InterleavedSlots((stored) => ({ ...stored, cooldown: reported(EARLIER), revision: stored.revision + 1 }));
  const reread = await signalFixture(shorter);
  const extended = value(await apply(reread.tx, limitUntil('2026-10-29T11:30:00.000Z')));
  assert.deepEqual([extended.cooldown, extended.revision, shorter.writes], [reported(LATER), 3, 2]);
});

test('a limit that keeps losing its compare-and-set returns the conflict after its applications', async () => {
  const contended = new InterleavedSlots((stored) => ({ ...stored, revision: stored.revision + 1 }), 'every');
  const { tx } = await signalFixture(contended);
  const applied = await apply(tx);
  assert.equal(!applied.ok && applied.error.code, 'conflict');
  assert.equal(contended.writes, SLOT_LIMIT_APPLICATIONS);
});

test('a limit for an unknown assignment, a reservation without one slot, or a bad reset changes nothing', async () => {
  const { tx, slots, assignments } = await signalFixture();
  const unknown = await apply(tx, LIMIT, id('AssignmentId', 'assignment-9') as AssignmentId);
  assert.equal(!unknown.ok && unknown.error.code, 'not-found');
  for (const [name, credentials] of [['assignment-2', []], ['assignment-3', ['slot-1', 'slot-2']]] as const) {
    value(await assignments.add(reservation(credentials, id('AssignmentId', name) as AssignmentId)));
    const refused = await apply(tx, LIMIT, id('AssignmentId', name) as AssignmentId);
    assert.deepEqual(!refused.ok && [refused.error.code, refused.error.details], ['precondition-failed', { assignment: name }]);
  }
  const malformed = await apply(tx, limitUntil('not an instant'));
  assert.equal(!malformed.ok && malformed.error.code, 'invalid');
  assert.equal(value(await slots.get(SLOT)).revision, 1);
});

test('a limit cools a revoked slot, which a reinstatement then keeps', async () => {
  const { tx } = await signalFixture(undefined, slotRecord({ state: 'revoked' }));
  const cooled = value(await apply(tx));
  assert.deepEqual([cooled.state, cooled.cooldown], ['revoked', { until: IN_ONE_HOUR, source: 'default' }]);
});

test('a limit past the cap cools the slot for seven days', async () => {
  const { tx } = await signalFixture();
  const cooled = value(await apply(tx, limitUntil('2026-11-12T10:00:00Z')));
  assert.deepEqual(cooled.cooldown, reported(IN_SEVEN_DAYS));
});

test('a limit for a removed slot is accepted and writes nothing', async () => {
  const removed = slotRecord({ state: 'removed' });
  const { tx, slots } = await signalFixture(undefined, removed);
  assert.deepEqual(value(await apply(tx, limitUntil('2026-10-29T11:30:00Z'))), removed);
  assert.deepEqual(value(await slots.get(SLOT)), removed);
});

test('a limit and its outcomes hold no slot credential', async () => {
  const credentials = new InMemorySlotCredentials();
  const secret = value(SlotSecret.of('limit-test-material-without-shape'));
  await credentials.store(SLOT, secret);
  const { tx } = await signalFixture();
  const results = [await apply(tx), await apply(tx, LIMIT, id('AssignmentId', 'assignment-9') as AssignmentId)];
  for (const form of [JSON.stringify(results), inspect(results, { depth: 6 })]) assert.ok(!form.includes(secret.reveal()), form);
});
