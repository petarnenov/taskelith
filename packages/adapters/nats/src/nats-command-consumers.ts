import type { JetStreamManager } from '@nats-io/jetstream';
import type { WorkerId } from '@taskelith/execution';
import type { WorkerCommandConsumers } from '@taskelith/fleet';
import type { Result } from '@taskelith/kernel';
import { ensureWorkerConsumer } from './topology.js';
import type { TransportAddress } from './transport-address.js';
import { TRANSPORT_LIMITS, type TransportLimits } from './transport-limits.js';

// The durable pull consumer of each worker's command subject.
export class NatsCommandConsumers implements WorkerCommandConsumers {
  readonly #jsm: JetStreamManager;
  readonly #address: TransportAddress;
  readonly #limits: TransportLimits;

  constructor(jsm: JetStreamManager, address: TransportAddress, limits: TransportLimits = TRANSPORT_LIMITS) {
    this.#jsm = jsm;
    this.#address = address;
    this.#limits = limits;
  }

  ensure(workerId: WorkerId): Promise<Result<void>> {
    return ensureWorkerConsumer(this.#jsm, this.#address, workerId, this.#limits);
  }
}
