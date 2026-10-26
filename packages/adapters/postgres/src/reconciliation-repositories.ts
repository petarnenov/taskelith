import { ok, type Result } from '@taskelith/kernel';
import {
  unknownExecutionsOf,
  type JournalId,
  type ObservationId,
  type ReconciliationQueue,
  type UnknownExecution,
  type UnrecordedProcess,
  type UnrecordedProcesses,
  type WorkerId,
} from '@taskelith/execution';
import type { TaskId } from '@taskelith/sdlc';
import { instant } from './capacity-repositories.js';
import { decodeTask } from './record-codec.js';
import type { Session } from './session.js';

// Execution's reconciliation queue (item 21d): the tasks that count unknown
// executions, and the table `unrecorded_processes`.

export class PostgresUnrecordedProcesses implements UnrecordedProcesses {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async record(process: UnrecordedProcess): Promise<Result<void>> {
    await this.#session.query(
      `INSERT INTO unrecorded_processes (worker_id, observation_id, journal_id, containment, process_count, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [process.workerId, process.observationId, process.journalId, process.containment, process.processCount, process.recordedAt],
    );
    return ok(undefined);
  }
}

interface ProcessRow {
  readonly worker_id: string;
  readonly observation_id: string;
  readonly journal_id: string;
  readonly containment: string;
  readonly process_count: number;
  readonly recorded_at: Date;
}

export class PostgresReconciliationQueue implements ReconciliationQueue {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async unknownExecutionsOfWorker(workerId: WorkerId): Promise<readonly UnknownExecution[]> {
    const unknown = await this.#unknown('unknown_executions > 0', []);
    return unknown.filter(({ execution }) => execution.workerId === workerId);
  }

  unknownExecutionsOfTask(taskId: TaskId): Promise<readonly UnknownExecution[]> {
    return this.#unknown('unknown_executions > 0 AND id = $1', [taskId]);
  }

  async unrecordedProcessesOfWorker(workerId: WorkerId): Promise<readonly UnrecordedProcess[]> {
    const { rows } = await this.#session.query<ProcessRow>(
      `SELECT * FROM unrecorded_processes WHERE worker_id = $1 ORDER BY recorded_at, observation_id COLLATE "C"`,
      [workerId],
    );
    return rows.map(processOf);
  }

  async #unknown(where: string, values: readonly unknown[]): Promise<readonly UnknownExecution[]> {
    const { rows } = await this.#session.query<{ record: string }>(
      `SELECT record FROM tasks WHERE ${where} ORDER BY id COLLATE "C"`,
      values,
    );
    return rows.flatMap((row) => unknownExecutionsOf(decodeTask(row.record)));
  }
}

function processOf(row: ProcessRow): UnrecordedProcess {
  return Object.freeze({
    workerId: row.worker_id as WorkerId,
    journalId: row.journal_id as JournalId,
    observationId: row.observation_id as ObservationId,
    containment: row.containment,
    processCount: row.process_count,
    recordedAt: instant(row.recorded_at),
  });
}
