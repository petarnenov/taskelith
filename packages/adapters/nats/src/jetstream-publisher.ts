import type { JetStreamClient } from '@nats-io/jetstream';
import type { MsgHdrs } from '@nats-io/nats-core';
import { ok, type Result } from '@taskelith/kernel';
import { brokerFailure } from './broker-failure.js';

export type PublishOutcome = 'stored' | 'duplicate';

export interface Publication {
  readonly subject: string;
  readonly body: Uint8Array;
  // The `Nats-Msg-Id`; a confirmation and an inventory request carry none.
  readonly messageId?: string;
  readonly headers?: MsgHdrs;
}

// Only a broker acknowledgement confirms a publication; on any failure the
// caller publishes again with the same message identity.
export class JetStreamPublisher {
  readonly #js: JetStreamClient;

  constructor(js: JetStreamClient) {
    this.#js = js;
  }

  async publish(publication: Publication): Promise<Result<PublishOutcome>> {
    try {
      const ack = await this.#js.publish(publication.subject, publication.body, {
        msgID: publication.messageId,
        headers: publication.headers,
      });
      return ok(ack.duplicate ? 'duplicate' : 'stored');
    } catch (error) {
      return brokerFailure(`publish on ${publication.subject}`, error);
    }
  }
}

export function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}
