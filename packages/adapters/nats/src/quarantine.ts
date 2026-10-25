import type { JetStreamClient, JetStreamManager, JsMsg, StoredMsg } from '@nats-io/jetstream';
import { headers as newHeaders, type MsgHdrs } from '@nats-io/nats-core';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { abortableDelay } from './abortable-delay.js';
import { brokerFailure } from './broker-failure.js';
import { JetStreamPublisher } from './jetstream-publisher.js';
import type { TransportAddress } from './transport-address.js';
import { retryDelayMilliseconds, TRANSPORT_LIMITS, type TransportLimits } from './transport-limits.js';

// What JetStream reports when a consumer terminates a message or gives up on
// it after `max_deliver` (JetStream spike, poison-message quarantine).
interface Advisory {
  readonly type: string;
  readonly stream: string;
  readonly consumer: string;
  readonly stream_seq: number;
  readonly deliveries: number;
  readonly reason?: string;
}

export const QUARANTINE_HEADERS = Object.freeze({
  sourceStream: 'Taskelith-Source-Stream',
  originalSubject: 'Taskelith-Original-Subject',
  originalStreamSequence: 'Taskelith-Original-Stream-Seq',
  originalMessageId: 'Taskelith-Original-Msg-Id',
  consumer: 'Taskelith-Consumer',
  deliveries: 'Taskelith-Deliveries',
  reason: 'Taskelith-Reason',
  originalMissing: 'Taskelith-Original-Missing',
});

export const MAX_DELIVERIES_REASON = 'max-deliveries';
const REDRIVEN = /^(.*)\.redrive\.(\d+)$/;
const CAPTURE_BATCH = 100;
const CAPTURE_EXPIRES_MILLISECONDS = 1000;
export const RECORDS_PAGE = 100;

// The streams whose consumers can quarantine a message.
export type QuarantineSource = 'commands' | 'observations';

export interface QuarantineRecord {
  readonly sequence: number;
  readonly source: QuarantineSource;
  readonly originalSubject: string;
  readonly originalStreamSequence: number;
  readonly originalMessageId: string | undefined;
  readonly consumer: string;
  readonly deliveries: number;
  readonly reason: string;
  // Null when the original expired from its stream before the capture.
  readonly body: Uint8Array | null;
}

// Copies terminated or exhausted messages with diagnostics into quarantine;
// a redrive needs a new `Nats-Msg-Id`, which the broker window would drop.
export class Quarantine {
  readonly #jsm: JetStreamManager;
  readonly #js: JetStreamClient;
  readonly #publisher: JetStreamPublisher;
  readonly #address: TransportAddress;
  readonly #limits: TransportLimits;

  constructor(jsm: JetStreamManager, js: JetStreamClient, address: TransportAddress, limits: TransportLimits = TRANSPORT_LIMITS) {
    this.#jsm = jsm;
    this.#js = js;
    this.#publisher = new JetStreamPublisher(js);
    this.#address = address;
    this.#limits = limits;
  }

  // Captures the advisories that are waiting; returns how many it copied.
  async capture(): Promise<Result<number>> {
    try {
      const consumer = await this.#js.consumers.get(this.#address.streamName('advisories'), 'quarantine');
      const advisories = await consumer.fetch({ max_messages: CAPTURE_BATCH, expires: CAPTURE_EXPIRES_MILLISECONDS });
      let captured = 0;
      for await (const message of advisories) captured += (await this.#captureOne(message)) ? 1 : 0;
      return ok(captured);
    } catch (error) {
      return brokerFailure('capture quarantine advisories', error);
    }
  }

  // Up to `limit` records from the sequence on; the caller pages on from the
  // last record's sequence plus one.
  async records(fromSequence = 1, limit = RECORDS_PAGE): Promise<Result<readonly QuarantineRecord[]>> {
    try {
      const stream = this.#address.streamName('quarantine');
      const { first_seq, last_seq, messages } = (await this.#jsm.streams.info(stream)).state;
      const records: QuarantineRecord[] = [];
      for (let seq = Math.max(first_seq, fromSequence); messages > 0 && seq <= last_seq && records.length < limit; seq++) {
        const stored = await this.#jsm.streams.getMessage(stream, { seq });
        if (stored) records.push(toRecord(stored));
      }
      return ok(records);
    } catch (error) {
      return brokerFailure('read the quarantine', error);
    }
  }

  // Publishes the record's message on its original subject and removes the
  // record; returns the new `Nats-Msg-Id`, or null for a message without one.
  async redrive(sequence: number): Promise<Result<string | null>> {
    const record = await this.#record(sequence);
    if (!record.ok) return record;
    const { body, originalSubject, originalMessageId } = record.value;
    if (body === null) {
      return err(failure('precondition-failed', 'the quarantined message expired before capture', { sequence: String(sequence) }));
    }
    const messageId = originalMessageId === undefined ? undefined : redriveMessageId(originalMessageId);
    const sent = await this.#publisher.publish({ subject: originalSubject, body, messageId });
    if (!sent.ok) return sent;
    try {
      await this.#jsm.streams.deleteMessage(this.#address.streamName('quarantine'), sequence);
      return ok(messageId ?? null);
    } catch (error) {
      return brokerFailure(`remove quarantine record ${sequence}`, error);
    }
  }

  async #record(sequence: number): Promise<Result<QuarantineRecord>> {
    try {
      const stored = await this.#jsm.streams.getMessage(this.#address.streamName('quarantine'), { seq: sequence });
      if (stored) return ok(toRecord(stored));
      return err(failure('not-found', 'no quarantine record has this sequence', { sequence: String(sequence) }));
    } catch (error) {
      return brokerFailure(`read quarantine record ${sequence}`, error);
    }
  }

  // Settles each advisory on its own, so one that fails cannot hold back the
  // rest; an advisory that can never be captured is terminated.
  async #captureOne(message: JsMsg): Promise<boolean> {
    const advisory = readAdvisory(message);
    const source = advisory === undefined ? undefined : this.#sourceOf(advisory.stream);
    if (advisory === undefined || source === undefined) {
      message.term('not an advisory of a transport stream');
      return false;
    }
    try {
      const sent = await this.#copy(advisory, source);
      if (sent) message.ack();
      else message.nak(retryDelayMilliseconds(message.info.deliveryCount, this.#limits));
      return sent;
    } catch {
      message.nak(retryDelayMilliseconds(message.info.deliveryCount, this.#limits));
      return false;
    }
  }

  async #copy(advisory: Advisory, source: QuarantineSource): Promise<boolean> {
    const original = await this.#jsm.streams.getMessage(advisory.stream, { seq: advisory.stream_seq });
    const sent = await this.#publisher.publish({
      subject: this.#address.quarantineSubject(source),
      body: original?.data ?? new Uint8Array(),
      // Consumers settle a message independently, so each gets its own copy.
      messageId: `${advisory.stream}.${advisory.consumer}.${advisory.stream_seq}`,
      headers: diagnostics(advisory, original),
    });
    return sent.ok;
  }

  #sourceOf(stream: string): QuarantineSource | undefined {
    const sources: QuarantineSource[] = ['commands', 'observations'];
    return sources.find((source) => this.#address.streamName(source) === stream);
  }
}

function readAdvisory(message: JsMsg): Advisory | undefined {
  try {
    const advisory = message.json<Advisory>();
    const valid = typeof advisory?.stream === 'string' && typeof advisory.consumer === 'string'
      && Number.isSafeInteger(advisory.stream_seq) && Number.isSafeInteger(advisory.deliveries);
    return valid ? advisory : undefined;
  } catch {
    return undefined;
  }
}

// Captures until the signal aborts, pausing when nothing is waiting.
export async function runQuarantineKeeper(
  quarantine: Quarantine,
  signal: AbortSignal,
  limits: TransportLimits = TRANSPORT_LIMITS,
): Promise<void> {
  let failedRounds = 0;
  while (!signal.aborted) {
    const captured = await quarantine.capture();
    failedRounds = captured.ok ? 0 : failedRounds + 1;
    if (failedRounds > 0) await abortableDelay(retryDelayMilliseconds(failedRounds, limits), signal);
  }
}

// `<original>.redrive.<n>`, counting from the message's first identity, so
// every redrive of one message gets a value the broker has not seen.
export function redriveMessageId(messageId: string): string {
  const redriven = REDRIVEN.exec(messageId);
  if (redriven === null) return `${messageId}.redrive.1`;
  return `${redriven[1]}.redrive.${Number(redriven[2]) + 1}`;
}

function diagnostics(advisory: Advisory, original: StoredMsg | null): MsgHdrs {
  const h = newHeaders();
  h.set(QUARANTINE_HEADERS.sourceStream, advisory.stream);
  h.set(QUARANTINE_HEADERS.originalStreamSequence, String(advisory.stream_seq));
  h.set(QUARANTINE_HEADERS.consumer, headerValue(advisory.consumer));
  h.set(QUARANTINE_HEADERS.deliveries, String(advisory.deliveries));
  h.set(QUARANTINE_HEADERS.reason, headerValue(advisory.reason ?? MAX_DELIVERIES_REASON));
  if (original === null) {
    h.set(QUARANTINE_HEADERS.originalMissing, 'true');
    return h;
  }
  h.set(QUARANTINE_HEADERS.originalSubject, original.subject);
  const messageId = original.header?.get('Nats-Msg-Id');
  if (messageId) h.set(QUARANTINE_HEADERS.originalMessageId, messageId);
  return h;
}

// A header value may not hold line breaks, which a termination reason could.
function headerValue(text: string): string {
  return text.replace(/[\r\n]+/g, ' ');
}

function toRecord(stored: StoredMsg): QuarantineRecord {
  const get = (name: string) => stored.header?.get(name) ?? '';
  const missing = get(QUARANTINE_HEADERS.originalMissing) === 'true';
  return {
    sequence: stored.seq,
    source: stored.subject.endsWith('.observations') ? 'observations' : 'commands',
    originalSubject: get(QUARANTINE_HEADERS.originalSubject),
    originalStreamSequence: Number(get(QUARANTINE_HEADERS.originalStreamSequence)),
    originalMessageId: get(QUARANTINE_HEADERS.originalMessageId) || undefined,
    consumer: get(QUARANTINE_HEADERS.consumer),
    deliveries: Number(get(QUARANTINE_HEADERS.deliveries)),
    reason: get(QUARANTINE_HEADERS.reason),
    body: missing ? null : stored.data,
  };
}
