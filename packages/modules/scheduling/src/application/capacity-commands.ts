import { parseEventMetadata, type CorrelationId, type EventId, type Instant, type Result } from '@taskelith/kernel';
import type { WorkerId } from '@taskelith/execution';
import type { JsonObject } from '@taskelith/sdlc';
import type { Assignment } from '../domain/assignment.js';
import type { CapacityTransaction } from '../ports/capacity-store.js';

export interface CommandIdentity {
  readonly commandId: EventId;
  readonly correlationId: CorrelationId;
}

// Writes a worker command to the outbox under the request's identity.
export async function appendWorkerCommand(
  tx: CapacityTransaction,
  identity: CommandIdentity,
  eventType: string,
  workerId: WorkerId,
  at: Instant,
  payload: JsonObject,
): Promise<Result<void>> {
  const metadata = parseEventMetadata({ eventId: identity.commandId, eventType, schemaVersion: 1, occurredAt: at, correlationId: identity.correlationId });
  if (!metadata.ok) return metadata;
  return tx.outbox.append({ metadata: metadata.value, subject: `workers.${workerId}.commands`, payload });
}

// Payloads are provisional until item 8 defines the wire schemas.
export function offeredPayload(assignment: Assignment): JsonObject {
  const { requested } = assignment.reservation;
  return {
    provisional: true,
    assignmentId: assignment.id,
    attemptId: assignment.attemptId,
    ownershipGeneration: assignment.ownershipGeneration,
    requested: { cpuMillicores: requested.cpuMillicores, memoryMebibytes: requested.memoryMebibytes, hardControls: [...requested.hardControls] },
  };
}

export function endedPayload(assignment: Assignment): JsonObject {
  return { provisional: true, assignmentId: assignment.id, attemptId: assignment.attemptId, reason: assignment.end?.reason ?? 'released' };
}

export function cancelPayload(assignment: Assignment): JsonObject {
  return { provisional: true, assignmentId: assignment.id, attemptId: assignment.attemptId, reason: 'assignment-ended' };
}
