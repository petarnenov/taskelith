import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AttemptId } from '@taskelith/execution';
import type { HandedOffWorkspace, HandOffRecord } from '@taskelith/git-workspace';
import { err, failure, ok, parseInstant, type Failure, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { failed, id, value } from '@taskelith/testing';
import { RECLAIM_FAILED_EVENT, WorkspaceSlots, type WorkerWorkspace } from '@taskelith/worker';
import { workspaceFailure } from '@taskelith/workspace';

const T0 = value(parseInstant('2026-10-28T09:00:00.000Z'));
const FIRST = id('AttemptId', 'attempt-1') as AttemptId;
const SECOND = id('AttemptId', 'attempt-2') as AttemptId;
const HANDED_OFF: HandOffRecord = { containment: null, reclaimFailed: false };
const SECRET = 'ghs_secretTokenValue0123456789';
const CHECKOUT = '/var/lib/taskelith/worker/workspaces/attempt-1-abc/checkout';

// The adapter's records in memory; each answer can be replaced.
class FakeWorkspace implements Pick<WorkerWorkspace, 'handOffRecords' | 'handOff' | 'reclaim'> {
  readonly records = new Map<AttemptId, HandOffRecord>();
  readFault: Error | undefined;
  handOffAnswer: Result<void> = ok(undefined);
  reclaimAnswer: Result<void> = ok(undefined);
  // Whether a failed hand-off still wrote its record.
  writesOnFailure = false;
  // A reclaim of an attempt with a gate waits for it before it acts.
  readonly gates = new Map<AttemptId, Promise<void>>();
  // The worker dies right after this attempt's record is removed.
  crashAfterRemovalOf: AttemptId | undefined;

  async handOffRecords(): Promise<readonly HandedOffWorkspace[]> {
    if (this.readFault !== undefined) throw this.readFault;
    return [...this.records].map(([attemptId, record]) => ({ attemptId, record }));
  }

  async handOff(attemptId: AttemptId): Promise<Result<void>> {
    if (this.handOffAnswer.ok || this.writesOnFailure) this.records.set(attemptId, HANDED_OFF);
    return this.handOffAnswer;
  }

  async reclaim(attemptId: AttemptId): Promise<Result<void>> {
    await this.gates.get(attemptId);
    if (this.reclaimAnswer.ok) this.records.delete(attemptId);
    if (attemptId === this.crashAfterRemovalOf) throw new Error('simulated crash');
    return this.reclaimAnswer;
  }
}

// The journal's capacity declarations: an owed one is journaled by the
// next declaration that does not fail, as `recordCapacity` does.
class FakeCapacityJournal {
  owed = false;
  declarations = 0;
  fault: Failure | undefined;

  readonly owe = (): Result<void> => {
    this.owed = true;
    return ok(undefined);
  };

  readonly declare = (): Result<void> => {
    if (this.fault !== undefined) return err(this.fault);
    if (this.owed) this.declarations += 1;
    this.owed = false;
    return ok(undefined);
  };
}

interface Opened {
  readonly slots: WorkspaceSlots;
  readonly sink: InMemoryLogSink;
  readonly journal: FakeCapacityJournal;
}

async function open(workspace: FakeWorkspace): Promise<Opened> {
  const sink = new InMemoryLogSink();
  const journal = new FakeCapacityJournal();
  const options = { workspace, oweCapacityDeclaration: journal.owe, declareCapacity: journal.declare, logger: new Logger(sink, { now: () => T0 }) };
  return { slots: value(await WorkspaceSlots.open(options)), sink, journal };
}

const reclaimFailedLines = (sink: InMemoryLogSink) => sink.records.filter(({ event }) => event === RECLAIM_FAILED_EVENT);

test('the start holds a slot for each hand-off record and keeps the cgroups they name for the scan', async () => {
  const workspace = new FakeWorkspace();
  workspace.records.set(FIRST, { containment: { kind: 'cgroup', name: 'reclaim-attempt-1-abc' }, reclaimFailed: false });
  workspace.records.set(SECOND, { containment: { kind: 'process-group', id: 4242 }, reclaimFailed: false });
  const { slots, sink } = await open(workspace);
  assert.deepEqual([...slots.held], [FIRST, SECOND]);
  assert.deepEqual([...slots.recordedContainments], ['reclaim-attempt-1-abc']);
  assert.deepEqual(reclaimFailedLines(sink), []);
});

test('hand-off records that cannot be read fail the opening with the fault code and without its path', async () => {
  const workspace = new FakeWorkspace();
  workspace.readFault = Object.assign(new Error(`EIO: i/o error, open '${CHECKOUT}/notes.txt'`), { code: 'EIO', syscall: 'open' });
  const journal = new FakeCapacityJournal();
  const logger = new Logger(new InMemoryLogSink(), { now: () => T0 });
  const refused = failed(await WorkspaceSlots.open({ workspace, oweCapacityDeclaration: journal.owe, declareCapacity: journal.declare, logger }));
  assert.deepEqual([refused.code, refused.message], ['unavailable', 'the hand-off records cannot be read (EIO)']);
  workspace.readFault = new Error(`broken at ${CHECKOUT}`);
  const uncoded = failed(await WorkspaceSlots.open({ workspace, oweCapacityDeclaration: journal.owe, declareCapacity: journal.declare, logger }));
  assert.equal(uncoded.message, 'the hand-off records cannot be read');
});

test('a hand-off holds its slot until a reclaim removes its record, which declares the capacity again', async () => {
  const workspace = new FakeWorkspace();
  const { slots, journal } = await open(workspace);
  value(await slots.handOff(FIRST));
  assert.deepEqual([...slots.held], [FIRST]);
  workspace.reclaimAnswer = err(failure('unavailable', 'the reclaim containment is still populated'));
  assert.equal(failed(await slots.reclaim(FIRST)).code, 'unavailable');
  assert.deepEqual([[...slots.held], journal.declarations], [[FIRST], 0]);
  workspace.reclaimAnswer = ok(undefined);
  value(await slots.reclaim(FIRST));
  assert.deepEqual([[...slots.held], journal.declarations], [[], 1]);
  value(await slots.reclaim(FIRST));
  assert.equal(journal.declarations, 1, 'a reclaim that removed no record declares nothing');
});

test('a capacity declaration that a reclaim owes outlives a journal failure until a later reclaim', async () => {
  const workspace = new FakeWorkspace();
  const { slots, journal } = await open(workspace);
  value(await slots.handOff(FIRST));
  journal.fault = failure('unavailable', 'the journal is busy');
  assert.equal(failed(await slots.reclaim(FIRST)).code, 'unavailable');
  assert.deepEqual([[...slots.held], journal.declarations, journal.owed], [[], 0, true]);
  journal.fault = undefined;
  value(await slots.reclaim(FIRST));
  assert.deepEqual([journal.declarations, journal.owed], [1, false]);
});

test('a failed hand-off holds a slot only when its record exists or cannot be read', async () => {
  const workspace = new FakeWorkspace();
  const { slots } = await open(workspace);
  workspace.handOffAnswer = workspaceFailure('precondition-failed', 'other-workspace-handed-off', 'another workspace is handed off');
  assert.equal(failed(await slots.handOff(FIRST)).details.reason, 'other-workspace-handed-off');
  assert.deepEqual([...slots.held], []);
  workspace.handOffAnswer = err(failure('unavailable', 'the checkout mode could not be set'));
  workspace.writesOnFailure = true;
  assert.equal(failed(await slots.handOff(FIRST)).code, 'unavailable');
  assert.deepEqual([...slots.held], [FIRST]);
  workspace.writesOnFailure = false;
  workspace.readFault = new Error('EIO: i/o error');
  assert.equal(failed(await slots.handOff(SECOND)).code, 'unavailable');
  assert.deepEqual([...slots.held], [FIRST, SECOND]);
});

test('a failed reclaim program keeps the slot held and is logged once for reconciliation', async () => {
  const workspace = new FakeWorkspace();
  const { slots, sink, journal } = await open(workspace);
  value(await slots.handOff(FIRST));
  workspace.reclaimAnswer = workspaceFailure('precondition-failed', 'reclaim-failed', 'the reclaim program failed; the workspace stays handed off');
  assert.equal(failed(await slots.reclaim(FIRST)).details.reason, 'reclaim-failed');
  assert.deepEqual([[...slots.held], journal.declarations], [[FIRST], 0]);
  assert.deepEqual(reclaimFailedLines(sink).map(({ level, fields }) => [level, fields]), [['warn', { attemptId: FIRST }]]);
});

test('a start that finds a failed reclaim holds the slot and logs it with its containment', async () => {
  const workspace = new FakeWorkspace();
  workspace.records.set(FIRST, { containment: { kind: 'cgroup', name: 'reclaim-attempt-1-abc' }, reclaimFailed: true });
  workspace.records.set(SECOND, { containment: { kind: 'process-group', id: 4242 }, reclaimFailed: true });
  const { slots, sink } = await open(workspace);
  assert.deepEqual([...slots.held], [FIRST, SECOND]);
  assert.deepEqual(reclaimFailedLines(sink).map(({ fields }) => fields), [
    { attemptId: FIRST, containment: 'reclaim-attempt-1-abc' },
    { attemptId: SECOND, containment: 'process group 4242' },
  ]);
});

test('the reclaim-failed line holds no path, no credential, and no checkout content', async () => {
  const workspace = new FakeWorkspace();
  const { slots, sink } = await open(workspace);
  value(await slots.handOff(FIRST));
  const message = `the reclaim program failed at ${CHECKOUT}/notes.txt with ${SECRET}: checkout line`;
  workspace.reclaimAnswer = workspaceFailure('precondition-failed', 'reclaim-failed', message);
  failed(await slots.reclaim(FIRST));
  const lines = reclaimFailedLines(sink);
  assert.equal(lines.length, 1);
  const text = JSON.stringify(lines);
  for (const leaked of [SECRET, CHECKOUT, '/', 'checkout line', 'notes.txt']) assert.equal(text.includes(leaked), false, leaked);
});

// A gate that a test opens when it lets a waiting reclaim go on.
function gate(): { readonly passed: Promise<void>; open(): void } {
  let open = () => {};
  const passed = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { passed, open };
}

async function twoHandedOff(): Promise<Opened & { readonly workspace: FakeWorkspace }> {
  const workspace = new FakeWorkspace();
  const opened = await open(workspace);
  value(await opened.slots.handOff(FIRST));
  value(await opened.slots.handOff(SECOND));
  return { ...opened, workspace };
}

test('two concurrent reclaims of different workspaces each declare the capacity', async () => {
  const { slots, journal, workspace } = await twoHandedOff();
  const [first, second] = [gate(), gate()];
  workspace.gates.set(FIRST, first.passed).set(SECOND, second.passed);
  const reclaims = [slots.reclaim(FIRST), slots.reclaim(SECOND)];
  first.open();
  value(await reclaims[0]!);
  second.open();
  value(await reclaims[1]!);
  assert.deepEqual([[...slots.held], journal.declarations, journal.owed], [[], 2, false]);
});

test('a worker killed after the second of two concurrent removals still owes its declaration', async () => {
  const { slots, journal, workspace } = await twoHandedOff();
  const [first, second] = [gate(), gate()];
  workspace.gates.set(FIRST, first.passed).set(SECOND, second.passed);
  workspace.crashAfterRemovalOf = SECOND;
  const reclaims = [slots.reclaim(FIRST), slots.reclaim(SECOND)];
  first.open();
  value(await reclaims[0]!);
  second.open();
  await assert.rejects(reclaims[1]!, /simulated crash/);
  assert.deepEqual([journal.declarations, journal.owed], [1, true], 'the next start declares the owed capacity');
  assert.deepEqual([...workspace.records.keys()], []);
});
