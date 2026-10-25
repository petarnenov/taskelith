import type { WorkerId } from '@taskelith/execution';
import { instantFromEpochMilliseconds, ok, type Result } from '@taskelith/kernel';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import type { ControlPlaneStore } from './control-plane-store.js';

// At most this many workers lose contact per check; the rest wait for the
// next one, which starts again from the oldest contact.
export const LOST_CONTACT_BATCH = 100;

export interface LostContactCheckOptions {
  readonly timeoutMilliseconds: number;
  readonly batch?: number;
  readonly logger?: Logger;
}

// Makes a worker without any contact for the timeout unreachable for new
// placement; no attempt, assignment, or reservation changes with it.
export class LostContactCheck {
  readonly #store: ControlPlaneStore;
  readonly #timeoutMilliseconds: number;
  readonly #batch: number;
  readonly #logger: Logger;

  constructor(store: ControlPlaneStore, options: LostContactCheckOptions) {
    this.#store = store;
    this.#timeoutMilliseconds = options.timeoutMilliseconds;
    this.#batch = options.batch ?? LOST_CONTACT_BATCH;
    this.#logger = options.logger ?? SILENT_LOGGER;
  }

  // The cutoff comes from the database time, as every contact does.
  async markLost(): Promise<Result<readonly WorkerId[]>> {
    const lost = await this.#store.transaction(async (tx) => {
      const before = instantFromEpochMilliseconds(Date.parse(await tx.now()) - this.#timeoutMilliseconds);
      return before.ok ? tx.reports.markContactLost(before.value, this.#batch) : before;
    });
    if (!lost.ok) return lost;
    for (const workerId of lost.value) {
      this.#logger.with({ workerId }).warn('fleet.worker.contact-lost', { timeoutMilliseconds: this.#timeoutMilliseconds });
    }
    return ok(lost.value);
  }
}
