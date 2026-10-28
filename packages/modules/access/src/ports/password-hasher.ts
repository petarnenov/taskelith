import type { Result } from '@taskelith/kernel';
import type { PasswordHash } from '../domain/principal.js';

export interface PasswordVerification {
  readonly matches: boolean;
  // The stored parameters are weaker than the current ones.
  readonly rehashDue: boolean;
}

// A slow password hash; `unavailable` when its bounded queue is full.
export interface PasswordHasher {
  hash(password: string): Promise<Result<PasswordHash>>;
  // Without a stored hash it verifies against a fixed dummy hash and never
  // matches, so an unknown login name costs what a wrong password does.
  verify(password: string, stored: PasswordHash | undefined): Promise<Result<PasswordVerification>>;
}
