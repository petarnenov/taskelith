import type {
  AuthorizationOutcome,
  CancellationTarget,
  ExecutionId,
  ExecutionState,
  JournalBinding,
  JournaledAuthorization,
  JournaledCancellation,
  JournaledExecution,
  JournaledIntent,
  JournalSnapshot,
  LaunchAuthId,
  LaunchRejectionReason,
  ObservationFact,
  ObservationPosition,
  OutboxEntry,
  ResourceRequest,
} from '@taskelith/execution';
import type { JournalDatabase } from './journal-connection.js';
import { optionalText, storedInteger, storedText, type Row } from './stored-values.js';

export function readBinding(database: JournalDatabase): JournalBinding {
  const meta = database.prepare('SELECT * FROM journal_meta').get();
  if (meta === undefined) throw new TypeError('journal metadata is missing');
  const binding: JournalBinding = {
    installationId: storedText(meta, 'installation_id'),
    workerId: storedText(meta, 'worker_id'),
    journalId: storedText(meta, 'journal_id'),
    recoveryEpoch: storedInteger(meta, 'recovery_epoch'),
  };
  return Object.freeze(binding);
}

export function readSnapshot(database: JournalDatabase): JournalSnapshot {
  const authorizations = database.prepare('SELECT * FROM authorization_request ORDER BY execution_id, position').all();
  return Object.freeze({
    intents: Object.freeze(database.prepare(`SELECT launch_intent.*, assignment_end.command_id IS NOT NULL AS ended
      FROM launch_intent LEFT JOIN assignment_end USING (assignment_id) ORDER BY launch_intent.rowid`).all().map(toIntent)),
    cancellations: Object.freeze(database.prepare('SELECT * FROM cancellation_request ORDER BY rowid').all().map(toCancellation)),
    executions: Object.freeze(database.prepare('SELECT * FROM execution ORDER BY rowid').all()
      .map((row) => toExecution(row, authorizations))),
  });
}

export function readOutbox(database: JournalDatabase, binding: JournalBinding): OutboxEntry[] {
  return database.prepare('SELECT * FROM outbox ORDER BY sequence').all().map((row) => {
    const position: ObservationPosition = {
      workerId: binding.workerId,
      journalId: binding.journalId,
      sequence: storedInteger(row, 'sequence'),
      observationId: storedText(row, 'observation_id'),
    };
    const entry: OutboxEntry = {
      position: Object.freeze(position),
      fact: Object.freeze(JSON.parse(storedText(row, 'fact')) as ObservationFact),
      recordedAt: storedText(row, 'recorded_at'),
    };
    return Object.freeze(entry);
  });
}

function toIntent(row: Row): JournaledIntent {
  const requested: ResourceRequest = {
    cpuMillicores: storedInteger(row, 'cpu_millicores'),
    memoryMebibytes: storedInteger(row, 'memory_mebibytes'),
    hardControls: Object.freeze(JSON.parse(storedText(row, 'hard_controls')) as string[]),
  };
  const intent: JournaledIntent = {
    assignmentId: storedText(row, 'assignment_id'),
    attemptId: storedText(row, 'attempt_id'),
    ownershipGeneration: storedInteger(row, 'ownership_generation'),
    admissionId: storedText(row, 'admission_id'),
    admissionGeneration: storedInteger(row, 'admission_generation'),
    recoveryEpoch: storedInteger(row, 'recovery_epoch'),
    requested: Object.freeze(requested),
    commandId: storedText(row, 'command_id'),
    ended: row.ended === 1,
  };
  return Object.freeze(intent);
}

function toCancellation(row: Row): JournaledCancellation {
  const target: CancellationTarget = storedText(row, 'target_kind') === 'attempt'
    ? { kind: 'attempt', attemptId: storedText(row, 'target_id') }
    : { kind: 'execution', executionId: storedText(row, 'target_id') };
  const cancellation: JournaledCancellation = {
    commandId: storedText(row, 'command_id'),
    target: Object.freeze(target),
    evidenceRecorded: row.evidence_recorded === 1,
  };
  return Object.freeze(cancellation);
}

function toExecution(row: Row, authorizations: readonly Row[]): JournaledExecution {
  const executionId = storedText<ExecutionId>(row, 'execution_id');
  const state = optionalText<ExecutionState>(row, 'state');
  const execution: JournaledExecution = {
    executionId,
    assignmentId: storedText(row, 'assignment_id'),
    ...(state === undefined ? {} : { state }),
    recordWritten: row.record_written === 1,
    uncertain: storedInteger<number>(row, 'uncertain_count') > 0,
    authorizations: Object.freeze(authorizations
      .filter((authorization) => authorization.execution_id === executionId)
      .map(toAuthorization)),
  };
  return Object.freeze(execution);
}

function toAuthorization(row: Row): JournaledAuthorization {
  const launchAuthId = optionalText<LaunchAuthId>(row, 'launch_auth_id');
  const rejection = optionalText<LaunchRejectionReason>(row, 'rejection_reason');
  const authorization: JournaledAuthorization = {
    operationId: storedText(row, 'operation_id'),
    outcome: storedText<AuthorizationOutcome>(row, 'outcome'),
    ...(launchAuthId === undefined ? {} : { launchAuthId }),
    ...(rejection === undefined ? {} : { rejection }),
  };
  return Object.freeze(authorization);
}
