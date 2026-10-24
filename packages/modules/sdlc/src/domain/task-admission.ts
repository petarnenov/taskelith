import { err, failure, ok, parseIdentifier, type Identifier, type Instant, type Result } from '@taskelith/kernel';
import type { ArtifactId, ArtifactRevision } from './artifact-revision.js';
import { fieldFailure } from './field-failure.js';
import type { Gate } from './gate.js';
import { FIRST_GENERATION, checkGeneration, nextGeneration, type Generation } from './generation.js';
import { hasStagePassed, type WorkflowProgress } from './stage-progress.js';
import type { WorkItem, WorkItemId } from './work-item.js';
import type { Stage, StageId, WorkflowId, WorkflowVersion } from './workflow-definition.js';
import type { PolicyRevision, WorkflowRunBinding } from './workflow-run-binding.js';

export type AdmissionId = Identifier<'AdmissionId'>;
export type TaskId = Identifier<'TaskId'>;

// A planning task works in an intake or specification stage without
// implementation; an implementation task works in an implementation stage.
export const TASK_KINDS = Object.freeze(['planning', 'implementation'] as const);

export type TaskKind = (typeof TASK_KINDS)[number];

export const ADMISSION_STATES = Object.freeze(['admitted', 'used', 'invalidated'] as const);

export type AdmissionState = (typeof ADMISSION_STATES)[number];

// The only allowed transitions. An admission is used once, at dispatch, and
// only an unused one is invalidated; started work is stopped and reconciled.
export const ADMISSION_TRANSITIONS: Readonly<Record<AdmissionState, readonly AdmissionState[]>> = Object.freeze({
  admitted: Object.freeze(['used', 'invalidated'] as const),
  used: Object.freeze([] as const),
  invalidated: Object.freeze([] as const),
});

// Lets one task of a run be dispatched, bound to stage, work item, inputs, and
// policy revision; the execution module (G2) adds the ownership generation.
export interface TaskAdmission {
  readonly id: AdmissionId;
  readonly taskId: TaskId;
  readonly kind: TaskKind;
  readonly workflowId: WorkflowId;
  readonly workflowVersion: WorkflowVersion;
  readonly stageId: StageId;
  readonly workItemId?: WorkItemId;
  readonly artifacts: readonly ArtifactRevision[];
  readonly policyRevision: PolicyRevision;
  readonly createdRevisions: readonly ArtifactRevision[];
  readonly state: AdmissionState;
  readonly generation: Generation;
  readonly changedAt: Instant;
  readonly invalidatedBy?: ArtifactRevision;
}

export interface TaskAdmissionRequest {
  readonly id: string;
  readonly taskId: string;
  readonly stageId: string;
  readonly workItem?: WorkItem;
}

// The workflow run a task is admitted to.
export interface RunContext {
  readonly binding: WorkflowRunBinding;
  readonly progress: WorkflowProgress;
}

// The run with the current gates of its stages, which implementation admission
// reads.
export interface GatedRunContext extends RunContext {
  readonly gates: readonly Gate[];
}

// Admits an implementation task bound to a work item once every stage it
// depends on passed; it works from exactly the revisions those gates judged.
export function admitImplementationTask(
  request: TaskAdmissionRequest,
  context: GatedRunContext,
  at: Instant,
): Result<TaskAdmission> {
  const target = parseTarget(request, context, 'implementation');
  if (!target.ok) return target;
  const { id, stage } = target.value;
  if (request.workItem === undefined) return admissionFailure(id, 'needs a work item for an implementation task');
  if (stage.dependsOn.length === 0) {
    return admissionFailure(id, `needs stage ${stage.id} to have a prerequisite stage whose gates passed`, { stage: stage.id });
  }
  const unmet = stage.dependsOn.filter((dependency) => !hasStagePassed(dependency, context.gates));
  if (unmet.length > 0) {
    return admissionFailure(id, `needs the stages ${unmet.join(', ')} to pass first`, { stage: stage.id, dependencies: unmet.join(',') });
  }
  const prerequisiteGates = context.gates.filter((gate) => stage.dependsOn.includes(gate.stageId));
  const artifacts = judgedRevisions(prerequisiteGates);
  if (!artifacts.ok) {
    return admissionFailure(id, `needs prerequisite gates that judged one revision of artifact ${artifacts.error}`, { artifact: artifacts.error });
  }
  return ok(newAdmission(target.value, request.workItem, artifacts.value, context.binding, at));
}

// Admits a planning task without a specification: it works from existing
// revisions, possibly none, and records the revisions it creates.
export function admitPlanningTask(
  request: TaskAdmissionRequest,
  context: RunContext,
  artifacts: readonly ArtifactRevision[],
  at: Instant,
): Result<TaskAdmission> {
  const target = parseTarget(request, context, 'planning');
  if (!target.ok) return target;
  const duplicate = findDuplicateArtifact(artifacts);
  if (duplicate !== undefined) return fieldFailure('artifacts', failure('invalid', `artifact ${duplicate} is listed twice`));
  return ok(newAdmission(target.value, request.workItem, artifacts, context.binding, at));
}

export function useAdmission(admission: TaskAdmission, expectedGeneration: Generation, at: Instant): Result<TaskAdmission> {
  const allowed = checkTransition(admission, expectedGeneration, 'used');
  if (!allowed.ok) return allowed;
  return ok(changedAdmission(admission, { state: 'used' }, at));
}

// A revision outdates an admission when it is a different revision of an
// artifact the admission is bound to.
export function isAdmissionOutdatedBy(admission: TaskAdmission, revision: ArtifactRevision): boolean {
  return admission.artifacts.some((bound) => bound.artifactId === revision.artifactId && bound.digest !== revision.digest);
}

export function invalidateAdmission(
  admission: TaskAdmission,
  expectedGeneration: Generation,
  revision: ArtifactRevision,
  at: Instant,
): Result<TaskAdmission> {
  const allowed = checkTransition(admission, expectedGeneration, 'invalidated');
  if (!allowed.ok) return allowed;
  if (!isAdmissionOutdatedBy(admission, revision)) {
    return admissionFailure(admission.id, `is not outdated by the revision of artifact ${revision.artifactId}`, {
      artifact: revision.artifactId,
    });
  }
  return ok(changedAdmission(admission, { state: 'invalidated', invalidatedBy: revision }, at));
}

// Records a revision that a dispatched planning task created, such as a
// specification that did not exist when the task was admitted.
export function recordCreatedRevision(
  admission: TaskAdmission,
  expectedGeneration: Generation,
  revision: ArtifactRevision,
  at: Instant,
): Result<TaskAdmission> {
  const generation = checkGeneration(`admission ${admission.id}`, admission.generation, expectedGeneration);
  if (!generation.ok) return generation;
  if (admission.kind !== 'planning') return admissionFailure(admission.id, 'is not for a planning task and records no created revisions');
  if (admission.state !== 'used') {
    return admissionFailure(admission.id, `records created revisions only once its task is dispatched, not while ${admission.state}`, {
      state: admission.state,
    });
  }
  const createdRevisions = Object.freeze([...admission.createdRevisions, revision]);
  return ok(changedAdmission(admission, { state: admission.state, createdRevisions }, at));
}

interface AdmissionTarget {
  readonly id: AdmissionId;
  readonly taskId: TaskId;
  readonly kind: TaskKind;
  readonly stage: Stage;
}

function parseTarget(
  request: TaskAdmissionRequest,
  context: RunContext,
  kind: TaskKind,
): Result<AdmissionTarget> {
  const id = parseIdentifier('AdmissionId', request.id);
  if (!id.ok) return fieldFailure('id', id.error);
  const taskId = parseIdentifier('TaskId', request.taskId);
  if (!taskId.ok) return fieldFailure('taskId', taskId.error);
  const stageId = parseIdentifier('StageId', request.stageId);
  if (!stageId.ok) return fieldFailure('stageId', stageId.error);
  const { binding, progress } = context;
  const { definition } = progress;
  if (binding.workflowId !== definition.id || binding.workflowVersion !== definition.version) {
    return admissionFailure(id.value, `names workflow ${definition.id} ${definition.version}, but the run is bound to ${binding.workflowId} ${binding.workflowVersion}`);
  }
  const stage = definition.stages.find((candidate) => candidate.id === stageId.value);
  if (stage === undefined) {
    return err(failure('not-found', `workflow ${definition.id} has no stage ${stageId.value}`, { admission: id.value, stage: stageId.value }));
  }
  if (taskKindOf(stage) !== kind) {
    return admissionFailure(id.value, `cannot admit a ${kind} task to stage ${stage.id}`, { stage: stage.id, kind });
  }
  return ok({ id: id.value, taskId: taskId.value, kind, stage });
}

function taskKindOf(stage: Stage): TaskKind | undefined {
  if (stage.obligations.includes('implementation')) return 'implementation';
  if (stage.obligations.includes('intake') || stage.obligations.includes('specification')) return 'planning';
  return undefined;
}

// The revisions the gates judged, at most one per artifact; gates that judged
// two revisions of one artifact are inconsistent, and the error names it.
function judgedRevisions(gates: readonly Gate[]): Result<readonly ArtifactRevision[], ArtifactId> {
  const byArtifact = new Map<ArtifactId, ArtifactRevision>();
  for (const revision of gates.flatMap((gate) => gate.subject)) {
    const known = byArtifact.get(revision.artifactId);
    if (known !== undefined && known.digest !== revision.digest) return err(revision.artifactId);
    byArtifact.set(revision.artifactId, known ?? revision);
  }
  return ok([...byArtifact.values()]);
}

function findDuplicateArtifact(revisions: readonly ArtifactRevision[]): ArtifactId | undefined {
  const seen = new Set<ArtifactId>();
  for (const revision of revisions) {
    if (seen.has(revision.artifactId)) return revision.artifactId;
    seen.add(revision.artifactId);
  }
  return undefined;
}

function newAdmission(
  target: AdmissionTarget,
  workItem: WorkItem | undefined,
  artifacts: readonly ArtifactRevision[],
  binding: WorkflowRunBinding,
  at: Instant,
): TaskAdmission {
  return Object.freeze({
    id: target.id,
    taskId: target.taskId,
    kind: target.kind,
    workflowId: binding.workflowId,
    workflowVersion: binding.workflowVersion,
    stageId: target.stage.id,
    ...(workItem === undefined ? {} : { workItemId: workItem.id }),
    artifacts: Object.freeze([...artifacts]),
    policyRevision: binding.policyRevision,
    createdRevisions: Object.freeze([]),
    state: 'admitted',
    generation: FIRST_GENERATION,
    changedAt: at,
  });
}

function checkTransition(admission: TaskAdmission, expectedGeneration: Generation, to: AdmissionState): Result<AdmissionState> {
  const generation = checkGeneration(`admission ${admission.id}`, admission.generation, expectedGeneration);
  if (!generation.ok) return generation;
  if (!ADMISSION_TRANSITIONS[admission.state].includes(to)) {
    return admissionFailure(admission.id, `cannot change from ${admission.state} to ${to}`, { from: admission.state, to });
  }
  return ok(to);
}

function admissionFailure(id: AdmissionId, message: string, details: Readonly<Record<string, string>> = {}): Result<never> {
  return err(failure('precondition-failed', `admission ${id} ${message}`, { admission: id, ...details }));
}

type AdmissionChange = Partial<Pick<TaskAdmission, 'createdRevisions' | 'invalidatedBy'>> & Pick<TaskAdmission, 'state'>;

function changedAdmission(admission: TaskAdmission, change: AdmissionChange, at: Instant): TaskAdmission {
  return Object.freeze({ ...admission, ...change, generation: nextGeneration(admission.generation), changedAt: at });
}
