import { createHash } from 'node:crypto';
import { EXECUTION_PROTOCOL_VERSION, type MessageSchemas } from '@taskelith/contracts';
import { classifyObservation, recordAppliedSequence, type ProducerCursor } from '@taskelith/execution';
import { ok, parseEventMetadata, type Failure, type Instant, type Result } from '@taskelith/kernel';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import type { ControlPlaneStore, ControlPlaneTransaction } from './control-plane-store.js';
import { OBSERVATION_EFFECTS, type ObservationEffect } from './observation-effects.js';
import { NOT_CONSUMED, notConsumed, parseObservation, type Observation, type ObservationMessage } from './observation.js';
import { isAuthenticProducer } from './producer-authentication.js';

// The durable consumer of every worker's observations, and its inbox.
export const OBSERVATION_CONSUMER = 'control-plane-observations';

// `rejected`: recorded and confirmed without effect, as the domain refused it.
export type ObservationOutcome = 'applied' | 'rejected' | 'duplicate';

const CONFIRMATION = 'execution.observations.confirmed';
const DOMAIN_REFUSALS = new Set(['conflict', 'precondition-failed', 'forbidden', 'not-found']);
const NO_EFFECT: ObservationEffect = async () => ok(undefined);

export interface ObservationServiceOptions {
  // A new outbox event identity for each confirmation sent again.
  readonly newConfirmationId: () => string;
  readonly logger?: Logger;
}

// Item 21b: each observation in one SERIALIZABLE transaction; an `Err` makes
// the consumer deliver it again, and one not consumed reaches quarantine.
export class ObservationService {
  readonly #store: ControlPlaneStore;
  readonly #newConfirmationId: () => string;
  readonly #logger: Logger;

  constructor(store: ControlPlaneStore, options: ObservationServiceOptions) {
    this.#store = store;
    this.#newConfirmationId = options.newConfirmationId;
    this.#logger = options.logger ?? SILENT_LOGGER;
  }

  // A refused effect rolls back and is recorded again without it, so that
  // no part of it commits.
  async apply(message: ObservationMessage): Promise<Result<ObservationOutcome>> {
    const parsed = parseObservation(message);
    if (!parsed.ok) return parsed;
    const observation = parsed.value;
    const effect = OBSERVATION_EFFECTS[observation.type];
    if (effect === undefined) return this.#leaveUnconsumed(observation);
    const applied = await this.#store.transaction((tx) => this.#record(tx, observation, effect, 'applied'));
    if (applied.ok) return applied;
    if (isNotConsumed(applied.error)) return this.#leaveUnconsumed(observation);
    if (!DOMAIN_REFUSALS.has(applied.error.code)) return applied;
    this.#logRejection(observation, applied.error);
    return this.#store.transaction((tx) => this.#record(tx, observation, NO_EFFECT, 'rejected'));
  }

  // Decision 1: authentication, first contact, the inbox, the sequence, the
  // effect, the cursor, and a confirmation when its prefix grew.
  async #record(
    tx: ControlPlaneTransaction, observation: Observation, effect: ObservationEffect, outcome: 'applied' | 'rejected',
  ): Promise<Result<ObservationOutcome>> {
    const authentic = await authenticate(tx, observation);
    if (!authentic.ok) return authentic;
    const { workerId, journalId } = observation.position;
    const at = await tx.now();
    // A duplicate is contact too, so a republishing worker stays reachable.
    const contact = await tx.reports.recordContact(workerId, at);
    if (!contact.ok) return contact;
    const inbox = await tx.inbox.accept(OBSERVATION_CONSUMER, observation.messageId);
    if (!inbox.ok) return inbox;
    if (inbox.value === 'duplicate') return this.#confirmAgain(tx, observation);
    const cursor = await tx.cursors.get(workerId, journalId);
    // The inbox ran first, so an applied sequence here has a new identity.
    const sequenceClass = classifyObservation(cursor, observation.position);
    if (!sequenceClass.ok) return sequenceClass;
    if (sequenceClass.value !== 'new') return notConsumed(`its sequence is a ${sequenceClass.value}`);
    const effected = await effect(tx, observation, at);
    if (!effected.ok) return effected;
    const advanced = await advanceCursor(tx, observation, cursor, at);
    return advanced.ok ? ok(outcome) : advanced;
  }

  // Decision 7: a duplicate within the confirmed prefix means that the
  // worker may have lost its confirmation, so the prefix is sent again.
  async #confirmAgain(tx: ControlPlaneTransaction, observation: Observation): Promise<Result<ObservationOutcome>> {
    const { workerId, journalId, sequence } = observation.position;
    const cursor = await tx.cursors.get(workerId, journalId);
    if (sequence > cursor.confirmedThrough) return ok('duplicate');
    const sent = await appendConfirmation(tx, observation, cursor, { eventId: this.#newConfirmationId(), at: await tx.now() });
    return sent.ok ? ok('duplicate') : sent;
  }

  // Decision 3: an authenticated one still counts as first contact, which
  // commits on its own; its sequence stays unrecorded.
  async #leaveUnconsumed(observation: Observation): Promise<Result<never>> {
    const contact = await this.#store.transaction((tx) => recordContactOf(tx, observation));
    return contact.ok || isNotConsumed(contact.error) ? notConsumed(`${observation.type} is left to a later change`) : contact;
  }

  #logRejection(observation: Observation, error: Failure): void {
    const { workerId, observationId } = observation.position;
    this.#logger.with({ workerId, observationId, correlationId: observation.correlationId }).warn('execution.observation.rejected', {
      type: observation.type, code: error.code, reason: error.details.reason ?? error.code, message: error.message,
    });
  }
}

async function recordContactOf(tx: ControlPlaneTransaction, observation: Observation): Promise<Result<void>> {
  const authentic = await authenticate(tx, observation);
  return authentic.ok ? tx.reports.recordContact(observation.position.workerId, await tx.now()) : authentic;
}

// Decision 2; a revoked worker is 21d's, another journal 21c's.
async function authenticate(tx: ControlPlaneTransaction, observation: Observation): Promise<Result<void>> {
  const { workerId, journalId } = observation.position;
  const authentic = await isAuthenticProducer(tx, { subjectWorkerId: observation.subjectWorkerId, workerId, journalId });
  if (!authentic.ok) return authentic;
  return authentic.value ? ok(undefined) : notConsumed(`its producer ${workerId} is not authenticated`);
}

async function advanceCursor(tx: ControlPlaneTransaction, observation: Observation, cursor: ProducerCursor, at: Instant): Promise<Result<void>> {
  const next = recordAppliedSequence(cursor, observation.position.sequence);
  if (!next.ok) return next;
  const saved = await tx.cursors.save(next.value);
  if (!saved.ok) return saved;
  if (next.value.confirmedThrough <= cursor.confirmedThrough) return ok(undefined);
  return appendConfirmation(tx, observation, next.value, { eventId: firstConfirmationId(next.value), at });
}

// Decision 7: unique by worker, journal, and value, which only grows.
function firstConfirmationId({ workerId, journalId, confirmedThrough }: ProducerCursor): string {
  return `o${createHash('sha256').update(JSON.stringify([workerId, journalId, confirmedThrough])).digest('hex')}`;
}

interface ConfirmationEvent {
  readonly eventId: string;
  readonly at: Instant;
}

// A worker without a common version gets this build's own.
async function appendConfirmation(
  tx: ControlPlaneTransaction, observation: Observation, cursor: ProducerCursor, { eventId, at }: ConfirmationEvent,
): Promise<Result<void>> {
  const { workerId, journalId, confirmedThrough } = cursor;
  const metadata = parseEventMetadata({ eventId, eventType: CONFIRMATION, schemaVersion: 1, occurredAt: at, correlationId: observation.correlationId });
  if (!metadata.ok) return metadata;
  const protocolVersion = (await tx.workers.get(workerId))?.protocolVersion ?? EXECUTION_PROTOCOL_VERSION;
  const payload: MessageSchemas['ObservationsConfirmed'] = {
    messageType: CONFIRMATION, schemaVersion: 1, protocolVersion, issuedAt: at, workerId, journalId, confirmedThrough,
  };
  return tx.outbox.append({ metadata: metadata.value, subject: `workers.${workerId}.commands`, payload: { ...payload } });
}

function isNotConsumed(error: Failure): boolean {
  return error.details.reason === NOT_CONSUMED;
}
