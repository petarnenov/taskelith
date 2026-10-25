import { parseIdentifier, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import type { Attempt, AttemptId, Task, TaskRepository, WorkerId } from '@taskelith/execution';
import {
  FIRST_GENERATION,
  expectCode,
  expectSame,
  expectSuccess,
  parseOwnershipGeneration,
  type AdmissionId,
  type ConformanceCase,
  type TaskId,
} from '@taskelith/sdlc';
import { createAssignment, endAssignment, type Assignment } from '../domain/assignment.js';
import { parseResourceRequest, type ProjectId, type ProviderCredentialId, type RunId } from '../domain/capacity-reservation.js';
import type { TaskLineageLink } from '../domain/delegation-admission.js';
import type { AssignmentRepository } from './assignment-repository.js';
import type { CapacityLedger } from './capacity-ledger.js';
import type { PlacementQueue } from './placement-queue.js';
import type { PlacementWorkers, WorkerPlacementRecord } from './placement-workers.js';
import type { QuotaSettings } from './quota-settings.js';
import type { TaskLineage } from './task-lineage.js';

// Shared suites for the capacity ports. Read-only ports are checked against
// the fixtures below, which a test stores with its adapter's own means.

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${result.error.message}`);
  return result.value;
}

const id = <Kind extends string>(kind: Kind, text: string) => must(parseIdentifier(kind, text));
const AT: Instant = must(parseInstant('2026-10-25T09:00:00.000Z'));
const PROJECT = id('ProjectId', 'project-1') as ProjectId;
const RUN = id('RunId', 'run-1') as RunId;
const CHILD_RUN = id('RunId', 'run-2') as RunId;
const ROOT = id('TaskId', 'task-root') as TaskId;
const CHILD = id('TaskId', 'task-child') as TaskId;
const CREDENTIAL = id('ProviderCredentialId', 'credential-1') as ProviderCredentialId;

export const ROOT_LINK: TaskLineageLink = Object.freeze({ taskId: ROOT, rootTaskId: ROOT, depth: 0, projectId: PROJECT, runId: RUN });
export const CHILD_LINK: TaskLineageLink = Object.freeze({
  taskId: CHILD, parentTaskId: ROOT, rootTaskId: ROOT, depth: 1, projectId: PROJECT, runId: CHILD_RUN,
});

function worker(text: string, overrides: Partial<WorkerPlacementRecord>): WorkerPlacementRecord {
  return Object.freeze({
    workerId: id('WorkerId', text) as WorkerId, enrolled: true, revoked: false, draining: false, reachable: true,
    slots: 2, cpuMillicores: 3500, memoryMebibytes: 7680, controls: Object.freeze(['memory-limit' as const]), protocolVersion: 1, ...overrides,
  });
}

// Only the first worker is eligible; each other one fails one condition.
export const PLACEMENT_WORKER_FIXTURES: readonly WorkerPlacementRecord[] = Object.freeze([
  worker('worker-eligible', { slots: 3 }),
  worker('worker-unenrolled', { enrolled: false }),
  worker('worker-revoked', { revoked: true }),
  worker('worker-draining', { draining: true }),
  worker('worker-unreachable', { reachable: false }),
  worker('worker-pressured', { admissionPressureSince: AT }),
  worker('worker-without-protocol', { protocolVersion: undefined }),
]);

// Quotas a test stores for project-1 and run-1; others keep the defaults.
export const QUOTA_FIXTURES = Object.freeze({ project: Object.freeze([PROJECT, 1] as const), run: Object.freeze([RUN, 3] as const) });

export const PLACEMENT_WORKERS_CONFORMANCE: readonly ConformanceCase<PlacementWorkers>[] = Object.freeze([
  {
    name: 'workers read back as stored, and only eligible ones count their slots',
    async check(workers: PlacementWorkers) {
      const problems: string[] = [];
      for (const fixture of PLACEMENT_WORKER_FIXTURES) expectSame(problems, fixture.workerId, await workers.get(fixture.workerId), fixture);
      expectSame(problems, 'unknown worker', await workers.get(id('WorkerId', 'worker-x') as WorkerId), undefined);
      expectSame(problems, 'eligible slots', await workers.eligibleSlots(), 3);
      return problems;
    },
  },
]);

export const QUOTA_SETTINGS_CONFORMANCE: readonly ConformanceCase<QuotaSettings>[] = Object.freeze([
  {
    name: 'stored quotas apply to their scope, and other scopes have the defaults',
    async check(quotas: QuotaSettings) {
      const problems: string[] = [];
      expectSame(problems, 'project', await quotas.projectQuota(PROJECT), 1);
      expectSame(problems, 'run', await quotas.runQuota(RUN), 3);
      expectSame(problems, 'default project', await quotas.projectQuota(id('ProjectId', 'project-x') as ProjectId), 4);
      expectSame(problems, 'default run', await quotas.runQuota(CHILD_RUN), 2);
      return problems;
    },
  },
]);

export const TASK_LINEAGE_CONFORMANCE: readonly ConformanceCase<TaskLineage>[] = Object.freeze([
  {
    name: 'a link is written once and reads back as stored',
    async check(lineage: TaskLineage) {
      const problems: string[] = [];
      expectSuccess(problems, 'add root', await lineage.add(ROOT_LINK));
      expectSuccess(problems, 'add child', await lineage.add(CHILD_LINK));
      expectCode(problems, 'second add', await lineage.add({ ...ROOT_LINK, runId: CHILD_RUN }), 'conflict');
      expectSame(problems, 'root', await lineage.get(ROOT), ROOT_LINK);
      expectSame(problems, 'child', await lineage.get(CHILD), CHILD_LINK);
      expectSame(problems, 'unknown', await lineage.get(id('TaskId', 'task-x') as TaskId), undefined);
      return problems;
    },
  },
]);

export interface CapacityLedgerConformanceTarget {
  readonly ledger: CapacityLedger;
  readonly assignments: AssignmentRepository;
  readonly lineage: TaskLineage;
}

function assignment(
  text: string, attempt: string, taskId: TaskId, runId: RunId, cpuMillicores: number, providerCredentials: readonly ProviderCredentialId[] = [],
): Assignment {
  return createAssignment({
    id: id('AssignmentId', text),
    attemptId: id('AttemptId', attempt) as AttemptId,
    workerId: id('WorkerId', 'worker-1') as WorkerId,
    ownershipGeneration: must(parseOwnershipGeneration(1)),
    reservation: {
      id: id('ReservationId', `reservation-${text}`),
      scope: { projectId: PROJECT, runId, taskId, rootTaskId: ROOT },
      requested: must(parseResourceRequest({ cpuMillicores, memoryMebibytes: cpuMillicores * 2, hardControls: [] })),
      providerCredentials,
    },
  }, AT);
}

export const CAPACITY_LEDGER_CONFORMANCE: readonly ConformanceCase<CapacityLedgerConformanceTarget>[] = Object.freeze([
  {
    name: 'occupancy counts held reservations by attempt, worker, project, and charged run',
    async check({ ledger, assignments, lineage }: CapacityLedgerConformanceTarget) {
      const problems: string[] = [];
      for (const link of [ROOT_LINK, CHILD_LINK]) expectSuccess(problems, `link ${link.taskId}`, await lineage.add(link));
      const root = assignment('assignment-root', 'attempt-root', ROOT, RUN, 1000, [CREDENTIAL]);
      const child = assignment('assignment-child', 'attempt-child', CHILD, CHILD_RUN, 500);
      const ended = assignment('assignment-ended', 'attempt-ended', ROOT, RUN, 700);
      for (const stored of [root, child, ended]) expectSuccess(problems, `add ${stored.id}`, await assignments.add(stored));
      const released = must(endAssignment(ended, ended.generation, 'cancelled', { granted: false, nonTerminal: false }, AT));
      expectSuccess(problems, 'release', await assignments.replace(released, ended.generation));
      expectSame(problems, 'held for attempt', await ledger.heldForAttempt(root.attemptId), true);
      expectSame(problems, 'released attempt', await ledger.heldForAttempt(ended.attemptId), false);
      expectSame(problems, 'worker', await ledger.heldOnWorker(root.workerId), { slots: 2, cpuMillicores: 1500, memoryMebibytes: 3000 });
      expectSame(problems, 'idle worker', await ledger.heldOnWorker(id('WorkerId', 'worker-x') as WorkerId), { slots: 0, cpuMillicores: 0, memoryMebibytes: 0 });
      expectSame(problems, 'project', await ledger.heldInProject(PROJECT), 2);
      expectSame(problems, 'root run, charged by the child too', await ledger.heldInRun(RUN), 2);
      expectSame(problems, 'child run', await ledger.heldInRun(CHILD_RUN), 1);
      expectSame(problems, 'credential', await ledger.heldForCredential(CREDENTIAL), 1);
      expectSame(problems, 'unused credential', await ledger.heldForCredential(id('ProviderCredentialId', 'credential-x') as ProviderCredentialId), 0);
      return problems;
    },
  },
  {
    name: 'charges are recorded once per attempt and counted by tree and by retry',
    async check({ ledger }: CapacityLedgerConformanceTarget) {
      const problems: string[] = [];
      const charge = (attempt: string, taskId: TaskId, automaticRetry: boolean) => ({
        attemptId: id('AttemptId', attempt) as AttemptId, taskId, rootTaskId: ROOT, automaticRetry,
      });
      expectSuccess(problems, 'first', await ledger.recordCharge(charge('attempt-1', ROOT, false)));
      expectSuccess(problems, 'retry', await ledger.recordCharge(charge('attempt-2', ROOT, true)));
      expectSuccess(problems, 'child', await ledger.recordCharge(charge('attempt-3', CHILD, true)));
      expectCode(problems, 'repeat', await ledger.recordCharge(charge('attempt-1', ROOT, true)), 'conflict');
      expectSame(problems, 'charged', await ledger.isCharged(id('AttemptId', 'attempt-1') as AttemptId), true);
      expectSame(problems, 'uncharged', await ledger.isCharged(id('AttemptId', 'attempt-9') as AttemptId), false);
      expectSame(problems, 'tree', await ledger.treeAttempts(ROOT), 3);
      expectSame(problems, 'retries', await ledger.automaticRetries(ROOT), 1);
      return problems;
    },
  },
  {
    name: 'open delegations make their parents waiting parents with held units',
    async check({ ledger, assignments, lineage }: CapacityLedgerConformanceTarget) {
      const problems: string[] = [];
      for (const link of [ROOT_LINK, CHILD_LINK]) expectSuccess(problems, `link ${link.taskId}`, await lineage.add(link));
      const parent = assignment('assignment-parent', 'attempt-parent', ROOT, RUN, 1000);
      expectSuccess(problems, 'add parent', await assignments.add(parent));
      expectSame(problems, 'not yet waiting', await ledger.isWaitingParent(parent.attemptId), false);
      const delegation = { parentAttemptId: parent.attemptId, childTaskId: CHILD, admittedAt: AT };
      expectSuccess(problems, 'open', await ledger.openDelegation(delegation));
      expectCode(problems, 'open again', await ledger.openDelegation(delegation), 'conflict');
      expectSame(problems, 'waiting', await ledger.isWaitingParent(parent.attemptId), true);
      expectSame(problems, 'project', await ledger.waitingParentsInProject(PROJECT), 1);
      expectSame(problems, 'run', await ledger.waitingParentsInRun(RUN), 1);
      expectSame(problems, 'other run', await ledger.waitingParentsInRun(CHILD_RUN), 0);
      expectSame(problems, 'slots', await ledger.waitingParentSlots(), 1);
      expectSuccess(problems, 'close', await ledger.closeDelegation(CHILD, AT));
      expectCode(problems, 'close again', await ledger.closeDelegation(CHILD, AT), 'not-found');
      expectCode(problems, 'reopen', await ledger.openDelegation(delegation), 'conflict');
      expectSame(problems, 'no longer waiting', await ledger.isWaitingParent(parent.attemptId), false);
      expectSame(problems, 'no waiting slots', await ledger.waitingParentSlots(), 0);
      return problems;
    },
  },
]);

// Eligible workers whose identities and held reservations order differently.
export const CANDIDATE_WORKER_FIXTURES: readonly WorkerPlacementRecord[] = Object.freeze([
  worker('worker-b', {}),
  worker('worker-d', {}),
  worker('worker-a', {}),
  worker('worker-c', {}),
  worker('worker-x', { draining: true }),
]);

export interface PlacementCandidatesConformanceTarget {
  readonly workers: PlacementWorkers;
  readonly assignments: AssignmentRepository;
}

function heldOn(text: string, attempt: string, workerText: string): Assignment {
  return Object.freeze({ ...assignment(text, attempt, ROOT, RUN, 100), workerId: id('WorkerId', workerText) as WorkerId });
}

export const PLACEMENT_CANDIDATES_CONFORMANCE: readonly ConformanceCase<PlacementCandidatesConformanceTarget>[] = Object.freeze([
  {
    name: 'candidates are the eligible workers, fewest held reservations first, then by identity',
    async check({ workers, assignments }: PlacementCandidatesConformanceTarget) {
      const problems: string[] = [];
      const released = heldOn('assignment-c2', 'attempt-c2', 'worker-c');
      const stored = [
        heldOn('assignment-b1', 'attempt-b1', 'worker-b'), heldOn('assignment-b2', 'attempt-b2', 'worker-b'),
        heldOn('assignment-c1', 'attempt-c1', 'worker-c'), heldOn('assignment-d1', 'attempt-d1', 'worker-d'),
        heldOn('assignment-x1', 'attempt-x1', 'worker-x'), released,
      ];
      for (const held of stored) expectSuccess(problems, `add ${held.id}`, await assignments.add(held));
      const ended = must(endAssignment(released, released.generation, 'cancelled', { granted: false, nonTerminal: false }, AT));
      expectSuccess(problems, 'release', await assignments.replace(ended, released.generation));
      expectSame(problems, 'candidates', await workers.candidates(), ['worker-a', 'worker-c', 'worker-d', 'worker-b']);
      return problems;
    },
  },
]);

export interface PlacementQueueConformanceTarget {
  readonly queue: PlacementQueue;
  readonly tasks: TaskRepository;
  readonly lineage: TaskLineage;
  readonly assignments: AssignmentRepository;
}

const at = (seconds: number): Instant => must(parseInstant(`2026-10-25T09:00:0${seconds}.000Z`));

function queuedTask(text: string, changedAt: Instant, attempts: readonly Attempt[] = []): Task {
  return Object.freeze({
    id: id('TaskId', text) as TaskId,
    admissionId: id('AdmissionId', `admission-${text}`) as AdmissionId,
    ownershipGeneration: must(parseOwnershipGeneration(attempts.length + 1)),
    attempts: Object.freeze(attempts),
    generation: FIRST_GENERATION,
    changedAt,
  });
}

function activeAttemptOf(text: string): Attempt {
  return Object.freeze({ id: id('AttemptId', text) as AttemptId, executions: Object.freeze([]) });
}

function endedAttemptOf(text: string): Attempt {
  const outcome = { kind: 'not-started' as const, cancelled: false, ownershipGeneration: must(parseOwnershipGeneration(2)), endedAt: AT };
  return Object.freeze({ ...activeAttemptOf(text), outcome: Object.freeze(outcome) });
}

function rootLink(taskId: TaskId, project: string): TaskLineageLink {
  return Object.freeze({ taskId, rootTaskId: taskId, depth: 0, projectId: id('ProjectId', project) as ProjectId, runId: RUN });
}

export const PLACEMENT_QUEUE_CONFORMANCE: readonly ConformanceCase<PlacementQueueConformanceTarget>[] = Object.freeze([
  {
    name: 'waiting tasks without a held reservation are read oldest first, with their project',
    async check({ queue, tasks, lineage, assignments }: PlacementQueueConformanceTarget) {
      const problems: string[] = [];
      const fresh = queuedTask('task-a', at(2));
      const released = queuedTask('task-b', at(1), [activeAttemptOf('attempt-b')]);
      const reserved = queuedTask('task-c', at(0), [activeAttemptOf('attempt-c')]);
      const ended = queuedTask('task-d', at(0), [endedAttemptOf('attempt-d')]);
      const later = queuedTask('task-e', at(3));
      const unlinked = queuedTask('task-f', at(0));
      for (const task of [fresh, released, reserved, ended, later, unlinked]) expectSuccess(problems, `add ${task.id}`, await tasks.add(task));
      for (const [task, project] of [[fresh, 'project-1'], [released, 'project-2'], [reserved, 'project-1'], [ended, 'project-1'], [later, 'project-1']] as const) {
        expectSuccess(problems, `link ${task.id}`, await lineage.add(rootLink(task.id, project)));
      }
      const releasedAssignment = assignment('assignment-b', 'attempt-b', released.id, RUN, 100);
      expectSuccess(problems, 'add released', await assignments.add(releasedAssignment));
      const ending = must(endAssignment(releasedAssignment, releasedAssignment.generation, 'cancelled', { granted: false, nonTerminal: false }, AT));
      expectSuccess(problems, 'release', await assignments.replace(ending, releasedAssignment.generation));
      expectSuccess(problems, 'add held', await assignments.add(assignment('assignment-c', 'attempt-c', reserved.id, RUN, 100)));
      const entry = (task: Task, project: string) => ({ projectId: project, waitingSince: task.changedAt, item: task.id });
      const all = [entry(released, 'project-2'), entry(fresh, 'project-1'), entry(later, 'project-1')];
      expectSame(problems, 'waiting', await queue.waiting(10), all);
      expectSame(problems, 'limited', await queue.waiting(2), all.slice(0, 2));
      return problems;
    },
  },
  {
    name: 'the limit takes each project\'s oldest task before any project\'s next',
    async check({ queue, tasks, lineage }: PlacementQueueConformanceTarget) {
      const problems: string[] = [];
      const older = [queuedTask('task-a1', at(0)), queuedTask('task-a2', at(1)), queuedTask('task-a3', at(2))];
      const newer = queuedTask('task-b1', at(3));
      for (const task of [...older, newer]) expectSuccess(problems, `add ${task.id}`, await tasks.add(task));
      for (const task of older) expectSuccess(problems, `link ${task.id}`, await lineage.add(rootLink(task.id, 'project-a')));
      expectSuccess(problems, `link ${newer.id}`, await lineage.add(rootLink(newer.id, 'project-b')));
      const entry = (task: Task, project: string) => ({ projectId: project, waitingSince: task.changedAt, item: task.id });
      const first = [entry(older[0]!, 'project-a'), entry(newer, 'project-b')];
      expectSame(problems, 'limited', await queue.waiting(2), first);
      expectSame(problems, 'all', await queue.waiting(10), [...first, entry(older[1]!, 'project-a'), entry(older[2]!, 'project-a')]);
      return problems;
    },
  },
]);
