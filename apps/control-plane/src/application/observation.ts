import type { MessageSchemas } from '@taskelith/contracts';
import { parseSequence, type AttemptId, type JournalId, type ObservationId, type ObservationPosition, type WorkerId } from '@taskelith/execution';
import { err, failure, ok, parseIdentifier, type CorrelationId, type EventId, type Failure, type Result } from '@taskelith/kernel';
import type { OwnershipGeneration } from '@taskelith/sdlc';

// An observation as the consumer delivers it, its schema already checked.
export interface ObservationMessage {
  // The worker that the subject it arrived on names, if any.
  readonly subjectWorkerId: string | undefined;
  readonly type: string;
  readonly body: Readonly<Record<string, unknown>>;
}

export type ObservationMetadata = MessageSchemas['ObservationMetadata'];

// One parsed observation: its producer position, its inbox identity, and
// the payload of its type.
export interface Observation {
  readonly type: string;
  readonly subjectWorkerId: string | undefined;
  readonly position: ObservationPosition;
  readonly messageId: EventId;
  readonly correlationId: CorrelationId;
  readonly attemptId: AttemptId | undefined;
  readonly ownershipGeneration: OwnershipGeneration | undefined;
  readonly payload: unknown;
}

export const NOT_CONSUMED = 'not-consumed';

// Item 21b, decision 3: what a later change consumes is not applied here.
export function notConsumed(why: string): Result<never> {
  return err(failure('precondition-failed', `the observation is not consumed: ${why}`, { reason: NOT_CONSUMED }));
}

export function isNotConsumed(error: Failure): boolean {
  return error.details.reason === NOT_CONSUMED;
}

// An inventory report has no observation metadata; InventoryService takes
// it. The consumer checked every identifier's schema, as the kernel's.
export function parseObservation(message: ObservationMessage): Result<Observation> {
  const metadata = message.body['metadata'] as ObservationMetadata | undefined;
  if (metadata === undefined) return notConsumed(`${message.type} is not an observation with metadata`);
  const sequence = parseSequence(metadata.sequence);
  if (!sequence.ok) return sequence;
  const messageId = parseIdentifier('EventId', metadata.observationId);
  if (!messageId.ok) return messageId;
  const correlationId = parseIdentifier('CorrelationId', metadata.correlationId);
  if (!correlationId.ok) return correlationId;
  return ok(Object.freeze({
    type: message.type,
    subjectWorkerId: message.subjectWorkerId,
    position: Object.freeze({
      workerId: metadata.workerId as WorkerId,
      journalId: metadata.journalId as JournalId,
      sequence: sequence.value,
      observationId: metadata.observationId as ObservationId,
    }),
    messageId: messageId.value,
    correlationId: correlationId.value,
    attemptId: metadata.attemptId as AttemptId | undefined,
    ownershipGeneration: metadata.ownershipGeneration as OwnershipGeneration | undefined,
    payload: message.body['payload'],
  }));
}
