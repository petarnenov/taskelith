import type {
  DeliveredSlotCredential,
  RecoveryEpoch,
  RunSlotCredentialRequest,
  RunSlotCredentials,
  SlotCredentialAnswer,
  SlotCredentialClient,
} from '@taskelith/execution';
import { ok, type Result } from '@taskelith/kernel';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';

export interface RunSlotCredentialsOptions {
  // The worker's current recovery epoch, which every fetch names.
  readonly recoveryEpoch: () => RecoveryEpoch;
  readonly logger?: Logger;
}

// Account pool contract section 7.3: one delivery per execution, held only
// in this process's memory until the harness host forgets the run.
export class FetchedRunSlotCredentials implements RunSlotCredentials {
  readonly #client: SlotCredentialClient;
  readonly #recoveryEpoch: () => RecoveryEpoch;
  readonly #logger: Logger;
  readonly #held = new Map<string, DeliveredSlotCredential>();

  constructor(client: SlotCredentialClient, options: RunSlotCredentialsOptions) {
    this.#client = client;
    this.#recoveryEpoch = options.recoveryEpoch;
    this.#logger = options.logger ?? SILENT_LOGGER;
  }

  async obtain(run: RunSlotCredentialRequest): Promise<Result<SlotCredentialAnswer>> {
    const key = heldKey(run);
    const held = this.#held.get(key);
    if (held !== undefined) return ok(Object.freeze({ kind: 'delivered', credential: held }));
    const answer = await this.#client.fetch({ ...run, recoveryEpoch: this.#recoveryEpoch() });
    // The fields name identifiers only; the logger redacts a credential key.
    const fields = { executionId: run.executionId, attemptId: run.attemptId, slot: run.slotId };
    if (!answer.ok) {
      this.#logger.warn('worker.slot-delivery.failed', { ...fields, code: answer.error.code });
    } else if (answer.value.kind === 'refused') {
      this.#logger.warn('worker.slot-delivery.refused', { ...fields, reason: answer.value.refusal.reason });
    } else {
      this.#held.set(key, answer.value.credential);
    }
    return answer;
  }

  // The run ended: no later run reuses its credential.
  forget(run: Pick<RunSlotCredentialRequest, 'executionId' | 'attemptId'>): void {
    const prefix = executionKey(run);
    for (const key of [...this.#held.keys()].filter((candidate) => candidate.startsWith(prefix))) this.#held.delete(key);
  }
}

function executionKey({ attemptId, executionId }: Pick<RunSlotCredentialRequest, 'executionId' | 'attemptId'>): string {
  return `${attemptId}\n${executionId}\n`;
}

function heldKey(run: RunSlotCredentialRequest): string {
  return `${executionKey(run)}${run.slotId}`;
}
