import { SUPPORTED_PROTOCOL_VERSIONS } from '@taskelith/contracts';

const AT = '2026-10-25T10:00:00.000Z';

export function offer(commandId: string, workerId = 'worker-1', protocolVersion = 1) {
  return {
    metadata: {
      commandId,
      commandType: 'execution.assignment.offer',
      schemaVersion: 1,
      issuedAt: AT,
      correlationId: 'correlation-1',
      projectId: 'project-1',
      taskId: 'task-1',
      attemptId: 'attempt-1',
      workerId,
      ownershipGeneration: 2,
      sdlc: { runId: 'run-1', stageId: 'apply', admissionId: 'admission-1', admissionGeneration: 1 },
    },
    payload: {
      protocolVersion,
      assignmentId: 'assignment-1',
      recoveryEpoch: 1,
      reservation: { reservationId: 'reservation-1', requested: { cpuMillicores: 1000, memoryMebibytes: 2048, hardControls: ['cpu-limit'] } },
    },
  };
}

export function capacityDeclared(observationId: string, workerId = 'worker-1', sequence = 1) {
  return {
    metadata: {
      observationId,
      observationType: 'worker.capacity.declared',
      schemaVersion: 1,
      protocolVersion: 1,
      occurredAt: AT,
      correlationId: 'correlation-1',
      workerId,
      journalId: 'journal-1',
      sequence,
    },
    payload: {
      capacity: { slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, enforceableControls: ['cpu-limit'] },
      protocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
    },
  };
}

export function confirmation(workerId = 'worker-1', confirmedThrough = 7) {
  return { messageType: 'execution.observations.confirmed', schemaVersion: 1, protocolVersion: 1, issuedAt: AT, workerId, journalId: 'journal-1', confirmedThrough };
}

export function inventoryRequest(workerId = 'worker-1') {
  return { messageType: 'worker.inventory.requested', schemaVersion: 1, protocolVersion: 1, issuedAt: AT, workerId, requestId: 'request-1' };
}

export function inventoryPart(reportId: string, part: number, workerId = 'worker-1') {
  return {
    messageType: 'worker.inventory.reported',
    schemaVersion: 1,
    protocolVersion: 1,
    reportId,
    snapshot: 1,
    part,
    parts: 2,
    reportedAt: AT,
    workerId,
    journalId: 'journal-1',
    throughSequence: 3,
    assignments: [],
    executions: [],
  };
}
