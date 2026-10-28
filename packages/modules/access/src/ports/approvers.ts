import type { Result } from '@taskelith/kernel';
import type { PrincipalId } from '../domain/principal.js';

// The decision bodies a gate can name (`SPEC_APPROVERS` of execution).
export type DecisionBody = 'project-maintainer' | 'delegated-reviewer';

export interface Approval {
  readonly projectId: string;
  readonly gateKind: string;
  readonly decisionBody: DecisionBody;
}

// Product ports section 2, rule 8: an approval is authorized by the
// decision body the gate names, never by a hard-coded role check.
export interface Approvers {
  authorizeApproval(principalId: PrincipalId, approval: Approval): Promise<Result<void>>;
}
