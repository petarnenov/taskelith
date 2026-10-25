import type { Msg, NatsConnection, Subscription } from '@nats-io/nats-core';
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
  // Heartbeats arriving while this many wait are dropped; later ones count.
  readonly maxPending?: number;
}

export const HEARTBEAT_PENDING_LIMIT = 1_000;

interface Arrival {
  readonly subject: string;
  readonly data: Uint8Array;
}

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

  // Ends when stopped or when the subscription closes; a stop handles
  // nothing that is still waiting.
  async run(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    const waiting = new WaitingHeartbeats(this.#maxPending);
    const subscription = this.#connection.subscribe(this.#subject, {
      queue: this.#queue,
      callback: (error, message) => this.#arrive(waiting, error, message),
    });
    const stop = () => waiting.wake();
    signal.addEventListener('abort', stop, { once: true });
    void subscription.closed.then(stop);
    try {
      await this.#drain(waiting, subscription, signal);
    } finally {
      signal.removeEventListener('abort', stop);
      subscription.unsubscribe();
    }
  }

  async #drain(waiting: WaitingHeartbeats, subscription: Subscription, signal: AbortSignal): Promise<void> {
    while (!signal.aborted && !subscription.isClosed()) {
      const next = waiting.take();
      if (next === undefined) await waiting.arrival();
      else await this.#receive(next);
    }
  }

  #arrive(waiting: WaitingHeartbeats, error: Error | null, message: Msg): void {
    if (error !== null) {
      this.#logger.warn('nats.heartbeat.subscription-failed', { subject: this.#subject, cause: error.message });
      return;
    }
    if (!waiting.add({ subject: message.subject, data: message.data })) {
      this.#logger.warn('nats.heartbeat.dropped', { subject: message.subject, reason: 'too many pending' });
    }
  }

  async #receive({ subject, data }: Arrival): Promise<void> {
    const read = readHeartbeatSubjectMessage(data);
    if (!read.ok) {
      this.#logger.warn('nats.heartbeat.dropped', { subject, reason: read.error });
      return;
    }
    const failure = await this.#handleSafely({ subject, body: read.value.body });
    if (failure !== undefined) this.#logger.warn('nats.heartbeat.unrecorded', { subject, reason: failure });
  }

  // A handler that throws loses only this heartbeat, as one that fails.
  async #handleSafely(heartbeat: ReceivedHeartbeat): Promise<string | undefined> {
    try {
      const handled = await this.#handle(heartbeat);
      return handled.ok ? undefined : `${handled.error.code}: ${handled.error.message}`;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
}

// Arrivals in order, at most `limit` of them, and a wake-up for the reader.
class WaitingHeartbeats {
  readonly #arrivals: Arrival[] = [];
  readonly #limit: number;
  #wake: (() => void) | undefined;

  constructor(limit: number) {
    this.#limit = limit;
  }

  add(arrival: Arrival): boolean {
    if (this.#arrivals.length >= this.#limit) return false;
    this.#arrivals.push(arrival);
    this.wake();
    return true;
  }

  take(): Arrival | undefined {
    return this.#arrivals.shift();
  }

  arrival(): Promise<void> {
    return new Promise((resolve) => { this.#wake = resolve; });
  }

  wake(): void {
    const wake = this.#wake;
    this.#wake = undefined;
    wake?.();
  }
}
