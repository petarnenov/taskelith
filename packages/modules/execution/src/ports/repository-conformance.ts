import { parseEventMetadata, parseIdentifier, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import {
  FIRST_OWNERSHIP_GENERATION,
  admitImplementationTask,
  beginWorkflowProgress,
  expectCode,
  expectRaceWinnerStored,
  expectRead,
  expectSame,
  expectSuccess,
  nextGeneration,
  openGate,
  parseArtifactRevision,
  parseGeneration,
  parseSemanticApproval,
  parseWorkItem,
  parseWorkflowDefinition,
  parseWorkflowRunBinding,
  recordGateEvidence,
  useAdmission,
  type ArtifactRevision,
  type ConformanceCase,
  type Gate,
  type RunContext,
  type TaskAdmission,
} from '@taskelith/sdlc';
import { authorizeLaunch } from '../domain/launch-authorization.js';
import { parseLaunchParameters } from '../domain/launch-grant.js';
import { parseRecoveryEpoch } from '../domain/identifiers.js';
import { claimOwnership, openAttempt, openTask, type Task } from '../domain/task.js';
import { launchRejection } from '../domain/launch-rejection.js';
import { revokeLaunch } from '../domain/task.js';
import {
  parseSequence,
  recordAppliedSequence,
  startProducerCursor,
  type JournalId,
  type ProducerCursor,
} from '../domain/observation-sequence.js';
import type { WorkerId } from '../domain/identifiers.js';
import type { Inbox } from './inbox.js';
import type { ProducerCursors } from './producer-cursors.js';
import type { LaunchRecords, RecordedLaunch } from './launch-records.js';
import type { TaskRepository } from './task-repository.js';

// Shared suites that the in-memory and the database adapters of the
// Execution ports both pass; each case expects a port with nothing stored.

function must<T, E extends { message?: string }>(result: Result<T, E>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${JSON.stringify(result.error)}`);
  return result.value;
}

function id<Kind extends string>(kind: Kind, text: string) {
  return must(parseIdentifier(kind, text));
}

const AT: Instant = must(parseInstant('2026-10-25T09:00:00.000Z'));
const LATER: Instant = must(parseInstant('2026-10-25T09:00:10.000Z'));

function revision(artifactId: string, fill: string): ArtifactRevision {
  return must(parseArtifactRevision({ artifactId, digest: `sha256:${fill.repeat(32)}`, nativeReference: `${artifactId}.md` }));
}

const SPEC = revision('spec', 'aa');

function run(): RunContext {
  const definition = must(parseWorkflowDefinition({
    id: 'conformance-workflow',
    version: '1',
    stages: [
      { id: 'specs', obligations: ['intake', 'specification'], origin: 'native', dependsOn: [] },
      { id: 'apply', obligations: ['implementation', 'review', 'verification', 'closure'], origin: 'native', dependsOn: ['specs'] },
    ],
  }));
  const binding = must(parseWorkflowRunBinding({
    pluginId: 'conformance-plugin', pluginVersion: '1.0.0', upstreamToolVersion: '2.0.0',
    workflowId: 'conformance-workflow', workflowVersion: '1', workflowDigest: `sha256:${'ee'.repeat(32)}`,
    configurationRevision: 'config-1', policyRevision: 'policy-1',
  }));
  return { binding, progress: beginWorkflowProgress(definition, AT) };
}

function passedGate(): Gate {
  const pending = must(openGate({ id: 'specs-approval', stageId: 'specs', requiredEvidence: 'semantic-approval', subject: [SPEC] }, AT));
  const approval = must(parseSemanticApproval({ approver: 'reviewer-1', verdict: 'approved', subject: [SPEC], recordedAt: AT, reference: 'review' }));
  return must(recordGateEvidence(pending, pending.generation, approval, AT));
}

function admission(admissionId: string, taskId: string): TaskAdmission {
  const workItem = must(parseWorkItem({ id: 'change-1', nativeReference: 'changes/conformance' }));
  const admitted = must(admitImplementationTask(
    { id: admissionId, taskId, stageId: 'apply', workItem }, { ...run(), gates: [passedGate()] }, AT,
  ));
  return must(useAdmission(admitted, admitted.generation, AT, FIRST_OWNERSHIP_GENERATION));
}

function openedTask(taskId: string): Task {
  return must(openTask(admission(`admission-${taskId}`, taskId), AT));
}

// A task whose attempt holds an authorized execution with its launch grant,
// which `launch` and `worker` name.
function authorizedTask(taskId: string, launch = '1', worker = 'worker-1'): Task {
  const used = admission(`admission-${taskId}`, taskId);
  const task = must(openTask(used, AT));
  const attemptId = id('AttemptId', 'attempt-1');
  const attempted = must(openAttempt(task, task.ownershipGeneration, { id: attemptId }, AT));
  const placed = must(claimOwnership(attempted, attempted.ownershipGeneration, attemptId, AT));
  const workerId = id('WorkerId', worker);
  const assignmentId = id('AssignmentId', `assignment-${launch}`);
  const recoveryEpoch = must(parseRecoveryEpoch(1));
  const authorization = must(authorizeLaunch(placed, {
    operationId: id('OperationId', `operation-${launch}`), workerId, recoveryEpoch, assignmentId, attemptId,
    ownershipGeneration: placed.ownershipGeneration, executionId: id('ExecutionId', 'execution-1'),
    admissionId: placed.admissionId, admissionGeneration: used.generation, reportsNotStarted: false,
  }, {
    installation: { recoveryEpoch, quarantined: false },
    workerAuthorized: true,
    assignment: { assignmentId, attemptId, workerId, ownershipGeneration: placed.ownershipGeneration, active: true },
    reservation: { state: 'held', attemptId, workerId },
    admission: used,
    definition: run().progress.definition,
    gates: [passedGate()],
    currentRevisions: [SPEC],
    policyRevision: run().binding.policyRevision,
  }, {
    launchAuthId: id('LaunchAuthId', `launch-${launch}`),
    issuedAt: LATER,
    parameters: must(parseLaunchParameters({ ttlMilliseconds: 30_000, skewMilliseconds: 5_000 })),
  }));
  return authorization.task;
}

function advanced(task: Task): Task {
  return { ...task, generation: nextGeneration(task.generation) };
}

export const TASK_REPOSITORY_CONFORMANCE: readonly ConformanceCase<TaskRepository>[] = Object.freeze([
  {
    name: 'a task with its attempts, executions, and grants reads back as stored',
    async check(repository: TaskRepository) {
      const problems: string[] = [];
      const stored = authorizedTask('task-1');
      expectSuccess(problems, 'add', await repository.add(stored));
      expectCode(problems, 'second add', await repository.add(stored), 'conflict');
      const read = await repository.get(stored.id);
      expectRead(problems, 'get', read, stored);
      if (!read.ok) return problems;
      const grant = read.value.attempts[0]?.executions[0]?.grants[0];
      const parameters = must(parseLaunchParameters({ ttlMilliseconds: 30_000, skewMilliseconds: 5_000 }));
      if (!(grant?.parameters instanceof parameters.constructor)) problems.push('get: grant parameters are not LaunchParameters');
      if (!Object.isFrozen(read.value)) problems.push('get: the task is not frozen');
      expectCode(problems, 'get unknown', await repository.get(openedTask('task-x').id), 'not-found');
      return problems;
    },
  },
  {
    name: 'replace compares the task generation and keeps the task on a conflict',
    async check(repository: TaskRepository) {
      const problems: string[] = [];
      const opened = openedTask('task-1');
      expectSuccess(problems, 'add', await repository.add(opened));
      const attempted = must(openAttempt(opened, opened.ownershipGeneration, { id: id('AttemptId', 'attempt-1') }, LATER));
      expectSuccess(problems, 'replace', await repository.replace(attempted, opened.generation));
      expectCode(problems, 'stale replace', await repository.replace(advanced(opened), opened.generation), 'conflict');
      expectCode(problems, 'unchanged generation', await repository.replace(attempted, attempted.generation), 'invalid');
      expectRead(problems, 'after rejected writes', await repository.get(opened.id), attempted);
      expectCode(problems, 'replace unknown', await repository.replace(advanced(openedTask('task-x')), opened.generation), 'not-found');
      const candidates = [AT, LATER].map((changedAt) => ({ ...advanced(attempted), changedAt }));
      await expectRaceWinnerStored(problems, 'concurrent replace', candidates,
        (candidate) => repository.replace(candidate, attempted.generation), () => repository.get(opened.id));
      return problems;
    },
  },
]);

export const INBOX_CONFORMANCE: readonly ConformanceCase<Inbox>[] = Object.freeze([
  {
    name: 'each consumer accepts a message once and sees a repeat as a duplicate',
    async check(inbox: Inbox) {
      const problems: string[] = [];
      const message = must(parseEventMetadata({
        eventId: 'event-1', eventType: 'execution.start.observed', schemaVersion: 1, occurredAt: AT, correlationId: 'correlation-1',
      })).eventId;
      const outcomes = [
        await inbox.accept('observations', message),
        await inbox.accept('observations', message),
        await inbox.accept('cancellations', message),
      ];
      expectSame(problems, 'outcomes', outcomes, [
        { ok: true, value: 'accepted' }, { ok: true, value: 'duplicate' }, { ok: true, value: 'accepted' },
      ]);
      const unusual = ['nul \u0000', 'unpaired \uD800', 'unpaired \uD801'];
      const accepted = await Promise.all(unusual.map((consumer) => inbox.accept(consumer, message)));
      expectSame(problems, 'distinct unusual consumers', accepted, unusual.map(() => ({ ok: true, value: 'accepted' })));
      return problems;
    },
  },
]);

export const PRODUCER_CURSORS_CONFORMANCE: readonly ConformanceCase<ProducerCursors>[] = Object.freeze([
  {
    name: 'a cursor starts at zero, reads back as saved, and is kept per journal',
    async check(cursors: ProducerCursors) {
      const problems: string[] = [];
      const workerId = must(parseIdentifier('WorkerId', 'worker-1')) as WorkerId;
      const journal = (text: string) => must(parseIdentifier('JournalId', text)) as JournalId;
      const first = journal('journal-1');
      expectSame(problems, 'unknown', await cursors.get(workerId, first), startProducerCursor(workerId, first));
      const applied = (cursor: ProducerCursor, ...sequences: number[]) => sequences.reduce(
        (next, sequence) => must(recordAppliedSequence(next, must(parseSequence(sequence)))), cursor);
      const gapped = applied(startProducerCursor(workerId, first), 1, 2, 4, 7);
      expectSuccess(problems, 'save', await cursors.save(gapped));
      expectSame(problems, 'saved', await cursors.get(workerId, first), gapped);
      const closed = applied(gapped, 3);
      expectSuccess(problems, 'save again', await cursors.save(closed));
      expectSame(problems, 'replaced', await cursors.get(workerId, first), closed);
      const other = journal('journal-2');
      expectSame(problems, 'other journal', await cursors.get(workerId, other), startProducerCursor(workerId, other));
      return problems;
    },
  },
]);

// The grant index is kept by the task repository, so the two are one target.
export interface LaunchRecordsConformanceTarget {
  readonly tasks: TaskRepository;
  readonly launches: LaunchRecords;
}

function recordedLaunch(task: Task): RecordedLaunch {
  const grant = task.attempts[0]!.executions[0]!.grants[0]!;
  return {
    launchAuthId: grant.launchAuthId, taskId: task.id, attemptId: grant.attemptId, assignmentId: grant.assignmentId,
    executionId: grant.executionId, workerId: grant.workerId,
  };
}

export const LAUNCH_RECORDS_CONFORMANCE: readonly ConformanceCase<LaunchRecordsConformanceTarget>[] = Object.freeze([
  {
    name: 'a stored grant is found by its operation for its worker only, and by its identity',
    async check({ tasks, launches }) {
      const problems: string[] = [];
      const stored = authorizedTask('task-1');
      must(await tasks.add(stored));
      const recorded = recordedLaunch(stored);
      expectRead(problems, 'by operation', await launches.byOperation(recorded.workerId, id('OperationId', 'operation-1')), recorded);
      expectRead(problems, 'other worker', await launches.byOperation(id('WorkerId', 'worker-2'), id('OperationId', 'operation-1')), undefined);
      expectRead(problems, 'by identity', await launches.byLaunchAuthId(recorded.launchAuthId), recorded);
      expectRead(problems, 'unknown', await launches.byLaunchAuthId(id('LaunchAuthId', 'launch-9')), undefined);
      return problems;
    },
  },
  {
    name: 'live grants are read by worker, assignment, artifact, gates, and all, until revoked',
    async check({ tasks, launches }) {
      const problems: string[] = [];
      const first = authorizedTask('task-1', '1', 'worker-1');
      const second = authorizedTask('task-2', '2', 'worker-2');
      must(await tasks.add(first));
      must(await tasks.add(second));
      const ids = (result: Result<readonly RecordedLaunch[]>) => (result.ok ? result.value.map((launch) => launch.launchAuthId) : result.error);
      expectSame(problems, 'worker', ids(await launches.liveGrants({ kind: 'worker', workerId: id('WorkerId', 'worker-2') })), ['launch-2']);
      expectSame(problems, 'assignment', ids(await launches.liveGrants({ kind: 'assignment', assignmentId: id('AssignmentId', 'assignment-1') })), ['launch-1']);
      expectSame(problems, 'artifact', ids(await launches.liveGrants({ kind: 'artifact', artifactId: SPEC.artifactId })), ['launch-1', 'launch-2']);
      expectSame(problems, 'gates', ids(await launches.liveGrants({ kind: 'gates', gateIds: [passedGate().id] })), ['launch-1', 'launch-2']);
      expectSame(problems, 'no gates', ids(await launches.liveGrants({ kind: 'gates', gateIds: [] })), []);
      const revoked = must(revokeLaunch(first, first.attempts[0]!.id, 'gate-not-passed', LATER));
      must(await tasks.replace(revoked, first.generation));
      expectSame(problems, 'all', ids(await launches.liveGrants({ kind: 'all' })), ['launch-2']);
      expectRead(problems, 'revoked still found', await launches.byLaunchAuthId(id('LaunchAuthId', 'launch-1')), recordedLaunch(first));
      return problems;
    },
  },
  {
    name: 'a rejection is recorded once for its worker and operation, with its request',
    async check({ launches }) {
      const problems: string[] = [];
      const request = {
        operationId: id('OperationId', 'operation-1'), workerId: id('WorkerId', 'worker-1'), recoveryEpoch: must(parseRecoveryEpoch(1)),
        assignmentId: id('AssignmentId', 'assignment-1'), attemptId: id('AttemptId', 'attempt-1'), ownershipGeneration: FIRST_OWNERSHIP_GENERATION,
        executionId: id('ExecutionId', 'execution-1'), admissionId: id('AdmissionId', 'admission-1'),
        admissionGeneration: must(parseGeneration(1)), reportsNotStarted: false,
      };
      const recorded = { request, rejection: launchRejection('gate-not-passed', 'gate g has not passed') };
      expectRead(problems, 'none', await launches.rejection(request.workerId, request.operationId), undefined);
      expectSuccess(problems, 'record', await launches.recordRejection(recorded));
      expectCode(problems, 'again', await launches.recordRejection(recorded), 'conflict');
      expectRead(problems, 'read', await launches.rejection(request.workerId, request.operationId), recorded);
      expectRead(problems, 'other worker', await launches.rejection(id('WorkerId', 'worker-2'), request.operationId), undefined);
      return problems;
    },
  },
]);
