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
  type ArtifactRevision,
  type OutboxMessage,
  type TaskAdmission,
  type TaskAdmissionRequest,
  type WorkflowRun,
  type WorkflowRunId,
} from '@taskelith/sdlc';
import type { ControlPlaneTransaction } from './control-plane-store.js';

// The steps that create an admitted task, shared by a submitted task and a
// delegated child (architecture section 9, step 1).

export type AdmissionView = HttpSchemas['Admission'];

// A task as SDLC admission takes it, from a submission or a delegation.
export type TaskRequest = HttpSchemas['SubmitTaskRequest'];

// The SDLC event subject that the publisher maps to the installation's
// `taskelith.<installationId>.sdlc.events` (coordinator decision Q2).
export const SDLC_EVENTS_SUBJECT = 'sdlc.events';

// The broker's 1 MiB payload limit, less room for the message headers.
export const MAX_EVENT_BYTES = 1024 ** 2 - 4096;

export interface ParsedTaskRequest {
  readonly runId: WorkflowRunId;
  readonly kind: TaskRequest['kind'];
  readonly admission: TaskAdmissionRequest;
  readonly artifacts: readonly ArtifactRevision[];
}

export interface CreatedTask {
  readonly task: Task;
  readonly admission: TaskAdmission;
}

// `a` and the SHA-256 of the run and task identities: 65 characters, within
// the 128 an identifier allows whatever their lengths.
export function admissionIdOf(runId: string, taskId: string): string {
  return `a${createHash('sha256').update(JSON.stringify([runId, taskId])).digest('hex')}`;
}

// The admission identity derives from the run and the task, so a retry of
// the same request finds it and a different one is `conflict`.
export function parseTaskRequest(runIdText: string, request: TaskRequest): Result<ParsedTaskRequest> {
  const runId = parseIdentifier('RunId', runIdText);
  if (!runId.ok) return runId;
  const artifacts = parseArtifacts(request.artifacts ?? []);
  if (!artifacts.ok) return artifacts;
  const workItem = request.workItem === undefined ? undefined : parseWorkItem(request.workItem);
  if (workItem !== undefined && !workItem.ok) return workItem;
  const admission: TaskAdmissionRequest = {
    id: admissionIdOf(runId.value, request.taskId), taskId: request.taskId, stageId: request.stageId,
    ...(workItem === undefined ? {} : { workItem: workItem.value }),
  };
  return ok({ runId: runId.value, kind: request.kind, admission, artifacts: artifacts.value });
}

export async function admitTask(tx: ControlPlaneTransaction, run: WorkflowRun, request: ParsedTaskRequest, at: Instant): Promise<Result<TaskAdmission>> {
  if (request.kind === 'planning') return admitPlanningTask(request.admission, run, request.artifacts, at);
  return admitImplementationTask(request.admission, { ...run, gates: await tx.gates.listByRun(run.id) }, at);
}

// The admission is stored admitted, then used, bound to its run, with the
// task it opens; the caller writes the task's lineage link.
export async function openAdmittedTask(
  tx: ControlPlaneTransaction,
  run: WorkflowRun,
  admitted: TaskAdmission,
  at: Instant,
): Promise<Result<CreatedTask>> {
  const used = useAdmission(admitted, admitted.generation, at, FIRST_OWNERSHIP_GENERATION);
  if (!used.ok) return used;
  const task = openTask(used.value, at);
  if (!task.ok) return task;
  const steps = [
    () => tx.admissions.add(admitted),
    () => tx.admissions.replace(used.value, admitted.generation),
    () => tx.catalog.bindAdmission(used.value.id, run.id),
    // Until a G3 writer exists, the first bound revision is the current one.
    () => tx.revisions.seed(run.id, used.value.artifacts),
    () => tx.tasks.add(task.value),
  ];
  for (const step of steps) {
    const done = await step();
    if (!done.ok) return done;
  }
  return ok({ task: task.value, admission: used.value });
}

// An event the broker refuses would stay in the outbox and hold back every
// later one on its subject, so the creation fails instead.
export async function appendAdmissionUsed(
  tx: ControlPlaneTransaction,
  runId: WorkflowRunId,
  admission: TaskAdmission,
  correlationId: CorrelationId,
  at: Instant,
): Promise<Result<void>> {
  const event = admissionUsedEvent(runId, admission, correlationId, at);
  if (!event.ok) return event;
  if (Buffer.byteLength(JSON.stringify(event.value.payload)) > MAX_EVENT_BYTES) {
    return err(failure('invalid', `the task's admission event would exceed ${MAX_EVENT_BYTES} bytes`, { task: admission.taskId }));
  }
  return tx.outbox.append(event.value);
}

export function admissionView(admission: TaskAdmission): AdmissionView {
  return JSON.parse(JSON.stringify(admission)) as AdmissionView;
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

function parseArtifacts(inputs: readonly HttpSchemas['ArtifactRevision'][]): Result<readonly ArtifactRevision[]> {
  const parsed: ArtifactRevision[] = [];
  for (const input of inputs) {
    const revision = parseArtifactRevision(input);
    if (!revision.ok) return revision;
    parsed.push(revision.value);
  }
  return ok(parsed);
}
