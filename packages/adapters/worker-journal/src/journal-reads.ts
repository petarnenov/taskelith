import type {
  AuthorizationOutcome,
  CancellationTarget,
  ExecutionState,
  JournalBinding,
  JournaledAuthorization,
  JournaledCancellation,
  JournaledExecution,
  JournalSnapshot,
  LaunchIntent,
  ObservationFact,
  OutboxEntry,
} from '@taskelith/execution';
import type { JournalDatabase } from './journal-connection.js';
import { optionalText, storedInteger, storedText, type Row } from './stored-values.js';

export function readBinding(database: JournalDatabase): JournalBinding {
  const meta = database.prepare('SELECT * FROM journal_meta').get();
  if (meta === undefined) throw new TypeError('journal metadata is missing');
  return Object.freeze({
    installationId: storedText(meta, 'installation_id'),
    workerId: storedText(meta, 'worker_id'),
    journalId: storedText(meta, 'journal_id'),
    recoveryEpoch: storedInteger(meta, 'recovery_epoch'),
  });
}

export function readSnapshot(database: JournalDatabase): JournalSnapshot {
  const authorizations = database.prepare('SELECT * FROM authorization_request ORDER BY execution_id, position').all();
  return Object.freeze({
    intents: Object.freeze(database.prepare('SELECT * FROM launch_intent ORDER BY rowid').all().map(toIntent)),
    cancellations: Object.freeze(database.prepare('SELECT * FROM cancellation_request ORDER BY rowid').all().map(toCancellation)),
    executions: Object.freeze(database.prepare('SELECT * FROM execution ORDER BY rowid').all()
      .map((row) => toExecution(row, authorizations))),
  });
}

export function readOutbox(database: JournalDatabase, binding: JournalBinding): OutboxEntry[] {
  return database.prepare('SELECT * FROM outbox ORDER BY sequence').all().map((row) => Object.freeze({
    position: Object.freeze({
      workerId: binding.workerId,
      journalId: binding.journalId,
      sequence: storedInteger(row, 'sequence'),
      observationId: storedText(row, 'observation_id'),
    }),
    fact: Object.freeze(JSON.parse(storedText(row, 'fact')) as ObservationFact),
    recordedAt: storedText(row, 'recorded_at'),
  }));
}

function toIntent(row: Row): LaunchIntent {
  return Object.freeze({
    assignmentId: storedText(row, 'assignment_id'),
    attemptId: storedText(row, 'attempt_id'),
    ownershipGeneration: storedInteger(row, 'ownership_generation'),
    admissionId: storedText(row, 'admission_id'),
    admissionGeneration: storedInteger(row, 'admission_generation'),
  });
}

function toCancellation(row: Row): JournaledCancellation {
  const target: CancellationTarget = storedText(row, 'target_kind') === 'attempt'
    ? { kind: 'attempt', attemptId: storedText(row, 'target_id') }
    : { kind: 'execution', executionId: storedText(row, 'target_id') };
  return Object.freeze({
    commandId: storedText(row, 'command_id'),
    target: Object.freeze(target),
    evidenceRecorded: row.evidence_recorded === 1,
  });
}

function toExecution(row: Row, authorizations: readonly Row[]): JournaledExecution {
  const executionId = storedText(row, 'execution_id');
  const state = optionalText<ExecutionState>(row, 'state');
  return Object.freeze({
    executionId,
    assignmentId: storedText(row, 'assignment_id'),
    ...(state === undefined ? {} : { state }),
    recordWritten: row.record_written === 1,
    authorizations: Object.freeze(authorizations
      .filter((authorization) => authorization.execution_id === executionId)
      .map(toAuthorization)),
  });
}

function toAuthorization(row: Row): JournaledAuthorization {
  const launchAuthId = optionalText(row, 'launch_auth_id');
  const rejection = optionalText(row, 'rejection_reason');
  return Object.freeze({
    operationId: storedText(row, 'operation_id'),
    outcome: storedText<AuthorizationOutcome>(row, 'outcome'),
    ...(launchAuthId === undefined ? {} : { launchAuthId }),
    ...(rejection === undefined ? {} : { rejection }),
  });
}
