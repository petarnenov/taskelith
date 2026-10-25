import { err, failure, ok, parseEventMetadata, type CorrelationId, type EventId, type Instant, type Result } from '@taskelith/kernel';
import type { JsonObject } from '@taskelith/sdlc';
import type { Assignment, AssignmentEndReason } from '../domain/assignment.js';
import type { CapacityTransaction } from '../ports/capacity-store.js';

export interface CommandIdentity {
  readonly commandId: EventId;
  readonly correlationId: CorrelationId;
}

// The command types of the execution wire contract (item 8), section 4.
export type WorkerCommandType = 'execution.assignment.offer' | 'execution.assignment.end' | 'execution.cancellation.request';

// What a command's payload needs from the installation and the worker; only
// an offer carries the recovery epoch.
export interface CommandSetting {
  readonly protocolVersion: number;
  readonly recoveryEpoch: number | undefined;
}

export type CommandPayload = (setting: CommandSetting) => JsonObject;

// Writes the assignment's worker a wire command under the request's identity:
// metadata with the SDLC binding, and a payload at the shared version.
export async function appendWorkerCommand(
  tx: CapacityTransaction,
  identity: CommandIdentity,
  commandType: WorkerCommandType,
  assignment: Assignment,
  at: Instant,
  payload: CommandPayload,
): Promise<Result<void>> {
  const context = await commandContext(tx, commandType, assignment);
  if (!context.ok) return context;
  // An end or cancellation for a worker without a record has no reader, and
  // must not keep its assignment from ending (capacity contract section 6).
  if (context.value === undefined) return ok(undefined);
  const event = parseEventMetadata({ eventId: identity.commandId, eventType: commandType, schemaVersion: 1, occurredAt: at, correlationId: identity.correlationId });
  if (!event.ok) return event;
  const { scope } = assignment.reservation;
  const { admission, setting } = context.value;
  const metadata: JsonObject = {
    commandId: identity.commandId,
    commandType,
    schemaVersion: 1,
    issuedAt: at,
    correlationId: identity.correlationId,
    projectId: scope.projectId,
    taskId: scope.taskId,
    attemptId: assignment.attemptId,
    workerId: assignment.workerId,
    ownershipGeneration: assignment.ownershipGeneration,
    sdlc: { runId: scope.runId, stageId: admission.stageId, admissionId: admission.id, admissionGeneration: admission.generation },
  };
  return tx.outbox.append({ metadata: event.value, subject: `workers.${assignment.workerId}.commands`, payload: { metadata, payload: payload(setting) } });
}

export function offerPayload(assignment: Assignment): CommandPayload {
  const { id, requested, retryOf } = assignment.reservation;
  return ({ protocolVersion, recoveryEpoch }) => ({
    protocolVersion,
    assignmentId: assignment.id,
    // commandContext refuses an offer without an epoch.
    recoveryEpoch: recoveryEpoch!,
    reservation: {
      reservationId: id,
      requested: { cpuMillicores: requested.cpuMillicores, memoryMebibytes: requested.memoryMebibytes, hardControls: [...requested.hardControls] },
    },
    ...(retryOf === undefined ? {} : { retryOf }),
  });
}

export function endPayload(assignment: Assignment, reason: AssignmentEndReason): CommandPayload {
  return ({ protocolVersion }) => ({ protocolVersion, assignmentId: assignment.id, reason });
}

// The cancellation that follows an ended assignment whose launch was revoked.
export function cancellationPayload(): CommandPayload {
  return ({ protocolVersion }) => ({ protocolVersion, reason: 'assignment-ended' });
}

interface CommandContext {
  readonly admission: { readonly id: string; readonly stageId: string; readonly generation: number };
  readonly setting: CommandSetting;
}

// Undefined when no command is due: an end or cancellation for a worker
// without a protocol version. An offer always needs both settings.
async function commandContext(
  tx: CapacityTransaction,
  commandType: WorkerCommandType,
  assignment: Assignment,
): Promise<Result<CommandContext | undefined>> {
  const offer = commandType === 'execution.assignment.offer';
  const protocolVersion = (await tx.workers.get(assignment.workerId))?.protocolVersion;
  const recoveryEpoch = offer ? await tx.installation.recoveryEpoch() : undefined;
  if (protocolVersion === undefined && !offer) return ok(undefined);
  if (protocolVersion === undefined || (offer && recoveryEpoch === undefined)) {
    return err(failure('precondition-failed', 'an offer needs the worker\'s protocol version and the recovery epoch', { worker: assignment.workerId }));
  }
  const task = await tx.tasks.get(assignment.reservation.scope.taskId);
  if (!task.ok) return task;
  const admission = await tx.admissions.get(task.value.admissionId);
  if (!admission.ok) return admission;
  const { id, stageId, generation } = admission.value;
  return ok({ admission: { id, stageId, generation }, setting: { protocolVersion, recoveryEpoch } });
}
