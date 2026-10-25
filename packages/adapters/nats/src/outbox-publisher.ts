import { ok, type EventId, type Result } from '@taskelith/kernel';
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

export interface OutboxPublisherOptions {
  readonly limits?: TransportLimits;
  readonly now?: () => number;
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
  readonly #backoff = new Map<string, SubjectBackoff>();

  constructor(source: OutboxSource, publisher: JetStreamPublisher, address: TransportAddress, options: OutboxPublisherOptions = {}) {
    this.#source = source;
    this.#publisher = publisher;
    this.#address = address;
    this.#limits = options.limits ?? TRANSPORT_LIMITS;
    this.#now = options.now ?? Date.now;
  }

  async publishPending(limit = OUTBOX_BATCH): Promise<Result<PublishRound>> {
    const rows = await this.#source.unpublished(limit);
    if (!rows.ok) return rows;
    const blocked = new Set<string>();
    let published = 0;
    for (const row of rows.value) {
      if (blocked.has(row.subject) || this.#backingOff(row.subject)) {
        blocked.add(row.subject);
      } else if (await this.#publishRow(row)) {
        this.#backoff.delete(row.subject);
        published += 1;
      } else {
        blocked.add(row.subject);
        this.#recordFailure(row.subject);
      }
    }
    return ok({ published, deferred: rows.value.length - published });
  }

  #backingOff(subject: string): boolean {
    return (this.#backoff.get(subject)?.retryAt ?? 0) > this.#now();
  }

  #recordFailure(subject: string): void {
    const failures = (this.#backoff.get(subject)?.failures ?? 0) + 1;
    this.#backoff.set(subject, { failures, retryAt: this.#now() + retryDelayMilliseconds(failures, this.#limits) });
  }

  async #publishRow(row: OutboxMessage): Promise<boolean> {
    const subject = this.#address.subjectOfOutboxRow(row.subject);
    if (!subject.ok) return false;
    const sent = await this.#publisher.publish({
      subject: subject.value,
      body: encodeJson(row.payload),
      messageId: row.metadata.eventId,
    });
    if (!sent.ok) return false;
    return (await this.#source.markPublished(row.metadata.eventId)).ok;
  }
}

// Publishes until the signal aborts: at once while rows flow, after a pause
// when none did, and with a growing pause while the outbox is unavailable.
export async function runOutboxPublisher(
  publisher: OutboxPublisher,
  signal: AbortSignal,
  limits: TransportLimits = TRANSPORT_LIMITS,
): Promise<void> {
  let failedRounds = 0;
  while (!signal.aborted) {
    const round = await publisher.publishPending();
    failedRounds = round.ok ? 0 : failedRounds + 1;
    if (round.ok && round.value.published > 0) continue;
    const pause = round.ok ? limits.idlePollMilliseconds : retryDelayMilliseconds(failedRounds, limits);
    await abortableDelay(pause, signal);
  }
}
