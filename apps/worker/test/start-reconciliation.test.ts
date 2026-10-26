import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { WorkerJournal } from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { id, value } from '@taskelith/testing';
import { LaunchOrchestrator, LIVENESS_POLLS } from '@taskelith/worker';
import type { WorkerRoot } from '@taskelith/worker-journal';
import {
  CLEAN_EXIT,
  FakeAuthority,
  FakeClock,
  FakeSupervisions,
  PROCESS,
  T0,
  cancellation,
  grantFor,
  granted,
  offer,
  requestOf,
  temporaryJournal,
} from './launch-fakes.ts';

const EXECUTION = id('ExecutionId', 'inherited-1');

let root: WorkerRoot;
let journal: WorkerJournal;
let remove: () => void;
let authority: FakeAuthority;
let supervisions: FakeSupervisions;
let sink: InMemoryLogSink;
let records: Result<readonly string[]>;
let failures: unknown[];
let controller: AbortController;
let orchestrator: LaunchOrchestrator;

beforeEach(() => {
  ({ root, remove } = temporaryJournal());
  journal = root.journal;
  const clock = new FakeClock();
  authority = new FakeAuthority();
  supervisions = new FakeSupervisions();
  sink = new InMemoryLogSink();
  records = ok([]);
  failures = [];
  controller = new AbortController();
  let ids = 0;
  orchestrator = new LaunchOrchestrator({
    journal, authority, supervision: supervisions.factory, clock, draw: () => 0.5, newId: () => `id-${(ids += 1)}`,
    sleep: async (milliseconds, signal) => {
      if (signal.aborted) return;
      clock.milliseconds += milliseconds;
      await new Promise((resolve) => setImmediate(resolve));
    },
    pollMilliseconds: 100,
    records: async () => records,
    logger: new Logger(sink, { now: () => T0 }),
    onFailure: (error) => failures.push(error),
  });
});

afterEach(() => {
  controller.abort();
  remove();
});

// What an earlier process journaled before it stopped: W1, then W2, then
// optionally W3 and W4.
function inherit(until: 'pending' | 'granted' | 'written'): void {
  value(journal.recordCommand(offer()));
  const request = requestOf(EXECUTION, 'operation-1');
  value(journal.beginAuthorization(request));
  if (until === 'pending') return;
  value(journal.recordGrant(grantFor(request)));
  if (until === 'written') value(journal.recordExecutionRecordWritten(EXECUTION));
}

async function startOnce(): Promise<void> {
  await orchestrator.pass(controller.signal);
  await orchestrator.settled();
}

function inherited() {
  return value(journal.snapshot()).executions.find(({ executionId }) => executionId === EXECUTION);
}

function inheritedSupervision() {
  const supervision = supervisions.byExecution.get(EXECUTION);
  assert.ok(supervision !== undefined, 'the inherited execution was never supervised');
  return supervision;
}

function events(): string[] {
  return sink.records.map(({ event }) => event);
}

function factKinds(): string[] {
  return value(journal.dueForPublication(T0)).map(({ fact }) => fact.kind).filter((kind) => kind !== 'assignment-accepted');
}

// Stops the next launch of the intent at its first request.
function launchNothingNew(): void {
  authority.onRequest = () => controller.abort();
}

test('a pending W2 is sealed on start and reported not-started; the intent is launched anew', async () => {
  inherit('pending');
  authority.answers = [granted()];
  supervisions.onCreated = (supervision) => {
    supervision.facts = [{ problems: [], process: PROCESS, exit: CLEAN_EXIT }];
  };
  await startOnce();
  await startOnce();
  assert.deepEqual(inheritedSupervision().calls, ['seal']);
  assert.equal(inherited()?.state, 'not-started');
  assert.deepEqual(value(journal.snapshot()).executions.map(({ state }) => state), ['not-started', 'exited']);
});

test('an unused grant is sealed on start, and the seal lost to a claim is reported uncertain', async () => {
  inherit('granted');
  launchNothingNew();
  supervisions.onCreated = (supervision) => {
    supervision.launch = { kind: 'claim', launchAuthId: id('LaunchAuthId', 'grant-operation-1'), supervisor: 1 };
  };
  await startOnce();
  assert.equal(inherited()?.recordWritten, true);
  assert.equal(inherited()?.uncertain, true);
  assert.ok(events().includes('worker.execution.uncertain'));
});

test('a written record is recovered, never started: an exit found by recovery is reported', async () => {
  inherit('written');
  launchNothingNew();
  supervisions.onCreated = (supervision) => {
    supervision.recovery = { fact: 'exited', exit: { ...CLEAN_EXIT, startProven: false } };
    supervision.facts = [{ problems: [], exit: { ...CLEAN_EXIT, startProven: false, termination: 'boot-changed' } }];
  };
  await startOnce();
  assert.deepEqual(inheritedSupervision().calls, ['recover', 'read']);
  assert.equal(inherited()?.state, 'exited');
  assert.ok(events().includes('worker.execution.recovered'));
});

test('a recovery that asks to retry is repeated once after the liveness wait', async () => {
  inherit('written');
  launchNothingNew();
  supervisions.onCreated = (supervision) => {
    supervision.recoveries = [{ fact: 'retry' }];
    supervision.recovery = { fact: 'not-started' };
  };
  await startOnce();
  assert.deepEqual(inheritedSupervision().rounds, ['first', 'after-retry']);
  assert.equal(inherited()?.state, 'not-started');
});

test('an adopting recovery observes the record to its exit, with the start it claimed', async () => {
  inherit('written');
  launchNothingNew();
  supervisions.onCreated = (supervision) => {
    supervision.recovery = { fact: 'observe' };
    supervision.facts = [{
      problems: [], process: PROCESS, exit: CLEAN_EXIT,
      launch: { kind: 'claim', launchAuthId: id('LaunchAuthId', 'grant-operation-1'), supervisor: 2 },
    }];
  };
  await startOnce();
  assert.equal(inherited()?.state, 'exited');
  assert.deepEqual(factKinds(), ['execution-started', 'execution-exited']);
});

test('an uncertain recovery is reported once, with its reason, and never reconciled again', async () => {
  inherit('written');
  launchNothingNew();
  supervisions.onCreated = (supervision) => {
    supervision.recovery = { fact: 'uncertain', reason: 'the record is damaged' };
  };
  await startOnce();
  await startOnce();
  assert.deepEqual(inheritedSupervision().calls, ['recover']);
  assert.deepEqual(factKinds(), ['execution-uncertain']);
  const logged = sink.records.find(({ event }) => event === 'worker.execution.uncertain');
  assert.equal(logged?.fields['reason'], 'the record is damaged');
});

test('an operation that expired is resumed for the same execution, reporting not-started', async () => {
  inherit('pending');
  value(journal.recordAuthorizationExpired(id('OperationId', 'operation-1')));
  authority.answers = [granted()];
  supervisions.onCreated = (supervision) => {
    supervision.facts = [{ problems: [], process: PROCESS, exit: CLEAN_EXIT }];
  };
  await startOnce();
  assert.equal(authority.requests[0]?.executionId, EXECUTION);
  assert.equal(authority.requests[0]?.reportsNotStarted, true);
  assert.deepEqual(value(journal.snapshot()).executions.map(({ state }) => state), ['exited']);
});

test('a retryable rejection is resumed for the same execution on start', async () => {
  inherit('pending');
  value(journal.recordLaunchRejection(id('OperationId', 'operation-1'), { reason: 'unavailable', retryable: true, message: 'down' }));
  launchNothingNew();
  await startOnce();
  assert.equal(authority.requests[0]?.executionId, EXECUTION);
});

test('a supervisor lost while observing is decided by the recovery table', async () => {
  inherit('written');
  launchNothingNew();
  supervisions.onCreated = (supervision) => {
    supervision.recoveries = [{ fact: 'observe' }];
    supervision.recovery = { fact: 'uncertain', reason: 'no live supervisor' };
    supervision.facts = [{
      problems: [], process: PROCESS,
      launch: { kind: 'claim', launchAuthId: id('LaunchAuthId', 'grant-operation-1'), supervisor: 1 },
    }];
  };
  await startOnce();
  const supervision = inheritedSupervision();
  assert.equal(supervision.calls.filter((call) => call === 'read').length, LIVENESS_POLLS);
  assert.deepEqual(factKinds(), ['execution-started', 'execution-uncertain']);
  assert.ok(events().includes('worker.supervisor.lost'));
});

test('a supervisor still live at the liveness check keeps the watch going', async () => {
  inherit('written');
  launchNothingNew();
  let reads = 0;
  supervisions.onCreated = (supervision) => {
    supervision.recovery = { fact: 'observe' };
    const claim = { kind: 'claim' as const, launchAuthId: id('LaunchAuthId', 'grant-operation-1'), supervisor: 1 };
    supervision.facts = Array.from({ length: LIVENESS_POLLS + 2 }, () => ({ problems: [], process: PROCESS, launch: claim }));
    supervision.facts.push({ problems: [], process: PROCESS, launch: claim, exit: CLEAN_EXIT });
    const read = supervision.read.bind(supervision);
    supervision.read = async () => {
      reads += 1;
      return read();
    };
  };
  await startOnce();
  assert.equal(reads, LIVENESS_POLLS + 3);
  assert.equal(inherited()?.state, 'exited');
  assert.ok(!events().includes('worker.supervisor.lost'));
});

test('survivors and an unapplied cancellation are each reported once beside the exit', async () => {
  inherit('written');
  value(journal.recordCommand(cancellation(1, { executionId: EXECUTION })));
  supervisions.onCreated = (supervision) => {
    supervision.recovery = { fact: 'observe' };
    const reported = {
      problems: [], process: PROCESS, survivors: [PROCESS], cancellationNotApplied: true,
      launch: { kind: 'claim' as const, launchAuthId: id('LaunchAuthId', 'grant-operation-1'), supervisor: 2 },
    };
    supervision.facts = [reported, reported, { ...reported, exit: CLEAN_EXIT }];
  };
  await startOnce();
  assert.deepEqual(factKinds(), [
    'execution-started', 'termination-unproven', 'cancellation-not-applied', 'execution-exited',
  ]);
});

test('a confirmed terminal fact removes its record once; a held record is kept for a later pass', async () => {
  inherit('written');
  launchNothingNew();
  supervisions.onCreated = (supervision) => {
    supervision.recovery = { fact: 'not-started' };
    supervision.removeResult = err(failure('conflict', 'the supervisor holds the lock'));
  };
  await startOnce();
  const sequence = value(journal.dueForPublication(T0)).at(-1)?.position.sequence;
  assert.ok(sequence !== undefined);
  value(journal.confirmThrough(sequence));
  await startOnce();
  assert.ok(events().includes('worker.execution.record-kept'));
  assert.deepEqual(value(journal.removableRecords()), [EXECUTION]);

  inheritedSupervision().removeResult = ok(undefined);
  await startOnce();
  await startOnce();
  assert.equal(inheritedSupervision().calls.filter((call) => call === 'remove').length, 2);
  assert.ok(events().includes('worker.execution.record-removed'));
  assert.deepEqual(value(journal.removableRecords()), []);
});

test('the first pass logs its plan and every record no journal row names, once', async () => {
  inherit('pending');
  launchNothingNew();
  records = ok(['stray-1', EXECUTION]);
  await startOnce();
  await startOnce();
  const leftovers = sink.records.filter(({ event }) => event === 'worker.execution.leftover');
  assert.deepEqual(leftovers.map(({ fields }) => fields['record']), ['stray-1']);
  const planned = sink.records.filter(({ event }) => event === 'worker.reconciliation.planned');
  assert.deepEqual(planned.map(({ fields }) => [fields['inherited'], fields['seal-execution']]), [[1, 1]]);
});

test('a record listing that fails is reported, and reconciliation goes on', async () => {
  inherit('pending');
  launchNothingNew();
  records = err(failure('unavailable', 'the executions directory cannot be read'));
  await startOnce();
  assert.equal(failures.length, 1);
  assert.equal(inherited()?.state, 'not-started');
});

test('executions of this process are never reconciled as inherited', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  supervisions.onCreated = (supervision) => {
    supervision.facts = [{ problems: [], process: PROCESS, exit: CLEAN_EXIT }];
  };
  await startOnce();
  await startOnce();
  assert.ok(supervisions.all.every(({ calls }) => !calls.includes('recover')));
});
