import type { Instant, Result } from '@taskelith/kernel';

// The public part of a worker-generated generation: its secrets stay home.
export interface RenewalMaterial {
  readonly generation: number;
  readonly brokerUserKey: string;
  readonly controlPlaneSha256: string;
}

export interface RenewalAnswer {
  readonly generation: number;
  readonly brokerUserJwt: string;
  readonly deadline: Instant;
}

// The worker's side of `renewWorkerCredentials` and
// `confirmWorkerCredentials`; each call names the bearer it authenticates with.
export interface CredentialRenewalClient {
  renew(bearer: string, material: RenewalMaterial): Promise<Result<RenewalAnswer>>;
  confirm(bearer: string, generation: number): Promise<Result<void>>;
}
