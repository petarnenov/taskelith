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

interface HeldDelivery {
  readonly credential: DeliveredSlotCredential;
  readonly attemptId: RunSlotCredentialRequest['attemptId'];
  readonly ownershipGeneration: RunSlotCredentialRequest['ownershipGeneration'];
  readonly recoveryEpoch: RecoveryEpoch;
}

// Account pool contract section 7.3: one delivery per execution, held only
// in memory until the run ends or its generation or epoch changes.
export class FetchedRunSlotCredentials implements RunSlotCredentials {
  readonly #client: SlotCredentialClient;
  readonly #recoveryEpoch: () => RecoveryEpoch;
  readonly #logger: Logger;
  readonly #held = new Map<string, HeldDelivery>();

  constructor(client: SlotCredentialClient, options: RunSlotCredentialsOptions) {
    this.#client = client;
    this.#recoveryEpoch = options.recoveryEpoch;
    this.#logger = options.logger ?? SILENT_LOGGER;
  }

  async obtain(run: RunSlotCredentialRequest): Promise<Result<SlotCredentialAnswer>> {
    const recoveryEpoch = this.#recoveryEpoch();
    this.#forgetStale(run, recoveryEpoch);
    const key = heldKey(run);
    const held = this.#held.get(key);
    if (held !== undefined) return ok(Object.freeze({ kind: 'delivered', credential: held.credential }));
    const answer = await this.#client.fetch({ ...run, recoveryEpoch });
    // The fields name identifiers only; the logger redacts a credential key.
    const fields = { executionId: run.executionId, attemptId: run.attemptId, slot: run.slotId };
    if (!answer.ok) {
      this.#logger.warn('worker.slot-delivery.failed', { ...fields, code: answer.error.code });
    } else if (answer.value.kind === 'refused') {
      this.#logger.warn('worker.slot-delivery.refused', { ...fields, reason: answer.value.refusal.reason });
    } else {
      const { attemptId, ownershipGeneration } = run;
      this.#held.set(key, { credential: answer.value.credential, attemptId, ownershipGeneration, recoveryEpoch });
    }
    return answer;
  }

  // The run ended: no later run reuses its credential.
  forget(run: Pick<RunSlotCredentialRequest, 'executionId' | 'attemptId'>): void {
    const prefix = executionKey(run);
    this.#forgetWhere((key) => key.startsWith(prefix));
  }

  // A new recovery epoch ends every held delivery, and a new ownership
  // generation of an attempt ends that attempt's deliveries.
  #forgetStale(run: RunSlotCredentialRequest, recoveryEpoch: RecoveryEpoch): void {
    this.#forgetWhere((_key, held) => held.recoveryEpoch !== recoveryEpoch
      || (held.attemptId === run.attemptId && held.ownershipGeneration !== run.ownershipGeneration));
  }

  #forgetWhere(stale: (key: string, held: HeldDelivery) => boolean): void {
    for (const [key, held] of [...this.#held]) if (stale(key, held)) this.#held.delete(key);
  }
}

function executionKey({ attemptId, executionId }: Pick<RunSlotCredentialRequest, 'executionId' | 'attemptId'>): string {
  return `${attemptId}\n${executionId}\n`;
}

function heldKey(run: RunSlotCredentialRequest): string {
  return `${executionKey(run)}${run.slotId}`;
}
