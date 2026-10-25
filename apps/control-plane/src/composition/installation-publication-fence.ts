import { err, failure, type Result } from '@taskelith/kernel';
import type { PublicationFence } from '@taskelith/nats';
import type { PostgresDatabase } from '@taskelith/postgres';

// Nothing is published under restore quarantine (trust model 2): entering it
// waits for the round holding the record, and a missing record counts too.
export class InstallationPublicationFence implements PublicationFence {
  readonly #database: PostgresDatabase;

  constructor(database: PostgresDatabase) {
    this.#database = database;
  }

  hold<Value>(work: () => Promise<Result<Value>>): Promise<Result<Value>> {
    return this.#database.readCommitted(async (tx) => {
      if (!(await tx.installation.holdForPublication())) {
        return err(failure('unavailable', 'the installation is in restore quarantine, so nothing is published', { reason: 'restore-quarantine' }));
      }
      return work();
    });
  }
}
