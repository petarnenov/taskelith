import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import type { AttemptId, WorkerId } from '@taskelith/execution';
import type { TaskId } from '@taskelith/sdlc';
import { DEFAULT_PROJECT_QUOTA, DEFAULT_RUN_QUOTA } from '../domain/capacity-limits.js';
import type { ProjectId, ProviderCredentialId, RunId } from '../domain/capacity-reservation.js';
import type { Assignment } from '../domain/assignment.js';
import type { TaskLineageLink } from '../domain/delegation-admission.js';
import type { CapacityCharge, CapacityLedger, OpenDelegation, WorkerOccupancy } from '../ports/capacity-ledger.js';
import type { InstallationGuard } from '../ports/installation-guard.js';
import { isEligibleForPlacement, type PlacementWorkers, type WorkerPlacementRecord } from '../ports/placement-workers.js';
import type { QuotaSettings } from '../ports/quota-settings.js';
import type { TaskLineage } from '../ports/task-lineage.js';

// In-memory capacity adapters for tests and single-process composition; the
// read-only ones take their records from the test that builds them.

export class InMemoryPlacementWorkers implements PlacementWorkers {
  readonly #workers: ReadonlyMap<WorkerId, WorkerPlacementRecord>;

  constructor(workers: readonly WorkerPlacementRecord[]) {
    this.#workers = new Map(workers.map((worker) => [worker.workerId, worker]));
  }

  async get(workerId: WorkerId): Promise<WorkerPlacementRecord | undefined> {
    return this.#workers.get(workerId);
  }

  async eligibleSlots(): Promise<number> {
    return [...this.#workers.values()].filter(isEligibleForPlacement).reduce((slots, worker) => slots + worker.slots, 0);
  }
}

// `undefined` is an installation without its record, which admits nothing.
export class InMemoryInstallationGuard implements InstallationGuard {
  readonly #quarantined: boolean | undefined;
  readonly #recoveryEpoch: number | undefined;

  constructor(quarantined: boolean | undefined, recoveryEpoch: number | undefined = quarantined === undefined ? undefined : 1) {
    this.#quarantined = quarantined;
    this.#recoveryEpoch = recoveryEpoch;
  }

  async quarantined(): Promise<boolean> {
    return this.#quarantined ?? true;
  }

  async recoveryEpoch(): Promise<number | undefined> {
    return this.#recoveryEpoch;
  }
}

export class InMemoryQuotaSettings implements QuotaSettings {
  readonly #projects: ReadonlyMap<ProjectId, number>;
  readonly #runs: ReadonlyMap<RunId, number>;

  constructor(projects: ReadonlyMap<ProjectId, number> = new Map(), runs: ReadonlyMap<RunId, number> = new Map()) {
    this.#projects = projects;
    this.#runs = runs;
  }

  async projectQuota(projectId: ProjectId): Promise<number> {
    return this.#projects.get(projectId) ?? DEFAULT_PROJECT_QUOTA;
  }

  async runQuota(runId: RunId): Promise<number> {
    return this.#runs.get(runId) ?? DEFAULT_RUN_QUOTA;
  }
}

export class InMemoryTaskLineage implements TaskLineage {
  readonly #links = new Map<TaskId, TaskLineageLink>();

  async get(taskId: TaskId): Promise<TaskLineageLink | undefined> {
    return this.#links.get(taskId);
  }

  async add(link: TaskLineageLink): Promise<Result<void>> {
    if (this.#links.has(link.taskId)) return err(failure('conflict', `task ${link.taskId} already has a lineage link`, { task: link.taskId }));
    this.#links.set(link.taskId, Object.freeze({ ...link }));
    return ok(undefined);
  }
}

// Derives occupancy from the held reservations of an assignment store and the
// runs of a lineage store, as the database ledger does with its queries.
export class InMemoryCapacityLedger implements CapacityLedger {
  readonly #assignments: () => readonly Assignment[];
  readonly #lineage: TaskLineage;
  readonly #charges = new Map<AttemptId, CapacityCharge>();
  readonly #delegations = new Map<TaskId, OpenDelegation & { closedAt?: Instant }>();

  constructor(assignments: () => readonly Assignment[], lineage: TaskLineage) {
    this.#assignments = assignments;
    this.#lineage = lineage;
  }

  async heldForAttempt(attemptId: AttemptId): Promise<boolean> {
    return this.#held().some((assignment) => assignment.attemptId === attemptId);
  }

  async heldOnWorker(workerId: WorkerId): Promise<WorkerOccupancy> {
    const held = this.#held().filter((assignment) => assignment.workerId === workerId);
    return Object.freeze({
      slots: held.length,
      cpuMillicores: held.reduce((sum, assignment) => sum + assignment.reservation.requested.cpuMillicores, 0),
      memoryMebibytes: held.reduce((sum, assignment) => sum + assignment.reservation.requested.memoryMebibytes, 0),
    });
  }

  async heldInProject(projectId: ProjectId): Promise<number> {
    return this.#held().filter((assignment) => assignment.reservation.scope.projectId === projectId).length;
  }

  async heldInRun(runId: RunId): Promise<number> {
    return (await this.#chargingRun(this.#held(), runId)).length;
  }

  async heldForCredential(credentialId: ProviderCredentialId): Promise<number> {
    return this.#held().filter((assignment) => assignment.reservation.providerCredentials.includes(credentialId)).length;
  }

  async isCharged(attemptId: AttemptId): Promise<boolean> {
    return this.#charges.has(attemptId);
  }

  async treeAttempts(rootTaskId: TaskId): Promise<number> {
    return [...this.#charges.values()].filter((charge) => charge.rootTaskId === rootTaskId).length;
  }

  async automaticRetries(taskId: TaskId): Promise<number> {
    return [...this.#charges.values()].filter((charge) => charge.taskId === taskId && charge.automaticRetry).length;
  }

  async recordCharge(charge: CapacityCharge): Promise<Result<void>> {
    if (this.#charges.has(charge.attemptId)) return err(failure('conflict', `attempt ${charge.attemptId} is already charged`, { attempt: charge.attemptId }));
    this.#charges.set(charge.attemptId, Object.freeze({ ...charge }));
    return ok(undefined);
  }

  async openDelegation(delegation: OpenDelegation): Promise<Result<void>> {
    if (this.#delegations.has(delegation.childTaskId)) {
      return err(failure('conflict', `task ${delegation.childTaskId} is already a delegated child`, { task: delegation.childTaskId }));
    }
    this.#delegations.set(delegation.childTaskId, { ...delegation });
    return ok(undefined);
  }

  // A closed delegation stays recorded, so the child is never delegated again.
  async closeDelegation(childTaskId: TaskId, at: Instant): Promise<Result<void>> {
    const delegation = this.#delegations.get(childTaskId);
    if (delegation === undefined || delegation.closedAt !== undefined) {
      return err(failure('not-found', `task ${childTaskId} is not an open delegated child`, { task: childTaskId }));
    }
    delegation.closedAt = at;
    return ok(undefined);
  }

  async isWaitingParent(attemptId: AttemptId): Promise<boolean> {
    return this.#open().some((delegation) => delegation.parentAttemptId === attemptId);
  }

  async waitingParentsInProject(projectId: ProjectId): Promise<number> {
    return this.#waitingParents().filter((assignment) => assignment.reservation.scope.projectId === projectId).length;
  }

  async waitingParentsInRun(runId: RunId): Promise<number> {
    return (await this.#chargingRun(this.#waitingParents(), runId)).length;
  }

  async waitingParentSlots(): Promise<number> {
    return this.#waitingParents().length;
  }

  #open(): readonly OpenDelegation[] {
    return [...this.#delegations.values()].filter((delegation) => delegation.closedAt === undefined);
  }

  #held(): readonly Assignment[] {
    return this.#assignments().filter((assignment) => assignment.reservation.state === 'held');
  }

  #waitingParents(): readonly Assignment[] {
    const parents = new Set(this.#open().map((delegation) => delegation.parentAttemptId));
    return this.#held().filter((assignment) => parents.has(assignment.attemptId));
  }

  async #chargingRun(assignments: readonly Assignment[], runId: RunId): Promise<readonly Assignment[]> {
    const charging: Assignment[] = [];
    for (const assignment of assignments) {
      const rootRun = (await this.#lineage.get(assignment.reservation.scope.rootTaskId))?.runId;
      if (assignment.reservation.scope.runId === runId || rootRun === runId) charging.push(assignment);
    }
    return charging;
  }
}
