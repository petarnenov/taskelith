import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { WorkerJournal } from '@taskelith/execution';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { id, value } from '@taskelith/testing';
import {
  LaunchOrchestrator,
  LOST_CONTACT_MILLISECONDS,
  WorkerContact,
  type LaunchContact,
  type LaunchOrchestratorOptions,
} from '@taskelith/worker';
import type { WorkerRoot } from '@taskelith/worker-journal';
import { flush, ManualTimers } from './contact-fakes.ts';
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
  unavailable,
} from './launch-fakes.ts';

let root: WorkerRoot;
let journal: WorkerJournal;
let remove: () => void;
let clock: FakeClock;
let authority: FakeAuthority;
let supervisions: FakeSupervisions;
let sink: InMemoryLogSink;
let timers: ManualTimers;
let controller: AbortController;
let contact: WorkerContact;
let options: LaunchOrchestratorOptions;

beforeEach(() => {
  ({ root, remove } = temporaryJournal());
  journal = root.journal;
  clock = new FakeClock();
  authority = new FakeAuthority();
  supervisions = new FakeSupervisions();
  sink = new InMemoryLogSink();
  timers = new ManualTimers();
  controller = new AbortController();
  contact = new WorkerContact({ sleep: timers.sleep, stopping: controller.signal });
  let ids = 0;
  options = {
    journal, authority, contact, supervision: supervisions.factory, clock, draw: () => 0.5, newId: () => `id-${(ids += 1)}`,
    // The launch's own delays advance the deadline clock and yield.
    sleep: async (milliseconds, signal) => {
      if (signal.aborted) return;
      clock.milliseconds += milliseconds;
      await new Promise((resolve) => setImmediate(resolve));
    },
    pollMilliseconds: 100,
    logger: new Logger(sink, { now: () => T0 }),
  };
});

afterEach(() => {
  controller.abort();
  remove();
});

function executions() {
  return value(journal.snapshot()).executions;
}

function outcomes(): Array<string | undefined> {
  return executions().flatMap(({ authorizations }) => authorizations.map(({ outcome }) => outcome));
}

test('an offline worker begins no authorization until its contact is online', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  supervisions.onCreated = (supervision) => {
    supervision.facts = [{ problems: [], process: PROCESS, exit: CLEAN_EXIT }];
  };
  const orchestrator = new LaunchOrchestrator(options);
  await orchestrator.pass(controller.signal);
  await flush();
  assert.deepEqual([authority.requests, executions()], [[], []]);
  const reading = clock.milliseconds;
  clock.milliseconds += 60_000;
  contact.linkUp();
  await orchestrator.settled();
  assert.equal(authority.requests.length, 1);
  assert.deepEqual(supervisions.all[0]?.plan?.deadline.milliseconds, reading + 60_000 + 25_000);
  assert.deepEqual(executions().map(({ state }) => state), ['exited']);
});

test('an operation begun online runs to its deadline offline; the next waits for contact', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [unavailable()];
  contact.linkUp();
  let wentOffline = false;
  authority.onRequest = () => {
    if (wentOffline) return;
    wentOffline = true;
    contact.linkDown();
    timers.elapse(LOST_CONTACT_MILLISECONDS);
  };
  const orchestrator = new LaunchOrchestrator(options);
  await orchestrator.pass(controller.signal);
  await flush();
  assert.equal(contact.offline, true);
  assert.deepEqual(outcomes(), ['expired']);
  const requests = authority.requests.length;
  assert.ok(requests > 1);
  assert.ok(authority.requests.every(({ operationId }) => operationId === authority.requests[0]?.operationId));
  authority.answers = [granted()];
  supervisions.onCreated = (supervision) => {
    supervision.facts = [{ problems: [], process: PROCESS, exit: CLEAN_EXIT }];
  };
  contact.linkUp();
  await orchestrator.settled();
  assert.deepEqual(outcomes(), ['expired', 'granted']);
  assert.equal(authority.requests[requests]?.reportsNotStarted, true);
});

test('contact lost before a wait\'s continuation runs holds W2 until online again', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  supervisions.onCreated = (supervision) => {
    supervision.facts = [{ problems: [], process: PROCESS, exit: CLEAN_EXIT }];
  };
  let offline = true;
  let waits = 0;
  let reconnect: () => void = () => undefined;
  const gate: LaunchContact = {
    get offline() {
      return offline;
    },
    whenOnline: async () => {
      waits += 1;
      if (waits > 1) return new Promise((resolve) => {
        reconnect = resolve;
      });
      offline = false;
      // The lost-contact callback, queued before the wait's continuation.
      queueMicrotask(() => {
        offline = true;
      });
    },
  };
  const orchestrator = new LaunchOrchestrator({ ...options, contact: gate });
  await orchestrator.pass(controller.signal);
  await flush();
  assert.deepEqual([waits, authority.requests, executions()], [2, [], []]);
  offline = false;
  reconnect();
  await orchestrator.settled();
  assert.deepEqual(executions().map(({ state }) => state), ['exited']);
});

test('a stop while offline journals nothing', async () => {
  value(journal.recordCommand(offer()));
  const orchestrator = new LaunchOrchestrator(options);
  await orchestrator.pass(controller.signal);
  controller.abort();
  await orchestrator.settled();
  assert.deepEqual([authority.requests, executions()], [[], []]);
});

test('a cancellation while offline ends the launch with no W2 and no request', async () => {
  value(journal.recordCommand(offer()));
  const orchestrator = new LaunchOrchestrator(options);
  await orchestrator.pass(controller.signal);
  value(journal.recordCommand(cancellation(1, { attemptId: 'attempt-1' })));
  await orchestrator.pass(controller.signal);
  await orchestrator.settled();
  await orchestrator.pass(controller.signal);
  assert.deepEqual([authority.requests, executions(), supervisions.all], [[], [], []]);
  assert.deepEqual(value(journal.snapshot()).cancellations.map(({ evidenceRecorded }) => evidenceRecorded), [true]);
});

test('a cancellation while offline after an expired operation seals with no new W2', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [unavailable()];
  contact.linkUp();
  authority.onRequest = () => {
    contact.linkDown();
    timers.elapse(LOST_CONTACT_MILLISECONDS);
  };
  const orchestrator = new LaunchOrchestrator(options);
  await orchestrator.pass(controller.signal);
  await flush();
  const requests = authority.requests.length;
  value(journal.recordCommand(cancellation(1, { attemptId: 'attempt-1' })));
  await orchestrator.pass(controller.signal);
  await orchestrator.settled();
  await orchestrator.pass(controller.signal);
  assert.deepEqual([authority.requests.length, outcomes()], [requests, ['expired']]);
  assert.deepEqual(executions().map(({ state }) => state), ['not-started']);
  assert.deepEqual(value(journal.snapshot()).cancellations.map(({ evidenceRecorded }) => evidenceRecorded), [true]);
});

// What an earlier process left: 1 pending its grant, 2 with its record
// written, 3 expired without a grant.
function inheritThree(): void {
  for (const number of [1, 2, 3]) {
    value(journal.recordCommand(offer(number)));
    value(journal.beginAuthorization(requestOf(`execution-${number}`, `operation-${number}`, number)));
  }
  value(journal.recordGrant(grantFor(requestOf('execution-2', 'operation-2', 2))));
  value(journal.recordExecutionRecordWritten(id('ExecutionId', 'execution-2')));
  value(journal.recordAuthorizationExpired(id('OperationId', 'operation-3')));
}

test('without a launch authority the start reconciles, removes records, and launches nothing', async () => {
  inheritThree();
  const { authority: _authority, ...reconciling } = options;
  const orchestrator = new LaunchOrchestrator(reconciling);
  contact.linkUp();
  for (let pass = 0; pass < 3; pass += 1) {
    await orchestrator.pass(controller.signal);
    await orchestrator.settled();
  }
  assert.deepEqual(executions().map(({ state }) => state), ['not-started', 'not-started', undefined]);
  assert.deepEqual(authority.requests, []);
  assert.deepEqual(supervisions.byExecution.get('execution-1')?.calls, ['seal']);
  assert.deepEqual(supervisions.byExecution.get('execution-2')?.calls, ['recover']);
  const deferred = sink.records.filter(({ event }) => event === 'worker.reconciliation.deferred').map(({ fields }) => fields);
  assert.deepEqual(deferred, [{ executionId: 'execution-3', reason: 'no launch command' }]);

  const sequence = value(journal.dueForPublication(T0)).at(-1)?.position.sequence;
  assert.ok(sequence !== undefined);
  value(journal.confirmThrough(sequence));
  await orchestrator.pass(controller.signal);
  assert.deepEqual(supervisions.byExecution.get('execution-2')?.calls, ['recover', 'remove']);
  assert.deepEqual(value(journal.removableRecords()), []);
});
