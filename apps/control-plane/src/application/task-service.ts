import type { HttpSchemas } from '@taskelith/contracts';
import { activeAttempt, type EvidenceRecord, type Task } from '@taskelith/execution';
import { err, failure, ok, parseIdentifier, type CorrelationId, type Result } from '@taskelith/kernel';
import type { AdmissionId, ArtifactRevision } from '@taskelith/sdlc';
import type { ControlPlaneStore, ControlPlaneTransaction } from './control-plane-store.js';
import { viewOf } from './evidence-view.js';
import {
  admissionView,
  admitTask,
  appendAdmissionUsed,
  openAdmittedTask,
  parseTaskRequest,
  type AdmissionView,
  type ParsedTaskRequest,
} from './task-creation.js';

export type SubmitTaskRequest = HttpSchemas['SubmitTaskRequest'];
export type TaskSubmission = HttpSchemas['TaskSubmission'];
export type TaskResult = HttpSchemas['TaskResult'];

// Architecture section 9, step 1: binds the task to its run and stage, and
// creates the task and its outbox entry in one transaction.
export class TaskService {
  readonly #store: ControlPlaneStore;

  constructor(store: ControlPlaneStore) {
    this.#store = store;
  }

  // A retry of the same submission returns its admission; a different one
  // under the same task is `conflict`.
  submitTask(runIdText: string, request: SubmitTaskRequest, correlationId: CorrelationId): Promise<Result<TaskSubmission>> {
    const parsed = parseTaskRequest(runIdText, request);
    if (!parsed.ok) return Promise.resolve(parsed);
    const { runId } = parsed.value;
    return this.#store.transaction(async (tx) => {
      const run = await tx.runs.get(runId);
      if (!run.ok) return run;
      const envelope = await tx.catalog.envelope(runId);
      if (!envelope.ok) return envelope;
      if (envelope.value === undefined) return err(failure('not-found', `run ${runId} does not exist`, { run: runId }));
      const repeated = await repeatedSubmission(tx, parsed.value, request);
      if (repeated !== undefined) return repeated;
      const at = await tx.now();
      const admitted = await admitTask(tx, run.value, parsed.value, at);
      if (!admitted.ok) return admitted;
      const created = await openAdmittedTask(tx, run.value, admitted.value, at);
      if (!created.ok) return created;
      const { task, admission } = created.value;
      // The root lineage link that placement reads.
      const linked = await tx.lineage.add({ taskId: task.id, rootTaskId: task.id, depth: 0, projectId: envelope.value.projectId, runId });
      if (!linked.ok) return linked;
      const appended = await appendAdmissionUsed(tx, runId, admission, correlationId, at);
      return appended.ok ? ok({ taskId: task.id, admission: admissionView(admission) }) : appended;
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

  // Pending while an attempt is active, such as a retry; then the outcome of
  // the last ended attempt with every evidence record of the task.
  readTaskResult(runIdText: string, taskIdText: string): Promise<Result<TaskResult>> {
    return this.#store.transaction(async (tx) => {
      const taskId = parseIdentifier('TaskId', taskIdText);
      if (!taskId.ok) return notFound('task', taskIdText);
      const link = await tx.lineage.get(taskId.value);
      if (link === undefined || link.runId !== runIdText) return notFound('task', taskIdText);
      const task = await tx.tasks.get(taskId.value);
      if (!task.ok) return task;
      const evidence = await tx.evidence.listByTask(taskId.value);
      if (!evidence.ok) return evidence;
      return ok(resultOf(link.runId, task.value, evidence.value));
    });
  }
}

async function repeatedSubmission(
  tx: ControlPlaneTransaction,
  parsed: ParsedTaskRequest,
  request: SubmitTaskRequest,
): Promise<Result<TaskSubmission> | undefined> {
  const stored = await tx.admissions.get(parsed.admission.id as AdmissionId);
  if (!stored.ok) return stored.error.code === 'not-found' ? undefined : stored;
  // A planning task's artifacts are its request's; an implementation task's
  // come from its gates, so they are not compared.
  const sameArtifacts = request.kind !== 'planning' || sameRevisions(stored.value.artifacts, request.artifacts ?? []);
  const same = stored.value.kind === request.kind && stored.value.stageId === request.stageId
    && stored.value.workItemId === request.workItem?.id && sameArtifacts;
  if (!same) return err(failure('conflict', `task ${request.taskId} was submitted with another request`, { task: request.taskId }));
  return ok({ taskId: stored.value.taskId, admission: admissionView(stored.value) });
}

function sameRevisions(stored: readonly ArtifactRevision[], requested: readonly HttpSchemas['ArtifactRevision'][]): boolean {
  const keys = (revisions: readonly { artifactId: string; digest: string; nativeReference: string }[]) =>
    JSON.stringify(revisions.map(({ artifactId, digest, nativeReference }) => [artifactId, digest, nativeReference]).sort());
  return keys(stored) === keys(requested);
}

function resultOf(runId: string, task: Task, evidence: readonly EvidenceRecord[]): TaskResult {
  const ended = task.attempts.filter((attempt) => attempt.outcome !== undefined).at(-1);
  if (activeAttempt(task) !== undefined || ended?.outcome === undefined) return { state: 'pending', runId, taskId: task.id };
  const outcome = JSON.parse(JSON.stringify(ended.outcome)) as Extract<TaskResult, { state: 'ended' }>['outcome'];
  return { state: 'ended', runId, taskId: task.id, attemptId: ended.id, ownershipGeneration: ended.outcome.ownershipGeneration, outcome, evidence: evidence.map(viewOf) };
}

function notFound(kind: string, id: string): Result<never> {
  return err(failure('not-found', `no ${kind} ${id} in this run`, { [kind]: id }));
}
