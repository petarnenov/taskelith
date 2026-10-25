import type { Result } from '@taskelith/kernel';
import type { ArtifactId } from '../domain/artifact-revision.js';
import type { Generation } from '../domain/generation.js';
import type { AdmissionId, TaskAdmission } from '../domain/task-admission.js';

// Stores admission records; `replace` is a compare-and-set that fails with
// `conflict` unless the stored record is at the expected generation.
export interface AdmissionRepository {
  get(id: AdmissionId): Promise<Result<TaskAdmission>>;
  add(admission: TaskAdmission): Promise<Result<void>>;
  replace(admission: TaskAdmission, expectedGeneration: Generation): Promise<Result<void>>;
  listUnusedBoundTo(artifactId: ArtifactId): Promise<readonly TaskAdmission[]>;
}
