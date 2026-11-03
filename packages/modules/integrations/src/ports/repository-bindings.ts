import { err, failure, ok, type Failure, type Result } from '@taskelith/kernel';
import { sameBindingValues, type RepositoryBinding, type RepositoryBindingValues } from '../domain/repository-binding.js';

// A bind of `projectId` against the integration revision that its remote
// URL was resolved at; a first bind names no `expectedRevision`.
export interface BindingPut {
  readonly projectId: string;
  readonly values: RepositoryBindingValues;
  readonly expectedRevision?: number;
  readonly integrationRevision: number;
}

// At most one binding per project. `put` applies `nextBinding` and fails
// with `conflict` when the integration is gone or at another revision.
export interface RepositoryBindings {
  get(projectId: string): Promise<Result<RepositoryBinding | undefined>>;
  put(put: BindingPut): Promise<Result<RepositoryBinding>>;
}

// Whether a project exists, which the Access module knows.
export interface BindableProjects {
  exists(projectId: string): Promise<Result<boolean>>;
}

// The one meaning of a put for every store: the same values at the current
// revision keep it, any other change moves it by one.
export function nextBinding(current: RepositoryBinding | undefined, put: BindingPut): Result<RepositoryBinding> {
  const { projectId, values, expectedRevision } = put;
  if (current === undefined) {
    if (expectedRevision !== undefined) return err(failure('conflict', 'the project is not bound'));
    return ok(Object.freeze({ projectId, ...values, revision: 1 }));
  }
  if (expectedRevision === undefined) return err(failure('conflict', 'the project is bound; name its revision'));
  if (expectedRevision !== current.revision) return err(failure('conflict', 'the binding changed since its revision'));
  if (sameBindingValues(current, values)) return ok(current);
  return ok(Object.freeze({ projectId, ...values, revision: current.revision + 1 }));
}

export function integrationMoved(): Failure {
  return failure('conflict', 'the integration changed while its remote URL was resolved');
}
