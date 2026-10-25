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
import type { Inbox } from './inbox.js';
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

// A task whose attempt holds an authorized execution with its launch grant.
function authorizedTask(taskId: string): Task {
  const used = admission(`admission-${taskId}`, taskId);
  const task = must(openTask(used, AT));
  const attemptId = id('AttemptId', 'attempt-1');
  const attempted = must(openAttempt(task, task.ownershipGeneration, { id: attemptId }, AT));
  const placed = must(claimOwnership(attempted, attempted.ownershipGeneration, attemptId, AT));
  const workerId = id('WorkerId', 'worker-1');
  const assignmentId = id('AssignmentId', 'assignment-1');
  const recoveryEpoch = must(parseRecoveryEpoch(1));
  const authorization = must(authorizeLaunch(placed, {
    operationId: id('OperationId', 'operation-1'), workerId, recoveryEpoch, assignmentId, attemptId,
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
    launchAuthId: id('LaunchAuthId', 'launch-1'),
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
      return problems;
    },
  },
]);
