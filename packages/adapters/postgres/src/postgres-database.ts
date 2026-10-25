import { setTimeout as delay } from 'node:timers/promises';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import pg from 'pg';
import { NO_CRASH_POINTS, type CrashPointHook } from './crash-points.js';
import { StatementError, unavailable } from './database-errors.js';
import { PostgresTransaction } from './postgres-transaction.js';
import { Session } from './session.js';

// A transaction that loses a serialization race runs again as a whole, at
// most this many times in all, waiting the base delay doubled per retry.
export const SERIALIZATION_ATTEMPTS = 5;
export const SERIALIZATION_BACKOFF_MILLISECONDS = 10;

const UNIQUE_VIOLATION = '23505';

// The server answers COMMIT with ROLLBACK when the work went on after a
// failed statement, which it caught instead of returning an `Err`.
const ABORTED_BY_A_FAILED_STATEMENT = failure(
  'internal', 'a failed statement aborted the transaction, so nothing was committed', { outcome: 'rolled-back' },
);

export interface PostgresDatabaseOptions {
  readonly crashPoints?: CrashPointHook;
  readonly maxConnections?: number;
  readonly serializationAttempts?: number;
  // A statement without an answer by then counts as a lost connection.
  readonly queryTimeoutMilliseconds?: number;
}

export type TransactionWork<Value> = (transaction: PostgresTransaction) => Promise<Result<Value>>;

// The control plane's PostgreSQL state. Work runs in SERIALIZABLE
// transactions; an `Err` from the work rolls its transaction back.
export class PostgresDatabase {
  readonly #pool: pg.Pool;
  readonly #crashPoints: CrashPointHook;
  readonly #serializationAttempts: number;

  constructor(url: URL, options: PostgresDatabaseOptions = {}) {
    this.#pool = new pg.Pool({
      connectionString: url.href,
      max: options.maxConnections ?? 10,
      query_timeout: options.queryTimeoutMilliseconds,
      connectionTimeoutMillis: options.queryTimeoutMilliseconds,
    });
    // An idle connection that breaks is discarded; the next checkout reports.
    this.#pool.on('error', ignoreConnectionError);
    this.#crashPoints = options.crashPoints ?? NO_CRASH_POINTS;
    this.#serializationAttempts = options.serializationAttempts ?? SERIALIZATION_ATTEMPTS;
  }

  async transaction<Value>(work: TransactionWork<Value>): Promise<Result<Value>> {
    for (let attempt = 1; ; attempt++) {
      const outcome = await this.#attempt(work);
      if (outcome.kind === 'done') return outcome.result;
      if (attempt >= this.#serializationAttempts) {
        return err(failure('unavailable', `the transaction lost ${attempt} serialization races in a row`, { attempts: String(attempt) }));
      }
      await delay(SERIALIZATION_BACKOFF_MILLISECONDS * 2 ** (attempt - 1));
    }
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  // Runs the work once; a lost serialization race asks for a retry.
  async #attempt<Value>(work: TransactionWork<Value>): Promise<Attempt<Value>> {
    let client: pg.PoolClient;
    try {
      client = await this.#pool.connect();
    } catch (error) {
      return done(err(unavailable('PostgreSQL is not reachable', error as Error)));
    }
    // A connection that breaks mid-transaction also emits `error`; the
    // failed statement reports it, so the event itself is ignored.
    client.on('error', ignoreConnectionError);
    const session = new Session(client);
    let broken: Error | undefined;
    try {
      await session.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const transaction = new PostgresTransaction(session);
      const result = await work(transaction);
      // Nothing was committed whether or not the rollback is confirmed.
      if (!result.ok) {
        broken = await rollbackOrBreak(session);
        return done(result);
      }
      const points = commitPoints(transaction);
      for (const point of points) this.#crashPoints.reach(`${point}.before`);
      const committed = await this.#commit(session);
      if (!committed.ok) {
        broken = new Error(committed.error.message);
        return done(committed);
      }
      for (const point of points) this.#crashPoints.reach(`${point}.after`);
      return done(result);
    } catch (error) {
      const lost = error instanceof StatementError && error.isConnectionLoss;
      broken = lost ? error : await rollbackOrBreak(session);
      if (!(error instanceof StatementError)) throw error;
      return statementOutcome(error);
    } finally {
      client.off('error', ignoreConnectionError);
      client.release(broken);
    }
  }

  // A connection lost during COMMIT leaves the outcome unknown, so the work
  // is not retried; a serialization failure at commit is.
  async #commit(session: Session): Promise<Result<void>> {
    try {
      const committed = await session.query('COMMIT');
      if (committed.command !== 'COMMIT') return err(ABORTED_BY_A_FAILED_STATEMENT);
      return ok(undefined);
    } catch (error) {
      if (!(error instanceof StatementError) || !error.isConnectionLoss) throw error;
      return err(unavailable('the commit outcome is unknown', error, { outcome: 'unknown' }));
    }
  }
}

type Attempt<Value> = { readonly kind: 'done'; readonly result: Result<Value> } | { readonly kind: 'retry' };

function done<Value>(result: Result<Value>): Attempt<Value> {
  return { kind: 'done', result };
}

function statementOutcome<Value>(error: StatementError): Attempt<Value> {
  if (error.isRetryable) return { kind: 'retry' };
  if (error.sqlState === UNIQUE_VIOLATION) {
    return done(err(failure('conflict', `a unique constraint rejected the transaction: ${error.message}`)));
  }
  if (error.isConnectionLoss) return done(err(unavailable('the PostgreSQL connection was lost', error)));
  throw error;
}

function ignoreConnectionError(): void {}

function commitPoints(transaction: PostgresTransaction): ('OutboxCommit' | 'InboxCommit')[] {
  return [
    ...(transaction.inbox.accepted ? ['InboxCommit' as const] : []),
    ...(transaction.outbox.appended ? ['OutboxCommit' as const] : []),
  ];
}

// A connection whose rollback was not confirmed is destroyed, not reused.
async function rollbackOrBreak(session: Session): Promise<Error | undefined> {
  try {
    await session.query('ROLLBACK');
    return undefined;
  } catch (error) {
    return error as Error;
  }
}

