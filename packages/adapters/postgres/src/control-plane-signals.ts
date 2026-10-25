import { ok, type Result } from '@taskelith/kernel';
import type { ControlPlaneSignals, ControlPlaneSnapshot } from '@taskelith/observability';
import { ELIGIBLE } from './capacity-repositories.js';
import type { PostgresDatabase } from './postgres-database.js';
import type { Session } from './session.js';

interface SnapshotRow {
  readonly outbox_lag: number;
  readonly outbox_pending: string;
  readonly assignment_age: number;
  readonly offered_assignments: string;
  readonly unknown_executions: string;
  readonly eligible_slots: string;
  readonly held_slots: string;
}

// Each part reads an index of its own; ages use the database clock, which
// also stamps the rows (capacity contract section 4).
const SNAPSHOT = `SELECT
  coalesce(extract(epoch FROM now() - (
    SELECT min(appended_at) FROM outbox WHERE published_at IS NULL
  )), 0)::float8 AS outbox_lag,
  (SELECT count(*) FROM outbox WHERE published_at IS NULL) AS outbox_pending,
  coalesce(extract(epoch FROM now() - (
    SELECT min(changed_at) FROM assignments WHERE state = 'offered'
  )), 0)::float8 AS assignment_age,
  (SELECT count(*) FROM assignments WHERE state = 'offered') AS offered_assignments,
  (SELECT coalesce(sum(unknown_executions), 0) FROM tasks WHERE unknown_executions > 0) AS unknown_executions,
  (SELECT coalesce(sum(slots), 0) FROM workers WHERE ${ELIGIBLE}) AS eligible_slots,
  (SELECT count(*) FROM assignments WHERE reservation_state = 'held') AS held_slots`;

export class PostgresSignalReadings {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async snapshot(): Promise<ControlPlaneSnapshot> {
    const { rows } = await this.#session.query<SnapshotRow>(SNAPSHOT);
    return snapshotOf(rows[0]!);
  }
}

export class PostgresControlPlaneSignals implements ControlPlaneSignals {
  readonly #database: PostgresDatabase;

  constructor(database: PostgresDatabase) {
    this.#database = database;
  }

  read(): Promise<Result<ControlPlaneSnapshot>> {
    return this.#database.readOnly(async (tx) => ok(await tx.signals.snapshot()));
  }
}

// An age is never negative, even when a row was stamped by a skewed clock.
function snapshotOf(row: SnapshotRow): ControlPlaneSnapshot {
  return Object.freeze({
    outboxLagSeconds: Math.max(0, row.outbox_lag),
    outboxPending: Number(row.outbox_pending),
    assignmentAgeSeconds: Math.max(0, row.assignment_age),
    offeredAssignments: Number(row.offered_assignments),
    unknownExecutions: Number(row.unknown_executions),
    eligibleSlots: Number(row.eligible_slots),
    heldSlots: Number(row.held_slots),
  });
}
