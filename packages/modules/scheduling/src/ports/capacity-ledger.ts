import type { Instant, Result } from '@taskelith/kernel';
import type { AttemptId, WorkerId } from '@taskelith/execution';
import type { TaskId } from '@taskelith/sdlc';
import type { ProjectId, RunId } from '../domain/capacity-reservation.js';

export interface WorkerOccupancy {
  readonly slots: number;
  readonly cpuMillicores: number;
  readonly memoryMebibytes: number;
}

export interface CapacityCharge {
  readonly attemptId: AttemptId;
  readonly taskId: TaskId;
  readonly rootTaskId: TaskId;
  readonly automaticRetry: boolean;
}

export interface OpenDelegation {
  readonly parentAttemptId: AttemptId;
  readonly childTaskId: TaskId;
  readonly admittedAt: Instant;
}

// Occupancy derived from held reservations, consumption from charge records,
// and the delegations whose parents wait; all read inside the transaction.
export interface CapacityLedger {
  heldForAttempt(attemptId: AttemptId): Promise<boolean>;
  heldOnWorker(workerId: WorkerId): Promise<WorkerOccupancy>;
  heldInProject(projectId: ProjectId): Promise<number>;
  // Held reservations that charge the run: their own run or their root's.
  heldInRun(runId: RunId): Promise<number>;
  isCharged(attemptId: AttemptId): Promise<boolean>;
  treeAttempts(rootTaskId: TaskId): Promise<number>;
  automaticRetries(taskId: TaskId): Promise<number>;
  // Fails with `conflict` for an attempt already charged.
  recordCharge(charge: CapacityCharge): Promise<Result<void>>;
  openDelegation(delegation: OpenDelegation): Promise<Result<void>>;
  isWaitingParent(attemptId: AttemptId): Promise<boolean>;
  // Units that held reservations of waiting parents occupy.
  waitingParentsInProject(projectId: ProjectId): Promise<number>;
  waitingParentsInRun(runId: RunId): Promise<number>;
  waitingParentSlots(): Promise<number>;
}
