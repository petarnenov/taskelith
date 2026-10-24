import { ok, type Result } from '@taskelith/kernel';
import type { ArtifactRevision } from '../domain/artifact-revision.js';
import type { Generation } from '../domain/generation.js';
import {
  admitImplementationTask,
  admitPlanningTask,
  invalidateAdmission,
  isAdmissionOutdatedBy,
  recordCreatedRevision,
  useAdmission,
  type AdmissionId,
  type GatedRunContext,
  type RunContext,
  type TaskAdmission,
  type TaskAdmissionRequest,
} from '../domain/task-admission.js';
import type { AdmissionRepository } from '../ports/admission-repository.js';
import type { Clock } from '../ports/clock.js';

export interface CreatedRevisionOutcome {
  readonly admission: TaskAdmission;
  readonly invalidated: readonly TaskAdmission[];
}

// The one entry point that admits tasks, records what planning tasks create,
// and invalidates unused admissions bound to a changed artifact.
export class TaskAdmissionService {
  readonly #admissions: AdmissionRepository;
  readonly #clock: Clock;

  constructor(admissions: AdmissionRepository, clock: Clock) {
    this.#admissions = admissions;
    this.#clock = clock;
  }

  async admitImplementationTask(request: TaskAdmissionRequest, context: GatedRunContext): Promise<Result<TaskAdmission>> {
    return this.#add(admitImplementationTask(request, context, this.#clock.now()));
  }

  async admitPlanningTask(
    request: TaskAdmissionRequest,
    context: RunContext,
    artifacts: readonly ArtifactRevision[],
  ): Promise<Result<TaskAdmission>> {
    return this.#add(admitPlanningTask(request, context, artifacts, this.#clock.now()));
  }

  async useAdmission(id: AdmissionId, expectedGeneration: Generation): Promise<Result<TaskAdmission>> {
    return this.#change(id, (admission) => useAdmission(admission, expectedGeneration, this.#clock.now()));
  }

  // Invalidates what the revision outdates before storing it, so a failed
  // invalidation leaves the admission at its generation and the call retryable.
  async recordCreatedRevision(
    id: AdmissionId,
    expectedGeneration: Generation,
    revision: ArtifactRevision,
  ): Promise<Result<CreatedRevisionOutcome>> {
    const current = await this.#admissions.get(id);
    if (!current.ok) return current;
    const next = recordCreatedRevision(current.value, expectedGeneration, revision, this.#clock.now());
    if (!next.ok) return next;
    const invalidated = await this.invalidateOutdatedAdmissions(revision);
    if (!invalidated.ok) return invalidated;
    const stored = await this.#admissions.replace(next.value, current.value.generation);
    if (!stored.ok) return stored;
    return ok(Object.freeze({ admission: next.value, invalidated: invalidated.value }));
  }

  // Invalidates every unused admission the revision outdates; a concurrent
  // writer causes `conflict`, and a rerun invalidates the remaining ones.
  async invalidateOutdatedAdmissions(revision: ArtifactRevision): Promise<Result<readonly TaskAdmission[]>> {
    const candidates = await this.#admissions.listUnusedBoundTo(revision.artifactId);
    const invalidated: TaskAdmission[] = [];
    for (const candidate of candidates.filter((admission) => isAdmissionOutdatedBy(admission, revision))) {
      const next = invalidateAdmission(candidate, candidate.generation, revision, this.#clock.now());
      if (!next.ok) return next;
      const stored = await this.#admissions.replace(next.value, candidate.generation);
      if (!stored.ok) return stored;
      invalidated.push(next.value);
    }
    return ok(Object.freeze(invalidated));
  }

  async #add(admission: Result<TaskAdmission>): Promise<Result<TaskAdmission>> {
    if (!admission.ok) return admission;
    const stored = await this.#admissions.add(admission.value);
    if (!stored.ok) return stored;
    return admission;
  }

  async #change(id: AdmissionId, transition: (admission: TaskAdmission) => Result<TaskAdmission>): Promise<Result<TaskAdmission>> {
    const current = await this.#admissions.get(id);
    if (!current.ok) return current;
    const next = transition(current.value);
    if (!next.ok) return next;
    const stored = await this.#admissions.replace(next.value, current.value.generation);
    if (!stored.ok) return stored;
    return next;
  }
}
