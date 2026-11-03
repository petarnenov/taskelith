import type { MergeMethod } from '../ports/source-control.js';
import type { ScmIntegrationId } from './scm-integration.js';

// What a project is bound to (wire contracts section 4): the remote URL is
// the one the integration's plugin resolved for the repository.
export interface RepositoryBindingValues {
  readonly integrationId: ScmIntegrationId;
  readonly repository: string;
  readonly remoteUrl: string;
  readonly integrationBranch: string;
  readonly mergeMethod: MergeMethod;
}

// One binding per project, changed by compare-and-set on its revision.
export interface RepositoryBinding extends RepositoryBindingValues {
  readonly projectId: string;
  readonly revision: number;
}

export function sameBindingValues(left: RepositoryBindingValues, right: RepositoryBindingValues): boolean {
  return left.integrationId === right.integrationId && left.repository === right.repository && left.remoteUrl === right.remoteUrl
    && left.integrationBranch === right.integrationBranch && left.mergeMethod === right.mergeMethod;
}
