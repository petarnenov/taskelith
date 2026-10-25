import type { Consumer, JetStreamClient, JsMsg } from '@nats-io/jetstream';
import { err, failure, type Result } from '@taskelith/kernel';
import { abortableDelay } from './abortable-delay.js';
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

  async run(signal: AbortSignal): Promise<void> {
    let failedPulls = 0;
    while (!signal.aborted) {
      try {
        await this.#pull(await this.#js.consumers.get(this.#stream, this.#durable), signal);
        failedPulls = 0;
      } catch {
        // A lost connection or a denied pull; the next pull retries.
        failedPulls += 1;
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
      message.term(read.error);
      return;
    }
    const deliveryCount = message.info.deliveryCount;
    const delivered = { ...read.value, subject: message.subject, deliveryCount };
    const handled = await whileWorking(message, this.#limits, () => this.#handleSafely(delivered));
    if (handled.ok) message.ack();
    else message.nak(retryDelayMilliseconds(deliveryCount, this.#limits));
  }

  // A handler that throws has not committed, like one that returns an error.
  async #handleSafely(message: DeliveredMessage): Promise<Result<unknown>> {
    try {
      return await this.#handle(message);
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      return err(failure('internal', 'the message handler threw', { cause }));
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
