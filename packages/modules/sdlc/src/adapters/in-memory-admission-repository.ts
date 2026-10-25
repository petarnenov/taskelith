import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ArtifactId } from '../domain/artifact-revision.js';
import { checkGeneration, checkNextGeneration, type Generation } from '../domain/generation.js';
import type { AdmissionId, TaskAdmission } from '../domain/task-admission.js';
import type { AdmissionRepository } from '../ports/admission-repository.js';

// Keeps admissions in process memory, for tests and single-process
// composition; records are frozen values, so they are stored as given.
export class InMemoryAdmissionRepository implements AdmissionRepository {
  readonly #admissions = new Map<AdmissionId, TaskAdmission>();

  async get(id: AdmissionId): Promise<Result<TaskAdmission>> {
    const admission = this.#admissions.get(id);
    if (admission === undefined) return err(failure('not-found', `admission ${id} does not exist`, { admission: id }));
    return ok(admission);
  }

  async add(admission: TaskAdmission): Promise<Result<void>> {
    if (this.#admissions.has(admission.id)) {
      return err(failure('conflict', `admission ${admission.id} already exists`, { admission: admission.id }));
    }
    this.#admissions.set(admission.id, admission);
    return ok(undefined);
  }

  // Checks and writes without awaiting, so concurrent replaces cannot both
  // pass the generation check.
  async replace(admission: TaskAdmission, expectedGeneration: Generation): Promise<Result<void>> {
    const stored = this.#admissions.get(admission.id);
    if (stored === undefined) return err(failure('not-found', `admission ${admission.id} does not exist`, { admission: admission.id }));
    const generation = checkGeneration(`admission ${admission.id}`, stored.generation, expectedGeneration);
    if (!generation.ok) return generation;
    const next = checkNextGeneration(`admission ${admission.id}`, admission.generation, expectedGeneration);
    if (!next.ok) return next;
    this.#admissions.set(admission.id, admission);
    return ok(undefined);
  }

  async listUnusedBoundTo(artifactId: ArtifactId): Promise<readonly TaskAdmission[]> {
    return [...this.#admissions.values()].filter(
      (admission) => admission.state === 'admitted' && admission.artifacts.some((revision) => revision.artifactId === artifactId),
    );
  }
}
