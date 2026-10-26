import { randomUUID } from 'node:crypto';
import type { WorkerId } from '@taskelith/execution';
import { parseIdentifier, type Instant, type Result } from '@taskelith/kernel';
import { CommittingFleetRegistry, type PostgresDatabase } from '@taskelith/postgres';
import { releaseRevokedWorker } from '../application/worker-revocation.js';

// A worker revocation is an invalidating writer (launch authorization
// section 5); in its transaction it also frees what the worker cannot run.
export class LaunchRevokingFleetRegistry extends CommittingFleetRegistry {
  readonly #database: PostgresDatabase;

  constructor(database: PostgresDatabase) {
    super(database);
    this.#database = database;
  }

  override revoke(workerId: WorkerId, at: Instant): Promise<Result<void>> {
    const correlationId = parseIdentifier('CorrelationId', `c-${randomUUID()}`);
    if (!correlationId.ok) return Promise.resolve(correlationId);
    return this.#database.transaction(async (tx) => {
      const revoked = await tx.fleet.revoke(workerId, at);
      if (!revoked.ok) return revoked;
      return releaseRevokedWorker(tx, workerId, correlationId.value);
    });
  }
}
