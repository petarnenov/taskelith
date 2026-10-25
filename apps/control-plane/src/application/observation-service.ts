import { createHash } from 'node:crypto';
import { EXECUTION_PROTOCOL_VERSION, type MessageSchemas } from '@taskelith/contracts';
import { classifyObservation, recordAppliedSequence, type ProducerCursor } from '@taskelith/execution';
import { err, failure, ok, parseEventMetadata, type Failure, type Instant, type Result } from '@taskelith/kernel';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import type { ControlPlaneStore, ControlPlaneTransaction } from './control-plane-store.js';
import { evaluateSnapshots } from './inventory-reconciliation.js';
import { authenticateProducer, retireJournal, type ReconciliationContext } from './journal-reconciliation.js';
import { OBSERVATION_EFFECTS, type ObservationEffect } from './observation-effects.js';
import { isNotConsumed, notConsumed, parseObservation, type Observation, type ObservationMessage } from './observation.js';
import { PendingLog } from './pending-log.js';

// The durable consumer of every worker's observations, and its inbox.
export const OBSERVATION_CONSUMER = 'control-plane-observations';

// `rejected`: recorded and confirmed without effect, as the domain refused it.
export type ObservationOutcome = 'applied' | 'rejected' | 'duplicate';

const CONFIRMATION = 'execution.observations.confirmed';
const DOMAIN_REFUSALS = new Set(['conflict', 'precondition-failed', 'forbidden', 'not-found']);
const NO_EFFECT: ObservationEffect = async () => ok(undefined);
// A sequence rollback found in the transaction, which then rolls back.
const ROLLBACK_FOUND = 'journal-rollback';

export interface ObservationServiceOptions {
  // A new outbox event identity for each confirmation sent again.
  readonly newConfirmationId: () => string;
  // The `requestId` of each inventory request: random in production.
  readonly newRequestId: () => string;
  readonly logger?: Logger;
}

type Settled = 'committed' | 'refused';

// Item 21b: each observation in one SERIALIZABLE transaction; an `Err` makes
// the consumer deliver it again, and one not consumed reaches quarantine.
export class ObservationService {
  readonly #store: ControlPlaneStore;
  readonly #newConfirmationId: () => string;
  readonly #newRequestId: () => string;
  readonly #logger: Logger;

  constructor(store: ControlPlaneStore, options: ObservationServiceOptions) {
    this.#store = store;
    this.#newConfirmationId = options.newConfirmationId;
    this.#newRequestId = options.newRequestId;
    this.#logger = options.logger ?? SILENT_LOGGER;
  }

  // A refused effect rolls back and is recorded again without it, so that
  // no part of it commits; a rollback retires the journal on its own.
  async apply(message: ObservationMessage): Promise<Result<ObservationOutcome>> {
    const parsed = parseObservation(message);
    if (!parsed.ok) return parsed;
    const observation = parsed.value;
    const effect = OBSERVATION_EFFECTS[observation.type];
    if (effect === undefined) return this.#leaveUnconsumed(observation);
    const applied = await this.#transaction('committed', (tx, context) => this.#record(tx, context, observation, effect, 'applied'));
    if (applied.ok) return applied;
    if (applied.error.details.reason === ROLLBACK_FOUND) return this.#retire(observation);
    if (isNotConsumed(applied.error)) return this.#leaveUnconsumed(observation);
    if (!DOMAIN_REFUSALS.has(applied.error.code)) return applied;
    this.#logRejection(observation, applied.error);
    return this.#transaction('committed', (tx, context) => this.#record(tx, context, observation, NO_EFFECT, 'rejected'));
  }

  // Decision 1, and the pending snapshots that a grown confirmed prefix may
  // complete (21c decision 7).
  async #record(
    tx: ControlPlaneTransaction, context: ReconciliationContext, observation: Observation, effect: ObservationEffect,
    outcome: 'applied' | 'rejected',
  ): Promise<Result<ObservationOutcome>> {
    const authentic = await authenticateProducer(tx, producerOf(observation), context);
    if (!authentic.ok) return authentic;
    const inbox = await tx.inbox.accept(OBSERVATION_CONSUMER, observation.messageId);
    if (!inbox.ok) return inbox;
    if (inbox.value === 'duplicate') return this.#recordKnown(tx, context, observation);
    const { workerId, journalId } = observation.position;
    const cursor = await tx.cursors.get(workerId, journalId);
    // The inbox ran first, so an applied sequence here has a new identity.
    const sequenceClass = classifyObservation(cursor, observation.position);
    if (!sequenceClass.ok) return sequenceClass;
    if (sequenceClass.value === 'rollback') return err(failure('conflict', 'the sequence is a rollback', { reason: ROLLBACK_FOUND }));
    if (sequenceClass.value !== 'new') return notConsumed(`its sequence is a ${sequenceClass.value}`);
    const recorded = await recordPosition(tx, context, observation, cursor, effect);
    return recorded.ok ? ok(outcome) : recorded;
  }

  // 21c decision 2: a known identity at a sequence new to its journal is a
  // fact derived again, whose position is recorded without its effect.
  async #recordKnown(tx: ControlPlaneTransaction, context: ReconciliationContext, observation: Observation): Promise<Result<ObservationOutcome>> {
    const { workerId, journalId, observationId } = observation.position;
    const cursor = await tx.cursors.get(workerId, journalId);
    // No identity is kept per sequence, so a known one there is a repeat.
    const sequenceClass = classifyObservation(cursor, observation.position, observationId);
    if (!sequenceClass.ok) return sequenceClass;
    if (sequenceClass.value === 'duplicate') return this.#confirmAgain(tx, observation, cursor);
    const recorded = await recordPosition(tx, context, observation, cursor, NO_EFFECT);
    return recorded.ok ? ok('duplicate') : recorded;
  }

  // Decision 7: a duplicate within the confirmed prefix means that the
  // worker may have lost its confirmation, so the prefix is sent again.
  async #confirmAgain(tx: ControlPlaneTransaction, observation: Observation, cursor: ProducerCursor): Promise<Result<ObservationOutcome>> {
    if (observation.position.sequence > cursor.confirmedThrough) return ok('duplicate');
    const sent = await appendConfirmation(tx, observation, cursor, { eventId: this.#newConfirmationId(), at: await tx.now() });
    return sent.ok ? ok('duplicate') : sent;
  }

  // Decision 3: an authenticated one still counts as first contact, which
  // commits on its own; its sequence stays unrecorded.
  async #leaveUnconsumed(observation: Observation): Promise<Result<never>> {
    const contact = await this.#transaction('refused', (tx, context) => recordContactOf(tx, context, observation));
    return contact.ok || isNotConsumed(contact.error) ? notConsumed(`${observation.type} is left to a later change`) : contact;
  }

  // 21c decision 3: the retirement commits on its own, and the observation
  // is not consumed.
  async #retire(observation: Observation): Promise<Result<never>> {
    const retired = await this.#transaction('committed', (tx, context) => retireRolledBack(tx, observation, context));
    return retired.ok ? notConsumed('its sequence is a rollback, which retired its journal') : retired;
  }

  // Writes the warnings of the attempt that settled: one that committed,
  // and with `refused` one that refused the observation too.
  async #transaction<Value>(
    settled: Settled, work: (tx: ControlPlaneTransaction, context: ReconciliationContext) => Promise<Result<Value>>,
  ): Promise<Result<Value>> {
    let log = new PendingLog();
    const result = await this.#store.transaction((tx) => {
      log = new PendingLog();
      return work(tx, { log, newRequestId: this.#newRequestId, requested: new Set() });
    });
    if (result.ok || (settled === 'refused' && isNotConsumed(result.error))) log.writeTo(this.#logger);
    return result;
  }

  #logRejection(observation: Observation, error: Failure): void {
    const { workerId, observationId } = observation.position;
    this.#logger.with({ workerId, observationId, correlationId: observation.correlationId }).warn('execution.observation.rejected', {
      type: observation.type, code: error.code, reason: error.details.reason ?? error.code, message: error.message,
    });
  }
}

async function recordContactOf(tx: ControlPlaneTransaction, context: ReconciliationContext, observation: Observation): Promise<Result<void>> {
  const authentic = await authenticateProducer(tx, producerOf(observation), context);
  return authentic.ok ? tx.reports.recordContact(observation.position.workerId, await tx.now()) : authentic;
}

// A replacement committed since the rollback was found already retired the
// journal; the new incarnation's reachability is left alone.
async function retireRolledBack(tx: ControlPlaneTransaction, observation: Observation, context: ReconciliationContext): Promise<Result<void>> {
  const { workerId, journalId } = observation.position;
  const worker = await tx.fleet.worker(workerId);
  if (!worker.ok) return worker;
  if (worker.value?.journalId !== journalId) return ok(undefined);
  const sequenceClass = classifyObservation(await tx.cursors.get(workerId, journalId), observation.position);
  if (!sequenceClass.ok) return sequenceClass;
  return sequenceClass.value === 'rollback' ? retireJournal(tx, workerId, journalId, 'sequence-rollback', context) : ok(undefined);
}

// First contact, the effect, and the cursor; then the pending snapshots,
// once the confirmed prefix grew.
async function recordPosition(
  tx: ControlPlaneTransaction, context: ReconciliationContext, observation: Observation, cursor: ProducerCursor, effect: ObservationEffect,
): Promise<Result<void>> {
  const { workerId, journalId } = observation.position;
  const at = await tx.now();
  const contact = await tx.reports.recordContact(workerId, at);
  if (!contact.ok) return contact;
  const effected = await effect(tx, observation, at, context.log);
  if (!effected.ok) return effected;
  const advanced = await advanceCursor(tx, observation, cursor, at);
  if (!advanced.ok) return advanced;
  return advanced.value ? evaluateSnapshots(tx, workerId, journalId, context) : ok(undefined);
}

function producerOf(observation: Observation) {
  const { workerId, journalId } = observation.position;
  return { subjectWorkerId: observation.subjectWorkerId, workerId, journalId };
}

// Answers whether the confirmed prefix grew.
async function advanceCursor(tx: ControlPlaneTransaction, observation: Observation, cursor: ProducerCursor, at: Instant): Promise<Result<boolean>> {
  const next = recordAppliedSequence(cursor, observation.position.sequence);
  if (!next.ok) return next;
  const saved = await tx.cursors.save(next.value);
  if (!saved.ok) return saved;
  if (next.value.confirmedThrough <= cursor.confirmedThrough) return ok(false);
  const sent = await appendConfirmation(tx, observation, next.value, { eventId: firstConfirmationId(next.value), at });
  return sent.ok ? ok(true) : sent;
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
