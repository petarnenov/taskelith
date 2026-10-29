import type {
  DeliveredSlotCredential,
  RecoveryEpoch,
  RunSlotCredentialRequest,
  RunSlotCredentials,
  SlotCredentialAnswer,
  SlotCredentialClient,
} from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';

export interface RunSlotCredentialsOptions {
  // The worker's current recovery epoch, which every fetch names.
  readonly recoveryEpoch: () => RecoveryEpoch;
  readonly logger?: Logger;
}

// The run, ownership generation, and recovery epoch of one fetch.
interface DeliveryScope {
  readonly executionId: RunSlotCredentialRequest['executionId'];
  readonly attemptId: RunSlotCredentialRequest['attemptId'];
  readonly ownershipGeneration: RunSlotCredentialRequest['ownershipGeneration'];
  readonly recoveryEpoch: RecoveryEpoch;
}

interface HeldDelivery extends DeliveryScope {
  readonly credential: DeliveredSlotCredential;
}

interface PendingFetch {
  readonly scope: DeliveryScope;
  ended: boolean;
}

type EndedScope = (scope: DeliveryScope) => boolean;

// Account pool contract section 7.3: one delivery per execution, held only
// in memory until the run ends or its generation or epoch changes.
export class FetchedRunSlotCredentials implements RunSlotCredentials {
  readonly #client: SlotCredentialClient;
  readonly #recoveryEpoch: () => RecoveryEpoch;
  readonly #logger: Logger;
  readonly #held = new Map<string, HeldDelivery>();
  readonly #pending = new Set<PendingFetch>();

  constructor(client: SlotCredentialClient, options: RunSlotCredentialsOptions) {
    this.#client = client;
    this.#recoveryEpoch = options.recoveryEpoch;
    this.#logger = options.logger ?? SILENT_LOGGER;
  }

  async obtain(run: RunSlotCredentialRequest): Promise<Result<SlotCredentialAnswer>> {
    const recoveryEpoch = this.#recoveryEpoch();
    this.#forgetWhere((scope) => scope.recoveryEpoch !== recoveryEpoch);
    if (this.#knowsLaterGeneration(run)) return err(failure('conflict', 'a later ownership generation of the attempt holds or fetches its slot credential'));
    this.#forgetEarlierGenerations(run);
    const key = heldKey(run);
    const held = this.#held.get(key);
    if (held !== undefined) return ok(Object.freeze({ kind: 'delivered', credential: held.credential }));
    const pending: PendingFetch = { scope: scopeOf(run, recoveryEpoch), ended: false };
    this.#pending.add(pending);
    const fetched = await this.#client.fetch({ ...run, recoveryEpoch }).finally(() => this.#pending.delete(pending));
    const ended = pending.ended || this.#recoveryEpoch() !== recoveryEpoch;
    const answer = ended ? withoutDelivery(fetched) : fetched;
    this.#logOutcome(run, answer);
    if (answer.ok && answer.value.kind === 'delivered') this.#held.set(key, { ...pending.scope, credential: answer.value.credential });
    return answer;
  }

  forgetRun(run: Pick<RunSlotCredentialRequest, 'executionId' | 'attemptId'>): void {
    this.#forgetWhere((scope) => scope.executionId === run.executionId && scope.attemptId === run.attemptId);
  }

  forgetOwnershipGeneration(attempt: Pick<RunSlotCredentialRequest, 'attemptId' | 'ownershipGeneration'>): void {
    this.#forgetWhere((scope) => scope.attemptId === attempt.attemptId && scope.ownershipGeneration === attempt.ownershipGeneration);
  }

  forgetRecoveryEpoch(recoveryEpoch: RecoveryEpoch): void {
    this.#forgetWhere((scope) => scope.recoveryEpoch === recoveryEpoch);
  }

  // A call of a superseded generation is stale itself and ends nothing.
  #knowsLaterGeneration(run: RunSlotCredentialRequest): boolean {
    const fetching = [...this.#pending].filter((pending) => !pending.ended).map((pending) => pending.scope);
    const scopes = [...this.#held.values(), ...fetching];
    return scopes.some((scope) => scope.attemptId === run.attemptId && scope.ownershipGeneration > run.ownershipGeneration);
  }

  // A call of a later generation ends what the host has not forgotten yet.
  #forgetEarlierGenerations(run: RunSlotCredentialRequest): void {
    this.#forgetWhere((scope) => scope.attemptId === run.attemptId && scope.ownershipGeneration < run.ownershipGeneration);
  }

  #forgetWhere(ended: EndedScope): void {
    for (const [key, held] of [...this.#held]) if (ended(held)) this.#held.delete(key);
    for (const pending of this.#pending) if (ended(pending.scope)) pending.ended = true;
  }

  #logOutcome(run: RunSlotCredentialRequest, answer: Result<SlotCredentialAnswer>): void {
    // The fields name identifiers only; the logger redacts a credential key.
    const fields = { executionId: run.executionId, attemptId: run.attemptId, slot: run.slotId };
    if (!answer.ok) this.#logger.warn('worker.slot-delivery.failed', { ...fields, code: answer.error.code });
    else if (answer.value.kind === 'refused') this.#logger.warn('worker.slot-delivery.refused', { ...fields, reason: answer.value.refusal.reason });
  }
}

// A delivery that arrives after its run, generation, or epoch ended is
// dropped; a refusal or failure holds nothing and passes unchanged.
function withoutDelivery(answer: Result<SlotCredentialAnswer>): Result<SlotCredentialAnswer> {
  if (!answer.ok || answer.value.kind !== 'delivered') return answer;
  return err(failure('conflict', 'the run, ownership generation, or recovery epoch ended while its slot credential was fetched'));
}

function scopeOf(run: RunSlotCredentialRequest, recoveryEpoch: RecoveryEpoch): DeliveryScope {
  const { executionId, attemptId, ownershipGeneration } = run;
  return Object.freeze({ executionId, attemptId, ownershipGeneration, recoveryEpoch });
}

function heldKey({ attemptId, executionId, slotId }: RunSlotCredentialRequest): string {
  return `${attemptId}\n${executionId}\n${slotId}`;
}
