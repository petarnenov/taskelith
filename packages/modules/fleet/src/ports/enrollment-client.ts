import type { Result } from '@taskelith/kernel';
import type { Enrollment } from '../application/enrollment-service.js';
import type { EnrollmentRequest } from '../domain/enrollment.js';

// The worker's side of `enrollWorker`, with the single-use token secret.
// Its `reason` details carry the service's reasons, such as `token-invalid`.
export interface EnrollmentClient {
  enroll(tokenSecret: string, request: EnrollmentRequest): Promise<Result<Enrollment>>;
}

// The installation CA as `readInstallationCa` answers it, not yet trusted:
// one CA certificate in PEM and the SHA-256 of its DER in lowercase hex.
export interface InstallationCa {
  readonly certificatePem: string;
  readonly sha256: string;
}

// Read before any secret is sent, so the worker can check the CA against
// the fingerprint of its enrollment bundle (installation contract sec. 10).
export interface InstallationCaSource {
  read(): Promise<Result<InstallationCa>>;
}
