import { err, failure, type Result } from '@taskelith/kernel';
import type { PrincipalId } from '../domain/principal.js';
import { projectRequirement } from '../domain/requirement.js';
import type { AccessStore } from '../ports/access-store.js';
import type { Approval, Approvers } from '../ports/approvers.js';
import { authorizeIn } from './authorization-service.js';

// The G3 approvers: a human approves only a gate whose decision body is
// project-maintainer, and only as maintainer of the gate's project.
export class RoleApprovers implements Approvers {
  readonly #store: AccessStore;

  constructor(store: AccessStore) {
    this.#store = store;
  }

  async authorizeApproval(principalId: PrincipalId, approval: Approval): Promise<Result<void>> {
    if (approval.decisionBody !== 'project-maintainer') {
      const message = `a ${approval.decisionBody} approval is not recorded by a human principal`;
      return err(failure('forbidden', message, { reason: 'role-required' }));
    }
    const requirement = projectRequirement(approval.projectId, 'project-maintainer');
    return this.#store.transaction((tx) => authorizeIn(tx, principalId, requirement));
  }
}
