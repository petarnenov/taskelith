import type { Result } from '@taskelith/kernel';
import type { CredentialRenewalRequest, RenewedCredentials } from '../domain/credential-rotation.js';

// The worker's side of `renewWorkerCredentials` and
// `confirmWorkerCredentials`; each call names the bearer it authenticates with.
export interface CredentialRenewalClient {
  renew(bearer: string, request: CredentialRenewalRequest): Promise<Result<RenewedCredentials>>;
  confirm(bearer: string, generation: number): Promise<Result<void>>;
}
