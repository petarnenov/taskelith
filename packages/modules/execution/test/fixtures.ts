import { parseIdentifier, parseInstant, type Instant } from '@taskelith/kernel';
import {
  FIRST_OWNERSHIP_GENERATION,
  admitImplementationTask,
  admitPlanningTask,
  beginWorkflowProgress,
  openGate,
  parseArtifactRevision,
  parseEvidenceReference,
  parseOwnershipGeneration,
  parseSemanticApproval,
  parseWorkItem,
  parseWorkflowDefinition,
  parseWorkflowRunBinding,
  recordGateEvidence,
  useAdmission,
  type ArtifactRevision,
  type EvidenceReference,
  type Gate,
  type OwnershipGeneration,
  type RunContext,
  type TaskAdmission,
} from '@taskelith/sdlc';
import {
  authorizeLaunch,
  claimOwnership,
  openAttempt,
  openTask,
  parseLaunchParameters,
  parseRecoveryEpoch,
  type AssignmentId,
  type AttemptId,
  type ExecutionId,
  type GrantIssue,
  type LaunchAuthId,
  type LaunchAuthorization,
  type LaunchContext,
  type LaunchRequest,
  type OperationId,
  type RecoveryEpoch,
  type Task,
  type WorkerId,
} from '@taskelith/execution';
import { value } from '@taskelith/testing';

export function instant(text: string): Instant {
  return value(parseInstant(text));
}

export const T0 = instant('2026-10-25T09:00:00.000Z');
export const T1 = instant('2026-10-25T10:00:00.000Z');
export const T2 = instant('2026-10-25T10:00:10.000Z');
export const T3 = instant('2026-10-25T10:00:30.000Z');
export const T4 = instant('2026-10-25T11:00:00.000Z');

export const attemptId = (text: string): AttemptId => value(parseIdentifier('AttemptId', text));
export const assignmentId = (text: string): AssignmentId => value(parseIdentifier('AssignmentId', text));
export const executionId = (text: string): ExecutionId => value(parseIdentifier('ExecutionId', text));
export const workerId = (text: string): WorkerId => value(parseIdentifier('WorkerId', text));
export const launchAuthId = (text: string): LaunchAuthId => value(parseIdentifier('LaunchAuthId', text));
export const operationId = (text: string): OperationId => value(parseIdentifier('OperationId', text));
export const ownership = (generation: number): OwnershipGeneration => value(parseOwnershipGeneration(generation));
export const epoch = (number: number): RecoveryEpoch => value(parseRecoveryEpoch(number));
export const evidence = (text: string): EvidenceReference => value(parseEvidenceReference(text));

export const ATTEMPT = attemptId('attempt-1');
export const ASSIGNMENT = assignmentId('assignment-1');
export const EXECUTION = executionId('execution-1');
export const WORKER = workerId('worker-1');
export const OTHER_WORKER = workerId('worker-2');
export const EPOCH = epoch(1);
export const PARAMETERS = value(parseLaunchParameters({ ttlMilliseconds: 30_000, skewMilliseconds: 5_000 }));

export function revision(artifactId: string, fill: string): ArtifactRevision {
  return value(parseArtifactRevision({ artifactId, digest: `sha256:${fill.repeat(32)}`, nativeReference: `${artifactId}.md` }));
}

export const SPEC = revision('spec', 'aa');
export const DESIGN = revision('design', 'bb');
export const NEW_SPEC = revision('spec', 'cc');

export function runContext(): RunContext {
  const definition = value(parseWorkflowDefinition({
    id: 'example-workflow',
    version: '1',
    stages: [
      { id: 'proposal', obligations: ['intake'], origin: 'native', dependsOn: [] },
      { id: 'specs', obligations: ['specification'], origin: 'native', dependsOn: ['proposal'] },
      { id: 'design', obligations: ['specification'], origin: 'native', dependsOn: ['proposal'] },
      { id: 'apply', obligations: ['implementation'], origin: 'native', dependsOn: ['specs', 'design'] },
      { id: 'check', obligations: ['review', 'verification', 'closure'], origin: 'platform-managed', dependsOn: ['apply'] },
    ],
  }));
  const binding = value(parseWorkflowRunBinding({
    pluginId: 'example-plugin',
    pluginVersion: '1.0.0',
    upstreamToolVersion: '2.0.0',
    workflowId: 'example-workflow',
    workflowVersion: '1',
    workflowDigest: `sha256:${'ee'.repeat(32)}`,
    configurationRevision: 'config-1',
    policyRevision: 'policy-7',
  }));
  return { binding, progress: beginWorkflowProgress(definition, T0) };
}

export function pendingGate(stage: string, subject: readonly ArtifactRevision[]): Gate {
  return value(openGate({ id: `${stage}-approval`, stageId: stage, requiredEvidence: 'semantic-approval', subject }, T0));
}

export function passedGate(stage: string, subject: readonly ArtifactRevision[]): Gate {
  const pending = pendingGate(stage, subject);
  const approval = value(parseSemanticApproval({ approver: 'reviewer-1', verdict: 'approved', subject, recordedAt: T0, reference: 'review' }));
  return value(recordGateEvidence(pending, pending.generation, approval, T0));
}

export const GATES: readonly Gate[] = [passedGate('specs', [SPEC]), passedGate('design', [SPEC, DESIGN])];

export function admittedImplementation(id = 'admission-1', taskId = 'task-1'): TaskAdmission {
  const workItem = value(parseWorkItem({ id: 'change-1', nativeReference: 'changes/add-feature' }));
  return value(admitImplementationTask({ id, taskId, stageId: 'apply', workItem }, { ...runContext(), gates: GATES }, T0));
}

export function implementationAdmission(id = 'admission-1', at: OwnershipGeneration = FIRST_OWNERSHIP_GENERATION): TaskAdmission {
  const admitted = admittedImplementation(id);
  return value(useAdmission(admitted, admitted.generation, T0, at));
}

export function planningAdmission(): TaskAdmission {
  const admitted = value(admitPlanningTask({ id: 'admission-p', taskId: 'task-1', stageId: 'specs' }, runContext(), [SPEC], T0));
  return value(useAdmission(admitted, admitted.generation, T0, FIRST_OWNERSHIP_GENERATION));
}

// A task with one attempt placed on assignment-1 at ownership generation 3.
export function placedTask(admission: TaskAdmission = implementationAdmission()): Task {
  const task = value(openTask(admission, T0));
  const attempted = value(openAttempt(task, task.ownershipGeneration, { id: ATTEMPT }, T0));
  return value(claimOwnership(attempted, attempted.ownershipGeneration, ATTEMPT, T0));
}

export function launchRequest(task: Task, overrides: Partial<LaunchRequest> = {}): LaunchRequest {
  return {
    operationId: operationId('operation-1'),
    workerId: WORKER,
    recoveryEpoch: EPOCH,
    assignmentId: ASSIGNMENT,
    attemptId: ATTEMPT,
    ownershipGeneration: task.ownershipGeneration,
    executionId: EXECUTION,
    admissionId: task.admissionId,
    admissionGeneration: implementationAdmission().generation,
    reportsNotStarted: false,
    ...overrides,
  };
}

export function launchContext(task: Task, overrides: Partial<LaunchContext> = {}): LaunchContext {
  const run = runContext();
  return {
    installation: { recoveryEpoch: EPOCH, quarantined: false },
    workerAuthorized: true,
    assignment: { assignmentId: ASSIGNMENT, attemptId: ATTEMPT, workerId: WORKER, ownershipGeneration: task.ownershipGeneration, active: true },
    reservation: { state: 'held', attemptId: ATTEMPT, workerId: WORKER },
    admission: implementationAdmission(),
    definition: run.progress.definition,
    gates: GATES,
    currentRevisions: [SPEC, DESIGN],
    policyRevision: run.binding.policyRevision,
    ...overrides,
  };
}

export function grantIssue(id = 'launch-1', issuedAt = T1): GrantIssue {
  return { launchAuthId: launchAuthId(id), issuedAt, parameters: PARAMETERS };
}

export function authorized(task: Task = placedTask(), overrides: Partial<LaunchRequest> = {}, issue = grantIssue()): LaunchAuthorization {
  return value(authorizeLaunch(task, launchRequest(task, overrides), launchContext(task), issue));
}
