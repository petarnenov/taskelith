import type { Consumer, JetStreamClient, JsMsg } from '@nats-io/jetstream';
import { err, failure, type Result } from '@taskelith/kernel';
import { measurement, NO_METRICS, SILENT_LOGGER, type Logger, type Metrics } from '@taskelith/observability';
import { abortableDelay } from './abortable-delay.js';
import { correlationOf } from './message-correlation.js';
import type { TransportAddress } from './transport-address.js';
import { retryDelayMilliseconds, TRANSPORT_LIMITS, type TransportLimits } from './transport-limits.js';
import {
  readCommandSubjectMessage,
  readObservationSubjectMessage,
  type Malformed,
  type WireMessage,
} from './wire-message.js';

export interface DeliveredMessage extends WireMessage {
  readonly subject: string;
  readonly deliveryCount: number;
}

// Commits the message's effect, its inbox record included, and answers ok
// only after the commit; a failure redelivers it after a backoff.
export type MessageHandler = (message: DeliveredMessage) => Promise<Result<unknown>>;

type MessageReader = (data: Uint8Array) => Result<WireMessage, Malformed>;

export interface ConsumerOptions {
  readonly limits?: TransportLimits;
  readonly fetchExpiresMilliseconds?: number;
  readonly metrics?: Metrics;
  readonly logger?: Logger;
  readonly now?: () => number;
}

const DEFAULT_FETCH_EXPIRES_MILLISECONDS = 5000;

// Settles each message of one pull consumer in order: ack after a commit, nak
// with backoff after a failure, term (quarantine) when its schema fails.
export class ValidatingConsumer {
  readonly #js: JetStreamClient;
  readonly #stream: string;
  readonly #durable: string;
  readonly #read: MessageReader;
  readonly #handle: MessageHandler;
  readonly #options: ConsumerOptions;

  constructor(
    source: { js: JetStreamClient; stream: string; durable: string; read: MessageReader },
    handle: MessageHandler,
    options: ConsumerOptions = {},
  ) {
    this.#js = source.js;
    this.#stream = source.stream;
    this.#durable = source.durable;
    this.#read = source.read;
    this.#handle = handle;
    this.#options = options;
  }

  get #limits(): TransportLimits {
    return this.#options.limits ?? TRANSPORT_LIMITS;
  }

  get #logger(): Logger {
    return this.#options.logger ?? SILENT_LOGGER;
  }

  // Looks the consumer up once, and again only after a failed pull.
  async run(signal: AbortSignal): Promise<void> {
    let failedPulls = 0;
    let consumer: Consumer | undefined;
    while (!signal.aborted) {
      try {
        consumer ??= await this.#js.consumers.get(this.#stream, this.#durable);
        await this.#pull(consumer, signal);
        failedPulls = 0;
      } catch (error) {
        // A lost connection or a denied pull; the next pull retries.
        consumer = undefined;
        failedPulls += 1;
        this.#logger.warn('nats.pull.failed', { stream: this.#stream, consumer: this.#durable, failedPulls, cause: causeOf(error) });
        await abortableDelay(retryDelayMilliseconds(failedPulls, this.#limits), signal);
      }
    }
  }

  async #pull(consumer: Consumer, signal: AbortSignal): Promise<void> {
    // One message per pull: a fetched message waiting behind a long commit
    // would pass its `ack_wait` and be delivered a second time.
    const messages = await consumer.fetch({
      max_messages: 1,
      expires: this.#options.fetchExpiresMilliseconds ?? DEFAULT_FETCH_EXPIRES_MILLISECONDS,
    });
    const stop = () => void messages.stop();
    signal.addEventListener('abort', stop, { once: true });
    if (signal.aborted) stop();
    try {
      for await (const message of messages) {
        if (signal.aborted) break;
        await this.#settle(message);
      }
    } finally {
      signal.removeEventListener('abort', stop);
    }
  }

  async #settle(message: JsMsg): Promise<void> {
    const read = this.#read(message.data);
    if (!read.ok) {
      this.#logger.warn('nats.message.quarantined', { subject: message.subject, reason: read.error });
      message.term(read.error);
      return;
    }
    const deliveryCount = message.info.deliveryCount;
    const delivered = { ...read.value, subject: message.subject, deliveryCount };
    const handled = await whileWorking(message, this.#limits, () => this.#handleSafely(delivered));
    if (handled.ok) {
      message.ack();
      this.#recordLag(message);
      return;
    }
    const delay = retryDelayMilliseconds(deliveryCount, this.#limits);
    this.#logger.with(correlationOf(delivered)).warn('nats.message.redelivered', {
      subject: message.subject, type: delivered.type, deliveryCount, delayMilliseconds: delay,
      code: handled.error.code, message: handled.error.message,
    });
    message.nak(delay);
  }

  // From the stream's append to the receiver's commit, in seconds.
  #recordLag(message: JsMsg): void {
    const appendedAt = Number(message.timestampNanos / 1_000_000n);
    const now = (this.#options.now ?? Date.now)();
    const labels = { stream: this.#stream, consumer: this.#durable };
    (this.#options.metrics ?? NO_METRICS).record(measurement('inbox.lag', Math.max(0, now - appendedAt) / 1000, labels));
  }

  // A handler that throws has not committed, like one that returns an error.
  async #handleSafely(message: DeliveredMessage): Promise<Result<unknown>> {
    try {
      return await this.#handle(message);
    } catch (error) {
      return err(failure('internal', 'the message handler threw', { cause: causeOf(error) }));
    }
  }
}

export function workerCommandConsumer(
  js: JetStreamClient,
  address: TransportAddress,
  workerId: string,
  handle: MessageHandler,
  options?: ConsumerOptions,
): ValidatingConsumer {
  const source = { js, stream: address.streamName('commands'), durable: workerId, read: readCommandSubjectMessage };
  return new ValidatingConsumer(source, handle, options);
}

export function observationConsumer(
  js: JetStreamClient,
  address: TransportAddress,
  name: string,
  handle: MessageHandler,
  options?: ConsumerOptions,
): ValidatingConsumer {
  const source = { js, stream: address.streamName('observations'), durable: name, read: readObservationSubjectMessage };
  return new ValidatingConsumer(source, handle, options);
}

// Extends `ack_wait` while a commit runs longer than a third of it, so a slow
// commit is not redelivered to a second handler meanwhile.
async function whileWorking<T>(message: JsMsg, limits: TransportLimits, work: () => Promise<T>): Promise<T> {
  const heartbeat = setInterval(() => message.working(), limits.ackWaitMilliseconds / 3);
  try {
    return await work();
  } finally {
    clearInterval(heartbeat);
  }
}

function causeOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
