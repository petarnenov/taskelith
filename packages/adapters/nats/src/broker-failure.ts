import { err, failure, type Failure, type Result } from '@taskelith/kernel';

export const CREDENTIALS_REJECTED = 'credentials-rejected';

// Every broker error is `unavailable`: the caller retries the same operation
// with the same identity, and nothing is assumed to have taken effect.
export function brokerFailure(operation: string, error: unknown): Result<never> {
  const cause = error instanceof Error ? error.message : String(error);
  const details: Record<string, string> = isRejectedCredential(error) ? { cause, reason: CREDENTIALS_REJECTED } : { cause };
  return err(failure('unavailable', `the broker could not ${operation}`, details));
}

// The server refused the user: an authorization violation or an expired
// or revoked user authentication.
export function isCredentialsRejected(failed: Failure): boolean {
  return failed.details.reason === CREDENTIALS_REJECTED;
}

const REJECTED_ERRORS = new Set(['AuthorizationError', 'UserAuthenticationExpiredError']);
const REJECTED_TEXT = /authorization violation|user authentication expired|authentication revoked/i;

// Follows the cause chain, which nats.js uses to wrap a server error.
function isRejectedCredential(error: unknown): boolean {
  const seen = new Set<unknown>();
  for (let link = error; link instanceof Error && !seen.has(link); link = link.cause) {
    seen.add(link);
    if (REJECTED_ERRORS.has(link.name) || REJECTED_TEXT.test(link.message)) return true;
  }
  return false;
}
