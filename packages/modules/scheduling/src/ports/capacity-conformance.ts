import { parseIdentifier, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import { parseSequence, type Attempt, type AttemptId, type Task, type TaskRepository, type WorkerId } from '@taskelith/execution';
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
import { fairPlacementOrder } from '../domain/fair-order.js';
import type { AssignmentRepository } from './assignment-repository.js';
import type { CapacityLedger } from './capacity-ledger.js';
import type { PlacementQueue } from './placement-queue.js';
import type { PlacementRotation } from './placement-rotation.js';
import type { PlacementWorkers, WorkerPlacementRecord } from './placement-workers.js';
import type { QuotaSettings } from './quota-settings.js';
import type { TaskLineage } from './task-lineage.js';
import type { WorkerReports } from './worker-reports.js';

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
    name: 'waiting tasks without a held reservation are read by project, oldest first in each',
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
      const all = [entry(fresh, 'project-1'), entry(released, 'project-2'), entry(later, 'project-1')];
      expectSame(problems, 'waiting', await queue.waiting(10, [], undefined), all);
      expectSame(problems, 'limited', await queue.waiting(2, [], undefined), all.slice(0, 2));
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
      expectSame(problems, 'limited', await queue.waiting(2, [], undefined), first);
      expectSame(problems, 'all', await queue.waiting(10, [], undefined), [...first, entry(older[1]!, 'project-a'), entry(older[2]!, 'project-a')]);
      return problems;
    },
  },
  {
    name: 'excluded tasks are left out before the limit, so the next tasks are read',
    async check({ queue, tasks, lineage }: PlacementQueueConformanceTarget) {
      const problems: string[] = [];
      const backingOff = [queuedTask('task-a', at(0)), queuedTask('task-b', at(1))];
      const next = queuedTask('task-c', at(2));
      for (const [task, project] of [[backingOff[0]!, 'project-a'], [backingOff[1]!, 'project-b'], [next, 'project-c']] as const) {
        expectSuccess(problems, `add ${task.id}`, await tasks.add(task));
        expectSuccess(problems, `link ${task.id}`, await lineage.add(rootLink(task.id, project)));
      }
      const excluding = backingOff.map((task) => task.id);
      const read = await queue.waiting(2, excluding, undefined);
      expectSame(problems, 'excluded', read, [{ projectId: 'project-c', waitingSince: next.changedAt, item: next.id }]);
      return problems;
    },
  },
  {
    name: 'a read starts after the given project and wraps around, oldest first in each',
    async check({ queue, tasks, lineage }: PlacementQueueConformanceTarget) {
      const problems: string[] = [];
      const placed = [
        [queuedTask('task-a1', at(0)), 'project-a'], [queuedTask('task-b1', at(1)), 'project-b'],
        [queuedTask('task-c1', at(2)), 'project-c'], [queuedTask('task-c2', at(3)), 'project-c'],
      ] as const;
      for (const [task, project] of placed) {
        expectSuccess(problems, `add ${task.id}`, await tasks.add(task));
        expectSuccess(problems, `link ${task.id}`, await lineage.add(rootLink(task.id, project)));
      }
      const entry = ([task, project]: (typeof placed)[number]) => ({ projectId: project, waitingSince: task.changedAt, item: task.id });
      const [a1, b1, c1, c2] = placed.map(entry);
      const afterB = id('ProjectId', 'project-b') as ProjectId;
      expectSame(problems, 'after b', await queue.waiting(10, [], afterB), [c1, a1, b1, c2]);
      expectSame(problems, 'limited after b', await queue.waiting(2, [], afterB), [c1, a1]);
      const afterC = id('ProjectId', 'project-c') as ProjectId;
      expectSame(problems, 'after the last', await queue.waiting(2, [], afterC), [a1, b1]);
      return problems;
    },
  },
  {
    name: 'a read after a project offers the next project before its backlog, in the fair order',
    async check({ queue, tasks, lineage }: PlacementQueueConformanceTarget) {
      const problems: string[] = [];
      const placed = [
        [queuedTask('task-a2', at(1)), 'project-a'], [queuedTask('task-a3', at(2)), 'project-a'],
        [queuedTask('task-b1', at(5)), 'project-b'],
      ] as const;
      for (const [task, project] of placed) {
        expectSuccess(problems, `add ${task.id}`, await tasks.add(task));
        expectSuccess(problems, `link ${task.id}`, await lineage.add(rootLink(task.id, project)));
      }
      const [a2, a3, b1] = placed.map(([task]) => task.id);
      const afterA = id('ProjectId', 'project-a') as ProjectId;
      const read = await queue.waiting(10, [], afterA);
      expectSame(problems, 'after a', read.map((entry) => entry.item), [b1, a2, a3]);
      expectSame(problems, 'fair order', fairPlacementOrder(read, afterA), [b1, a2, a3]);
      return problems;
    },
  },
  {
    name: 'a read after a project between two waiting ones starts after it, in the fair order',
    async check({ queue, tasks, lineage }: PlacementQueueConformanceTarget) {
      const problems: string[] = [];
      const placed = [[queuedTask('task-a', at(0)), 'project-a'], [queuedTask('task-c', at(0)), 'project-c']] as const;
      for (const [task, project] of placed) {
        expectSuccess(problems, `add ${task.id}`, await tasks.add(task));
        expectSuccess(problems, `link ${task.id}`, await lineage.add(rootLink(task.id, project)));
      }
      const [a, c] = placed.map(([task]) => task.id);
      const afterB = id('ProjectId', 'project-b') as ProjectId;
      const read = await queue.waiting(10, [], afterB);
      expectSame(problems, 'after b', read.map((entry) => entry.item), [c, a]);
      expectSame(problems, 'fair order', fairPlacementOrder(read, afterB), [c, a]);
      return problems;
    },
  },
  {
    name: 'only the given tasks that still wait are answered, in id order',
    async check({ queue, tasks, lineage, assignments }: PlacementQueueConformanceTarget) {
      const problems: string[] = [];
      const waiting = queuedTask('task-b', at(0));
      const reserved = queuedTask('task-a', at(0), [activeAttemptOf('attempt-a')]);
      const other = queuedTask('task-c', at(0));
      for (const task of [waiting, reserved, other]) {
        expectSuccess(problems, `add ${task.id}`, await tasks.add(task));
        expectSuccess(problems, `link ${task.id}`, await lineage.add(rootLink(task.id, 'project-a')));
      }
      expectSuccess(problems, 'add held', await assignments.add(assignment('assignment-a', 'attempt-a', reserved.id, RUN, 100)));
      const unknown = id('TaskId', 'task-unknown') as TaskId;
      expectSame(problems, 'still waiting', await queue.stillWaiting([unknown, other.id, reserved.id, waiting.id]), [waiting.id, other.id]);
      expectSame(problems, 'none asked', await queue.stillWaiting([]), []);
      return problems;
    },
  },
]);

export const PLACEMENT_ROTATION_CONFORMANCE: readonly ConformanceCase<PlacementRotation>[] = Object.freeze([
  {
    name: 'an installation has no cursor before the first move',
    async check(rotation: PlacementRotation) {
      const problems: string[] = [];
      expectSame(problems, 'cursor', await rotation.read(), undefined);
      return problems;
    },
  },
  {
    name: 'each move replaces the cursor',
    async check(rotation: PlacementRotation) {
      const problems: string[] = [];
      expectSuccess(problems, 'first move', await rotation.advance(PROJECT));
      expectSame(problems, 'after the first move', await rotation.read(), PROJECT);
      const later = id('ProjectId', 'project-0') as ProjectId;
      expectSuccess(problems, 'later move', await rotation.advance(later));
      expectSame(problems, 'after the later move', await rotation.read(), later);
      return problems;
    },
  },
  {
    name: 'a conditional move stores only over the expected cursor',
    async check(rotation: PlacementRotation) {
      const problems: string[] = [];
      const other = id('ProjectId', 'project-2') as ProjectId;
      expectSuccess(problems, 'first move', await rotation.advanceFrom(undefined, PROJECT));
      expectSame(problems, 'after the first move', await rotation.read(), PROJECT);
      expectSuccess(problems, 'move from none', await rotation.advanceFrom(undefined, other));
      expectSuccess(problems, 'move from another', await rotation.advanceFrom(other, other));
      expectSame(problems, 'after the stale moves', await rotation.read(), PROJECT);
      expectSuccess(problems, 'move from the cursor', await rotation.advanceFrom(PROJECT, other));
      expectSame(problems, 'after the matching move', await rotation.read(), other);
      return problems;
    },
  },
]);

// An enrolled worker before its first contact, which a test stores.
export const REPORTING_WORKER_FIXTURE: WorkerPlacementRecord = worker('worker-reporting', { reachable: false });

export interface WorkerReportsConformanceTarget {
  readonly reports: WorkerReports;
  readonly workers: PlacementWorkers;
  // Stores a worker record with the adapter's own means.
  addWorker(worker: WorkerPlacementRecord): Promise<void>;
}

const second = (seconds: number): Instant => must(parseInstant(`2026-10-25T09:00:${String(seconds).padStart(2, '0')}.000Z`));
const sequence = (value: number) => must(parseSequence(value));
const UNKNOWN_WORKER = id('WorkerId', 'worker-x') as WorkerId;
const DECLARED = Object.freeze({ slots: 4, cpuMillicores: 8000, memoryMebibytes: 16384, controls: Object.freeze(['cpu-limit' as const]) });
const OLDER_DECLARED = Object.freeze({ slots: 1, cpuMillicores: 1000, memoryMebibytes: 1024, controls: Object.freeze([]) });

export const WORKER_REPORTS_CONFORMANCE: readonly ConformanceCase<WorkerReportsConformanceTarget>[] = Object.freeze([
  {
    name: 'contact makes the worker reachable and never moves its last contact backward',
    async check({ reports, workers }: WorkerReportsConformanceTarget) {
      const problems: string[] = [];
      const { workerId } = REPORTING_WORKER_FIXTURE;
      expectSuccess(problems, 'contact', await reports.recordContact(workerId, second(20)));
      expectSuccess(problems, 'older contact', await reports.recordContact(workerId, second(10)));
      expectSame(problems, 'reachable', await workers.get(workerId), { ...REPORTING_WORKER_FIXTURE, reachable: true, lastContactAt: second(20) });
      expectSame(problems, 'candidates', await workers.candidates(), [workerId]);
      expectCode(problems, 'unknown worker', await reports.recordContact(UNKNOWN_WORKER, AT), 'not-found');
      return problems;
    },
  },
  {
    name: 'contact is lost for reachable workers silent since before the cutoff, oldest first, until a new contact',
    async check({ reports, workers, addWorker }: WorkerReportsConformanceTarget) {
      const problems: string[] = [];
      const [older, old, recent, unreachable] = [
        worker('worker-older', { lastContactAt: second(5) }), worker('worker-old', { lastContactAt: second(10) }),
        worker('worker-recent', { lastContactAt: second(30) }), worker('worker-unreachable', { reachable: false, lastContactAt: second(1) }),
      ];
      for (const record of [older, old, recent, unreachable]) await addWorker(record);
      const reachable = async (record: WorkerPlacementRecord) => (await workers.get(record.workerId))?.reachable;
      expectSame(problems, 'oldest within the limit', await reports.markContactLost(second(20), 1), { ok: true, value: [older.workerId] });
      expectSame(problems, 'the rest', await reports.markContactLost(second(20), 10), { ok: true, value: [old.workerId] });
      expectSame(problems, 'none left', await reports.markContactLost(second(20), 10), { ok: true, value: [] });
      expectSame(problems, 'kept', [await reachable(recent), await reachable(unreachable)], [true, false]);
      expectSuccess(problems, 'contact again', await reports.recordContact(older.workerId, second(40)));
      expectSame(problems, 'reachable again', await workers.get(older.workerId), { ...older, lastContactAt: second(40) });
      return problems;
    },
  },
  {
    name: 'a journal loss makes the worker unreachable until its next contact',
    async check({ reports, workers }: WorkerReportsConformanceTarget) {
      const problems: string[] = [];
      const { workerId } = REPORTING_WORKER_FIXTURE;
      expectSuccess(problems, 'contact', await reports.recordContact(workerId, second(20)));
      expectSuccess(problems, 'loss', await reports.recordJournalLoss(workerId));
      expectSame(problems, 'unreachable', await workers.get(workerId), { ...REPORTING_WORKER_FIXTURE, reachable: false, lastContactAt: second(20) });
      expectSame(problems, 'no candidate', await workers.candidates(), []);
      expectSuccess(problems, 'contact again', await reports.recordContact(workerId, second(30)));
      expectSame(problems, 'candidate again', await workers.candidates(), [workerId]);
      expectCode(problems, 'unknown worker', await reports.recordJournalLoss(UNKNOWN_WORKER), 'not-found');
      return problems;
    },
  },
  {
    name: 'a declaration applies only above the last one',
    async check({ reports, workers }: WorkerReportsConformanceTarget) {
      const problems: string[] = [];
      const { workerId } = REPORTING_WORKER_FIXTURE;
      expectSuccess(problems, 'declare 5', await reports.declareCapacity(workerId, DECLARED, sequence(5)));
      expectSuccess(problems, 'declare 3', await reports.declareCapacity(workerId, OLDER_DECLARED, sequence(3)));
      expectSame(problems, 'kept the newer', await workers.get(workerId), { ...REPORTING_WORKER_FIXTURE, ...DECLARED });
      expectSuccess(problems, 'declare 6', await reports.declareCapacity(workerId, OLDER_DECLARED, sequence(6)));
      expectSame(problems, 'newer', await workers.get(workerId), { ...REPORTING_WORKER_FIXTURE, ...OLDER_DECLARED });
      return problems;
    },
  },
  {
    name: 'restarted fences apply the first report of a new journal',
    async check({ reports, workers }: WorkerReportsConformanceTarget) {
      const problems: string[] = [];
      const { workerId } = REPORTING_WORKER_FIXTURE;
      expectSuccess(problems, 'declare 5', await reports.declareCapacity(workerId, DECLARED, sequence(5)));
      expectSuccess(problems, 'enter 5', await reports.enterPressure(workerId, sequence(5), AT));
      expectSuccess(problems, 'refuse 5', await reports.markCapacityRefused(workerId, sequence(5), AT));
      expectSuccess(problems, 'protocol 5', await reports.setProtocolVersion(workerId, undefined, sequence(5)));
      expectSuccess(problems, 'restart', await reports.restartFences(workerId));
      expectSuccess(problems, 'declare 1', await reports.declareCapacity(workerId, OLDER_DECLARED, sequence(1)));
      expectSuccess(problems, 'leave 1', await reports.leavePressure(workerId, sequence(1)));
      expectSuccess(problems, 'clear 1', await reports.clearCapacityRefusal(workerId, sequence(1)));
      expectSuccess(problems, 'protocol 1', await reports.setProtocolVersion(workerId, 1, sequence(1)));
      expectSame(problems, 'applied', await workers.get(workerId), { ...REPORTING_WORKER_FIXTURE, ...OLDER_DECLARED, protocolVersion: 1 });
      expectCode(problems, 'unknown worker', await reports.restartFences(UNKNOWN_WORKER), 'not-found');
      return problems;
    },
  },
  {
    name: 'concurrent declarations keep the values of the higher sequence',
    async check({ reports, workers }: WorkerReportsConformanceTarget) {
      const problems: string[] = [];
      const { workerId } = REPORTING_WORKER_FIXTURE;
      const declared = await Promise.all([
        reports.declareCapacity(workerId, DECLARED, sequence(5)), reports.declareCapacity(workerId, OLDER_DECLARED, sequence(3)),
      ]);
      for (const [index, outcome] of declared.entries()) expectSuccess(problems, `declaration ${index}`, outcome);
      expectSame(problems, 'values of 5', await workers.get(workerId), { ...REPORTING_WORKER_FIXTURE, ...DECLARED });
      return problems;
    },
  },
  {
    name: 'a write for a worker without a record fails and advances no sequence',
    async check({ reports, workers, addWorker }: WorkerReportsConformanceTarget) {
      const problems: string[] = [];
      const late = worker('worker-late', { reachable: false });
      const writes = [
        ['declare', () => reports.declareCapacity(late.workerId, DECLARED, sequence(5))],
        ['enter', () => reports.enterPressure(late.workerId, sequence(5), AT)],
        ['refuse', () => reports.markCapacityRefused(late.workerId, sequence(5), AT)],
        ['protocol', () => reports.setProtocolVersion(late.workerId, undefined, sequence(5))],
      ] as const;
      for (const [label, write] of writes) expectCode(problems, `missing ${label}`, await write(), 'not-found');
      await addWorker(late);
      for (const [label, write] of writes) expectSuccess(problems, `stored ${label}`, await write());
      const { protocolVersion: _none, ...withoutProtocol } = late;
      expectSame(problems, 'applied', await workers.get(late.workerId), {
        ...withoutProtocol, ...DECLARED, admissionPressureSince: AT, capacityRefusedSince: AT,
      });
      return problems;
    },
  },
  {
    name: 'pressure keeps its earlier start, clears on leaving, and ignores older changes',
    async check({ reports, workers }: WorkerReportsConformanceTarget) {
      const problems: string[] = [];
      const { workerId } = REPORTING_WORKER_FIXTURE;
      const since = async () => (await workers.get(workerId))?.admissionPressureSince;
      expectSuccess(problems, 'enter 2', await reports.enterPressure(workerId, sequence(2), second(1)));
      expectSuccess(problems, 'enter 3', await reports.enterPressure(workerId, sequence(3), second(2)));
      expectSame(problems, 'earlier start', await since(), second(1));
      expectSuccess(problems, 'leave 1', await reports.leavePressure(workerId, sequence(1)));
      expectSame(problems, 'older leave ignored', await since(), second(1));
      expectSuccess(problems, 'leave 4', await reports.leavePressure(workerId, sequence(4)));
      expectSame(problems, 'left', await since(), undefined);
      expectSuccess(problems, 'enter 4 again', await reports.enterPressure(workerId, sequence(4), second(5)));
      expectSame(problems, 'repeated sequence ignored', await since(), undefined);
      expectCode(problems, 'unknown worker', await reports.leavePressure(UNKNOWN_WORKER, sequence(9)), 'not-found');
      return problems;
    },
  },
  {
    name: 'a capacity refusal is marked and cleared only above the last of either',
    async check({ reports, workers }: WorkerReportsConformanceTarget) {
      const problems: string[] = [];
      const { workerId } = REPORTING_WORKER_FIXTURE;
      const since = async () => (await workers.get(workerId))?.capacityRefusedSince;
      expectSuccess(problems, 'contact', await reports.recordContact(workerId, AT));
      expectSuccess(problems, 'refuse 3', await reports.markCapacityRefused(workerId, sequence(3), second(1)));
      expectSuccess(problems, 'refuse 4', await reports.markCapacityRefused(workerId, sequence(4), second(2)));
      expectSame(problems, 'earlier mark', await since(), second(1));
      expectSame(problems, 'refused worker', await workers.candidates(), []);
      expectSuccess(problems, 'older clear', await reports.clearCapacityRefusal(workerId, sequence(2)));
      expectSame(problems, 'still refused', await since(), second(1));
      expectSuccess(problems, 'clear 6', await reports.clearCapacityRefusal(workerId, sequence(6)));
      expectSame(problems, 'eligible again', await workers.candidates(), [workerId]);
      expectSuccess(problems, 'late refusal', await reports.markCapacityRefused(workerId, sequence(5), second(3)));
      expectSame(problems, 'late refusal ignored', await since(), undefined);
      expectCode(problems, 'unknown worker', await reports.clearCapacityRefusal(UNKNOWN_WORKER, sequence(9)), 'not-found');
      return problems;
    },
  },
  {
    name: 'the protocol version is set or removed only above the last one',
    async check({ reports, workers }: WorkerReportsConformanceTarget) {
      const problems: string[] = [];
      const { workerId } = REPORTING_WORKER_FIXTURE;
      const version = async () => (await workers.get(workerId))?.protocolVersion;
      expectSuccess(problems, 'contact', await reports.recordContact(workerId, AT));
      expectSuccess(problems, 'no common version', await reports.setProtocolVersion(workerId, undefined, sequence(3)));
      expectSame(problems, 'without protocol', await version(), undefined);
      expectSame(problems, 'ineligible', await workers.candidates(), []);
      expectSuccess(problems, 'older version', await reports.setProtocolVersion(workerId, 1, sequence(2)));
      expectSame(problems, 'older ignored', await version(), undefined);
      expectSuccess(problems, 'version 1', await reports.setProtocolVersion(workerId, 1, sequence(4)));
      expectSame(problems, 'with protocol', await version(), 1);
      expectCode(problems, 'unknown worker', await reports.setProtocolVersion(UNKNOWN_WORKER, 1, sequence(9)), 'not-found');
      return problems;
    },
  },
]);
