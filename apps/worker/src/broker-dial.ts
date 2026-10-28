import { err, failure, ok, type Failure, type Result } from '@taskelith/kernel';
import { isCredentialsRejected } from '@taskelith/nats';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import type { BrokerCandidate } from './credential-rotation.js';

// Rounds in which the broker rejected every generation before the worker
// stops (installation contract section 10).
export const REJECTED_ROUNDS_LIMIT = 3;

export interface GenerationLink<Link> {
  readonly link: Link;
  readonly generation: number;
}

export interface BrokerDialOptions<Link> {
  readonly candidates: () => readonly BrokerCandidate[];
  readonly dial: (creds: string) => Promise<Result<Link>>;
  readonly logger?: Logger;
}

// One connection round tries every local generation in order; only
// rounds that the broker rejected entirely count toward the stop.
export class BrokerDial<Link> {
  readonly #options: BrokerDialOptions<Link>;
  readonly #logger: Logger;
  #rejectedRounds = 0;

  constructor(options: BrokerDialOptions<Link>) {
    this.#options = options;
    this.#logger = options.logger ?? SILENT_LOGGER;
  }

  readonly connect = async (): Promise<Result<GenerationLink<Link>>> => {
    let last: Failure = failure('internal', 'the worker holds no broker credentials');
    let allRejected = true;
    for (const { generation, creds } of this.#options.candidates()) {
      const dialed = await this.#options.dial(creds);
      if (dialed.ok) {
        this.#rejectedRounds = 0;
        return ok({ link: dialed.value, generation });
      }
      last = dialed.error;
      allRejected &&= isCredentialsRejected(dialed.error);
      if (isCredentialsRejected(dialed.error)) this.#logger.warn('worker.broker.credentials-rejected', { credentialGeneration: generation });
    }
    this.#rejectedRounds = allRejected ? this.#rejectedRounds + 1 : 0;
    return err(this.#rejectedRounds >= REJECTED_ROUNDS_LIMIT ? credentialsExpired(this.#rejectedRounds) : last);
  };
}

// A `forbidden` failure ends the broker session instead of a retry.
export function credentialsExpired(rounds: number): Failure {
  const message = `the broker rejected every credential generation of this worker in ${rounds} consecutive rounds; enroll the worker again`;
  return failure('forbidden', message, { reason: 'credentials-expired' });
}
