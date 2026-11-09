import { createHash } from 'node:crypto';
import { SESSION_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from '@taskelith/contracts';

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

export function heartbeat(workerId: string) {
  return { messageType: 'worker.heartbeat', schemaVersion: 1, protocolVersion: 1, workerId, journalId: 'journal-1', sentAt: AT };
}

const SESSION = 'session-1';
const TURN = 'turn-1';
const REQUEST = { generation: 2, nativeRequestId: 'request-1' };
const EPOCH = { recoveryEpoch: 1 };
// The command whose outcome a not-delivered or acceptance-unknown report is.
export const TURN_DELIVERY_COMMAND_ID = 'command-turn-1';

// One valid payload per session observation of the worker messages
// contract, section 9; no text is shaped like a credential.
export const SESSION_OBSERVATION_PAYLOADS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = Object.freeze({
  'session.generation.started': { sessionId: SESSION, generation: 2, nativeSessionId: 'native-session-1', ...EPOCH },
  'session.generation.ended': { sessionId: SESSION, generation: 2, cause: 'session-ended', ...EPOCH },
  'session.turn.delivered': { sessionId: SESSION, turnId: TURN, generation: 2, ...EPOCH },
  'session.turn.not-delivered': { sessionId: SESSION, turnId: TURN, generation: 2, reason: 'turn-invalid', ...EPOCH },
  'session.turn.acceptance-unknown': { sessionId: SESSION, turnId: TURN, generation: 2, reason: 'timeout', ...EPOCH },
  'session.turn.ended': { sessionId: SESSION, turnId: TURN, generation: 2, outcome: 'completed', ...EPOCH },
  'session.request.recorded': { sessionId: SESSION, request: REQUEST, kind: 'permission-request', turnId: TURN, text: 'run the tests', ...EPOCH },
  'session.response.delivery-reported': { sessionId: SESSION, request: REQUEST, report: 'delivered', ...EPOCH },
  'session.output.appended': { sessionId: SESSION, turnId: TURN, generation: 2, chunk: 1, text: 'the tests pass', ...EPOCH },
  'session.limit.signaled': { sessionId: SESSION, generation: 2, ...EPOCH },
});

// The source each identity is derived from (contract section 9, the table's
// last column); the worker's derivation is item 18's.
interface SourceFields {
  readonly sessionId?: string;
  readonly generation?: number;
  readonly turnId?: string;
  readonly chunk?: number;
  readonly signal?: number;
  readonly request?: { readonly generation: number; readonly nativeRequestId: string };
}

const SESSION_OBSERVATION_SOURCES: Readonly<Record<string, (payload: SourceFields) => readonly unknown[]>> = Object.freeze({
  'session.generation.started': ({ sessionId, generation }) => [sessionId, generation, 'generation-started'],
  'session.generation.ended': ({ sessionId, generation }) => [sessionId, generation, 'generation-ended'],
  'session.turn.delivered': ({ turnId, generation }) => [turnId, generation, 'turn-delivered'],
  'session.turn.not-delivered': () => ['command-outcome', TURN_DELIVERY_COMMAND_ID],
  'session.turn.acceptance-unknown': () => ['command-outcome', TURN_DELIVERY_COMMAND_ID],
  'session.turn.ended': ({ turnId }) => [turnId, 'turn-ended'],
  'session.request.recorded': ({ sessionId, request }) => [sessionId, request?.generation, request?.nativeRequestId, 'request-recorded'],
  'session.response.delivery-reported': ({ sessionId, request }) => [sessionId, request?.generation, request?.nativeRequestId, 'delivery-reported'],
  'session.output.appended': ({ sessionId, generation, chunk }) => [sessionId, generation, chunk, 'output-appended'],
  'session.limit.signaled': ({ sessionId, generation, signal = 1 }) => [sessionId, generation, signal, 'limit-signaled'],
});

export function sessionObservationId(type: string, payload: Readonly<Record<string, unknown>>): string {
  const source = SESSION_OBSERVATION_SOURCES[type]!(payload);
  return `obs-${createHash('sha256').update(JSON.stringify(source)).digest('hex')}`;
}

export function sessionObservation(type: string, payload: Readonly<Record<string, unknown>>, workerId = 'worker-1', sequence = 1) {
  return {
    metadata: {
      observationId: type in SESSION_OBSERVATION_SOURCES ? sessionObservationId(type, payload) : `observation-${type}`,
      observationType: type,
      schemaVersion: 1,
      protocolVersion: SESSION_PROTOCOL_VERSION,
      occurredAt: AT,
      correlationId: 'correlation-1',
      workerId,
      journalId: 'journal-1',
      sequence,
      attemptId: 'attempt-1',
      ownershipGeneration: 2,
    },
    payload,
  };
}

const PRINCIPAL = { kind: 'principal', principalId: 'person-1' };

// One valid payload per session command the tables hold (section 3).
export const SESSION_COMMAND_PAYLOADS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = Object.freeze({
  'session.turn.deliver': { sessionId: SESSION, generation: 2, turn: { turnId: TURN, position: 3, author: PRINCIPAL, text: 'run the tests' } },
  'session.response.deliver': { sessionId: SESSION, request: REQUEST, answer: { kind: 'permission', decision: 'allow' }, responder: PRINCIPAL },
});

export function sessionCommand(type: string, payload: Readonly<Record<string, unknown>>, workerId = 'worker-1') {
  const { metadata } = offer(`command-${type}`, workerId);
  return { metadata: { ...metadata, commandType: type }, payload: { protocolVersion: SESSION_PROTOCOL_VERSION, ...payload } };
}
