import { failure, type Failure } from '@taskelith/kernel';
import pg from 'pg';

// SQLSTATE serialization_failure and deadlock_detected: the transaction
// lost a race and can be retried as a whole.
const RETRYABLE_STATES = new Set(['40001', '40P01']);

// What the database or the connection reported for one statement; other
// exceptions in a transaction are defects and pass through unchanged.
export class StatementError extends Error {
  constructor(readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'StatementError';
  }

  // Only a server error carries an SQLSTATE; a socket error code such as
  // EPIPE has the same shape but means a lost connection.
  get sqlState(): string | undefined {
    return this.cause instanceof pg.DatabaseError ? this.cause.code : undefined;
  }

  get isRetryable(): boolean {
    return RETRYABLE_STATES.has(this.sqlState ?? '');
  }

  // A broken or refused connection has no SQLSTATE, or one of class 08 or
  // an administrator shutdown (57P01 to 57P03).
  get isConnectionLoss(): boolean {
    const state = this.sqlState;
    return state === undefined || state.startsWith('08') || /^57P0[1-3]$/.test(state);
  }
}

export function unavailable(message: string, cause: Error, details: Readonly<Record<string, string>> = {}): Failure {
  return failure('unavailable', `${message}: ${cause.message}`, details);
}
