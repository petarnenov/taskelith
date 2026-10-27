import type { Result } from '@taskelith/kernel';
import type { Enrollment } from '../application/enrollment-service.js';
import type { EnrollmentRequest } from '../domain/enrollment.js';

// The worker's side of `enrollWorker`, with the single-use token secret.
// Its `reason` details carry the service's reasons, such as `token-invalid`.
export interface EnrollmentClient {
  enroll(tokenSecret: string, request: EnrollmentRequest): Promise<Result<Enrollment>>;
}
