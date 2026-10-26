import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, test } from 'node:test';
import { err, failure, parseInstant, type Failure } from '@taskelith/kernel';
import {
  parseSequence,
  type DeclaredCapacity,
  type ExecutionId,
  type JournaledCommand,
  type LaunchIntent,
  type OperationId,
  type WorkerJournal,
} from '@taskelith/execution';
import {
  JOURNAL_FORMAT,
  REPUBLICATION_BOUND_MS,
  SqliteWorkerJournal,
  enrollWorkerRoot,
  failureReason,
  observationIdOf,
  openWorkerRoot,
  type JournalDatabase,
  type WorkerRoot,
} from '@taskelith/worker-journal';
import { failed, id, value } from '@taskelith/testing';
import { BINDING, CORRELATION, ENROLLMENT, CLOCK, PROCESS, T0, assignment, exitWith, digest, grantFor, intent, launchRequest, rootOptions, temporaryDataRoot, unsupported } from './fixtures.ts';

let root: WorkerRoot;
let journal: WorkerJournal;
let remove: () => void;

const EXECUTION = id('ExecutionId', 'execution-1');
const OPERATION = id('OperationId', 'operation-1');

beforeEach(() => {
  const temporary = temporaryDataRoot();
  remove = temporary.remove;
  root = value(enrollWorkerRoot(rootOptions(temporary.dataRoot), ENROLLMENT));
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

// The facts after the acceptance of the offer, which W1 journals first.
function factKinds(): string[] {
  const [accepted, ...facts] = value(journal.dueForPublication(T0)).map((entry) => entry.fact.kind);
  assert.equal(accepted, 'assignment-accepted');
  return facts;
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
  const rejected = unsupported(9);
  value(journal.recordCommand(rejected));
  const cancellation: JournaledCommand = {
    commandId: id('CommandId', 'cancel-1'),
    digest: digest('cancel'),
    correlationId: CORRELATION,
    outcome: 'accepted',
    kind: 'cancellation',
    target: { kind: 'execution', executionId: EXECUTION },
  };
  value(journal.recordCommand(cancellation));
  const [entry] = value(journal.dueForPublication(T0));
  assert.deepEqual(entry?.fact, {
    kind: 'command-rejected', commandId: rejected.commandId, correlationId: CORRELATION, commandType: 'execution.assignment.offer',
    reason: 'protocol-not-supported', supportedProtocolVersions: { minimum: 1, maximum: 1 },
  });
  assert.equal(entry?.position.observationId, observationIdOf(entry!.fact, BINDING.journalId));
  assert.deepEqual(value(journal.snapshot()).cancellations, [{ commandId: cancellation.commandId, target: cancellation.target, evidenceRecorded: false }]);
  value(journal.recordCancellationEvidence(cancellation.commandId));
  assert.equal(value(journal.snapshot()).cancellations[0]?.evidenceRecorded, true);
  assert.equal(failed(journal.recordCancellationEvidence(id('CommandId', 'unknown'))).code, 'not-found');
});

test('W2 to W5e record one execution through its exit, in order', () => {
  value(journal.recordCommand(assignment()));
  launchUntilWritten();
  value(journal.recordStart(EXECUTION, id('LaunchAuthId', 'launch-auth-1'), PROCESS));
  value(journal.recordExit(EXECUTION, exitWith({ kind: 'code', code: 0 })));

  const [execution] = value(journal.snapshot()).executions;
  assert.deepEqual(execution, {
    executionId: EXECUTION,
    assignmentId: intent(1).assignmentId,
    state: 'exited',
    recordWritten: true,
    uncertain: false,
    authorizations: [{ operationId: OPERATION, outcome: 'granted', launchAuthId: id('LaunchAuthId', 'launch-auth-1') }],
  });
  assert.deepEqual(factKinds(), ['execution-started', 'execution-exited']);
});

test('execution facts name the assignment of their launch intent, from the journal', () => {
  value(journal.recordCommand(assignment()));
  launchUntilWritten();
  value(journal.recordStart(EXECUTION, id('LaunchAuthId', 'launch-auth-1'), PROCESS));
  value(journal.recordExit(EXECUTION, exitWith({ kind: 'code', code: 0 })));
  const { assignmentId, attemptId, ownershipGeneration, recoveryEpoch } = intent(1);
  const subject = { executionId: EXECUTION, assignmentId, attemptId, ownershipGeneration };
  const launchAuthId = id('LaunchAuthId', 'launch-auth-1');
  const [, started, exited] = value(journal.dueForPublication(T0)).map((entry) => entry.fact);
  assert.deepEqual(started, { kind: 'execution-started', ...subject, launchAuthId, recoveryEpoch, process: PROCESS });
  assert.deepEqual(exited, { kind: 'execution-exited', ...subject, exit: exitWith({ kind: 'code', code: 0 }) });
});

test('the protocol order is enforced: no W2 without W1, no W4 without a grant, no fact without W4', () => {
  assert.equal(failed(journal.beginAuthorization(launchRequest(EXECUTION, OPERATION))).code, 'precondition-failed');
  value(journal.recordCommand(assignment()));
  value(journal.beginAuthorization(launchRequest(EXECUTION, OPERATION)));
  assert.equal(failed(journal.beginAuthorization(launchRequest(EXECUTION, OPERATION))).code, 'conflict');
  assert.equal(failed(journal.recordExecutionRecordWritten(EXECUTION)).code, 'precondition-failed');
  assert.equal(failed(journal.recordStart(EXECUTION, id('LaunchAuthId', 'launch-auth-1'), PROCESS)).code, 'precondition-failed');
  value(journal.recordGrant(grantFor(launchRequest(EXECUTION, OPERATION))));
  assert.equal(failed(journal.recordGrant(grantFor(launchRequest(EXECUTION, OPERATION)))).code, 'precondition-failed');
  value(journal.recordExecutionRecordWritten(EXECUTION));
  assert.equal(failed(journal.recordStart(EXECUTION, id('LaunchAuthId', 'other-grant'), PROCESS)).code, 'precondition-failed');
  assert.equal(failed(journal.recordExit(id('ExecutionId', 'unknown'), exitWith({ kind: 'unknown' }))).code, 'not-found');
});

test('a fact derived again after a lost write keeps its observation', () => {
  value(journal.recordCommand(assignment()));
  launchUntilWritten();
  value(journal.recordStart(EXECUTION, id('LaunchAuthId', 'launch-auth-1'), PROCESS));
  value(journal.recordStart(EXECUTION, id('LaunchAuthId', 'launch-auth-1'), PROCESS));
  value(journal.recordExit(EXECUTION, exitWith({ kind: 'signal', signal: 'SIGTERM' })));
  value(journal.recordExit(EXECUTION, exitWith({ kind: 'signal', signal: 'SIGTERM' })));
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

test('W6 reports not-started once', () => {
  value(journal.recordCommand(assignment()));
  value(journal.beginAuthorization(launchRequest(EXECUTION, OPERATION)));
  assert.equal(failed(journal.recordUncertain(EXECUTION)).code, 'precondition-failed');
  value(journal.recordNotStarted(EXECUTION));
  value(journal.recordNotStarted(EXECUTION));
  assert.equal(failed(journal.recordNotStarted(id('ExecutionId', 'unknown'))).code, 'not-found');
  assert.deepEqual(factKinds(), ['execution-not-started']);
});

test('uncertain evidence after W4 gets a new identity each time, until a terminal fact', () => {
  value(journal.recordCommand(assignment()));
  launchUntilWritten();
  value(journal.recordUncertain(EXECUTION));
  value(journal.recordUncertain(EXECUTION));
  value(journal.recordExit(EXECUTION, exitWith({ kind: 'unknown' })));
  assert.equal(failed(journal.recordUncertain(EXECUTION)).code, 'precondition-failed');
  const entries = value(journal.dueForPublication(T0));
  assert.deepEqual(entries.map((entry) => entry.fact.kind), ['assignment-accepted', 'execution-uncertain', 'execution-uncertain', 'execution-exited']);
  assert.equal(new Set(entries.map((entry) => entry.position.observationId)).size, 4);
});

test('a late grant cannot move a started execution back to authorized', () => {
  value(journal.recordCommand(assignment()));
  launchUntilWritten();
  const again = launchRequest(EXECUTION, id('OperationId', 'operation-2'));
  value(journal.beginAuthorization({ ...again, reportsNotStarted: true }));
  value(journal.recordStart(EXECUTION, id('LaunchAuthId', 'launch-auth-1'), PROCESS));
  assert.equal(failed(journal.recordGrant(grantFor(again, 'launch-auth-2'))).code, 'precondition-failed');
  assert.equal(value(journal.snapshot()).executions[0]?.state, 'started');
});

test('after a grant, a retryable rejection of a re-authorization can be retried', () => {
  value(journal.recordCommand(assignment()));
  const first = launchRequest(EXECUTION, OPERATION);
  value(journal.beginAuthorization(first));
  value(journal.recordGrant(grantFor(first)));
  const second = id('OperationId', 'operation-2');
  value(journal.beginAuthorization({ ...launchRequest(EXECUTION, second), reportsNotStarted: true }));
  value(journal.recordLaunchRejection(second, { reason: 'unavailable', retryable: true, message: '' }));
  value(journal.beginAuthorization({ ...launchRequest(EXECUTION, id('OperationId', 'operation-3')), reportsNotStarted: true }));
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
  value(journal.recordStart(EXECUTION, id('LaunchAuthId', 'launch-auth-2'), PROCESS));
});

test('a cancellation delivered twice is journaled once and stays pending until its evidence', () => {
  const cancellation: JournaledCommand = {
    commandId: id('CommandId', 'cancel-1'),
    digest: digest('cancel'),
    correlationId: CORRELATION,
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
  value(journal.recordStart(EXECUTION, id('LaunchAuthId', 'launch-auth-1'), PROCESS));
  assert.equal(failed(journal.recordNotStarted(EXECUTION)).code, 'precondition-failed');
  assert.equal(failed(journal.beginAuthorization(launchRequest(EXECUTION, id('OperationId', 'operation-2')))).code, 'precondition-failed');
});

test('the outbox numbers entries gaplessly and keeps them until confirmed', () => {
  value(journal.recordCommand(assignment()));
  launchUntilWritten();
  value(journal.recordStart(EXECUTION, id('LaunchAuthId', 'launch-auth-1'), PROCESS));
  value(journal.recordExit(EXECUTION, exitWith({ kind: 'code', code: 1 })));
  const entries = value(journal.dueForPublication(T0));
  assert.deepEqual(entries.map((entry) => entry.position.sequence), [1, 2, 3]);
  const producer = [BINDING.workerId, BINDING.journalId];
  assert.deepEqual(entries.map((entry) => [entry.position.workerId, entry.position.journalId]), [producer, producer, producer]);

  for (const entry of entries) journal.markPublished(entry.position.sequence, T0);
  assert.deepEqual(value(journal.dueForPublication(later(REPUBLICATION_BOUND_MS - 1))), []);
  assert.equal(value(journal.dueForPublication(later(REPUBLICATION_BOUND_MS))).length, 3);

  value(journal.confirmThrough(value(parseSequence(2))));
  assert.deepEqual(value(journal.dueForPublication(later(REPUBLICATION_BOUND_MS))).map((entry) => entry.position.sequence), [3]);
  assert.equal(failed(journal.confirmThrough(value(parseSequence(4)))).code, 'invalid');
});

test('the outbox continues the sequence after pruning and a reopen', () => {
  value(journal.recordCommand(assignment()));
  value(journal.beginAuthorization(launchRequest(EXECUTION, OPERATION)));
  value(journal.recordNotStarted(EXECUTION));
  value(journal.confirmThrough(value(parseSequence(2))));
  root.close();
  root = value(openWorkerRoot(rootOptions(root.paths.dataRoot)));
  journal = root.journal;
  value(journal.recordCommand(unsupported(2)));
  assert.deepEqual(value(journal.dueForPublication(T0)).map((entry) => entry.position.sequence), [3]);
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

const CAPACITY: DeclaredCapacity = {
  slots: 2, cpuMillicores: 4000, memoryMebibytes: 7680, enforceableControls: [], protocolVersions: { minimum: 1, maximum: 1 },
};

function end(number: number, assignmentNumber = number): JournaledCommand {
  return {
    commandId: id('CommandId', `end-${number}`), digest: digest(`end-${number}`), correlationId: CORRELATION,
    outcome: 'accepted', kind: 'assignment-end', assignmentId: intent(assignmentNumber).assignmentId,
  };
}

test('W1 journals an accepted offer with its acceptance, and a refusal with its reason', () => {
  value(journal.recordCommand(assignment()));
  const { assignmentId, attemptId, ownershipGeneration } = intent(2);
  const refused: JournaledCommand = {
    commandId: id('CommandId', 'command-2'), digest: digest('refused'), correlationId: CORRELATION, outcome: 'rejected',
    kind: 'execution.assignment.offer',
    rejection: { kind: 'assignment-refused', assignment: { assignmentId, attemptId, ownershipGeneration }, reason: 'worker-slots-exhausted' },
  };
  value(journal.recordCommand(refused));
  const facts = value(journal.dueForPublication(T0)).map((entry) => entry.fact);
  assert.deepEqual(facts, [
    { kind: 'assignment-accepted', commandId: assignment().commandId, correlationId: CORRELATION, ...pick(intent(1)) },
    { kind: 'assignment-refused', commandId: refused.commandId, correlationId: CORRELATION, ...pick(intent(2)), reason: 'worker-slots-exhausted' },
  ]);
  assert.deepEqual(value(journal.snapshot()).intents.map((entry) => [entry.commandId, entry.ended, entry.requested]), [
    [assignment().commandId, false, intent().requested],
  ]);
});

function pick({ assignmentId, attemptId, ownershipGeneration }: LaunchIntent) {
  return { assignmentId, attemptId, ownershipGeneration };
}

test('an assignment end is journaled before or after its offer and ends the assignment', () => {
  value(journal.recordCommand(end(1)));
  value(journal.recordCommand(assignment(1)));
  value(journal.recordCommand(assignment(2)));
  value(journal.recordCommand(end(2)));
  assert.deepEqual(value(journal.recordCommand(end(2))), { kind: 'duplicate' });
  assert.deepEqual(value(journal.snapshot()).intents.map((entry) => entry.ended), [true, true]);
  assert.deepEqual(value(journal.recordCommand(end(3, 1))), { kind: 'recorded' });
});

test('a capacity declaration is journaled only when it changes, each with its own identity', () => {
  value(journal.recordCapacity(CAPACITY));
  value(journal.recordCapacity(CAPACITY));
  value(journal.recordCapacity({ ...CAPACITY, slots: 3 }));
  value(journal.recordCapacity(CAPACITY));
  const entries = value(journal.dueForPublication(T0));
  assert.deepEqual(entries.map((entry) => entry.fact), [
    { kind: 'capacity-declared', declaration: 1, capacity: CAPACITY },
    { kind: 'capacity-declared', declaration: 2, capacity: { ...CAPACITY, slots: 3 } },
    { kind: 'capacity-declared', declaration: 3, capacity: CAPACITY },
  ]);
  assert.equal(new Set(entries.map((entry) => entry.position.observationId)).size, 3);
  const otherJournal = observationIdOf(entries[0]!.fact, id('JournalId', 'journal-2'));
  assert.notEqual(otherJournal, entries[0]!.position.observationId);
});

test('each inventory gets a higher snapshot number and the last sequence it reflects', () => {
  const first = value(journal.takeInventory());
  assert.deepEqual([first.snapshot, first.throughSequence, first.journal.intents.length], [1, 0, 0]);
  value(journal.recordCommand(assignment()));
  launchUntilWritten();
  value(journal.recordUncertain(EXECUTION));
  const second = value(journal.takeInventory());
  assert.deepEqual([second.snapshot, second.throughSequence], [2, 2]);
  assert.deepEqual(second.journal.executions.map((execution) => [execution.state, execution.uncertain]), [['authorized', true]]);
  root.close();
  root = value(openWorkerRoot(rootOptions(root.paths.dataRoot)));
  journal = root.journal;
  assert.equal(value(journal.takeInventory()).snapshot, 3);
});

// Undoes format 3, as a format 2 journal stores its records; the widened
// CHECK stays, which the migration's rebuild replaces anyway.
function asFormat2(raw: DatabaseSync): void {
  for (const column of ['terminal_sequence', 'record_removed', 'termination_unproven']) raw.exec(`ALTER TABLE execution DROP COLUMN ${column}`);
  raw.exec('DROP TABLE cancellation_not_applied');
  raw.exec('PRAGMA user_version = 2');
}

function reopenRaw(change: (raw: DatabaseSync) => void): void {
  const { paths } = root;
  root.close();
  const raw = new DatabaseSync(paths.journal);
  raw.exec('PRAGMA locking_mode = EXCLUSIVE');
  change(raw);
  raw.close();
  root = value(openWorkerRoot(rootOptions(paths.dataRoot)));
  journal = root.journal;
}

function cancellationOf(executionId: ExecutionId): JournaledCommand {
  return {
    commandId: id('CommandId', `cancel-${executionId}`), digest: digest(`cancel ${executionId}`), correlationId: CORRELATION,
    outcome: 'accepted', kind: 'cancellation', target: { kind: 'execution', executionId },
  };
}

test('a format 2 journal is migrated: a sealed pending operation expires and confirmed terminal facts are found', () => {
  value(journal.recordCommand(assignment()));
  launchUntilWritten();
  value(journal.recordExit(EXECUTION, exitWith({ kind: 'code', code: 0 })));
  const sealed = id('ExecutionId', 'execution-2');
  value(journal.beginAuthorization(launchRequest(sealed, id('OperationId', 'operation-2'))));
  value(journal.recordNotStarted(sealed));
  value(journal.confirmThrough(value(parseSequence(2))));
  reopenRaw((raw) => {
    asFormat2(raw);
    raw.exec(`UPDATE authorization_request SET outcome = 'pending' WHERE operation_id = 'operation-2'`);
  });
  const outcomes = value(journal.snapshot()).executions.map((execution) => execution.authorizations.at(-1)?.outcome);
  assert.deepEqual(outcomes, ['granted', 'expired']);
  // The exit (2) was confirmed and pruned; the seal (3) is still unconfirmed.
  assert.deepEqual(value(journal.removableRecords()), [EXECUTION]);
});

test('an expired operation is closed and its execution authorized again under a new operation', () => {
  value(journal.recordCommand(assignment()));
  value(journal.beginAuthorization(launchRequest(EXECUTION, OPERATION)));
  value(journal.recordAuthorizationExpired(OPERATION));
  assert.equal(failed(journal.recordAuthorizationExpired(OPERATION)).code, 'precondition-failed');
  const again = launchRequest(EXECUTION, id('OperationId', 'operation-2'));
  value(journal.beginAuthorization({ ...again, reportsNotStarted: true }));
  value(journal.recordGrant(grantFor(again)));
  const [execution] = value(journal.snapshot()).executions;
  assert.deepEqual(execution?.authorizations.map(({ outcome }) => outcome), ['expired', 'granted']);
  assert.deepEqual(factKinds(), []);
});

test('a seal expires the operation still waiting for its answer', () => {
  value(journal.recordCommand(assignment()));
  value(journal.beginAuthorization(launchRequest(EXECUTION, OPERATION)));
  value(journal.recordNotStarted(EXECUTION));
  assert.deepEqual(value(journal.snapshot()).executions[0]?.authorizations.map(({ outcome }) => outcome), ['expired']);
});

test('a record is removable once its terminal fact is confirmed, and removed once', () => {
  value(journal.recordCommand(assignment()));
  launchUntilWritten();
  value(journal.recordStart(EXECUTION, grantFor(launchRequest(EXECUTION, OPERATION)).launchAuthId, PROCESS));
  assert.equal(failed(journal.recordRecordRemoved(EXECUTION)).code, 'precondition-failed');
  value(journal.recordExit(EXECUTION, exitWith({ kind: 'code', code: 0 })));
  assert.deepEqual(value(journal.removableRecords()), []);
  value(journal.confirmThrough(value(parseSequence(2))));
  assert.deepEqual(value(journal.removableRecords()), []);
  assert.equal(failed(journal.recordRecordRemoved(EXECUTION)).code, 'precondition-failed');
  value(journal.confirmThrough(value(parseSequence(3))));
  assert.deepEqual(value(journal.removableRecords()), [EXECUTION]);
  value(journal.recordRecordRemoved(EXECUTION));
  assert.deepEqual(value(journal.removableRecords()), []);
});

test('termination unproven and a cancellation not applied are each reported once', () => {
  value(journal.recordCommand(assignment()));
  launchUntilWritten();
  const cancellation = cancellationOf(EXECUTION);
  value(journal.recordCommand(cancellation));
  const survivors = [{ ...PROCESS, pid: 4300 }];
  value(journal.recordTerminationUnproven(EXECUTION, survivors));
  value(journal.recordTerminationUnproven(EXECUTION, survivors));
  value(journal.recordCancellationNotApplied(cancellation.commandId, EXECUTION));
  value(journal.recordCancellationNotApplied(cancellation.commandId, EXECUTION));
  assert.equal(failed(journal.recordCancellationNotApplied(id('CommandId', 'unknown'), EXECUTION)).code, 'not-found');
  assert.equal(failed(journal.recordTerminationUnproven(id('ExecutionId', 'unwritten'), survivors)).code, 'not-found');
  const facts = value(journal.dueForPublication(T0)).map((entry) => entry.fact).filter(({ kind }) => kind !== 'assignment-accepted');
  assert.deepEqual(facts.map(({ kind }) => kind), ['termination-unproven', 'cancellation-not-applied']);
  assert.deepEqual(facts[1], {
    kind: 'cancellation-not-applied', executionId: EXECUTION, assignmentId: intent().assignmentId, attemptId: intent().attemptId,
    ownershipGeneration: intent().ownershipGeneration, commandId: cancellation.commandId,
  });
});

test('a format 1 journal is migrated to the current format and keeps its records', () => {
  value(journal.recordCommand(assignment()));
  const { paths } = root;
  root.close();
  const raw = new DatabaseSync(paths.journal);
  raw.exec('PRAGMA locking_mode = EXCLUSIVE');
  asFormat2(raw);
  for (const column of ['declared_capacity', 'capacity_declarations', 'inventory_snapshots']) raw.exec(`ALTER TABLE journal_meta DROP COLUMN ${column}`);
  for (const column of ['recovery_epoch', 'cpu_millicores', 'memory_mebibytes', 'hard_controls']) raw.exec(`ALTER TABLE launch_intent DROP COLUMN ${column}`);
  raw.exec('DROP TABLE assignment_end');
  raw.exec('PRAGMA user_version = 1');
  raw.close();
  root = value(openWorkerRoot(rootOptions(paths.dataRoot)));
  journal = root.journal;
  const [migrated] = value(journal.snapshot()).intents;
  assert.deepEqual([migrated?.assignmentId, migrated?.ended, migrated?.recoveryEpoch, migrated?.requested], [
    intent().assignmentId, false, BINDING.recoveryEpoch, { cpuMillicores: 0, memoryMebibytes: 0, hardControls: [] },
  ]);
  value(journal.recordCommand(end(1)));
  assert.equal(value(journal.takeInventory()).snapshot, 1);
  root.close();
  const check = new DatabaseSync(paths.journal);
  check.exec('PRAGMA locking_mode = EXCLUSIVE');
  assert.equal(check.prepare('PRAGMA user_version').get()?.user_version, JOURNAL_FORMAT);
  check.close();
  root = value(openWorkerRoot(rootOptions(paths.dataRoot)));
  journal = root.journal;
});

test('a migration that fails part way leaves the format 1 journal complete', () => {
  value(journal.recordCommand(assignment()));
  const { paths } = root;
  root.close();
  const raw = new DatabaseSync(paths.journal);
  raw.exec('PRAGMA locking_mode = EXCLUSIVE');
  for (const column of ['recovery_epoch', 'cpu_millicores', 'memory_mebibytes', 'hard_controls']) raw.exec(`ALTER TABLE launch_intent DROP COLUMN ${column}`);
  raw.exec('PRAGMA user_version = 1');
  raw.close();
  // journal_meta still has the format 2 columns, so the first ALTER fails.
  assert.equal(failed(openWorkerRoot(rootOptions(paths.dataRoot))).code, 'internal');
  const check = new DatabaseSync(paths.journal);
  check.exec('PRAGMA locking_mode = EXCLUSIVE');
  assert.equal(check.prepare('PRAGMA user_version').get()?.user_version, 1);
  assert.deepEqual(check.prepare('SELECT assignment_id FROM launch_intent').all().map((row) => row.assignment_id), [intent().assignmentId]);
  assert.equal(check.prepare("SELECT 1 FROM pragma_table_info('launch_intent') WHERE name = 'cpu_millicores'").get(), undefined);
  check.close();
  // afterEach closes a root; this one is fresh and removed with the first.
  const fresh = temporaryDataRoot();
  const removeFirst = remove;
  remove = () => {
    removeFirst();
    fresh.remove();
  };
  root = value(enrollWorkerRoot(rootOptions(fresh.dataRoot), ENROLLMENT));
  journal = root.journal;
});
