import { createHash } from 'node:crypto';
import type { HttpSchemas } from '@taskelith/contracts';
import { openTask, type Task } from '@taskelith/execution';
import { err, failure, ok, parseEventMetadata, parseIdentifier, type CorrelationId, type Instant, type Result } from '@taskelith/kernel';
import {
  FIRST_OWNERSHIP_GENERATION,
  admitImplementationTask,
  admitPlanningTask,
  parseArtifactRevision,
  parseWorkItem,
  useAdmission,
  type AdmissionId,
  type ArtifactRevision,
  type OutboxMessage,
  type ProjectId,
  type TaskAdmission,
  type TaskAdmissionRequest,
  type WorkflowRun,
} from '@taskelith/sdlc';
import type { ControlPlaneStore, ControlPlaneTransaction } from './control-plane-store.js';

export type SubmitTaskRequest = HttpSchemas['SubmitTaskRequest'];
export type TaskSubmission = HttpSchemas['TaskSubmission'];
export type AdmissionView = HttpSchemas['Admission'];
export type TaskResult = HttpSchemas['TaskResult'];

// The SDLC event subject that the publisher maps to the installation's
// `taskelith.<installationId>.sdlc.events` (coordinator decision Q2).
export const SDLC_EVENTS_SUBJECT = 'sdlc.events';

// Architecture section 9, step 1: binds the task to its run and stage, and
// creates the task and its outbox entry in one transaction.
export class TaskService {
  readonly #store: ControlPlaneStore;

  constructor(store: ControlPlaneStore) {
    this.#store = store;
  }

  // The admission identity derives from the run and the task, so a retry of
  // the same submission returns it and a different one is `conflict`.
  submitTask(runIdText: string, request: SubmitTaskRequest, correlationId: CorrelationId): Promise<Result<TaskSubmission>> {
    const runId = parseIdentifier('RunId', runIdText);
    if (!runId.ok) return Promise.resolve(runId);
    const artifacts = parseArtifacts(request.artifacts ?? []);
    if (!artifacts.ok) return Promise.resolve(artifacts);
    const workItem = request.workItem === undefined ? undefined : parseWorkItem(request.workItem);
    if (workItem !== undefined && !workItem.ok) return Promise.resolve(workItem);
    const admissionRequest: TaskAdmissionRequest = {
      id: admissionIdOf(runId.value, request.taskId), taskId: request.taskId, stageId: request.stageId,
      ...(workItem === undefined ? {} : { workItem: workItem.value }),
    };
    return this.#store.transaction(async (tx) => {
      const run = await tx.runs.get(runId.value);
      if (!run.ok) return run;
      const envelope = await tx.catalog.envelope(runId.value);
      if (!envelope.ok) return envelope;
      if (envelope.value === undefined) return err(failure('not-found', `run ${runId.value} does not exist`, { run: runId.value }));
      const repeated = await repeatedSubmission(tx, admissionRequest, request);
      if (repeated !== undefined) return repeated;
      const at = await tx.now();
      const admitted = await admit(tx, run.value, request.kind, admissionRequest, artifacts.value, at);
      if (!admitted.ok) return admitted;
      const used = useAdmission(admitted.value, admitted.value.generation, at, FIRST_OWNERSHIP_GENERATION);
      if (!used.ok) return used;
      const task = openTask(used.value, at);
      if (!task.ok) return task;
      const stored = await storeSubmission(tx, run.value, envelope.value.projectId, used.value, admitted.value, task.value);
      if (!stored.ok) return stored;
      const event = admissionUsedEvent(runId.value, used.value, correlationId, at);
      if (!event.ok) return event;
      const appended = await tx.outbox.append(event.value);
      return appended.ok ? ok({ taskId: task.value.id, admission: admissionView(used.value) }) : appended;
    });
  }

  readAdmission(runIdText: string, admissionIdText: string): Promise<Result<AdmissionView>> {
    return this.#store.transaction(async (tx) => {
      const admissionId = parseIdentifier('AdmissionId', admissionIdText);
      if (!admissionId.ok) return notFound('admission', admissionIdText);
      const runId = await tx.catalog.runOfAdmission(admissionId.value);
      if (!runId.ok) return runId;
      if (runId.value !== runIdText) return notFound('admission', admissionIdText);
      const admission = await tx.admissions.get(admissionId.value);
      return admission.ok ? ok(admissionView(admission.value)) : admission;
    });
  }

  // Pending until an attempt ends; then the outcome of the last ended attempt.
  // Evidence is item 19's, so the list stays empty until then.
  readTaskResult(runIdText: string, taskIdText: string): Promise<Result<TaskResult>> {
    return this.#store.transaction(async (tx) => {
      const taskId = parseIdentifier('TaskId', taskIdText);
      if (!taskId.ok) return notFound('task', taskIdText);
      const link = await tx.lineage.get(taskId.value);
      if (link === undefined || link.runId !== runIdText) return notFound('task', taskIdText);
      const task = await tx.tasks.get(taskId.value);
      if (!task.ok) return task;
      return ok(resultOf(link.runId, task.value));
    });
  }
}

// `a` and the SHA-256 of the run and task identities: 65 characters, within
// the 128 an identifier allows whatever their lengths.
export function admissionIdOf(runId: string, taskId: string): string {
  return `a${createHash('sha256').update(JSON.stringify([runId, taskId])).digest('hex')}`;
}

async function repeatedSubmission(
  tx: ControlPlaneTransaction,
  admissionRequest: TaskAdmissionRequest,
  request: SubmitTaskRequest,
): Promise<Result<TaskSubmission> | undefined> {
  const stored = await tx.admissions.get(admissionRequest.id as AdmissionId);
  if (!stored.ok) return stored.error.code === 'not-found' ? undefined : stored;
  // A planning task's artifacts are its request's; an implementation task's
  // come from its gates, so they are not compared.
  const sameArtifacts = request.kind !== 'planning' || sameRevisions(stored.value.artifacts, request.artifacts ?? []);
  const same = stored.value.kind === request.kind && stored.value.stageId === request.stageId
    && stored.value.workItemId === request.workItem?.id && sameArtifacts;
  if (!same) return err(failure('conflict', `task ${request.taskId} was submitted with another request`, { task: request.taskId }));
  return ok({ taskId: stored.value.taskId, admission: admissionView(stored.value) });
}

async function admit(
  tx: ControlPlaneTransaction,
  run: WorkflowRun,
  kind: SubmitTaskRequest['kind'],
  request: TaskAdmissionRequest,
  artifacts: readonly ArtifactRevision[],
  at: Instant,
): Promise<Result<TaskAdmission>> {
  if (kind === 'planning') return admitPlanningTask(request, run, artifacts, at);
  return admitImplementationTask(request, { ...run, gates: await tx.gates.listByRun(run.id) }, at);
}

// The admission is stored admitted, then used, with the task, its run, and
// the root lineage link that placement reads.
async function storeSubmission(
  tx: ControlPlaneTransaction,
  run: WorkflowRun,
  projectId: ProjectId,
  used: TaskAdmission,
  admitted: TaskAdmission,
  task: Task,
): Promise<Result<void>> {
  const steps = [
    () => tx.admissions.add(admitted),
    () => tx.admissions.replace(used, admitted.generation),
    () => tx.catalog.bindAdmission(used.id, run.id),
    () => tx.tasks.add(task),
    () => tx.lineage.add({ taskId: task.id, rootTaskId: task.id, depth: 0, projectId, runId: run.id }),
  ];
  for (const step of steps) {
    const done = await step();
    if (!done.ok) return done;
  }
  return ok(undefined);
}

// `sdlc.admission.used` of the SDLC wire contract; the admission is its
// producer, and its generation the event's sequence.
function admissionUsedEvent(runId: string, admission: TaskAdmission, correlationId: CorrelationId, at: Instant): Result<OutboxMessage> {
  const eventId = `${admission.id}.used`;
  const metadata = parseEventMetadata({ eventId, eventType: 'sdlc.admission.used', schemaVersion: 1, occurredAt: at, correlationId });
  if (!metadata.ok) return metadata;
  const wire = {
    metadata: {
      eventId, eventType: 'sdlc.admission.used', schemaVersion: 1, occurredAt: at, correlationId,
      producerId: admission.id, sequence: admission.generation,
    },
    payload: { runId, admission: admissionView(admission) },
  };
  return ok({ metadata: metadata.value, subject: SDLC_EVENTS_SUBJECT, payload: JSON.parse(JSON.stringify(wire)) });
}

function sameRevisions(stored: readonly ArtifactRevision[], requested: readonly HttpSchemas['ArtifactRevision'][]): boolean {
  const keys = (revisions: readonly { artifactId: string; digest: string; nativeReference: string }[]) =>
    JSON.stringify(revisions.map(({ artifactId, digest, nativeReference }) => [artifactId, digest, nativeReference]).sort());
  return keys(stored) === keys(requested);
}

function admissionView(admission: TaskAdmission): AdmissionView {
  return JSON.parse(JSON.stringify(admission)) as AdmissionView;
}

function resultOf(runId: string, task: Task): TaskResult {
  const ended = task.attempts.filter((attempt) => attempt.outcome !== undefined).at(-1);
  if (ended === undefined || ended.outcome === undefined) return { state: 'pending', runId, taskId: task.id };
  const outcome = JSON.parse(JSON.stringify(ended.outcome)) as Extract<TaskResult, { state: 'ended' }>['outcome'];
  return { state: 'ended', runId, taskId: task.id, attemptId: ended.id, ownershipGeneration: ended.outcome.ownershipGeneration, outcome, evidence: [] };
}

function parseArtifacts(inputs: readonly HttpSchemas['ArtifactRevision'][]): Result<readonly ArtifactRevision[]> {
  const parsed: ArtifactRevision[] = [];
  for (const input of inputs) {
    const revision = parseArtifactRevision(input);
    if (!revision.ok) return revision;
    parsed.push(revision.value);
  }
  return ok(parsed);
}

function notFound(kind: string, id: string): Result<never> {
  return err(failure('not-found', `no ${kind} ${id} in this run`, { [kind]: id }));
}
