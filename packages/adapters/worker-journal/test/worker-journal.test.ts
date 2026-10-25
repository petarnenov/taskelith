import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, test } from 'node:test';
import { err, failure, parseInstant, type Failure } from '@taskelith/kernel';
import { parseSequence, type ExecutionId, type JournaledCommand, type OperationId, type WorkerJournal } from '@taskelith/execution';
import {
  REPUBLICATION_BOUND_MS,
  SqliteWorkerJournal,
  enrollWorkerRoot,
  failureReason,
  observationIdOf,
  openWorkerRoot,
  type JournalDatabase,
  type WorkerRoot,
} from '@taskelith/worker-journal';
import { BINDING, CLOCK, T0, assignment, digest, failed, grantFor, id, intent, launchRequest, rootOptions, temporaryDataRoot, value } from './fixtures.ts';

let root: WorkerRoot;
let journal: WorkerJournal;
let remove: () => void;

const EXECUTION = id('ExecutionId', 'execution-1');
const OPERATION = id('OperationId', 'operation-1');

beforeEach(() => {
  const temporary = temporaryDataRoot();
  remove = temporary.remove;
  root = value(enrollWorkerRoot(rootOptions(temporary.dataRoot), BINDING));
  journal = root.journal;
});

afterEach(() => {
  root.close();
  remove();
});

function launchUntilWritten(executionId: ExecutionId = EXECUTION, operationId: OperationId = OPERATION): void {
  const request = launchRequest(executionId, operationId);
  value(journal.beginAuthorization(request));
  value(journal.recordGrant(grantFor(request)));
  value(journal.recordExecutionRecordWritten(executionId));
}

function factKinds(): string[] {
  return value(journal.dueForPublication(T0)).map((entry) => entry.fact.kind);
}

const later = (milliseconds: number) => value(parseInstant(new Date(Date.parse(T0) + milliseconds).toISOString()));

test('W1 records an assignment once; a repeat is a duplicate and other content a conflict', () => {
  assert.deepEqual(value(journal.recordCommand(assignment())), { kind: 'recorded' });
  assert.deepEqual(value(journal.recordCommand(assignment())), { kind: 'duplicate' });
  assert.equal(failed(journal.recordCommand({ ...assignment(), digest: digest('other') })).code, 'conflict');
  assert.equal(failed(journal.recordCommand({ ...assignment(2), intent: intent(1) } as JournaledCommand)).code, 'conflict');
  assert.equal(value(journal.snapshot()).intents.length, 1);
});

test('W1 journals a rejection with its observation, and a cancellation request', () => {
  const rejected: JournaledCommand = { commandId: id('CommandId', 'command-9'), digest: digest('x'), outcome: 'rejected', kind: 'assignment', reason: 'backlog' };
  value(journal.recordCommand(rejected));
  const cancellation: JournaledCommand = {
    commandId: id('CommandId', 'cancel-1'),
    digest: digest('cancel'),
    outcome: 'accepted',
    kind: 'cancellation',
    target: { kind: 'execution', executionId: EXECUTION },
  };
  value(journal.recordCommand(cancellation));
  const [entry] = value(journal.dueForPublication(T0));
  assert.deepEqual(entry?.fact, { kind: 'command-rejected', commandId: rejected.commandId, reason: 'backlog' });
  assert.equal(entry?.position.observationId, observationIdOf(entry!.fact));
  assert.deepEqual(value(journal.snapshot()).cancellations, [{ commandId: cancellation.commandId, target: cancellation.target, evidenceRecorded: false }]);
  value(journal.recordCancellationEvidence(cancellation.commandId));
  assert.equal(value(journal.snapshot()).cancellations[0]?.evidenceRecorded, true);
  assert.equal(failed(journal.recordCancellationEvidence(id('CommandId', 'unknown'))).code, 'not-found');
});

test('W2 to W5e record one execution through its exit, in order', () => {
  value(journal.recordCommand(assignment()));
  launchUntilWritten();
  value(journal.recordStart(EXECUTION, id('LaunchAuthId', 'launch-auth-1')));
  value(journal.recordExit(EXECUTION, { kind: 'code', code: 0 }));

  const [execution] = value(journal.snapshot()).executions;
  assert.deepEqual(execution, {
    executionId: EXECUTION,
    assignmentId: intent(1).assignmentId,
    state: 'exited',
    recordWritten: true,
    authorizations: [{ operationId: OPERATION, outcome: 'granted', launchAuthId: id('LaunchAuthId', 'launch-auth-1') }],
  });
  assert.deepEqual(factKinds(), ['execution-started', 'execution-exited']);
});

test('the protocol order is enforced: no W2 without W1, no W4 without a grant, no fact without W4', () => {
  assert.equal(failed(journal.beginAuthorization(launchRequest(EXECUTION, OPERATION))).code, 'precondition-failed');
  value(journal.recordCommand(assignment()));
  value(journal.beginAuthorization(launchRequest(EXECUTION, OPERATION)));
  assert.equal(failed(journal.beginAuthorization(launchRequest(EXECUTION, OPERATION))).code, 'conflict');
  assert.equal(failed(journal.recordExecutionRecordWritten(EXECUTION)).code, 'precondition-failed');
  assert.equal(failed(journal.recordStart(EXECUTION, id('LaunchAuthId', 'launch-auth-1'))).code, 'precondition-failed');
  value(journal.recordGrant(grantFor(launchRequest(EXECUTION, OPERATION))));
  assert.equal(failed(journal.recordGrant(grantFor(launchRequest(EXECUTION, OPERATION)))).code, 'precondition-failed');
  value(journal.recordExecutionRecordWritten(EXECUTION));
  assert.equal(failed(journal.recordStart(EXECUTION, id('LaunchAuthId', 'other-grant'))).code, 'precondition-failed');
  assert.equal(failed(journal.recordExit(id('ExecutionId', 'unknown'), { kind: 'unknown' })).code, 'not-found');
});

test('a fact derived again after a lost write keeps its observation', () => {
  value(journal.recordCommand(assignment()));
  launchUntilWritten();
  value(journal.recordStart(EXECUTION, id('LaunchAuthId', 'launch-auth-1')));
  value(journal.recordStart(EXECUTION, id('LaunchAuthId', 'launch-auth-1')));
  value(journal.recordExit(EXECUTION, { kind: 'signal', signal: 'SIGTERM' }));
  value(journal.recordExit(EXECUTION, { kind: 'signal', signal: 'SIGTERM' }));
  assert.deepEqual(factKinds(), ['execution-started', 'execution-exited']);
});

test('a retryable rejection allows a new operation for the execution; a final one is reported and closes it', () => {
  value(journal.recordCommand(assignment()));
  value(journal.beginAuthorization(launchRequest(EXECUTION, OPERATION)));
  value(journal.recordLaunchRejection(OPERATION, { reason: 'unavailable', retryable: true, message: 'down' }));
  const retry = id('OperationId', 'operation-2');
  value(journal.beginAuthorization(launchRequest(EXECUTION, retry)));
  value(journal.recordLaunchRejection(retry, { reason: 'gate-not-passed', retryable: false, message: 'gate' }));
  assert.equal(failed(journal.beginAuthorization(launchRequest(EXECUTION, id('OperationId', 'operation-3')))).code, 'precondition-failed');
  assert.deepEqual(value(journal.snapshot()).executions[0]?.authorizations.map((a) => [a.outcome, a.rejection]), [
    ['rejected-retryable', 'unavailable'],
    ['rejected-final', 'gate-not-passed'],
  ]);
  assert.deepEqual(factKinds(), ['launch-rejected']);
  assert.equal(failed(journal.recordLaunchRejection(retry, { reason: 'unavailable', retryable: true, message: '' })).code, 'precondition-failed');
});

test('W6 reports not-started once, and uncertain evidence gets a new identity each time', () => {
  value(journal.recordCommand(assignment()));
  value(journal.beginAuthorization(launchRequest(EXECUTION, OPERATION)));
  value(journal.recordUncertain(EXECUTION));
  value(journal.recordUncertain(EXECUTION));
  value(journal.recordNotStarted(EXECUTION));
  value(journal.recordNotStarted(EXECUTION));
  assert.equal(failed(journal.recordUncertain(EXECUTION)).code, 'precondition-failed');
  assert.equal(failed(journal.recordNotStarted(id('ExecutionId', 'unknown'))).code, 'not-found');
  const entries = value(journal.dueForPublication(T0));
  assert.deepEqual(entries.map((entry) => entry.fact.kind), ['execution-uncertain', 'execution-uncertain', 'execution-not-started']);
  assert.equal(new Set(entries.map((entry) => entry.position.observationId)).size, 3);
});

test('a grant or rejection arriving after W6 is refused and reports nothing', () => {
  value(journal.recordCommand(assignment()));
  const request = launchRequest(EXECUTION, OPERATION);
  value(journal.beginAuthorization(request));
  value(journal.recordNotStarted(EXECUTION));
  assert.equal(failed(journal.recordGrant(grantFor(request))).code, 'precondition-failed');
  assert.equal(failed(journal.recordLaunchRejection(OPERATION, { reason: 'gate-not-passed', retryable: false, message: '' })).code, 'precondition-failed');
  assert.equal(value(journal.snapshot()).executions[0]?.state, 'not-started');
  assert.deepEqual(factKinds(), ['execution-not-started']);
});

test('a granted execution is authorized again only when its launch record says it has not started', () => {
  value(journal.recordCommand(assignment()));
  launchUntilWritten();
  const again = id('OperationId', 'operation-2');
  assert.equal(failed(journal.beginAuthorization(launchRequest(EXECUTION, again))).code, 'precondition-failed');
  value(journal.beginAuthorization({ ...launchRequest(EXECUTION, again), reportsNotStarted: true }));
  value(journal.recordGrant(grantFor(launchRequest(EXECUTION, again), 'launch-auth-2')));
  value(journal.recordStart(EXECUTION, id('LaunchAuthId', 'launch-auth-2')));
});

test('a cancellation delivered twice is journaled once and stays pending until its evidence', () => {
  const cancellation: JournaledCommand = {
    commandId: id('CommandId', 'cancel-1'),
    digest: digest('cancel'),
    outcome: 'accepted',
    kind: 'cancellation',
    target: { kind: 'attempt', attemptId: intent(1).attemptId },
  };
  value(journal.recordCommand(cancellation));
  assert.deepEqual(value(journal.recordCommand(cancellation)), { kind: 'duplicate' });
  assert.deepEqual(value(journal.snapshot()).cancellations.map((entry) => entry.evidenceRecorded), [false]);
});

test('a started execution cannot be reported as not started', () => {
  value(journal.recordCommand(assignment()));
  launchUntilWritten();
  value(journal.recordStart(EXECUTION, id('LaunchAuthId', 'launch-auth-1')));
  assert.equal(failed(journal.recordNotStarted(EXECUTION)).code, 'precondition-failed');
  assert.equal(failed(journal.beginAuthorization(launchRequest(EXECUTION, id('OperationId', 'operation-2')))).code, 'precondition-failed');
});

test('the outbox numbers entries gaplessly and keeps them until confirmed', () => {
  value(journal.recordCommand(assignment()));
  launchUntilWritten();
  value(journal.recordStart(EXECUTION, id('LaunchAuthId', 'launch-auth-1')));
  value(journal.recordExit(EXECUTION, { kind: 'code', code: 1 }));
  const entries = value(journal.dueForPublication(T0));
  assert.deepEqual(entries.map((entry) => entry.position.sequence), [1, 2]);
  assert.deepEqual(entries.map((entry) => [entry.position.workerId, entry.position.journalId]), [[BINDING.workerId, BINDING.journalId], [BINDING.workerId, BINDING.journalId]]);

  for (const entry of entries) journal.markPublished(entry.position.sequence, T0);
  assert.deepEqual(value(journal.dueForPublication(later(REPUBLICATION_BOUND_MS - 1))), []);
  assert.equal(value(journal.dueForPublication(later(REPUBLICATION_BOUND_MS))).length, 2);

  value(journal.confirmThrough(value(parseSequence(1))));
  assert.deepEqual(value(journal.dueForPublication(later(REPUBLICATION_BOUND_MS))).map((entry) => entry.position.sequence), [2]);
  assert.equal(failed(journal.confirmThrough(value(parseSequence(3)))).code, 'invalid');
});

test('the outbox continues the sequence after pruning and a reopen', () => {
  value(journal.recordCommand(assignment()));
  value(journal.beginAuthorization(launchRequest(EXECUTION, OPERATION)));
  value(journal.recordNotStarted(EXECUTION));
  value(journal.confirmThrough(value(parseSequence(1))));
  root.close();
  root = value(openWorkerRoot(rootOptions(root.paths.dataRoot)));
  journal = root.journal;
  const rejected: JournaledCommand = { commandId: id('CommandId', 'command-2'), digest: digest('2'), outcome: 'rejected', kind: 'assignment', reason: 'disk-floor' };
  value(journal.recordCommand(rejected));
  assert.deepEqual(value(journal.dueForPublication(T0)).map((entry) => entry.position.sequence), [2]);
});

test('an I/O error at COMMIT stops the journal until a restart', () => {
  const database = faultyDatabase(10);
  const stops: string[] = [];
  const onStop = (fault: Failure) => {
    stops.push(fault.details.reason ?? '');
    return err(failure('internal', 'the fault record could not be written'));
  };
  const faulty = value(SqliteWorkerJournal.open(database.handle, CLOCK, { onStop }));
  database.failNextCommit();
  assert.equal(failureReason(failed(faulty.recordCommand(assignment()))), 'flush-failure');
  assert.deepEqual(stops, ['flush-failure']);
  assert.equal(faulty.fault?.details.recording, 'the fault record could not be written');
  assert.equal(faulty.fault?.details.reason, 'flush-failure');
  assert.equal(database.handle.isOpen, false);
  assert.equal(failureReason(failed(faulty.recordCommand(assignment(2)))), 'stopped');
  assert.equal(failureReason(failed(faulty.snapshot())), 'stopped');
});

test('a write refused for lack of space rolls back and leaves the journal usable', () => {
  const database = faultyDatabase(13);
  const full = value(SqliteWorkerJournal.open(database.handle, CLOCK));
  database.failNextCommit();
  assert.equal(failureReason(failed(full.recordCommand(assignment()))), 'disk-full');
  assert.equal(full.fault, undefined);
  assert.equal(value(full.snapshot()).intents.length, 0);
  value(full.recordCommand(assignment()));
  assert.equal(value(full.snapshot()).intents.length, 1);
  full.close();
});

// The enrolled journal opened directly, whose next COMMIT throws `code`.
function faultyDatabase(code: number): { handle: JournalDatabase; failNextCommit: () => void } {
  root.close();
  const real = new DatabaseSync(root.paths.journal);
  let failing = false;
  const handle: JournalDatabase = {
    exec: (sql) => {
      if (failing && sql === 'COMMIT') {
        failing = false;
        throw Object.assign(new Error(`injected SQLite error ${code}`), { errcode: code });
      }
      real.exec(sql);
    },
    prepare: (sql) => real.prepare(sql),
    close: () => real.close(),
    get isOpen() {
      return real.isOpen;
    },
  };
  return { handle, failNextCommit: () => { failing = true; } };
}
