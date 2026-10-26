import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  LAUNCH_RETRY_DELAY,
  launchRejection,
  type ObservationFact,
  type WorkerJournal,
} from '@taskelith/execution';
import { err, failure, ok } from '@taskelith/kernel';
import { value } from '@taskelith/testing';
import { LaunchOrchestrator } from '@taskelith/worker';
import type { WorkerRoot } from '@taskelith/worker-journal';
import {
  CLEAN_EXIT,
  FakeAuthority,
  FakeClock,
  FakeSupervisions,
  PROCESS,
  T0,
  cancellation,
  granted,
  offer,
  temporaryJournal,
  unavailable,
} from './launch-fakes.ts';

let root: WorkerRoot;
let journal: WorkerJournal;
let remove: () => void;
let clock: FakeClock;
let authority: FakeAuthority;
let supervisions: FakeSupervisions;
let delays: number[];
let controller: AbortController;
let orchestrator: LaunchOrchestrator;

beforeEach(() => {
  ({ root, remove } = temporaryJournal());
  journal = root.journal;
  clock = new FakeClock();
  authority = new FakeAuthority();
  supervisions = new FakeSupervisions();
  delays = [];
  controller = new AbortController();
  let ids = 0;
  orchestrator = new LaunchOrchestrator({
    journal, authority, supervision: supervisions.factory, clock, draw: () => 0.5, newId: () => `id-${(ids += 1)}`,
    // Each sleep advances the clock and yields, so polling never spins; an
    // aborted signal returns at once, as the production sleep does.
    sleep: async (milliseconds, signal) => {
      if (signal.aborted) return;
      delays.push(milliseconds);
      clock.milliseconds += milliseconds;
      await new Promise((resolve) => setImmediate(resolve));
    },
    pollMilliseconds: 100,
  });
});

afterEach(() => {
  controller.abort();
  remove();
});

async function launchOnce(): Promise<void> {
  await orchestrator.pass(controller.signal);
  await orchestrator.settled();
}

// Waits a bounded number of turns of the event loop for the condition.
async function until(condition: () => boolean): Promise<void> {
  for (let turn = 0; !condition() && turn < 1_000; turn += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(condition(), 'the condition never held');
}

function stopAfterRequests(count: number): void {
  authority.onRequest = () => {
    if (authority.requests.length >= count) controller.abort();
  };
}

function facts(): ObservationFact[] {
  return value(journal.dueForPublication(T0)).map((entry) => entry.fact);
}

function factKinds(): string[] {
  return facts().map((fact) => fact.kind).filter((kind) => kind !== 'assignment-accepted');
}

function executions() {
  return value(journal.snapshot()).executions;
}

test('a grant is journaled, the record written, and the supervisor started; its facts reach the outbox', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  supervisions.onCreated = (supervision) => {
    supervision.facts = [{ problems: [] }, { problems: [], process: PROCESS }, { problems: [], process: PROCESS, exit: CLEAN_EXIT }];
  };
  await launchOnce();

  const [supervision] = supervisions.all;
  assert.deepEqual(supervision?.calls.slice(0, 2), ['prepare', 'start']);
  assert.deepEqual(supervision?.plan?.deadline, { bootId: 'boot-1', milliseconds: 1_000 + 25_000 });
  const [execution] = executions();
  assert.equal(execution?.state, 'exited');
  assert.equal(execution?.recordWritten, true);
  assert.deepEqual(execution?.authorizations.map(({ outcome }) => outcome), ['granted']);
  assert.deepEqual(factKinds(), ['execution-started', 'execution-exited']);
  const started = facts().find((fact) => fact.kind === 'execution-started');
  assert.deepEqual(started?.kind === 'execution-started' ? started.process : undefined, PROCESS);
});

test('a request without a decision is repeated with the same operation, backing off within [5 s, 60 s]', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [unavailable(), unavailable(), granted()];
  supervisions.onCreated = (supervision) => {
    supervision.facts = [{ problems: [], process: PROCESS, exit: CLEAN_EXIT }];
  };
  await launchOnce();

  assert.equal(authority.requests.length, 3);
  assert.equal(new Set(authority.requests.map(({ operationId }) => operationId)).size, 1);
  const backoff = delays.filter((delay) => delay >= LAUNCH_RETRY_DELAY.initialMilliseconds);
  assert.deepEqual(backoff, [7_500, 15_000]);
  assert.ok(backoff.every((delay) => delay <= LAUNCH_RETRY_DELAY.maximumMilliseconds));
  assert.equal(executions()[0]?.state, 'exited');
});

test('offline, nothing starts: past the deadline the operation expires and the same execution is asked again', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [unavailable()];
  stopAfterRequests(7);
  await launchOnce();

  const [only, ...others] = executions();
  assert.deepEqual(others, []);
  assert.equal(only?.state, undefined);
  // Past the first deadline, the delay of 60 s outlasts each new one.
  assert.deepEqual(only?.authorizations.map(({ outcome }) => outcome), ['expired', 'expired', 'expired', 'expired', 'pending']);
  const operations = authority.requests.map(({ operationId }) => operationId);
  assert.equal(new Set(operations.slice(0, 3)).size, 1);
  assert.notEqual(operations[3], operations[0]);
  assert.ok(authority.requests.every(({ executionId }) => executionId === only?.executionId));
  assert.deepEqual(authority.requests.map(({ reportsNotStarted }) => reportsNotStarted), [false, false, false, true, true, true, true]);
  assert.deepEqual(supervisions.all, []);
  assert.deepEqual(factKinds(), []);
});

test('a retryable rejection is retried under a new operation for the same execution', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [ok({ kind: 'rejected', rejection: launchRejection('quarantined', 'restore') }), granted()];
  supervisions.onCreated = (supervision) => {
    supervision.facts = [{ problems: [], process: PROCESS, exit: CLEAN_EXIT }];
  };
  await launchOnce();

  const [first, second] = authority.requests;
  assert.notEqual(first?.operationId, second?.operationId);
  assert.equal(first?.executionId, second?.executionId);
  assert.deepEqual(executions()[0]?.authorizations.map(({ outcome }) => outcome), ['rejected-retryable', 'granted']);
});

test('a final rejection is journaled with its observation and never retried', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [ok({ kind: 'rejected', rejection: launchRejection('gate-not-passed', 'gate') })];
  await launchOnce();

  assert.equal(authority.requests.length, 1);
  assert.deepEqual(factKinds(), ['launch-rejected']);
  assert.equal(supervisions.all.length, 0);
  await launchOnce();
  assert.equal(authority.requests.length, 1);
});

test('a revocation answered to a retry is a rejection with its reason', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [unavailable(), ok({ kind: 'revoked', reason: 'policy-revision-changed' })];
  await launchOnce();

  assert.deepEqual(executions()[0]?.authorizations.map(({ outcome, rejection }) => [outcome, rejection]), [
    ['rejected-final', 'policy-revision-changed'],
  ]);
  assert.deepEqual(factKinds(), ['launch-rejected']);
});

test('an expired answer closes its operation, and the same execution is authorized again', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [ok({ kind: 'expired' }), granted()];
  supervisions.onCreated = (supervision) => {
    supervision.facts = [{ problems: [], process: PROCESS, exit: CLEAN_EXIT }];
  };
  await launchOnce();

  const [execution] = executions();
  assert.deepEqual(executions().map(({ state }) => state), ['exited']);
  assert.deepEqual(execution?.authorizations.map(({ outcome }) => outcome), ['expired', 'granted']);
  assert.equal(authority.requests[1]?.reportsNotStarted, true);
  assert.deepEqual(factKinds(), ['execution-started', 'execution-exited']);
});

test('a grant that arrives after the deadline is journaled and never used', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  authority.onRequest = () => {
    if (authority.requests.length === 1) clock.milliseconds += 25_000;
    else controller.abort();
  };
  await launchOnce();

  const [first] = executions();
  assert.equal(first?.state, 'not-started');
  assert.deepEqual(first?.authorizations.map(({ outcome }) => outcome), ['granted']);
  assert.deepEqual(supervisions.all[0]?.calls, ['seal']);
  assert.equal(authority.requests.length, 2);
});

test('a reading from another boot never hands a grant out', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  authority.onRequest = () => {
    if (authority.requests.length === 1) clock.bootId = 'boot-2';
    else controller.abort();
  };
  await launchOnce();
  assert.equal(executions()[0]?.state, 'not-started');
  assert.ok(supervisions.all.every((supervision) => !supervision.calls.includes('prepare')));
});

test('an unreadable clock requests nothing', async () => {
  value(journal.recordCommand(offer()));
  clock.readable = false;
  await launchOnce();
  assert.equal(authority.requests.length, 0);
  assert.deepEqual(executions(), []);
});

test('a supervisor that seals reports not-started, and the intent is launched again', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  let launches = 0;
  supervisions.onCreated = (supervision) => {
    launches += 1;
    supervision.facts = launches === 1
      ? [{ problems: [], launch: { kind: 'seal', by: 'supervisor', reason: 'deadline-passed' } }]
      : [{ problems: [], process: PROCESS, exit: CLEAN_EXIT }];
  };
  await launchOnce();
  assert.deepEqual(executions().map(({ state }) => state), ['not-started', 'exited']);
});

test('a supervisor that cannot start is recovered from its record', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  let launches = 0;
  supervisions.onCreated = (supervision) => {
    launches += 1;
    if (launches === 1) supervision.startResult = err(failure('unavailable', 'no spawn'));
    supervision.facts = [{ problems: [], process: PROCESS, exit: CLEAN_EXIT }];
  };
  await launchOnce();
  assert.deepEqual(supervisions.all[0]?.calls, ['prepare', 'start', 'recover']);
  assert.deepEqual(executions().map(({ state }) => state), ['not-started', 'exited']);
});

test('a recovered exit is reported, and a recovery that adopts keeps observing', async () => {
  value(journal.recordCommand(offer()));
  value(journal.recordCommand(offer(2)));
  authority.answers = [granted()];
  let launches = 0;
  supervisions.onCreated = (supervision) => {
    launches += 1;
    supervision.startResult = err(failure('unavailable', 'no spawn'));
    supervision.recovery = launches === 1 ? { fact: 'exited', exit: { ...CLEAN_EXIT, startProven: false } } : { fact: 'observe' };
    supervision.facts = [{ problems: [], process: PROCESS, exit: CLEAN_EXIT }];
  };
  await launchOnce();
  assert.deepEqual(executions().map(({ state }) => state), ['exited', 'exited']);
});

test('a corrupt record is reported uncertain once, and the launch stops', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  supervisions.onCreated = (supervision) => {
    supervision.facts = [{ problems: [{ file: 'handle', kind: 'corrupt', detail: 'bad json' }] }];
  };
  await launchOnce();
  assert.deepEqual(factKinds(), ['execution-uncertain']);
  assert.equal(executions()[0]?.state, 'authorized');
  assert.equal(executions()[0]?.uncertain, true);
});

test('a failed record write abandons the execution before W4', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  let launches = 0;
  supervisions.onCreated = (supervision) => {
    launches += 1;
    if (launches === 1) supervision.prepareResult = err(failure('unavailable', 'disk'));
    supervision.facts = [{ problems: [], process: PROCESS, exit: CLEAN_EXIT }];
  };
  await launchOnce();
  assert.deepEqual(executions().map(({ state, recordWritten }) => [state, recordWritten]), [['not-started', false], ['exited', true]]);
});

test('a cancellation during authorization stops the launch, seals it, and then records its evidence', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [unavailable()];
  let cancelling: Promise<void> = Promise.resolve();
  authority.onRequest = () => {
    if (authority.requests.length === 1) {
      value(journal.recordCommand(cancellation(1, { attemptId: 'attempt-1' })));
      cancelling = orchestrator.pass(controller.signal);
    }
  };
  await launchOnce();
  await cancelling;
  assert.equal(authority.requests.length, 1);
  assert.equal(executions()[0]?.state, 'not-started');
  assert.equal(value(journal.snapshot()).cancellations[0]?.evidenceRecorded, false);

  await launchOnce();
  assert.equal(value(journal.snapshot()).cancellations[0]?.evidenceRecorded, true);
  assert.equal(authority.requests.length, 1);
});

test('a cancellation after W4 writes the cancel file; evidence waits for the exit', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  let release: () => void = () => undefined;
  const exited = new Promise<void>((resolve) => {
    release = resolve;
  });
  supervisions.onCreated = (supervision) => {
    supervision.facts = [{ problems: [], process: PROCESS }];
    void exited.then(() => {
      supervision.facts = [{ problems: [], process: PROCESS, exit: { ...CLEAN_EXIT, status: { kind: 'signal', signal: 'SIGTERM' } } }];
    });
  };
  await orchestrator.pass(controller.signal);
  await until(() => executions()[0]?.state === 'started');

  value(journal.recordCommand(cancellation(1, { executionId: executions()[0]?.executionId ?? '' })));
  await orchestrator.pass(controller.signal);
  await until(() => supervisions.all[0]?.cancelled !== undefined);
  assert.equal(value(journal.snapshot()).cancellations[0]?.evidenceRecorded, false);

  release();
  await orchestrator.settled();
  await orchestrator.pass(controller.signal);
  assert.equal(executions()[0]?.state, 'exited');
  assert.equal(value(journal.snapshot()).cancellations[0]?.evidenceRecorded, true);
});

test('cancellation names a superseded execution: the launch stops before evidence is recorded', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [granted(), unavailable()];
  let launches = 0;
  supervisions.onCreated = (supervision) => {
    launches += 1;
    if (launches === 1) supervision.facts = [{ problems: [], launch: { kind: 'seal', by: 'supervisor', reason: 'deadline-passed' } }];
  };
  await orchestrator.pass(controller.signal);
  await until(() => authority.requests.length >= 2);
  const [superseded, current] = executions();
  assert.equal(superseded?.state, 'not-started');
  assert.notEqual(current?.executionId, superseded?.executionId);

  value(journal.recordCommand(cancellation(1, { executionId: superseded?.executionId ?? '' })));
  await orchestrator.pass(controller.signal);
  assert.equal(value(journal.snapshot()).cancellations[0]?.evidenceRecorded, false);
  await orchestrator.settled();
  assert.equal(executions()[1]?.state, 'not-started');
  await orchestrator.pass(controller.signal);
  assert.equal(value(journal.snapshot()).cancellations[0]?.evidenceRecorded, true);
  assert.equal(executions().length, 2);
});

test('a cancellation names an execution a stopped launch left open: its cancel file is written', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  supervisions.onCreated = (supervision) => {
    supervision.facts = [{ problems: [], process: PROCESS }];
  };
  await orchestrator.pass(controller.signal);
  await until(() => executions()[0]?.state === 'started');
  controller.abort();
  await orchestrator.settled();

  controller = new AbortController();
  value(journal.recordCommand(cancellation(1, { executionId: executions()[0]?.executionId ?? '' })));
  await orchestrator.pass(controller.signal);
  await orchestrator.pass(controller.signal);
  assert.equal(supervisions.all[0]?.calls.filter((call) => call === 'cancel').length, 1);
  assert.equal(value(journal.snapshot()).cancellations[0]?.evidenceRecorded, false);
});

test('a seal lost to a claim before W4 is reported uncertain', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  supervisions.onCreated = (supervision) => {
    supervision.prepareResult = err(failure('unavailable', 'disk'));
    supervision.launch = { kind: 'claim', launchAuthId: 'unknown', supervisor: 1 };
  };
  await launchOnce();
  assert.deepEqual(factKinds(), ['execution-uncertain']);
  assert.equal(executions()[0]?.recordWritten, true);
});

test('a launch that throws is reported and ends; the orchestrator keeps running', async () => {
  const failures: unknown[] = [];
  let ids = 0;
  orchestrator = new LaunchOrchestrator({
    journal, authority, supervision: supervisions.factory, clock, draw: () => 0, newId: () => `id-${(ids += 1)}`,
    sleep: async () => new Promise((resolve) => setImmediate(resolve)), onFailure: (error) => failures.push(error),
  });
  value(journal.recordCommand(offer()));
  authority.authorize = async () => {
    throw new Error('broken client');
  };
  await launchOnce();
  assert.equal(failures.length, 1);
});

test('a cancellation after a final rejection records its evidence', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [ok({ kind: 'rejected', rejection: launchRejection('gate-not-passed', 'gate') })];
  await launchOnce();
  assert.equal(executions()[0]?.state, undefined);

  value(journal.recordCommand(cancellation(1, { attemptId: 'attempt-1' })));
  await launchOnce();
  assert.equal(value(journal.snapshot()).cancellations[0]?.evidenceRecorded, true);
});

test('a cancellation of an execution with a pending W2 and no live launch waits for the next start's seal', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [unavailable()];
  stopAfterRequests(1);
  await launchOnce();
  controller = new AbortController();

  value(journal.recordCommand(cancellation(1, { attemptId: 'attempt-1' })));
  await launchOnce();
  assert.equal(value(journal.snapshot()).cancellations[0]?.evidenceRecorded, false);
});

test('a commit that fails without changing the decision is reported', async () => {
  const failures: unknown[] = [];
  let ids = 0;
  orchestrator = new LaunchOrchestrator({
    journal, authority, supervision: supervisions.factory, clock, draw: () => 0, newId: () => `id-${(ids += 1)}`,
    sleep: async () => new Promise((resolve) => setImmediate(resolve)), onFailure: (error) => failures.push(error),
  });
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  supervisions.onCreated = (supervision) => {
    supervision.facts = [{ problems: [], process: PROCESS, exit: CLEAN_EXIT }];
  };
  const recordExit = journal.recordExit.bind(journal);
  journal.recordExit = () => err(failure('unavailable', 'the disk is full'));
  await launchOnce();
  journal.recordExit = recordExit;
  assert.deepEqual(failures.map((failed) => (failed as { message: string }).message), ['the disk is full']);
});

test('an existing cancel file counts as forwarded', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  supervisions.onCreated = (supervision) => {
    supervision.facts = [{ problems: [], process: PROCESS }];
    supervision.cancel = async (reason) => {
      supervision.calls.push('cancel');
      supervision.cancelled = reason;
      return err(failure('conflict', 'cancel exists'));
    };
  };
  await orchestrator.pass(controller.signal);
  await until(() => executions()[0]?.state === 'started');
  controller.abort();
  await orchestrator.settled();

  controller = new AbortController();
  value(journal.recordCommand(cancellation(1, { executionId: executions()[0]?.executionId ?? '' })));
  await orchestrator.pass(controller.signal);
  await orchestrator.pass(controller.signal);
  assert.equal(supervisions.all[0]?.calls.filter((call) => call === 'cancel').length, 1);
});

test('a cancel file that cannot be written is retried at the poll interval, never in a hot loop', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  supervisions.onCreated = (supervision) => {
    supervision.facts = [{ problems: [], process: PROCESS }];
    supervision.cancel = async () => {
      supervision.calls.push('cancel');
      if (supervision.calls.filter((call) => call === 'cancel').length === 3) {
        supervision.facts = [{ problems: [], process: PROCESS, exit: CLEAN_EXIT }];
      }
      return err(failure('unavailable', 'the record is not writable'));
    };
  };
  await orchestrator.pass(controller.signal);
  await until(() => executions()[0]?.state === 'started');
  const polls = delays.length;
  value(journal.recordCommand(cancellation(1, { attemptId: 'attempt-1' })));
  await orchestrator.pass(controller.signal);
  await orchestrator.settled();

  const calls = supervisions.all[0]?.calls ?? [];
  assert.equal(calls.filter((call) => call === 'cancel').length, 3);
  assert.equal(delays.length - polls, 2);
  assert.equal(executions()[0]?.state, 'exited');
});

test('a spawn claimed under another grant is reported uncertain, never as a start', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  supervisions.onCreated = (supervision) => {
    supervision.facts = [{ problems: [], process: PROCESS, launch: { kind: 'claim', launchAuthId: 'another-grant', supervisor: 1 } }];
  };
  await launchOnce();
  assert.deepEqual(factKinds(), ['execution-uncertain']);
});

test('a cancellation after a retryable rejection of a stopped launch records its evidence', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [ok({ kind: 'rejected', rejection: launchRejection('quarantined', 'restore') })];
  // The worker stops during the delay before the retry, after W3.
  authority.onRequest = () => void setImmediate(() => controller.abort());
  await launchOnce();
  assert.deepEqual(executions()[0]?.authorizations.map(({ outcome }) => outcome), ['rejected-retryable']);
  controller = new AbortController();

  value(journal.recordCommand(cancellation(1, { attemptId: 'attempt-1' })));
  await launchOnce();
  assert.equal(value(journal.snapshot()).cancellations[0]?.evidenceRecorded, true);
});

test('a failed record read ends the launch and is reported', async () => {
  const failures: unknown[] = [];
  let ids = 0;
  orchestrator = new LaunchOrchestrator({
    journal, authority, supervision: supervisions.factory, clock, draw: () => 0, newId: () => `id-${(ids += 1)}`,
    sleep: async () => new Promise((resolve) => setImmediate(resolve)), onFailure: (error) => failures.push(error),
  });
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  supervisions.onCreated = (supervision) => {
    supervision.read = async () => err(failure('unavailable', 'the record cannot be read'));
  };
  await launchOnce();
  assert.deepEqual(failures.map((failed) => (failed as { message: string }).message), ['the record cannot be read']);
});

function reportingOrchestrator(failures: unknown[]): LaunchOrchestrator {
  let ids = 0;
  return new LaunchOrchestrator({
    journal, authority, supervision: supervisions.factory, clock, draw: () => 0, newId: () => `id-${(ids += 1)}`,
    sleep: async () => new Promise((resolve) => setImmediate(resolve)), onFailure: (error) => failures.push(error),
  });
}

test('a failed seal is reported and ends the launch', async () => {
  const failures: unknown[] = [];
  orchestrator = reportingOrchestrator(failures);
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  authority.onRequest = () => {
    clock.milliseconds += 25_000;
  };
  supervisions.onCreated = (supervision) => {
    supervision.sealResult = err(failure('unavailable', 'the seal cannot be written'));
  };
  await launchOnce();
  assert.deepEqual(failures.map((failed) => (failed as { message: string }).message), ['the seal cannot be written']);
  assert.equal(authority.requests.length, 1);
  assert.equal(executions()[0]?.state, 'authorized');
});

test('a failed recovery is reported and ends the launch', async () => {
  const failures: unknown[] = [];
  orchestrator = reportingOrchestrator(failures);
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  supervisions.onCreated = (supervision) => {
    supervision.startResult = err(failure('unavailable', 'no spawn'));
    supervision.recoverResult = err(failure('unavailable', 'the record cannot be recovered'));
  };
  await launchOnce();
  assert.deepEqual(failures.map((failed) => (failed as { message: string }).message), ['the record cannot be recovered']);
  assert.equal(authority.requests.length, 1);
  assert.equal(executions()[0]?.state, 'authorized');
});

test('a spawn without a claim is reported uncertain, never as a start', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  supervisions.onCreated = (supervision) => {
    supervision.claimSpawns = false;
    supervision.facts = [{ problems: [], process: PROCESS }];
  };
  await launchOnce();
  assert.deepEqual(factKinds(), ['execution-uncertain']);
});

test('a cancellation journaled before any launch records its evidence and launches nothing', async () => {
  value(journal.recordCommand(offer()));
  value(journal.recordCommand(cancellation(1, { attemptId: 'attempt-1' })));
  await launchOnce();
  assert.equal(authority.requests.length, 0);
  assert.equal(value(journal.snapshot()).cancellations[0]?.evidenceRecorded, true);
});

test('an execution an earlier process left pending is not launched again', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [unavailable()];
  stopAfterRequests(1);
  await launchOnce();
  assert.equal(executions()[0]?.state, undefined);

  controller = new AbortController();
  await launchOnce();
  assert.equal(authority.requests.length, 1);
});

test('run passes until aborted and waits for its launches', async () => {
  value(journal.recordCommand(offer()));
  authority.answers = [unavailable()];
  stopAfterRequests(2);
  await orchestrator.run(controller.signal);
  assert.equal(authority.requests.length, 2);
  orchestrator.notify();
});
