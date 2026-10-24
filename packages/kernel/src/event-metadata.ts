import { failure, type Failure } from './failure.js';
import { parseIdentifier, type Identifier } from './identifier.js';
import { parseInstant, type Instant } from './instant.js';
import { err, ok, type Result } from './result.js';

declare const eventTypeBrand: unique symbol;
declare const schemaVersionBrand: unique symbol;

export type EventId = Identifier<'EventId'>;
export type CorrelationId = Identifier<'CorrelationId'>;
export type CausationId = Identifier<'CausationId'>;

// Dot-separated segments of lowercase letters, digits, and inner hyphens, each
// starting with a letter, as in `sdlc.gate.passed`; the owner picks the first.
export type EventType = string & { readonly [eventTypeBrand]: true };
export type SchemaVersion = number & { readonly [schemaVersionBrand]: true };

// Metadata of every event; attempt and ownership generation belong to Execution
// events, and per-producer sequence to the wire envelopes (G1 item 13).
export interface EventMetadata {
  readonly eventId: EventId;
  readonly eventType: EventType;
  readonly schemaVersion: SchemaVersion;
  readonly occurredAt: Instant;
  readonly correlationId: CorrelationId;
  readonly causationId?: CausationId;
}

export interface EventMetadataInput {
  readonly eventId: string;
  readonly eventType: string;
  readonly schemaVersion: number;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly causationId?: string;
}

const SEGMENT = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*';
const EVENT_TYPE = new RegExp(`^${SEGMENT}(?:\\.${SEGMENT})+$`);
export const MAX_EVENT_TYPE_LENGTH = 128;

export function parseEventType(text: string): Result<EventType> {
  if (text.length > MAX_EVENT_TYPE_LENGTH || !EVENT_TYPE.test(text)) {
    return err(failure(
      'invalid',
      `EventType must be at most ${MAX_EVENT_TYPE_LENGTH} characters of at least two dot-separated segments of lowercase letters, digits, and inner hyphens, each starting with a letter`,
    ));
  }
  return ok(text as EventType);
}

export function parseSchemaVersion(value: number): Result<SchemaVersion> {
  if (!Number.isSafeInteger(value) || value < 1) {
    return err(failure('invalid', 'SchemaVersion must be a positive integer'));
  }
  return ok(value as SchemaVersion);
}

export function parseEventMetadata(input: EventMetadataInput): Result<EventMetadata> {
  const eventId = parseIdentifier('EventId', input.eventId);
  if (!eventId.ok) return fieldFailure('eventId', eventId.error);
  const eventType = parseEventType(input.eventType);
  if (!eventType.ok) return fieldFailure('eventType', eventType.error);
  const schemaVersion = parseSchemaVersion(input.schemaVersion);
  if (!schemaVersion.ok) return fieldFailure('schemaVersion', schemaVersion.error);
  const occurredAt = parseInstant(input.occurredAt);
  if (!occurredAt.ok) return fieldFailure('occurredAt', occurredAt.error);
  const correlationId = parseIdentifier('CorrelationId', input.correlationId);
  if (!correlationId.ok) return fieldFailure('correlationId', correlationId.error);
  const metadata = {
    eventId: eventId.value,
    eventType: eventType.value,
    schemaVersion: schemaVersion.value,
    occurredAt: occurredAt.value,
    correlationId: correlationId.value,
  };
  if (input.causationId === undefined) return ok(Object.freeze(metadata));
  const causationId = parseIdentifier('CausationId', input.causationId);
  if (!causationId.ok) return fieldFailure('causationId', causationId.error);
  return ok(Object.freeze({ ...metadata, causationId: causationId.value }));
}

function fieldFailure(field: keyof EventMetadataInput, cause: Failure): Result<never> {
  return err(failure(cause.code, `${field}: ${cause.message}`, { ...cause.details, field }));
}
