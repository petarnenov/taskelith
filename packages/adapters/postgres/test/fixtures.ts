import { parseEventMetadata, parseIdentifier, parseInstant } from '@taskelith/kernel';
import { createAssignment, parseResourceRequest, type Assignment } from '@taskelith/scheduling';
import { parseOwnershipGeneration, type OutboxMessage } from '@taskelith/sdlc';
import { value } from '@taskelith/testing';

export const AT = value(parseInstant('2026-10-25T09:00:00.000Z'));

export function assignment(id: string, attempt = 'attempt-1'): Assignment {
  const taskId = value(parseIdentifier('TaskId', 'task-1'));
  return createAssignment({
    id: value(parseIdentifier('AssignmentId', id)),
    attemptId: value(parseIdentifier('AttemptId', attempt)),
    workerId: value(parseIdentifier('WorkerId', 'worker-1')),
    ownershipGeneration: value(parseOwnershipGeneration(1)),
    reservation: {
      id: value(parseIdentifier('ReservationId', `reservation-${id}`)),
      scope: { projectId: value(parseIdentifier('ProjectId', 'project-1')), runId: value(parseIdentifier('RunId', 'run-1')), taskId, rootTaskId: taskId },
      requested: value(parseResourceRequest({ cpuMillicores: 500, memoryMebibytes: 512, hardControls: [] })),
      providerCredentials: [],
    },
  }, AT);
}

export function command(eventId: string): OutboxMessage {
  const metadata = value(parseEventMetadata({
    eventId, eventType: 'scheduling.assignment.offered', schemaVersion: 1, occurredAt: AT, correlationId: 'correlation-1',
  }));
  return { metadata, subject: 'worker.worker-1.commands', payload: { assignmentId: eventId } };
}
