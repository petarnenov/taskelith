import {
  checkMessageSchema,
  SUPPORTED_PROTOCOL_VERSIONS,
  supportsProtocolVersion,
  type MessageSchemas,
} from '@taskelith/contracts';
import { err, ok, type Result } from '@taskelith/kernel';

type SchemaName = keyof MessageSchemas & string;

// The schema of each message type the execution contract puts on a subject.
export const COMMAND_SCHEMAS: Readonly<Record<string, SchemaName>> = Object.freeze({
  'execution.assignment.offer': 'AssignmentOfferCommand',
  'execution.cancellation.request': 'CancellationCommand',
  'execution.assignment.end': 'AssignmentEndCommand',
});

export const COMMAND_SUBJECT_NOTICES: Readonly<Record<string, SchemaName>> = Object.freeze({
  'execution.observations.confirmed': 'ObservationsConfirmed',
  'worker.inventory.requested': 'InventoryRequested',
});

export const OBSERVATION_SCHEMAS: Readonly<Record<string, SchemaName>> = Object.freeze({
  'execution.assignment.accepted': 'AssignmentAcceptedObservation',
  'execution.assignment.refused': 'AssignmentRefusedObservation',
  'execution.command.rejected': 'CommandRejectedObservation',
  'execution.launch.rejected': 'LaunchRejectedObservation',
  'execution.started': 'ExecutionStartedObservation',
  'execution.exited': 'ExecutionExitedObservation',
  'execution.not-started': 'ExecutionNotStartedObservation',
  'execution.uncertain': 'ExecutionUncertainObservation',
  'execution.termination-unproven': 'TerminationUnprovenObservation',
  'execution.unrecorded-process': 'UnrecordedProcessObservation',
  'execution.cancellation.not-applied': 'CancellationNotAppliedObservation',
  'worker.capacity.declared': 'CapacityDeclaredObservation',
  'worker.admission-pressure.changed': 'AdmissionPressureChangedObservation',
});

export const INVENTORY_REPORTED = 'worker.inventory.reported';

// A received message that passed its schema. `identity` is the body field the
// receiver deduplicates by; confirmations and inventory requests have none.
export interface WireMessage {
  readonly type: string;
  readonly identity: string | undefined;
  readonly body: Readonly<Record<string, unknown>>;
}

// Why a message is quarantined instead of handled; the reason goes into the
// MSG_TERMINATED advisory and the quarantine record.
export type Malformed = string;

// A command of a protocol version the worker does not support passes with its
// stable part only, so that the worker can reject it (contract section 3).
export function readCommandSubjectMessage(data: Uint8Array): Result<WireMessage, Malformed> {
  const body = parseObject(data);
  if (!body.ok) return body;
  const notice = noticeType(body.value);
  if (notice !== undefined) return validated(body.value, COMMAND_SUBJECT_NOTICES[notice]!, notice, undefined);
  const versioned = checkMessageSchema('VersionedCommand', body.value);
  if (!versioned.ok) return err(violation('VersionedCommand', versioned.error));
  const { metadata, payload } = versioned.value;
  const schema = COMMAND_SCHEMAS[metadata.commandType];
  const message = { type: metadata.commandType, identity: metadata.commandId, body: body.value };
  // This build's schemas describe exactly the versions it supports.
  if (!supportsProtocolVersion(SUPPORTED_PROTOCOL_VERSIONS, payload.protocolVersion)) return ok(message);
  if (schema === undefined) return err(`unknown command type ${metadata.commandType}`);
  return validated(body.value, schema, message.type, message.identity);
}

export function readObservationSubjectMessage(data: Uint8Array): Result<WireMessage, Malformed> {
  const body = parseObject(data);
  if (!body.ok) return body;
  if (body.value['messageType'] === INVENTORY_REPORTED) {
    const report = checkMessageSchema('InventoryReported', body.value);
    if (!report.ok) return err(violation('InventoryReported', report.error));
    return ok({ type: INVENTORY_REPORTED, identity: `${report.value.reportId}.${report.value.part}`, body: body.value });
  }
  const metadata = body.value['metadata'] as Record<string, unknown> | undefined;
  const type = typeof metadata?.['observationType'] === 'string' ? metadata['observationType'] : undefined;
  const schema = type === undefined ? undefined : OBSERVATION_SCHEMAS[type];
  if (schema === undefined) return err(`unknown observation type ${String(type)}`);
  return validated(body.value, schema, type!, String(metadata!['observationId']));
}

function noticeType(body: Readonly<Record<string, unknown>>): string | undefined {
  const type = body['messageType'];
  return typeof type === 'string' && type in COMMAND_SUBJECT_NOTICES ? type : undefined;
}

function validated(
  body: Readonly<Record<string, unknown>>,
  schema: SchemaName,
  type: string,
  identity: string | undefined,
): Result<WireMessage, Malformed> {
  const checked = checkMessageSchema(schema, body);
  return checked.ok ? ok({ type, identity, body }) : err(violation(schema, checked.error));
}

function parseObject(data: Uint8Array): Result<Readonly<Record<string, unknown>>, Malformed> {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
  } catch {
    return err('not UTF-8 JSON');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return err('not a JSON object');
  return ok(value as Record<string, unknown>);
}

// The advisory reason stays short; the full list is in the quarantine copy's
// source message, which a reader can validate again.
function violation(schema: string, violations: readonly string[]): Malformed {
  return `violates ${schema}: ${violations[0]}${violations.length > 1 ? ` (+${violations.length - 1})` : ''}`;
}
