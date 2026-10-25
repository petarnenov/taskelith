import { ok, type EventId, type Result } from '@taskelith/kernel';
import type { OutboxMessage } from '@taskelith/sdlc';
import { encodeJson, type JetStreamPublisher } from './jetstream-publisher.js';
import { abortableDelay } from './abortable-delay.js';
import type { TransportAddress } from './transport-address.js';
import { retryDelayMilliseconds, TRANSPORT_LIMITS, type TransportLimits } from './transport-limits.js';

// The outbox side the publisher needs; PostgresOutboxRelay provides it.
export interface OutboxSource {
  unpublished(limit: number): Promise<Result<readonly OutboxMessage[]>>;
  markPublished(eventId: EventId): Promise<Result<void>>;
}

export interface PublishRound {
  readonly published: number;
  // Rows left for the next round, after a broker or outbox failure.
  readonly deferred: number;
}

export const OUTBOX_BATCH = 100;

// Publishes outbox rows as worker commands under their event identity. Rows
// of one subject go in append order: after one fails, the rest of that subject
// waits for the next round, while other subjects continue.
export class OutboxPublisher {
  readonly #source: OutboxSource;
  readonly #publisher: JetStreamPublisher;
  readonly #address: TransportAddress;

  constructor(source: OutboxSource, publisher: JetStreamPublisher, address: TransportAddress) {
    this.#source = source;
    this.#publisher = publisher;
    this.#address = address;
  }

  async publishPending(limit = OUTBOX_BATCH): Promise<Result<PublishRound>> {
    const rows = await this.#source.unpublished(limit);
    if (!rows.ok) return rows;
    const blocked = new Set<string>();
    let published = 0;
    for (const row of rows.value) {
      if (blocked.has(row.subject) || !(await this.#publishRow(row))) blocked.add(row.subject);
      else published += 1;
    }
    return ok({ published, deferred: rows.value.length - published });
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

// Publishes until the signal aborts: at once while rows flow, otherwise after
// a pause that backs off while rounds keep failing.
export async function runOutboxPublisher(
  publisher: OutboxPublisher,
  signal: AbortSignal,
  limits: TransportLimits = TRANSPORT_LIMITS,
): Promise<void> {
  let failedRounds = 0;
  while (!signal.aborted) {
    const round = await publisher.publishPending();
    failedRounds = !round.ok || round.value.deferred > 0 ? failedRounds + 1 : 0;
    if (round.ok && round.value.published > 0 && failedRounds === 0) continue;
    const pause = failedRounds === 0 ? limits.idlePollMilliseconds : retryDelayMilliseconds(failedRounds, limits);
    await abortableDelay(pause, signal);
  }
}
