import { err, failure, type Failure, type Result } from '@taskelith/kernel';

// Prefixes a nested failure with the input field that caused it, so that a
// caller can point at the offending part of a larger input.
export function fieldFailure(field: string, cause: Failure): Result<never> {
  return err(failure(cause.code, `${field}: ${cause.message}`, { ...cause.details, field }));
}
