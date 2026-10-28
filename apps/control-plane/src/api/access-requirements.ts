import { AUTHENTICATED, OWNER_ONLY, projectRead, projectRequirement, type AccessRequirement, type ProjectRole } from '@taskelith/access';

// How an operation's requirement is found (wire contracts section 3); a
// `resource-project` one is checked after its resource's project is read.
export type RequirementRule =
  | { readonly kind: 'none' }
  | { readonly kind: 'fixed'; readonly requirement: AccessRequirement }
  | { readonly kind: 'path-project'; readonly role: ProjectRole; readonly ownerReads: boolean }
  | { readonly kind: 'resource-project'; readonly role: ProjectRole };

const NONE: RequirementRule = Object.freeze({ kind: 'none' });
const ANY_PRINCIPAL: RequirementRule = Object.freeze({ kind: 'fixed', requirement: AUTHENTICATED });
const OWNER: RequirementRule = Object.freeze({ kind: 'fixed', requirement: OWNER_ONLY });
const PROJECT_READ: RequirementRule = Object.freeze({ kind: 'path-project', role: 'project-viewer', ownerReads: true });
const PROJECT_MAINTAINER: RequirementRule = Object.freeze({ kind: 'path-project', role: 'project-maintainer', ownerReads: false });
// The G2 operator operations, which the temporary G2 bridge covers (Q5).
const RUN_OPERATOR: RequirementRule = Object.freeze({ kind: 'resource-project', role: 'project-operator' });
const RUN_VIEWER: RequirementRule = Object.freeze({ kind: 'resource-project', role: 'project-viewer' });

export const ACCESS_REQUIREMENTS: Readonly<Record<string, RequirementRule>> = Object.freeze({
  readSession: NONE, logIn: NONE, logOut: NONE, receiveScmWebhook: NONE,
  listProjects: ANY_PRINCIPAL, listScmIntegrations: ANY_PRINCIPAL, readScmIntegration: ANY_PRINCIPAL,
  readProject: PROJECT_READ, listProjectMembers: PROJECT_READ, readProjectDefaults: PROJECT_READ,
  readAutoMergeSetting: PROJECT_READ, readRepositoryBinding: PROJECT_READ, listProjectAccountSlots: PROJECT_READ,
  updateProject: PROJECT_MAINTAINER, updateProjectDefaults: PROJECT_MAINTAINER, updateAutoMergeSetting: PROJECT_MAINTAINER,
  bindRepository: PROJECT_MAINTAINER,
  createProject: OWNER, assignProjectMember: OWNER, removeProjectMember: OWNER, listWorkers: OWNER,
  listEnrollmentTokens: OWNER, issueEnrollmentToken: OWNER, revokeEnrollmentToken: OWNER, rotateEnrollmentToken: OWNER,
  listAccountSlots: OWNER, addAccountSlot: OWNER, updateAccountSlot: OWNER, revokeAccountSlot: OWNER,
  reinstateAccountSlot: OWNER, rotateSlotCredential: OWNER, removeAccountSlot: OWNER,
  createScmIntegration: OWNER, updateScmIntegration: OWNER,
  createRun: RUN_OPERATOR, submitTask: RUN_OPERATOR,
  readAdmission: RUN_VIEWER, readTaskResult: RUN_VIEWER, readEvidence: RUN_VIEWER, downloadEvidence: RUN_VIEWER,
  listQuarantine: OWNER, redriveQuarantined: OWNER,
  readInstallationCa: NONE, enrollWorker: NONE, authorizeLaunch: NONE, publishEvidence: NONE, requestDelegation: NONE,
});

// An operation that no rule names fails closed: it requires the owner.
export function ruleOf(operationId: string): RequirementRule {
  return ACCESS_REQUIREMENTS[operationId] ?? OWNER;
}

// The requirement the server checks before the body, or none when the
// operation has none or checks its resource's project itself.
export function requirementBeforeBody(operationId: string, parameters: readonly string[]): AccessRequirement | undefined {
  const rule = ruleOf(operationId);
  if (rule.kind === 'fixed') return rule.requirement;
  if (rule.kind !== 'path-project') return undefined;
  return rule.ownerReads ? projectRead(parameters[0]) : projectRequirement(parameters[0], rule.role);
}
