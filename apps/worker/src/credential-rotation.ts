import { createHash } from 'node:crypto';
import { launchRetryDelay } from '@taskelith/execution';
import type { CredentialRenewalClient } from '@taskelith/fleet';
import { failure, ok, type Failure, type FailureCode, type Result } from '@taskelith/kernel';
import { brokerUserPublicKey, credsFile, newBrokerUserKey } from '@taskelith/nats';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import { NodeSecrets } from '@taskelith/secrets';
import {
  adoptGeneration,
  finishAdoption,
  readCredentialFiles,
  readPendingGeneration,
  readWorkerCredentials,
  removeSupersededGeneration,
  storePendingGeneration,
  type PendingGeneration,
  type WorkerCredentials,
  type WorkerIdentity,
  type WorkerPaths,
} from '@taskelith/worker-journal';

// One generation's `.creds` text, as a broker connection attempt uses it.
export interface BrokerCandidate {
  readonly generation: number;
  readonly creds: string;
}

// The notice's fields the worker acts on (installation contract sec. 6).
export interface RotationNotice {
  readonly credentialGeneration: number;
}

export interface CredentialRotationOptions {
  readonly paths: WorkerPaths;
  readonly identity: WorkerIdentity;
  readonly renewal: CredentialRenewalClient;
  // Ends the broker link, so the next one dials the current generation.
  readonly redial: () => void;
  readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly draw: () => number;
  readonly logger?: Logger;
}

type Step = 'continue' | 'idle' | 'retry';

// The codes of a 400, 401 or 403, and 409: the control plane decided.
const REFUSALS: ReadonlySet<FailureCode> = new Set(['invalid', 'forbidden', 'conflict']);

// Owns the worker's credential generations: it stores a requested one,
// renews and adopts it, and confirms it once the broker link uses it.
export class CredentialRotation {
  readonly #options: CredentialRotationOptions;
  readonly #logger: Logger;
  #identity: WorkerIdentity;
  #current: WorkerCredentials;
  #previous: WorkerCredentials | undefined;
  #linkedGeneration: number | undefined;
  #redialed = false;
  #wake = new AbortController();

  private constructor(options: CredentialRotationOptions, current: WorkerCredentials, previous: WorkerCredentials | undefined) {
    this.#options = options;
    this.#logger = options.logger ?? SILENT_LOGGER;
    this.#identity = options.identity;
    this.#current = current;
    this.#previous = previous;
  }

  // Reads the files the identity names, the kept predecessor's included,
  // and resumes the removal of a finished adoption's files.
  static open(options: CredentialRotationOptions): Result<CredentialRotation> {
    const { paths, identity } = options;
    const current = readWorkerCredentials(paths, identity);
    if (!current.ok) return current;
    if (identity.previous === undefined) {
      const removed = removeSupersededGeneration(paths, identity);
      return removed.ok ? ok(new CredentialRotation(options, current.value, undefined)) : removed;
    }
    const previous = readCredentialFiles(paths, identity.previous.credentials);
    return previous.ok ? ok(new CredentialRotation(options, current.value, previous.value)) : previous;
  }

  get generation(): number {
    return this.#identity.credentialGeneration;
  }

  // The current generation's bearer secret, read at each request.
  readonly bearer = (): string => this.#current.controlPlane;

  // The current generation first, then a predecessor kept until the
  // confirmation.
  brokerCandidates(): readonly BrokerCandidate[] {
    const current = { generation: this.generation, creds: this.#current.broker };
    const { previous } = this.#identity;
    if (previous === undefined || this.#previous === undefined) return [current];
    return [current, { generation: previous.credentialGeneration, creds: this.#previous.broker }];
  }

  // A broker link is up with `generation`'s user.
  readonly linked = (generation: number): void => {
    this.#linkedGeneration = generation;
    this.#wakeUp();
  };

  // Only the generation after the current one is stored, durably before the
  // ack; an unconfirmed adoption is finished first, then it is renewed.
  readonly requested = (notice: RotationNotice): Result<void> => {
    const next = this.generation + 1;
    if (notice.credentialGeneration !== next) {
      this.#logger.info('worker.credentials.notice-ignored', { credentialGeneration: notice.credentialGeneration, current: this.generation });
      return ok(undefined);
    }
    const stored = storePendingGeneration(this.#options.paths, newGeneration(next));
    if (!stored.ok) return stored;
    this.#wakeUp();
    return ok(undefined);
  };

  // Runs at every start: it resumes what the files say, then waits for a
  // notice or a link.
  async run(signal: AbortSignal): Promise<void> {
    let retry = 0;
    while (!signal.aborted) {
      const waking = this.#wake.signal;
      const step = await this.#step();
      if (step === 'continue') continue;
      retry = step === 'retry' ? retry + 1 : 0;
      const wait = AbortSignal.any([signal, waking]);
      if (step === 'retry') await this.#options.sleep(launchRetryDelay(retry, this.#options.draw()), wait);
      else await untilAborted(wait);
    }
  }

  #wakeUp(): void {
    this.#wake.abort();
    this.#wake = new AbortController();
  }

  async #step(): Promise<Step> {
    if (this.#identity.previous !== undefined) return this.#confirm();
    const pending = readPendingGeneration(this.#options.paths, this.generation + 1);
    if (!pending.ok) throw pending.error;
    return pending.value === undefined ? 'idle' : this.#renew(pending.value);
  }

  // Renewed with the confirmed generation's bearer; a replay of the same
  // material answers the same JWT.
  async #renew(pending: PendingGeneration): Promise<Step> {
    const brokerUserKey = brokerUserPublicKey(pending.brokerSeed);
    if (brokerUserKey === undefined) throw failure('internal', `the pending generation ${pending.credentialGeneration} holds no NKey user seed`);
    const controlPlaneSha256 = createHash('sha256').update(pending.controlPlane, 'utf8').digest('hex');
    const material = { generation: pending.credentialGeneration, brokerUserKey, controlPlaneSha256 };
    const renewed = await this.#options.renewal.renew(this.#current.controlPlane, material);
    if (!renewed.ok) return this.#unfinished('renewal', pending.credentialGeneration, renewed.error);
    const broker = credsFile(renewed.value.brokerUserJwt, new TextEncoder().encode(pending.brokerSeed));
    const next = { controlPlane: pending.controlPlane, broker };
    const adopted = adoptGeneration(this.#options.paths, this.#identity, pending.credentialGeneration, next);
    if (!adopted.ok) throw adopted.error;
    [this.#previous, this.#current, this.#identity] = [this.#current, next, adopted.value];
    this.#redialed = false;
    this.#logger.info('worker.credentials.adopted', { credentialGeneration: this.generation, deadline: renewed.value.deadline });
    return 'continue';
  }

  // Only a link with the adopted generation's user confirms it; one re-dial
  // per round, then the retry delay.
  async #confirm(): Promise<Step> {
    if (this.#linkedGeneration !== this.generation) {
      if (this.#redialed) {
        this.#redialed = false;
        return 'retry';
      }
      this.#redialed = true;
      this.#options.redial();
      return 'idle';
    }
    const confirmed = await this.#options.renewal.confirm(this.#current.controlPlane, this.generation);
    if (!confirmed.ok) return this.#unfinished('confirmation', this.generation, confirmed.error);
    const finished = finishAdoption(this.#options.paths, this.#identity);
    if (!finished.ok) throw finished.error;
    this.#identity = finished.value;
    this.#previous = undefined;
    this.#logger.info('worker.credentials.confirmed', { credentialGeneration: this.generation });
    return 'continue';
  }

  // A refusal ends the round until the next notice or start; any other
  // failure, a 500 included, decided nothing and is retried.
  #unfinished(operation: string, generation: number, failed: Failure): Step {
    const fields = { credentialGeneration: generation, code: failed.code, reason: failed.details.reason ?? failed.message };
    if (!REFUSALS.has(failed.code)) {
      this.#logger.warn(`worker.credentials.${operation}-unavailable`, fields);
      return 'retry';
    }
    this.#logger.warn(`worker.credentials.${operation}-refused`, fields);
    return 'idle';
  }
}

// The bearer comes from the generator the control plane uses.
function newGeneration(generation: number): PendingGeneration {
  const { secret } = new NodeSecrets().issue('worker');
  return { credentialGeneration: generation, controlPlane: secret, brokerSeed: newBrokerUserKey().seed };
}

function untilAborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
}
