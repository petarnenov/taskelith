import { ok, type EventId, type Result } from '@taskelith/kernel';
import { SILENT_LOGGER, type LogCorrelation, type Logger } from '@taskelith/observability';
import type { OutboxMessage } from '@taskelith/sdlc';
import { abortableDelay } from './abortable-delay.js';
import { encodeJson, type JetStreamPublisher } from './jetstream-publisher.js';
import type { TransportAddress } from './transport-address.js';
import { retryDelayMilliseconds, TRANSPORT_LIMITS, type TransportLimits } from './transport-limits.js';

// The outbox side the publisher needs; PostgresOutboxRelay provides it.
export interface OutboxSource {
  unpublished(limit: number): Promise<Result<readonly OutboxMessage[]>>;
  markPublished(eventId: EventId): Promise<Result<void>>;
}

export interface PublishRound {
  readonly published: number;
  // Rows left for a later round, after a failure on their subject.
  readonly deferred: number;
}

// Holds a round of publications under a condition, such as the absence of
// restore quarantine, that must not change while the round runs.
export interface PublicationFence {
  hold<Value>(work: () => Promise<Result<Value>>): Promise<Result<Value>>;
}

export interface OutboxPublisherOptions {
  readonly limits?: TransportLimits;
  readonly now?: () => number;
  readonly logger?: Logger;
  readonly fence?: PublicationFence;
}

export const OUTBOX_BATCH = 100;

interface SubjectBackoff {
  readonly failures: number;
  readonly retryAt: number;
}

// Publishes outbox rows under their event identity, in append order per
// subject; a failing subject backs off alone while the others go on.
export class OutboxPublisher {
  readonly #source: OutboxSource;
  readonly #publisher: JetStreamPublisher;
  readonly #address: TransportAddress;
  readonly #limits: TransportLimits;
  readonly #now: () => number;
  readonly #logger: Logger;
  readonly #backoff = new Map<string, SubjectBackoff>();
  readonly #fence: PublicationFence | undefined;

  constructor(source: OutboxSource, publisher: JetStreamPublisher, address: TransportAddress, options: OutboxPublisherOptions = {}) {
    this.#fence = options.fence;
    this.#source = source;
    this.#publisher = publisher;
    this.#address = address;
    this.#limits = options.limits ?? TRANSPORT_LIMITS;
    this.#now = options.now ?? Date.now;
    this.#logger = options.logger ?? SILENT_LOGGER;
  }

  publishPending(limit = OUTBOX_BATCH): Promise<Result<PublishRound>> {
    return this.#fence === undefined ? this.#round(limit) : this.#fence.hold(() => this.#round(limit));
  }

  async #round(limit: number): Promise<Result<PublishRound>> {
    const rows = await this.#source.unpublished(limit);
    if (!rows.ok) return rows;
    const blocked = new Set<string>();
    let published = 0;
    for (const row of rows.value) {
      if (blocked.has(row.subject) || this.#backingOff(row.subject)) {
        blocked.add(row.subject);
      } else {
        const sent = await this.#publishRow(row);
        if (sent.ok) {
          this.#backoff.delete(row.subject);
          published += 1;
        } else {
          blocked.add(row.subject);
          this.#recordFailure(row, sent.error.message);
        }
      }
    }
    return ok({ published, deferred: rows.value.length - published });
  }

  #backingOff(subject: string): boolean {
    return (this.#backoff.get(subject)?.retryAt ?? 0) > this.#now();
  }

  #recordFailure(row: OutboxMessage, cause: string): void {
    const failures = (this.#backoff.get(row.subject)?.failures ?? 0) + 1;
    const delay = retryDelayMilliseconds(failures, this.#limits);
    this.#backoff.set(row.subject, { failures, retryAt: this.#now() + delay });
    this.#logger.with(rowCorrelation(row)).warn('nats.outbox.publish-failed', {
      subject: row.subject, failures, delayMilliseconds: delay, cause,
    });
  }

  async #publishRow(row: OutboxMessage): Promise<Result<void>> {
    const subject = this.#address.subjectOfOutboxRow(row.subject);
    if (!subject.ok) return subject;
    const sent = await this.#publisher.publish({
      subject: subject.value,
      body: encodeJson(row.payload),
      messageId: row.metadata.eventId,
    });
    if (!sent.ok) return sent;
    return this.#source.markPublished(row.metadata.eventId);
  }
}

function rowCorrelation({ metadata }: OutboxMessage): LogCorrelation {
  const { eventId, correlationId, causationId } = metadata;
  return causationId === undefined ? { eventId, correlationId } : { eventId, correlationId, causationId };
}

// Publishes until the signal aborts: at once while rows flow, after a pause
// when none did, and with a growing pause while the outbox is unavailable.
export function runOutboxPublisher(
  publisher: OutboxPublisher,
  signal: AbortSignal,
  limits: TransportLimits = TRANSPORT_LIMITS,
): Promise<void> {
  return runPublicationLoop(async () => {
    const round = await publisher.publishPending();
    return round.ok ? ok(round.value.published) : round;
  }, signal, limits);
}

// Runs publication rounds until the signal aborts: again at once after one
// that published, after a pause when none did, and with backoff on failure.
export async function runPublicationLoop(
  round: () => Promise<Result<number>>,
  signal: AbortSignal,
  limits: TransportLimits = TRANSPORT_LIMITS,
): Promise<void> {
  let failedRounds = 0;
  while (!signal.aborted) {
    const published = await round();
    failedRounds = published.ok ? 0 : failedRounds + 1;
    if (published.ok && published.value > 0) continue;
    const pause = published.ok ? limits.idlePollMilliseconds : retryDelayMilliseconds(failedRounds, limits);
    await abortableDelay(pause, signal);
  }
}
