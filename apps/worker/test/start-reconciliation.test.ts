import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { launchRejection, SPACE_REFUSAL_REASON, type WorkerJournal } from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { id, value } from '@taskelith/testing';
import { LaunchOrchestrator, LIVENESS_POLLS } from '@taskelith/worker';
import type { WorkerRoot } from '@taskelith/worker-journal';
import {
  CLEAN_EXIT,
  FakeAuthority,
  FakeClock,
  FakePressure,
  FakeSupervisions,
  PROCESS,
  T0,
  cancellation,
  grantFor,
  granted,
  grantedToOwner,
  offer,
  requestOf,
  temporaryJournal,
} from './launch-fakes.ts';

const EXECUTION = id('ExecutionId', 'inherited-1');

let root: WorkerRoot;
let journal: WorkerJournal;
let remove: () => void;
let clock: FakeClock;
let authority: FakeAuthority;
let pressure: FakePressure;
let supervisions: FakeSupervisions;
let sink: InMemoryLogSink;
let records: Result<readonly string[]>;
let failures: unknown[];
// Journal methods whose next call fails, once each.
let failing: Set<string>;
// Journal methods refused for lack of space this many times before they
// commit, and what each refusal also does.
let spaceRefusals: Map<string, number>;
let onSpaceRefused: () => void;
let controller: AbortController;
let orchestrator: LaunchOrchestrator;

beforeEach(() => {
  ({ root, remove } = temporaryJournal());
  journal = root.journal;
  clock = new FakeClock();
  authority = new FakeAuthority();
  pressure = new FakePressure();
  supervisions = new FakeSupervisions();
  sink = new InMemoryLogSink();
  records = ok([]);
  failures = [];
  failing = new Set();
  spaceRefusals = new Map();
  onSpaceRefused = () => undefined;
  controller = new AbortController();
  let ids = 0;
  orchestrator = new LaunchOrchestrator({
    journal: failingOnce(journal), authority, supervision: supervisions.factory, clock, pressure, draw: () => 0.5, newId: () => `id-${(ids += 1)}`,
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

// The journal, except that each method named in `failing` fails once, and
// each in `spaceRefusals` is refused for lack of space.
function failingOnce(real: WorkerJournal): WorkerJournal {
  return new Proxy(real, {
    get(target, property: string) {
      const member = Reflect.get(target, property) as unknown;
      if (typeof member !== 'function') return member;
      if ((spaceRefusals.get(property) ?? 0) > 0) return () => refusedForSpace(property);
      if (!failing.delete(property)) return member.bind(target);
      return () => err(failure('unavailable', `${property} failed`));
    },
  });
}

function refusedForSpace(method: string): Result<never> {
  spaceRefusals.set(method, (spaceRefusals.get(method) ?? 0) - 1);
  onSpaceRefused();
  return err(failure('unavailable', `${method} refused for lack of space`, { reason: SPACE_REFUSAL_REASON }));
}

function spaceBackoffs(): unknown[] {
  return sink.records.filter(({ event }) => event === 'worker.journal.space-refused').map(({ fields }) => fields['delayMilliseconds']);
}

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

for (const until of ['pending', 'granted'] as const) {
  test(`a ${until} W2 sealed on start is reported with the new execution, which runs to its exit`, async () => {
    inherit(until);
    authority.answers = [grantedToOwner(EXECUTION)];
    supervisions.onCreated = (supervision) => {
      supervision.facts = [{ problems: [], process: PROCESS, exit: CLEAN_EXIT }];
    };
    await startOnce();
    await startOnce();
    assert.deepEqual(authority.requests[0]?.reportsNotStartedFor, [{ executionId: EXECUTION, operationId: 'operation-1' }]);
    assert.deepEqual(value(journal.snapshot()).executions.map(({ state }) => state), ['not-started', 'exited']);
  });
}

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
    supervision.facts = [{ problems: [], exit: { status: { kind: 'unknown' }, startProven: false, termination: 'boot-changed' } }];
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

test('a granted execution sealed at runtime and a pending W2 after it are both reported with the next one', async () => {
  inherit('granted');
  value(journal.recordNotStarted(EXECUTION));
  const relaunch = requestOf('relaunch-2', 'operation-2');
  value(journal.beginAuthorization(relaunch));
  authority.answers = [grantedToOwner(EXECUTION)];
  supervisions.onCreated = (supervision) => {
    supervision.facts = [{ problems: [], process: PROCESS, exit: CLEAN_EXIT }];
  };
  await startOnce();
  await startOnce();
  const reported = [{ executionId: EXECUTION, operationId: 'operation-1' }, { executionId: relaunch.executionId, operationId: 'operation-2' }];
  assert.deepEqual(authority.requests[0]?.reportsNotStartedFor, reported);
  assert.deepEqual(value(journal.snapshot()).executions.map(({ state }) => state), ['not-started', 'not-started', 'exited']);
});

test('a resumed execution reports the sealed one, whose not-started has not reached the authority', async () => {
  inherit('granted');
  value(journal.recordNotStarted(EXECUTION));
  const resumed = requestOf('resumed-2', 'operation-2');
  value(journal.beginAuthorization(resumed));
  value(journal.recordAuthorizationExpired(resumed.operationId));
  authority.answers = [grantedToOwner(EXECUTION)];
  supervisions.onCreated = (supervision) => {
    supervision.facts = [{ problems: [], process: PROCESS, exit: CLEAN_EXIT }];
  };
  await startOnce();
  assert.equal(authority.requests[0]?.executionId, resumed.executionId);
  assert.deepEqual(authority.requests[0]?.reportsNotStartedFor, [{ executionId: EXECUTION, operationId: 'operation-1' }]);
  assert.deepEqual(value(journal.snapshot()).executions.map(({ state }) => state), ['not-started', 'exited']);
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

test('survivors that cannot be listed are still reported once as termination-unproven', async () => {
  inherit('written');
  supervisions.onCreated = (supervision) => {
    supervision.recovery = { fact: 'observe' };
    const reported = {
      problems: [], process: PROCESS, survivors: [],
      launch: { kind: 'claim' as const, launchAuthId: id('LaunchAuthId', 'grant-operation-1'), supervisor: 2 },
    };
    supervision.facts = [reported, reported, { ...reported, exit: CLEAN_EXIT }];
  };
  await startOnce();
  assert.deepEqual(factKinds(), ['execution-started', 'termination-unproven', 'execution-exited']);
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

function claimedBy(supervisor: number) {
  return { kind: 'claim' as const, launchAuthId: id('LaunchAuthId', 'grant-operation-1'), supervisor };
}

test('evidence that fails to commit holds the exit back until it is committed', async () => {
  inherit('written');
  value(journal.recordCommand(cancellation(1, { executionId: EXECUTION })));
  failing = new Set(['recordTerminationUnproven', 'recordCancellationNotApplied']);
  supervisions.onCreated = (supervision) => {
    supervision.recovery = { fact: 'observe' };
    const ended = { problems: [], process: PROCESS, survivors: [PROCESS], cancellationNotApplied: true, launch: claimedBy(2), exit: CLEAN_EXIT };
    supervision.facts = [ended];
  };
  await startOnce();
  assert.equal(failures.length, 2);
  assert.deepEqual(factKinds(), [
    'execution-started', 'termination-unproven', 'cancellation-not-applied', 'execution-exited',
  ]);
});

test('a cancellation journaled later in the same watch gets its own not-applied report', async () => {
  inherit('written');
  value(journal.recordCommand(cancellation(1, { executionId: EXECUTION })));
  supervisions.onCreated = (supervision) => {
    supervision.recovery = { fact: 'observe' };
    const reported = { problems: [], process: PROCESS, cancellationNotApplied: true, launch: claimedBy(2) };
    supervision.facts = [reported, reported, { ...reported, exit: CLEAN_EXIT }];
    const read = supervision.read.bind(supervision);
    let reads = 0;
    supervision.read = async () => {
      reads += 1;
      if (reads === 2) value(journal.recordCommand(cancellation(2, { executionId: EXECUTION })));
      return read();
    };
  };
  await startOnce();
  const notApplied = value(journal.dueForPublication(T0)).flatMap(({ fact }) => fact.kind === 'cancellation-not-applied' ? [fact.commandId] : []);
  assert.deepEqual(notApplied, ['cancel-1', 'cancel-2']);
});

test('a supervisor replaced by a new adopter is logged as lost, and the watch goes on', async () => {
  inherit('written');
  launchNothingNew();
  supervisions.onCreated = (supervision) => {
    supervision.recoveries = [{ fact: 'observe' }, { fact: 'adopted' }];
    supervision.recovery = { fact: 'observe' };
    const running = { problems: [], process: PROCESS, launch: claimedBy(1) };
    supervision.facts = Array.from({ length: LIVENESS_POLLS }, () => running);
    supervision.facts.push({ ...running, exit: CLEAN_EXIT });
  };
  await startOnce();
  assert.equal(inherited()?.state, 'exited');
  const lost = sink.records.find(({ event }) => event === 'worker.supervisor.lost');
  assert.equal(lost?.fields['fact'], 'adopted');
});

test('a fact refused for lack of space is derived again after the backoff and committed once', async () => {
  inherit('written');
  spaceRefusals = new Map([['recordStart', 1], ['recordExit', 2]]);
  supervisions.onCreated = (supervision) => {
    supervision.recovery = { fact: 'observe' };
    supervision.facts = [{ problems: [], process: PROCESS, launch: claimedBy(2) }, { problems: [], process: PROCESS, exit: CLEAN_EXIT, launch: claimedBy(2) }];
  };
  await startOnce();
  assert.equal(inherited()?.state, 'exited');
  assert.deepEqual(factKinds(), ['execution-started', 'execution-exited']);
  assert.deepEqual(failures, [], 'a refusal for space is retried, not reported');
  assert.deepEqual(spaceBackoffs(), [7_500, 15_000, 30_000]);
  assert.equal(inheritedSupervision().calls.filter((call) => call === 'read').length, 4, 'each retry reads the record again');
});

test('a recovered fact refused for lack of space is recovered and committed again', async () => {
  inherit('written');
  launchNothingNew();
  spaceRefusals = new Map([['recordNotStarted', 1]]);
  supervisions.onCreated = (supervision) => {
    supervision.recovery = { fact: 'not-started' };
  };
  await startOnce();
  assert.equal(inherited()?.state, 'not-started');
  assert.deepEqual(factKinds(), ['execution-not-started']);
  assert.deepEqual(inheritedSupervision().rounds, ['first', 'first']);
  assert.deepEqual([failures, spaceBackoffs()], [[], [7_500]]);
});

test('a stop ends the retries of a fact refused for lack of space, which stays in its record', async () => {
  inherit('written');
  let refused = 0;
  spaceRefusals = new Map([['recordExit', Number.POSITIVE_INFINITY]]);
  onSpaceRefused = () => {
    refused += 1;
    if (refused === 3) controller.abort();
  };
  supervisions.onCreated = (supervision) => {
    supervision.recovery = { fact: 'observe' };
    supervision.facts = [{ problems: [], process: PROCESS, exit: CLEAN_EXIT, launch: claimedBy(2) }];
  };
  await startOnce();
  assert.notEqual(inherited()?.state, 'exited');
  assert.deepEqual(factKinds(), ['execution-started']);
  assert.deepEqual([failures, spaceBackoffs().length], [[], 3]);
});

for (const refusals of [1, 3]) {
  test(`a pending W2 sealed on start commits not-started after ${refusals} refusal(s) for space`, async () => {
    inherit('pending');
    launchNothingNew();
    spaceRefusals = new Map([['recordNotStarted', refusals]]);
    await startOnce();
    assert.equal(inherited()?.state, 'not-started');
    assert.deepEqual(factKinds(), ['execution-not-started']);
    assert.deepEqual([failures, spaceBackoffs()], [[], [7_500, 15_000, 30_000].slice(0, refusals)]);
  });

  test(`an unused grant lost to a claim commits W4 and uncertain after ${refusals} refusal(s) for space`, async () => {
    inherit('granted');
    launchNothingNew();
    spaceRefusals = new Map([['recordExecutionRecordWritten', refusals], ['recordUncertain', refusals]]);
    supervisions.onCreated = (supervision) => {
      supervision.launch = claimedBy(1);
    };
    await startOnce();
    assert.deepEqual([inherited()?.recordWritten, inherited()?.uncertain], [true, true]);
    assert.deepEqual([failures, spaceBackoffs().length], [[], 2 * refusals]);
  });

  test(`a recovered uncertain is committed after ${refusals} refusal(s) for space`, async () => {
    inherit('written');
    launchNothingNew();
    spaceRefusals = new Map([['recordUncertain', refusals]]);
    supervisions.onCreated = (supervision) => {
      supervision.recovery = { fact: 'uncertain', reason: 'the record is damaged' };
    };
    await startOnce();
    assert.equal(inherited()?.uncertain, true);
    assert.deepEqual(factKinds(), ['execution-uncertain']);
    assert.deepEqual([failures, spaceBackoffs().length], [[], refusals]);
  });
}

// A launch of this process whose supervisor cannot be prepared, so it
// seals its own execution; the next launch stops at its request.
function launchThatSeals(seal?: ReturnType<typeof claimedBy>): void {
  value(journal.recordCommand(offer()));
  authority.answers = [granted()];
  authority.onRequest = () => {
    if (authority.requests.length >= 2) controller.abort();
  };
  supervisions.onCreated = (supervision) => {
    supervision.prepareResult = err(failure('unavailable', 'no record directory'));
    if (seal !== undefined) supervision.launch = seal;
  };
}

test('a live launch commits not-started after its own seal despite refusals for space', async () => {
  launchThatSeals();
  spaceRefusals = new Map([['recordNotStarted', 2]]);
  await startOnce();
  const [first] = value(journal.snapshot()).executions;
  assert.equal(first?.state, 'not-started');
  assert.equal(authority.requests.length, 2, 'the launch went on with a new execution');
  assert.deepEqual([failures, spaceBackoffs()], [[], [7_500, 15_000]]);
});

test('a live launch whose seal lost to a claim commits W4 and uncertain despite refusals for space', async () => {
  launchThatSeals({ kind: 'claim', launchAuthId: id('LaunchAuthId', 'grant-id-2'), supervisor: 1 });
  spaceRefusals = new Map([['recordExecutionRecordWritten', 1], ['recordUncertain', 2]]);
  await startOnce();
  const [first] = value(journal.snapshot()).executions;
  assert.deepEqual([first?.recordWritten, first?.uncertain], [true, true]);
  assert.equal(authority.requests.length, 1, 'an uncertain execution ends the launch');
  assert.deepEqual([failures, spaceBackoffs().length], [[], 3]);
});

// A launch of this process that runs its execution to a clean exit.
function launchToExit(answers: FakeAuthority['answers']): void {
  value(journal.recordCommand(offer()));
  authority.answers = answers;
  supervisions.onCreated = (supervision) => {
    supervision.facts = [{ problems: [], process: PROCESS, exit: CLEAN_EXIT }];
  };
}

function onlyExecution() {
  const executions = value(journal.snapshot()).executions;
  assert.equal(executions.length, 1, 'the same execution is kept');
  return executions[0]!;
}

test('a W2 refused for space is retried before any request, for the same operation', async () => {
  launchToExit([granted()]);
  spaceRefusals = new Map([['beginAuthorization', 2]]);
  const pendingAtRequest: boolean[] = [];
  authority.onRequest = () => {
    pendingAtRequest.push(value(journal.snapshot()).executions.length === 1);
  };
  await startOnce();
  assert.deepEqual(pendingAtRequest, [true], 'the one request followed the commit of W2');
  const execution = onlyExecution();
  assert.deepEqual([execution.state, execution.authorizations.length], ['exited', 1]);
  assert.equal(authority.requests[0]?.operationId, execution.authorizations[0]?.operationId);
  assert.deepEqual([failures, spaceBackoffs()], [[], [7_500, 15_000]]);
});

test('a grant refused for space is retried, and the supervisor starts only after it commits', async () => {
  launchToExit([granted()]);
  spaceRefusals = new Map([['recordGrant', 2]]);
  await startOnce();
  const execution = onlyExecution();
  assert.deepEqual([execution.state, execution.authorizations.map(({ outcome }) => outcome)], ['exited', ['granted']]);
  assert.deepEqual(supervisions.all[0]?.calls.slice(0, 2), ['prepare', 'start']);
  assert.deepEqual([failures, spaceBackoffs().length, authority.requests.length], [[], 2, 1]);
});

test('a W4 refused for space is retried before the supervisor starts, not left unhandled', async () => {
  launchToExit([granted()]);
  let startedBeforeW4 = false;
  spaceRefusals = new Map([['recordExecutionRecordWritten', 2]]);
  onSpaceRefused = () => {
    startedBeforeW4 ||= supervisions.all[0]?.calls.includes('start') === true;
  };
  await startOnce();
  const execution = onlyExecution();
  assert.deepEqual([execution.state, execution.recordWritten, startedBeforeW4], ['exited', true, false]);
  assert.deepEqual([failures, spaceBackoffs().length], [[], 2]);
});

test('a rejection and an expiry refused for space are retried, and the execution is authorized again', async () => {
  launchToExit([ok({ kind: 'rejected', rejection: launchRejection('quarantined', 'restore') }), ok({ kind: 'expired' }), granted()]);
  spaceRefusals = new Map([['recordLaunchRejection', 1], ['recordAuthorizationExpired', 2]]);
  await startOnce();
  const execution = onlyExecution();
  assert.equal(execution.state, 'exited');
  assert.deepEqual(execution.authorizations.map(({ outcome }) => outcome), ['rejected-retryable', 'expired', 'granted']);
  assert.deepEqual([failures, spaceBackoffs().length, authority.requests.length], [[], 3, 3]);
});

test('cancellation evidence refused for space is held back for its backoff, then committed', async () => {
  value(journal.recordCommand(offer()));
  value(journal.recordCommand(cancellation(1, { attemptId: 'attempt-1' })));
  spaceRefusals = new Map([['recordCancellationEvidence', 1]]);
  const recorded = () => value(journal.snapshot()).cancellations[0]?.evidenceRecorded;
  await startOnce();
  await startOnce();
  assert.equal(recorded(), false, 'no pass tries it again within the backoff');
  clock.milliseconds += 7_500;
  await startOnce();
  assert.equal(recorded(), true);
  assert.deepEqual([failures, spaceBackoffs(), authority.requests.length], [[], [7_500], 0]);
});

test('a record removal refused for space is held back for its backoff, then committed', async () => {
  inherit('written');
  launchNothingNew();
  supervisions.onCreated = (supervision) => {
    supervision.recovery = { fact: 'not-started' };
  };
  await startOnce();
  value(journal.confirmThrough(value(journal.dueForPublication(T0)).at(-1)!.position.sequence));
  spaceRefusals = new Map([['recordRecordRemoved', 1]]);
  await startOnce();
  await startOnce();
  const removals = () => inheritedSupervision().calls.filter((call) => call === 'remove').length;
  assert.deepEqual([removals(), value(journal.removableRecords())], [1, [EXECUTION]]);
  clock.milliseconds += 7_500;
  await startOnce();
  assert.deepEqual([removals(), value(journal.removableRecords())], [2, []]);
  assert.deepEqual([failures, spaceBackoffs()], [[], [7_500]]);
});
