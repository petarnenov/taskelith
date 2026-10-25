import type { NatsConnection, Subscription } from '@nats-io/nats-core';
import type { Result } from '@taskelith/kernel';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import type { TransportAddress } from './transport-address.js';
import { readHeartbeatSubjectMessage } from './wire-message.js';

export interface ReceivedHeartbeat {
  readonly subject: string;
  readonly body: Readonly<Record<string, unknown>>;
}

export type HeartbeatHandler = (heartbeat: ReceivedHeartbeat) => Promise<Result<unknown>>;

export interface HeartbeatReceiverOptions {
  readonly logger?: Logger;
  // Heartbeats waiting beyond it are dropped; the next ones replace them.
  readonly maxPending?: number;
}

export const HEARTBEAT_PENDING_LIMIT = 1_000;

// Handles every worker's heartbeats one at a time in one queue group. Core
// NATS keeps none, so nothing is redelivered and a dropped one is not retried.
export class HeartbeatReceiver {
  readonly #connection: NatsConnection;
  readonly #subject: string;
  readonly #queue: string;
  readonly #handle: HeartbeatHandler;
  readonly #logger: Logger;
  readonly #maxPending: number;

  constructor(
    source: { connection: NatsConnection; address: TransportAddress; queue: string },
    handle: HeartbeatHandler,
    options: HeartbeatReceiverOptions = {},
  ) {
    this.#connection = source.connection;
    this.#subject = source.address.allWorkerSubjects('heartbeats');
    this.#queue = source.queue;
    this.#handle = handle;
    this.#logger = options.logger ?? SILENT_LOGGER;
    this.#maxPending = options.maxPending ?? HEARTBEAT_PENDING_LIMIT;
  }

  async run(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    const subscription = this.#connection.subscribe(this.#subject, { queue: this.#queue });
    const stop = () => subscription.unsubscribe();
    signal.addEventListener('abort', stop, { once: true });
    try {
      for await (const message of subscription) await this.#receive(subscription, message.subject, message.data);
    } finally {
      signal.removeEventListener('abort', stop);
    }
  }

  async #receive(subscription: Subscription, subject: string, data: Uint8Array): Promise<void> {
    if (subscription.getPending() > this.#maxPending) {
      this.#logger.warn('nats.heartbeat.dropped', { subject, reason: 'too many pending' });
      return;
    }
    const read = readHeartbeatSubjectMessage(data);
    if (!read.ok) {
      this.#logger.warn('nats.heartbeat.dropped', { subject, reason: read.error });
      return;
    }
    const handled = await this.#handleSafely({ subject, body: read.value.body });
    if (!handled.ok) this.#logger.warn('nats.heartbeat.unrecorded', { subject, reason: handled.reason });
  }

  // A handler that throws loses only this heartbeat, as one that fails.
  async #handleSafely(heartbeat: ReceivedHeartbeat): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      const handled = await this.#handle(heartbeat);
      return handled.ok ? { ok: true } : { ok: false, reason: `${handled.error.code}: ${handled.error.message}` };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }
}
