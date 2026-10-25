import type { Result } from '@taskelith/kernel';
import type { LaunchOutcome, LaunchRequest } from '../domain/launch-authorization.js';

// What a worker sends: its identity is its bearer credential.
export type LaunchAuthorizationRequest = Omit<LaunchRequest, 'workerId'>;

// The worker's side of `authorizeLaunch`. `unavailable` means no decision
// was reached: the worker retries the same operation until its deadline.
export interface LaunchAuthorityClient {
  authorize(request: LaunchAuthorizationRequest): Promise<Result<LaunchOutcome>>;
}
