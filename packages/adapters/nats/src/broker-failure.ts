import { err, failure, type Result } from '@taskelith/kernel';

// Every broker error is `unavailable`: the caller retries the same operation
// with the same identity, and nothing is assumed to have taken effect.
export function brokerFailure(operation: string, error: unknown): Result<never> {
  const cause = error instanceof Error ? error.message : String(error);
  return err(failure('unavailable', `the broker could not ${operation}`, { cause }));
}
