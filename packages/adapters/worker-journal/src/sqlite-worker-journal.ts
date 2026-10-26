import { err, failure, ok, type Failure, type Instant, type Result } from '@taskelith/kernel';
import type {
  AdmissionPressureCause,
  CommandId,
  CommandRecording,
  DeclaredCapacity,
  ExecutionExit,
  ExecutionId,
  ExecutionProcess,
  ExecutionSubject,
  CancellationTarget,
  JournalBinding,
  JournaledCommand,
  JournalInventory,
  JournalSnapshot,
  LaunchAuthId,
  LaunchGrant,
  LaunchIntent,
  LaunchRejection,
  LaunchRequest,
  ObservationFact,
  OperationId,
  OutboxBacklog,
  OutboxEntry,
  RecoveryEpoch,
  Sequence,
  WorkerJournal,
} from '@taskelith/execution';
import { JournalConnection, type JournalDatabase } from './journal-connection.js';
import { readBinding, readOutbox, readSnapshot } from './journal-reads.js';
import { observationIdOf } from './observation-identity.js';
import { storedInteger, storedText, type Row } from './stored-values.js';

export interface JournalClock {
  now(): Instant;
}

// The commits of contract section 5; tests crash a worker on either side.
export const WRITE_POINTS = Object.freeze(['W1', 'W2', 'W3', 'W4', 'W5s', 'W5e', 'W6'] as const);

export type WritePoint = (typeof WRITE_POINTS)[number];

// Called with `W1.before`, `W1.after`, and so on; a crash point harness
// passes its `reach`.
export type CommitPointHook = (point: `${WritePoint}.${'before' | 'after'}`) => void;

export interface JournalHooks {
  readonly onCommitPoint?: CommitPointHook;
  // Called once when a flush failure or corruption stops the journal.
  readonly onStop?: (fault: Failure) => Result<void>;
  // Called after each write refused for lack of space rolled back.
  readonly onSpaceRefused?: () => void;
}

// An unconfirmed entry is published again after this bound (contract
// section 6); publication marks live in memory only.
export const REPUBLICATION_BOUND_MS = 60_000;

// The worker journal on SQLite: each `record` method is one W commit of the
// worker journal contract, section 5.
export class SqliteWorkerJournal implements WorkerJournal {
  readonly binding: JournalBinding;
  readonly #connection: JournalConnection;
  readonly #clock: JournalClock;
  readonly #publishedAt = new Map<number, number>();
  readonly #onCommitPoint: CommitPointHook;

  private constructor(
    connection: JournalConnection,
    binding: JournalBinding,
    clock: JournalClock,
    onCommitPoint: CommitPointHook,
  ) {
    this.#connection = connection;
    this.binding = binding;
    this.#clock = clock;
    this.#onCommitPoint = onCommitPoint;
  }

  static open(database: JournalDatabase, clock: JournalClock, hooks: JournalHooks = {}): Result<SqliteWorkerJournal> {
    const connection = new JournalConnection(database, {
      onStop: hooks.onStop ?? (() => ok(undefined)),
      onSpaceRefused: hooks.onSpaceRefused ?? (() => undefined),
    });
    const binding = connection.read(readBinding);
    if (!binding.ok) return binding;
    return ok(new SqliteWorkerJournal(connection, binding.value, clock, hooks.onCommitPoint ?? (() => {})));
  }

  // The flush failure or corruption that stopped the journal, if any.
  get fault(): Failure | undefined {
    return this.#connection.fault;
  }

  recordCommand(command: JournaledCommand): Result<CommandRecording> {
    return this.#commit<CommandRecording>('W1', (database) => {
      const known = database.prepare('SELECT digest FROM inbox WHERE command_id = ?').get(command.commandId);
      if (known !== undefined) {
        if (known.digest === command.digest) return ok(Object.freeze({ kind: 'duplicate' as const }));
        return err(failure('conflict', `command ${command.commandId} was journaled with other content`));
      }
      database.prepare(`INSERT INTO inbox (command_id, kind, digest, outcome, rejection_reason, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(
        command.commandId,
        command.kind,
        command.digest,
        command.outcome,
        command.outcome === 'rejected' ? command.rejection.reason : null,
        this.#clock.now(),
      );
      const recorded = this.#recordCommandRequest(database, command);
      return recorded.ok ? ok(Object.freeze({ kind: 'recorded' as const })) : recorded;
    });
  }

  beginAuthorization(request: LaunchRequest): Result<void> {
    return this.#commit('W2', (database) => {
      const intent = database.prepare('SELECT * FROM launch_intent WHERE assignment_id = ?').get(request.assignmentId);
      if (intent === undefined || intent.attempt_id !== request.attemptId
        || intent.ownership_generation !== request.ownershipGeneration) {
        return err(failure('precondition-failed', `no launch intent matches assignment ${request.assignmentId}`));
      }
      if (database.prepare('SELECT 1 FROM authorization_request WHERE operation_id = ?').get(request.operationId)) {
        return err(failure('conflict', `operation ${request.operationId} is already journaled`));
      }
      const execution = this.#prepareExecution(database, request);
      if (!execution.ok) return execution;
      database.prepare(`INSERT INTO authorization_request (operation_id, execution_id, position, expected, outcome)
        VALUES (?, ?, ?, ?, 'pending')`).run(request.operationId, request.executionId, execution.value, JSON.stringify(request));
      return ok(undefined);
    });
  }

  recordGrant(grant: LaunchGrant): Result<void> {
    return this.#commit('W3', (database) => {
      const pending = this.#pendingAuthorization(database, grant.operationId, grant.executionId);
      if (!pending.ok) return pending;
      database.prepare(`UPDATE authorization_request SET outcome = 'granted', launch_auth_id = ?, grant_values = ?
        WHERE operation_id = ?`).run(grant.launchAuthId, JSON.stringify(grant), grant.operationId);
      database.prepare(`UPDATE execution SET state = 'authorized' WHERE execution_id = ?`).run(grant.executionId);
      return ok(undefined);
    });
  }

  recordLaunchRejection(operationId: OperationId, rejection: LaunchRejection): Result<void> {
    return this.#commit('W3', (database) => {
      const pending = this.#pendingAuthorization(database, operationId);
      if (!pending.ok) return pending;
      const outcome = rejection.retryable ? 'rejected-retryable' : 'rejected-final';
      database.prepare('UPDATE authorization_request SET outcome = ?, rejection_reason = ? WHERE operation_id = ?')
        .run(outcome, rejection.reason, operationId);
      if (rejection.retryable) return ok(undefined);
      const { subject } = subjectOf(database, pending.value);
      this.#append(database, { kind: 'launch-rejected', ...subject, operationId, reason: rejection.reason });
      return ok(undefined);
    });
  }

  recordAuthorizationExpired(operationId: OperationId): Result<void> {
    return this.#commit('W3', (database) => {
      const pending = this.#pendingAuthorization(database, operationId);
      if (!pending.ok) return pending;
      database.prepare(`UPDATE authorization_request SET outcome = 'expired' WHERE operation_id = ?`).run(operationId);
      return ok(undefined);
    });
  }

  recordExecutionRecordWritten(executionId: ExecutionId): Result<void> {
    return this.#commit('W4', (database) => {
      const execution = executionRow(database, executionId);
      if (execution?.state !== 'authorized') return err(notInState(executionId, 'authorized'));
      database.prepare('UPDATE execution SET record_written = 1 WHERE execution_id = ?').run(executionId);
      return ok(undefined);
    });
  }

  recordStart(executionId: ExecutionId, launchAuthId: LaunchAuthId, process: ExecutionProcess): Result<void> {
    return this.#commit('W5s', (database) => {
      const execution = writtenExecution(database, executionId);
      if (!execution.ok) return execution;
      if (execution.value.state === 'started' || execution.value.state === 'exited') return ok(undefined);
      if (execution.value.state !== 'authorized') return err(notInState(executionId, 'authorized'));
      const granted = database.prepare(`SELECT 1 FROM authorization_request
        WHERE execution_id = ? AND launch_auth_id = ? AND outcome = 'granted'`).get(executionId, launchAuthId);
      if (granted === undefined) return err(failure('precondition-failed', `${launchAuthId} is not a grant of ${executionId}`));
      const { subject, recoveryEpoch } = subjectOf(database, executionId);
      const fact = { kind: 'execution-started' as const, ...subject, launchAuthId, recoveryEpoch, process };
      this.#moveExecution(database, executionId, 'started', fact);
      return ok(undefined);
    });
  }

  recordExit(executionId: ExecutionId, exit: ExecutionExit): Result<void> {
    return this.#commit('W5e', (database) => {
      const execution = writtenExecution(database, executionId);
      if (!execution.ok) return execution;
      if (execution.value.state === 'exited') return ok(undefined);
      if (execution.value.state !== 'authorized' && execution.value.state !== 'started') {
        return err(notInState(executionId, 'authorized or started'));
      }
      const { subject } = subjectOf(database, executionId);
      this.#moveExecution(database, executionId, 'exited', { kind: 'execution-exited', ...subject, exit });
      return ok(undefined);
    });
  }

  recordNotStarted(executionId: ExecutionId): Result<void> {
    return this.#commit('W6', (database) => {
      const execution = executionRow(database, executionId);
      if (execution === undefined) return err(unknownExecution(executionId));
      if (execution.state === 'not-started') return ok(undefined);
      if (execution.state !== null && execution.state !== 'authorized') return err(notInState(executionId, 'authorized'));
      // The seal leaves no use for an operation still waiting for its answer.
      database.prepare(`UPDATE authorization_request SET outcome = 'expired' WHERE execution_id = ? AND outcome = 'pending'`)
        .run(executionId);
      const { subject } = subjectOf(database, executionId);
      this.#moveExecution(database, executionId, 'not-started', { kind: 'execution-not-started', ...subject });
      return ok(undefined);
    });
  }

  recordUncertain(executionId: ExecutionId): Result<void> {
    return this.#connection.transact((database) => {
      const written = writtenExecution(database, executionId);
      if (!written.ok) return written;
      const execution = written.value;
      if (execution.state === 'exited' || execution.state === 'not-started') {
        return err(notInState(executionId, 'not terminal'));
      }
      const evidenceCounter = storedInteger<number>(execution, 'uncertain_count') + 1;
      database.prepare('UPDATE execution SET uncertain_count = ? WHERE execution_id = ?').run(evidenceCounter, executionId);
      this.#append(database, { kind: 'execution-uncertain', ...subjectOf(database, executionId).subject, evidenceCounter });
      return ok(undefined);
    });
  }

  recordTerminationUnproven(executionId: ExecutionId, survivors: readonly ExecutionProcess[]): Result<void> {
    return this.#connection.transact((database) => {
      const written = writtenExecution(database, executionId);
      if (!written.ok) return written;
      if (written.value.termination_unproven === 1) return ok(undefined);
      database.prepare('UPDATE execution SET termination_unproven = 1 WHERE execution_id = ?').run(executionId);
      this.#append(database, { kind: 'termination-unproven', ...subjectOf(database, executionId).subject, survivors });
      return ok(undefined);
    });
  }

  recordCancellationNotApplied(commandId: CommandId, executionId: ExecutionId): Result<void> {
    return this.#connection.transact((database) => {
      const written = writtenExecution(database, executionId);
      if (!written.ok) return written;
      if (!database.prepare('SELECT 1 FROM cancellation_request WHERE command_id = ?').get(commandId)) {
        return err(failure('not-found', `no cancellation request for command ${commandId}`));
      }
      const inserted = database.prepare('INSERT OR IGNORE INTO cancellation_not_applied (command_id, execution_id) VALUES (?, ?)')
        .run(commandId, executionId);
      if (inserted.changes === 0) return ok(undefined);
      this.#append(database, { kind: 'cancellation-not-applied', ...subjectOf(database, executionId).subject, commandId });
      return ok(undefined);
    });
  }

  recordUnrecordedProcess(containment: string, processes: readonly ExecutionProcess[]): Result<void> {
    return this.#connection.transact((database) => {
      const fact: ObservationFact = { kind: 'unrecorded-process', containment, processes };
      const observationId = observationIdOf(fact, this.binding.journalId);
      if (database.prepare('SELECT 1 FROM outbox WHERE observation_id = ?').get(observationId)) return ok(undefined);
      this.#append(database, fact);
      return ok(undefined);
    });
  }

  recordCancellationEvidence(commandId: CommandId): Result<void> {
    return this.#connection.transact((database) => {
      const updated = database.prepare('UPDATE cancellation_request SET evidence_recorded = 1 WHERE command_id = ?').run(commandId);
      if (updated.changes === 0) return err(failure('not-found', `no cancellation request for command ${commandId}`));
      return ok(undefined);
    });
  }

  recordCapacity(capacity: DeclaredCapacity): Result<void> {
    return this.#connection.transact((database) => {
      const meta = metaRow(database);
      const declared = JSON.stringify(canonicalCapacity(capacity));
      if (meta.declared_capacity === declared) return ok(undefined);
      const declaration = storedInteger<number>(meta, 'capacity_declarations') + 1;
      database.prepare('UPDATE journal_meta SET declared_capacity = ?, capacity_declarations = ?').run(declared, declaration);
      this.#append(database, { kind: 'capacity-declared', declaration, capacity });
      return ok(undefined);
    });
  }

  // A declaration is the sequence it takes, so it is unique in the journal.
  recordAdmissionPressure(causes: readonly AdmissionPressureCause[]): Result<void> {
    return this.#connection.transact((database) => {
      const declaration = storedInteger<number>(metaRow(database), 'next_sequence');
      this.#append(database, { kind: 'admission-pressure-changed', declaration, causes: [...causes] });
      return ok(undefined);
    });
  }

  snapshot(): Result<JournalSnapshot> {
    return this.#connection.read(readSnapshot);
  }

  // A terminal fact is confirmed once its outbox entry is pruned.
  removableRecords(): Result<readonly ExecutionId[]> {
    return this.#connection.read((database) => Object.freeze(database.prepare(`SELECT execution_id FROM execution
      WHERE terminal_sequence IS NOT NULL AND record_removed = 0
        AND NOT EXISTS (SELECT 1 FROM outbox WHERE outbox.sequence = execution.terminal_sequence)
      ORDER BY rowid`).all().map((row) => storedText<ExecutionId>(row, 'execution_id'))));
  }

  recordRecordRemoved(executionId: ExecutionId): Result<void> {
    return this.#connection.transact((database) => {
      const updated = database.prepare(`UPDATE execution SET record_removed = 1
        WHERE execution_id = ? AND terminal_sequence IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM outbox WHERE outbox.sequence = execution.terminal_sequence)`).run(executionId);
      return updated.changes === 0 ? err(notInState(executionId, 'terminal and confirmed')) : ok(undefined);
    });
  }

  takeInventory(): Result<JournalInventory> {
    return this.#connection.transact((database) => {
      const meta = metaRow(database);
      const snapshot = storedInteger<number>(meta, 'inventory_snapshots') + 1;
      database.prepare('UPDATE journal_meta SET inventory_snapshots = ?').run(snapshot);
      const throughSequence = storedInteger<number>(meta, 'next_sequence') - 1;
      return ok(Object.freeze({ snapshot, throughSequence, journal: readSnapshot(database) }));
    });
  }

  dueForPublication(now: Instant): Result<readonly OutboxEntry[]> {
    const cutoff = Date.parse(now) - REPUBLICATION_BOUND_MS;
    const entries = this.#connection.read((database) => readOutbox(database, this.binding));
    if (!entries.ok) return entries;
    return ok(Object.freeze(entries.value.filter(({ position }) => {
      const publishedAt = this.#publishedAt.get(position.sequence);
      return publishedAt === undefined || publishedAt <= cutoff;
    })));
  }

  markPublished(sequence: Sequence, at: Instant): void {
    this.#publishedAt.set(sequence, Date.parse(at));
  }

  backlog(): Result<OutboxBacklog> {
    return this.#connection.read((database) => {
      const row = database.prepare(`SELECT COUNT(*) AS entries, COALESCE(SUM(LENGTH(CAST(observation_id AS BLOB))
        + LENGTH(CAST(fact AS BLOB)) + LENGTH(CAST(recorded_at AS BLOB))), 0) AS bytes FROM outbox`).get() ?? {};
      return Object.freeze({ entries: storedInteger<number>(row, 'entries'), bytes: storedInteger<number>(row, 'bytes') });
    });
  }

  confirmThrough(sequence: Sequence): Result<void> {
    return this.#connection.transact((database) => {
      const assigned = storedInteger<number>(metaRow(database), 'next_sequence') - 1;
      if (sequence > assigned) return err(failure('invalid', `sequence ${sequence} was never assigned; the last is ${assigned}`));
      database.prepare('DELETE FROM outbox WHERE sequence <= ?').run(sequence);
      for (const published of this.#publishedAt.keys()) if (published <= sequence) this.#publishedAt.delete(published);
      return ok(undefined);
    });
  }

  close(): void {
    this.#connection.close();
  }

  #commit<T>(point: WritePoint, write: (database: JournalDatabase) => Result<T>): Result<T> {
    this.#onCommitPoint(`${point}.before`);
    const written = this.#connection.transact(write);
    if (written.ok) this.#onCommitPoint(`${point}.after`);
    return written;
  }

  #recordCommandRequest(database: JournalDatabase, command: JournaledCommand): Result<void> {
    const cause = { commandId: command.commandId, correlationId: command.correlationId };
    if (command.outcome === 'rejected') {
      const { rejection } = command;
      if (rejection.kind === 'command-rejected') {
        this.#append(database, { ...rejection, ...cause });
        return ok(undefined);
      }
      const { assignment, ...refusal } = rejection;
      this.#append(database, { ...refusal, ...cause, ...assignment });
      return ok(undefined);
    }
    switch (command.kind) {
      case 'cancellation':
        return recordCancellation(database, command.commandId, command.target);
      case 'assignment-end':
        // A second end of an ended assignment changes nothing.
        database.prepare('INSERT OR IGNORE INTO assignment_end (assignment_id, command_id) VALUES (?, ?)')
          .run(command.assignmentId, command.commandId);
        return ok(undefined);
      case 'assignment': {
        const recorded = recordIntent(database, command.commandId, command.intent);
        if (!recorded.ok) return recorded;
        const { assignmentId, attemptId, ownershipGeneration } = command.intent;
        this.#append(database, { kind: 'assignment-accepted', ...cause, assignmentId, attemptId, ownershipGeneration });
        return ok(undefined);
      }
    }
  }

  // Creates the execution, or admits a new operation for it, and gives the
  // operation's position among the execution's operations.
  #prepareExecution(database: JournalDatabase, request: LaunchRequest): Result<number> {
    const execution = executionRow(database, request.executionId);
    if (execution === undefined) {
      database.prepare('INSERT INTO execution (execution_id, assignment_id) VALUES (?, ?)')
        .run(request.executionId, request.assignmentId);
      return ok(1);
    }
    if (execution.assignment_id !== request.assignmentId) {
      return err(failure('conflict', `execution ${request.executionId} belongs to another assignment`));
    }
    const last = database.prepare(`SELECT position, outcome FROM authorization_request
      WHERE execution_id = ? ORDER BY position DESC LIMIT 1`).get(request.executionId);
    if (!mayAuthorizeAgain(execution, last, request)) {
      return err(failure('precondition-failed', `execution ${request.executionId} cannot be authorized again`));
    }
    return ok(storedInteger<number>(last ?? { position: 0 }, 'position') + 1);
  }

  // The pending operation's execution, checked against `executionId` if given.
  #pendingAuthorization(database: JournalDatabase, operationId: OperationId, executionId?: ExecutionId): Result<ExecutionId> {
    const pending = database.prepare(`SELECT request.execution_id, request.outcome, execution.state
      FROM authorization_request AS request JOIN execution USING (execution_id)
      WHERE request.operation_id = ?`).get(operationId);
    const open = pending?.state === null || pending?.state === 'authorized';
    if (pending?.outcome !== 'pending' || !open || (executionId !== undefined && pending.execution_id !== executionId)) {
      return err(failure('precondition-failed', `operation ${operationId} has no pending request`));
    }
    return ok(storedText<ExecutionId>(pending, 'execution_id'));
  }

  // A terminal fact's sequence tells when it is confirmed.
  #moveExecution(database: JournalDatabase, executionId: ExecutionId, state: string, fact: ObservationFact): void {
    const sequence = this.#append(database, fact);
    const terminal = state === 'exited' || state === 'not-started' ? sequence : null;
    database.prepare('UPDATE execution SET state = ?, terminal_sequence = ? WHERE execution_id = ?').run(state, terminal, executionId);
  }

  // Assigns the next number of the gapless sequence in the same transaction.
  #append(database: JournalDatabase, fact: ObservationFact): number {
    const sequence = storedInteger<number>(metaRow(database), 'next_sequence');
    database.prepare('INSERT INTO outbox (sequence, observation_id, fact, recorded_at) VALUES (?, ?, ?, ?)')
      .run(sequence, observationIdOf(fact, this.binding.journalId), JSON.stringify(fact), this.#clock.now());
    database.prepare('UPDATE journal_meta SET next_sequence = ?').run(sequence + 1);
    return sequence;
  }
}

// A fixed field order, so the stored declaration compares by content.
function canonicalCapacity(capacity: DeclaredCapacity): DeclaredCapacity {
  const { slots, cpuMillicores, memoryMebibytes, enforceableControls, protocolVersions: { minimum, maximum } } = capacity;
  return { slots, cpuMillicores, memoryMebibytes, enforceableControls, protocolVersions: { minimum, maximum } };
}

function recordCancellation(database: JournalDatabase, commandId: CommandId, target: CancellationTarget): Result<void> {
  const targetId = target.kind === 'attempt' ? target.attemptId : target.executionId;
  database.prepare('INSERT INTO cancellation_request (command_id, target_kind, target_id) VALUES (?, ?, ?)')
    .run(commandId, target.kind, targetId);
  return ok(undefined);
}

function recordIntent(database: JournalDatabase, commandId: CommandId, intent: LaunchIntent): Result<void> {
  if (database.prepare('SELECT 1 FROM launch_intent WHERE assignment_id = ?').get(intent.assignmentId)) {
    return err(failure('conflict', `assignment ${intent.assignmentId} already has a launch intent`));
  }
  const { requested } = intent;
  database.prepare(`INSERT INTO launch_intent
    (assignment_id, command_id, attempt_id, ownership_generation, admission_id, admission_generation,
     recovery_epoch, cpu_millicores, memory_mebibytes, hard_controls)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    intent.assignmentId,
    commandId,
    intent.attemptId,
    intent.ownershipGeneration,
    intent.admissionId,
    intent.admissionGeneration,
    intent.recoveryEpoch,
    requested.cpuMillicores,
    requested.memoryMebibytes,
    JSON.stringify(requested.hardControls),
  );
  return ok(undefined);
}

// Before a grant only a retryable rejection or an expired operation is
// retried; after one, only while its launch record says it has not started.
function mayAuthorizeAgain(execution: Row, last: Row | undefined, request: LaunchRequest): boolean {
  if (execution.state === null) return last?.outcome === 'rejected-retryable' || last?.outcome === 'expired';
  const settled = last?.outcome === 'granted' || last?.outcome === 'rejected-retryable';
  return execution.state === 'authorized' && settled && request.reportsNotStarted;
}

// The journal, not the caller, names the assignment an execution fact is
// about, from the launch intent the execution belongs to.
function subjectOf(database: JournalDatabase, executionId: ExecutionId): {
  readonly subject: ExecutionSubject;
  readonly recoveryEpoch: RecoveryEpoch;
} {
  const row = database.prepare(`SELECT intent.assignment_id, intent.attempt_id, intent.ownership_generation, intent.recovery_epoch
    FROM execution JOIN launch_intent AS intent USING (assignment_id) WHERE execution.execution_id = ?`).get(executionId);
  if (row === undefined) throw new TypeError(`execution ${executionId} has no launch intent`);
  return {
    subject: {
      executionId,
      assignmentId: storedText(row, 'assignment_id'),
      attemptId: storedText(row, 'attempt_id'),
      ownershipGeneration: storedInteger(row, 'ownership_generation'),
    },
    recoveryEpoch: storedInteger(row, 'recovery_epoch'),
  };
}

function executionRow(database: JournalDatabase, executionId: ExecutionId): Row | undefined {
  return database.prepare('SELECT * FROM execution WHERE execution_id = ?').get(executionId);
}

// W4 precedes every fact read from the execution record.
function writtenExecution(database: JournalDatabase, executionId: ExecutionId): Result<Row> {
  const execution = executionRow(database, executionId);
  if (execution === undefined) return err(unknownExecution(executionId));
  if (execution.record_written !== 1) return err(failure('precondition-failed', `execution ${executionId} has no journaled record`));
  return ok(execution);
}

function metaRow(database: JournalDatabase): Row {
  const row = database.prepare('SELECT * FROM journal_meta').get();
  if (row === undefined) throw new TypeError('journal metadata is missing');
  return row;
}

function unknownExecution(executionId: ExecutionId): Failure {
  return failure('not-found', `execution ${executionId} is not journaled`);
}

function notInState(executionId: ExecutionId, expected: string): Failure {
  return failure('precondition-failed', `execution ${executionId} is not ${expected}`);
}
