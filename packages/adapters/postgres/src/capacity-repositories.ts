import { err, failure, ok, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import type { AttemptId, WorkerId } from '@taskelith/execution';
import {
  DEFAULT_PROJECT_QUOTA,
  DEFAULT_RUN_QUOTA,
  type CapacityCharge,
  type CapacityLedger,
  type HardControl,
  type InstallationGuard,
  type OpenDelegation,
  type PlacementWorkers,
  type ProjectId,
  type ProviderCredentialId,
  type QuotaSettings,
  type RunId,
  type TaskLineage,
  type TaskLineageLink,
  type WorkerOccupancy,
  type WorkerPlacementRecord,
} from '@taskelith/scheduling';
import type { TaskId } from '@taskelith/sdlc';
import type { Session } from './session.js';

// The capacity reads and writes of the reservation transaction. Counts are
// queried from held reservations inside it, never cached (contract §4).

interface WorkerRow {
  readonly worker_id: string;
  readonly enrolled: boolean;
  readonly revoked: boolean;
  readonly draining: boolean;
  readonly reachable: boolean;
  readonly admission_pressure_since: Date | null;
  readonly slots: number;
  readonly cpu_millicores: number;
  readonly memory_mebibytes: number;
  readonly controls: string[];
}

// The columns placement reads; item 13 may add others to the table.
const WORKER_COLUMNS = 'worker_id, enrolled, revoked, draining, reachable, admission_pressure_since, slots, cpu_millicores, memory_mebibytes, controls';
export const ELIGIBLE = 'enrolled AND NOT revoked AND NOT draining AND reachable AND admission_pressure_since IS NULL';

export class PostgresPlacementWorkers implements PlacementWorkers {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async get(workerId: WorkerId): Promise<WorkerPlacementRecord | undefined> {
    const { rows } = await this.#session.query<WorkerRow>(`SELECT ${WORKER_COLUMNS} FROM workers WHERE worker_id = $1`, [workerId]);
    return rows[0] === undefined ? undefined : workerRecord(rows[0]);
  }

  async eligibleSlots(): Promise<number> {
    const { rows } = await this.#session.query<{ slots: string }>(`SELECT coalesce(sum(slots), 0) AS slots FROM workers WHERE ${ELIGIBLE}`);
    return Number(rows[0]!.slots);
  }
}

function workerRecord(row: WorkerRow): WorkerPlacementRecord {
  const since = row.admission_pressure_since === null ? undefined : instant(row.admission_pressure_since);
  return Object.freeze({
    workerId: row.worker_id as WorkerId,
    enrolled: row.enrolled,
    revoked: row.revoked,
    draining: row.draining,
    reachable: row.reachable,
    ...(since === undefined ? {} : { admissionPressureSince: since }),
    slots: row.slots,
    cpuMillicores: row.cpu_millicores,
    memoryMebibytes: row.memory_mebibytes,
    controls: Object.freeze(row.controls as HardControl[]),
  });
}

// An installation without its record is not initialized and admits nothing.
export class PostgresInstallationGuard implements InstallationGuard {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async quarantined(): Promise<boolean> {
    const { rows } = await this.#session.query<{ quarantined: boolean }>('SELECT quarantined FROM installation');
    return rows[0]?.quarantined ?? true;
  }
}

export class PostgresQuotaSettings implements QuotaSettings {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  projectQuota(projectId: ProjectId): Promise<number> {
    return this.#quota('project', projectId, DEFAULT_PROJECT_QUOTA);
  }

  runQuota(runId: RunId): Promise<number> {
    return this.#quota('run', runId, DEFAULT_RUN_QUOTA);
  }

  async #quota(scope: 'project' | 'run', scopeId: string, fallback: number): Promise<number> {
    const { rows } = await this.#session.query<{ quota: number }>('SELECT quota FROM capacity_quotas WHERE scope = $1 AND scope_id = $2', [scope, scopeId]);
    return rows[0]?.quota ?? fallback;
  }
}

interface LineageRow {
  readonly task_id: string;
  readonly parent_task_id: string | null;
  readonly root_task_id: string;
  readonly depth: number;
  readonly project_id: string;
  readonly run_id: string;
}

export class PostgresTaskLineage implements TaskLineage {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async get(taskId: TaskId): Promise<TaskLineageLink | undefined> {
    const { rows } = await this.#session.query<LineageRow>(
      'SELECT task_id, parent_task_id, root_task_id, depth, project_id, run_id FROM task_lineage WHERE task_id = $1',
      [taskId],
    );
    const row = rows[0];
    if (row === undefined) return undefined;
    return Object.freeze({
      taskId: row.task_id as TaskId,
      ...(row.parent_task_id === null ? {} : { parentTaskId: row.parent_task_id as TaskId }),
      rootTaskId: row.root_task_id as TaskId,
      depth: row.depth,
      projectId: row.project_id as ProjectId,
      runId: row.run_id as RunId,
    });
  }

  async add(link: TaskLineageLink): Promise<Result<void>> {
    const inserted = await this.#session.query(
      'INSERT INTO task_lineage (task_id, parent_task_id, root_task_id, depth, project_id, run_id) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
      [link.taskId, link.parentTaskId ?? null, link.rootTaskId, link.depth, link.projectId, link.runId],
    );
    if (inserted.rowCount === 1) return ok(undefined);
    return err(failure('conflict', `task ${link.taskId} already has a lineage link`, { task: link.taskId }));
  }
}

const HELD = "reservation_state = 'held'";
const WAITING_PARENT = `attempt_id IN (SELECT parent_attempt_id FROM delegations WHERE closed_at IS NULL)`;
// A held reservation charges its own run and the run of its root task.
const CHARGES_RUN = '(run_id = $1 OR root_task_id IN (SELECT task_id FROM task_lineage WHERE run_id = $1))';

export class PostgresCapacityLedger implements CapacityLedger {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async heldForAttempt(attemptId: AttemptId): Promise<boolean> {
    return (await this.#count(`SELECT count(*) FROM assignments WHERE ${HELD} AND attempt_id = $1`, [attemptId])) > 0;
  }

  async heldOnWorker(workerId: WorkerId): Promise<WorkerOccupancy> {
    const { rows } = await this.#session.query<{ slots: string; cpu: string; memory: string }>(
      `SELECT count(*) AS slots, coalesce(sum(cpu_millicores), 0) AS cpu, coalesce(sum(memory_mebibytes), 0) AS memory
       FROM assignments WHERE ${HELD} AND worker_id = $1`,
      [workerId],
    );
    const row = rows[0]!;
    return Object.freeze({ slots: Number(row.slots), cpuMillicores: Number(row.cpu), memoryMebibytes: Number(row.memory) });
  }

  heldInProject(projectId: ProjectId): Promise<number> {
    return this.#count(`SELECT count(*) FROM assignments WHERE ${HELD} AND project_id = $1`, [projectId]);
  }

  heldInRun(runId: RunId): Promise<number> {
    return this.#count(`SELECT count(*) FROM assignments WHERE ${HELD} AND ${CHARGES_RUN}`, [runId]);
  }

  heldForCredential(credentialId: ProviderCredentialId): Promise<number> {
    return this.#count(`SELECT count(*) FROM assignments WHERE ${HELD} AND provider_credentials @> ARRAY[$1::text]`, [credentialId]);
  }

  async isCharged(attemptId: AttemptId): Promise<boolean> {
    return (await this.#count('SELECT count(*) FROM capacity_charges WHERE attempt_id = $1', [attemptId])) > 0;
  }

  treeAttempts(rootTaskId: TaskId): Promise<number> {
    return this.#count('SELECT count(*) FROM capacity_charges WHERE root_task_id = $1', [rootTaskId]);
  }

  automaticRetries(taskId: TaskId): Promise<number> {
    return this.#count('SELECT count(*) FROM capacity_charges WHERE task_id = $1 AND automatic_retry', [taskId]);
  }

  async recordCharge(charge: CapacityCharge): Promise<Result<void>> {
    const inserted = await this.#session.query(
      'INSERT INTO capacity_charges (attempt_id, task_id, root_task_id, automatic_retry) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [charge.attemptId, charge.taskId, charge.rootTaskId, charge.automaticRetry],
    );
    if (inserted.rowCount === 1) return ok(undefined);
    return err(failure('conflict', `attempt ${charge.attemptId} is already charged`, { attempt: charge.attemptId }));
  }

  async openDelegation(delegation: OpenDelegation): Promise<Result<void>> {
    const inserted = await this.#session.query(
      'INSERT INTO delegations (child_task_id, parent_attempt_id, admitted_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [delegation.childTaskId, delegation.parentAttemptId, delegation.admittedAt],
    );
    if (inserted.rowCount === 1) return ok(undefined);
    return err(failure('conflict', `task ${delegation.childTaskId} is already a delegated child`, { task: delegation.childTaskId }));
  }

  async closeDelegation(childTaskId: TaskId, at: Instant): Promise<Result<void>> {
    const closed = await this.#session.query(
      'UPDATE delegations SET closed_at = $2 WHERE child_task_id = $1 AND closed_at IS NULL',
      [childTaskId, at],
    );
    if (closed.rowCount === 1) return ok(undefined);
    return err(failure('not-found', `task ${childTaskId} is not an open delegated child`, { task: childTaskId }));
  }

  async isWaitingParent(attemptId: AttemptId): Promise<boolean> {
    return (await this.#count('SELECT count(*) FROM delegations WHERE closed_at IS NULL AND parent_attempt_id = $1', [attemptId])) > 0;
  }

  waitingParentsInProject(projectId: ProjectId): Promise<number> {
    return this.#count(`SELECT count(*) FROM assignments WHERE ${HELD} AND ${WAITING_PARENT} AND project_id = $1`, [projectId]);
  }

  waitingParentsInRun(runId: RunId): Promise<number> {
    return this.#count(`SELECT count(*) FROM assignments WHERE ${HELD} AND ${WAITING_PARENT} AND ${CHARGES_RUN}`, [runId]);
  }

  waitingParentSlots(): Promise<number> {
    return this.#count(`SELECT count(*) FROM assignments WHERE ${HELD} AND ${WAITING_PARENT}`);
  }

  async #count(text: string, values: readonly unknown[] = []): Promise<number> {
    const { rows } = await this.#session.query<{ count: string }>(text, values);
    return Number(rows[0]!.count);
  }
}

// The database clock at the start of the transaction, the same for every
// read in it, so all records one transaction writes carry one time.
export async function databaseNow(session: Session): Promise<Instant> {
  const { rows } = await session.query<{ now: Date }>('SELECT now() AS now');
  return instant(rows[0]!.now);
}

export function instant(date: Date): Instant {
  const parsed = parseInstant(date.toISOString());
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}
