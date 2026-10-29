import type { AttemptId, ExecutionId, WorkerId } from '@taskelith/execution';
import {
  parseSlotCredentialVersion,
  type ProviderCredentialId,
  type SlotCredentialDeliveries,
  type SlotDeliveryRecord,
} from '@taskelith/scheduling';
import type { TaskId } from '@taskelith/sdlc';
import { instant } from './capacity-repositories.js';
import type { Session } from './session.js';

interface DeliveryRow {
  readonly task_id: string;
  readonly execution_id: string;
  readonly slot_id: string;
  readonly attempt_id: string;
  readonly worker_id: string;
  readonly credential_version: number;
  readonly first_delivered_at: Date;
  readonly last_delivered_at: Date;
  readonly deliveries: number;
}

const COLUMNS = `task_id, execution_id, slot_id, attempt_id, worker_id, credential_version, first_delivered_at,
  last_delivered_at, deliveries`;

// Delivery records in the delivery's SERIALIZABLE transaction; a concurrent
// first record of one execution and slot is a serialization failure.
export class PostgresSlotCredentialDeliveries implements SlotCredentialDeliveries {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async find(taskId: TaskId, executionId: ExecutionId, slotId: ProviderCredentialId): Promise<SlotDeliveryRecord | undefined> {
    const { rows } = await this.#session.query<DeliveryRow>(
      `SELECT ${COLUMNS} FROM slot_credential_deliveries WHERE task_id = $1 AND execution_id = $2 AND slot_id = $3`,
      [taskId, executionId, slotId],
    );
    return rows[0] === undefined ? undefined : recordOf(rows[0]);
  }

  async listByExecution(taskId: TaskId, executionId: ExecutionId): Promise<readonly SlotDeliveryRecord[]> {
    const { rows } = await this.#session.query<DeliveryRow>(
      `SELECT ${COLUMNS} FROM slot_credential_deliveries WHERE task_id = $1 AND execution_id = $2 ORDER BY slot_id COLLATE "C"`,
      [taskId, executionId],
    );
    return Object.freeze(rows.map(recordOf));
  }

  async record(delivery: SlotDeliveryRecord): Promise<void> {
    await this.#session.query(
      `INSERT INTO slot_credential_deliveries (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (task_id, execution_id, slot_id) DO UPDATE SET attempt_id = $4, worker_id = $5, credential_version = $6,
         first_delivered_at = $7, last_delivered_at = $8, deliveries = $9`,
      [delivery.taskId, delivery.executionId, delivery.slotId, delivery.attemptId, delivery.workerId, delivery.credentialVersion,
        delivery.firstDeliveredAt, delivery.lastDeliveredAt, delivery.deliveries],
    );
  }
}

function recordOf(row: DeliveryRow): SlotDeliveryRecord {
  const version = parseSlotCredentialVersion(row.credential_version);
  if (!version.ok) throw new Error(`stored delivery of slot ${row.slot_id} is invalid: ${version.error.message}`);
  return Object.freeze({
    taskId: row.task_id as TaskId,
    executionId: row.execution_id as ExecutionId,
    slotId: row.slot_id as ProviderCredentialId,
    attemptId: row.attempt_id as AttemptId,
    workerId: row.worker_id as WorkerId,
    credentialVersion: version.value,
    firstDeliveredAt: instant(row.first_delivered_at),
    lastDeliveredAt: instant(row.last_delivered_at),
    deliveries: row.deliveries,
  });
}
