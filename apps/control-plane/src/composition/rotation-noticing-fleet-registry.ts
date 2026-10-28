import type { WorkerId } from '@taskelith/execution';
import type { RotationOrder, RotationRequest } from '@taskelith/fleet';
import type { Result } from '@taskelith/kernel';
import type { PostgresDatabase } from '@taskelith/postgres';
import { appendRotationNotice } from '../application/rotation-notice.js';
import { LaunchRevokingFleetRegistry } from './launch-revoking-fleet-registry.js';

// A rotation request and the worker's notice commit together; a repeat
// sends the notice again.
export class RotationNoticingFleetRegistry extends LaunchRevokingFleetRegistry {
  readonly #database: PostgresDatabase;

  constructor(database: PostgresDatabase) {
    super(database);
    this.#database = database;
  }

  override requestRotation(workerId: WorkerId, order: RotationOrder): Promise<Result<RotationRequest>> {
    return this.#database.transaction(async (tx) => {
      const requested = await tx.fleet.requestRotation(workerId, order);
      if (!requested.ok) return requested;
      const noticed = await appendRotationNotice(tx, workerId, requested.value);
      return noticed.ok ? requested : noticed;
    });
  }
}
