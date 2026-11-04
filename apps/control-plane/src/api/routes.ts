import type { HttpSchemas } from '@taskelith/contracts';
import type { FailureCode } from '@taskelith/kernel';
import { BODY_TOO_LARGE, MAX_SCM_WEBHOOK_BODY_BYTES } from './http-exchange.js';

// `browserSession`: the session cookie, with the CSRF header on any method
// but GET; `none`: no credential, so a public or optional-session operation.
export type SecurityScheme = 'operatorToken' | 'enrollmentToken' | 'workerCredential' | 'browserSession' | 'none';

// One operation of the OpenAPI documents: how a request reaches it and how
// its failures map to the statuses the document declares.
export interface RouteDefinition {
  readonly operationId: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly pattern: RegExp;
  // The alternatives of the document's `security` array.
  readonly security: readonly SecurityScheme[];
  // Served on the browser endpoint only, as its document requires.
  readonly browserOnly?: true;
  readonly body?: keyof HttpSchemas & string;
  // The query parameters of the document, the only ones a request log holds.
  readonly query?: readonly string[];
  // The body reaches a `writeOnly` schema, so no failure names its values.
  readonly writeOnlyBody?: true;
  // Body fields that map setting names to values, with each map's schema: a
  // refused body names its first setting at fault in `details.setting`.
  readonly settingMaps?: Readonly<Record<string, keyof HttpSchemas & string>>;
  // The response carries a secret, so it is answered only over TLS.
  readonly confidential?: true;
  // The schema of every success body, checked before it leaves; `binary`,
  // `empty`, or `event-stream` (its operation checks each frame) for none.
  readonly response: (keyof HttpSchemas & string) | 'binary' | 'empty' | 'event-stream';
  // The body is multipart: `body` validates its `record` part, and its
  // `content` part reaches the operation as exact bytes.
  readonly upload?: true;
  // The body reaches the operation unparsed, as bytes with the lower-case
  // headers, read up to this limit: its signature authenticates it.
  readonly signedBodyLimit?: number;
  // A path parameter that is not valid percent-encoding reaches the
  // operation as sent, where other routes answer 400.
  readonly keepsUndecodablePathParameters?: true;
  readonly success: number;
  readonly statuses: Partial<Record<FailureCode, number>>;
  // Statuses by failure reason, which take precedence over those by code.
  readonly reasons?: Readonly<Record<string, number>>;
}

const SEGMENT = '([^/]+)';
const COMMON: Partial<Record<FailureCode, number>> = { invalid: 400, forbidden: 401, unavailable: 503, internal: 500 };
const OVER_LIMIT: Readonly<Record<string, number>> = Object.freeze({ [BODY_TOO_LARGE]: 413 });
const SESSION_PATH = `^/projects/${SEGMENT}/agent-sessions/${SEGMENT}`;
const SESSION_READ: Partial<Record<FailureCode, number>> = { ...COMMON, 'not-found': 404 };
const SESSION_COMMAND: Partial<Record<FailureCode, number>> = { ...SESSION_READ, conflict: 409, 'precondition-failed': 422 };
const PROJECT_PATH = `^/projects/${SEGMENT}`;
const PROJECT_READ: Partial<Record<FailureCode, number>> = { ...COMMON, 'not-found': 404 };
const INBOX_ANSWER: Partial<Record<FailureCode, number>> = { ...PROJECT_READ, conflict: 409, 'precondition-failed': 422 };
const PROJECT_UPDATE: Partial<Record<FailureCode, number>> = { ...PROJECT_READ, conflict: 409 };
// A role lost after the server's check is denied by the command's own.
const ROLE_DENIAL: Readonly<Record<string, number>> = Object.freeze({ 'role-required': 403 });
const BROWSER_OR_OPERATOR: readonly SecurityScheme[] = ['browserSession', 'operatorToken'];
const SCM_SETTING_MAPS: Readonly<Record<string, keyof HttpSchemas & string>> = Object.freeze({ settings: 'ScmSettings', secrets: 'ScmSecrets' });

export const ROUTES: readonly RouteDefinition[] = Object.freeze([
  {
    operationId: 'createRun', method: 'POST', pattern: /^\/runs$/, security: ['operatorToken'], body: 'CreateRunRequest', response: 'Run', success: 201,
    statuses: { ...COMMON, conflict: 409, 'precondition-failed': 422 },
  },
  {
    operationId: 'submitTask', method: 'POST', pattern: new RegExp(`^/runs/${SEGMENT}/tasks$`), security: ['operatorToken'],
    body: 'SubmitTaskRequest', response: 'TaskSubmission', success: 201,
    statuses: { ...COMMON, 'not-found': 404, conflict: 409, 'precondition-failed': 422 },
  },
  {
    operationId: 'readAdmission', method: 'GET', pattern: new RegExp(`^/runs/${SEGMENT}/admissions/${SEGMENT}$`), security: ['operatorToken'],
    response: 'Admission', success: 200, statuses: { ...COMMON, 'not-found': 404 },
  },
  {
    operationId: 'readTaskResult', method: 'GET', pattern: new RegExp(`^/runs/${SEGMENT}/tasks/${SEGMENT}/result$`), security: ['operatorToken'],
    response: 'TaskResult', success: 200, statuses: { ...COMMON, 'not-found': 404 },
  },
  {
    operationId: 'readInstallationCa', method: 'GET', pattern: /^\/installation\/ca$/, security: ['none'], response: 'InstallationCa', success: 200,
    // As the document declares: a public read has no 400 or 401.
    statuses: { unavailable: 503, internal: 500 },
  },
  {
    operationId: 'enrollWorker', method: 'POST', pattern: /^\/workers\/enrollments$/, security: ['enrollmentToken'], body: 'EnrollmentRequest',
    response: 'Enrollment', success: 201, statuses: { ...COMMON, conflict: 409, 'precondition-failed': 422 },
  },
  {
    operationId: 'renewWorkerCredentials', method: 'POST', pattern: /^\/workers\/credentials\/renewals$/, security: ['workerCredential'],
    body: 'CredentialRenewalRequest', response: 'CredentialRenewal', success: 200, statuses: { ...COMMON, conflict: 409 },
  },
  {
    operationId: 'confirmWorkerCredentials', method: 'POST', pattern: /^\/workers\/credentials\/confirmations$/, security: ['workerCredential'],
    body: 'CredentialConfirmationRequest', response: 'CredentialConfirmation', success: 200, statuses: { ...COMMON, conflict: 409 },
  },
  {
    operationId: 'authorizeLaunch', method: 'POST', pattern: /^\/launch-authorizations$/, security: ['workerCredential'],
    body: 'LaunchAuthorizationRequest', response: 'LaunchAuthorizationOutcome', success: 200,
    // The contract has no 500: an undecided operation is retried (section 3).
    statuses: { ...COMMON, internal: 503 },
  },
  {
    operationId: 'publishEvidence', method: 'POST', pattern: /^\/evidence$/, security: ['workerCredential'], body: 'EvidencePublication', upload: true,
    response: 'EvidenceRecord', success: 201, statuses: { ...COMMON, forbidden: 403, conflict: 409 },
    // A credential revoked after the bearer check is still a refused one.
    reasons: { 'worker-not-authorized': 401 },
  },
  {
    operationId: 'requestDelegation', method: 'POST', pattern: /^\/delegations$/, security: ['workerCredential'], body: 'DelegationRequest',
    response: 'DelegationOutcome', success: 200,
    statuses: { ...COMMON, forbidden: 403, conflict: 409, 'not-found': 422, 'precondition-failed': 422 },
    reasons: { 'worker-not-authorized': 401 },
  },
  {
    operationId: 'fetchSlotCredential', method: 'GET', pattern: new RegExp(`^/executions/${SEGMENT}/slot-credentials/${SEGMENT}$`),
    security: ['workerCredential'], query: ['attemptId', 'ownershipGeneration', 'recoveryEpoch'], confidential: true,
    response: 'SlotCredentialDelivery', success: 200, statuses: { ...COMMON, 'precondition-failed': 422 },
  },
  {
    operationId: 'readEvidence', method: 'GET', pattern: new RegExp(`^/evidence/${SEGMENT}$`),
    security: ['browserSession', 'operatorToken'], response: 'EvidenceRecord', success: 200, statuses: { ...COMMON, 'not-found': 404 },
  },
  {
    operationId: 'downloadEvidence', method: 'GET', pattern: new RegExp(`^/evidence/${SEGMENT}/content$`),
    security: ['browserSession', 'operatorToken'], response: 'binary', success: 200, statuses: { ...COMMON, 'not-found': 404 },
  },
  {
    operationId: 'listQuarantine', method: 'GET', pattern: /^\/quarantine$/, security: ['operatorToken'], query: ['from'],
    response: 'QuarantinePage', success: 200, statuses: COMMON,
  },
  {
    operationId: 'redriveQuarantined', method: 'POST', pattern: /^\/quarantine\/([0-9]+)\/redrive$/, security: ['operatorToken'],
    response: 'Redrive', success: 200,
    statuses: { ...COMMON, 'not-found': 404, 'precondition-failed': 409 },
  },
  // Control-plane wire contracts section 9.
  {
    operationId: 'listAgentSessions', method: 'GET', pattern: new RegExp(`^/projects/${SEGMENT}/cards/${SEGMENT}/agent-sessions$`),
    security: ['browserSession', 'operatorToken'], query: ['after'], response: 'AgentSessionPage', success: 200, statuses: SESSION_READ,
  },
  {
    operationId: 'readAgentSession', method: 'GET', pattern: new RegExp(`${SESSION_PATH}$`),
    security: ['browserSession', 'operatorToken'], response: 'AgentSessionView', success: 200, statuses: SESSION_READ,
  },
  {
    operationId: 'listAgentSessionTurns', method: 'GET', pattern: new RegExp(`${SESSION_PATH}/turns$`),
    security: ['browserSession', 'operatorToken'], query: ['after'], response: 'TurnPage', success: 200, statuses: SESSION_READ,
  },
  {
    operationId: 'readAgentSessionOutput', method: 'GET', pattern: new RegExp(`${SESSION_PATH}/output$`),
    security: ['browserSession', 'operatorToken'], query: ['after'], response: 'OutputRead', success: 200, statuses: SESSION_READ,
  },
  {
    operationId: 'submitTurn', method: 'POST', pattern: new RegExp(`${SESSION_PATH}/turns$`), security: ['browserSession', 'operatorToken'],
    body: 'TurnSubmission', response: 'TurnSubmitted', success: 201, statuses: SESSION_COMMAND,
  },
  {
    operationId: 'listAgentSessionRequests', method: 'GET', pattern: new RegExp(`${SESSION_PATH}/requests$`),
    security: ['browserSession', 'operatorToken'], query: ['after'], response: 'NativeRequestPage', success: 200, statuses: SESSION_READ,
  },
  {
    operationId: 'respondToNativeRequest', method: 'POST', pattern: new RegExp(`${SESSION_PATH}/responses$`),
    security: ['browserSession', 'operatorToken'], body: 'NativeResponseSubmission', response: 'NativeRequest', success: 200,
    statuses: SESSION_COMMAND,
  },
  // Control-plane wire contracts section 8: the board and the inbox.
  {
    operationId: 'readBoard', method: 'GET', pattern: new RegExp(`${PROJECT_PATH}/board$`), security: BROWSER_OR_OPERATOR,
    response: 'Board', success: 200, statuses: PROJECT_READ, reasons: ROLE_DENIAL,
  },
  {
    operationId: 'readTaskDetail', method: 'GET', pattern: new RegExp(`${PROJECT_PATH}/cards/${SEGMENT}$`), security: BROWSER_OR_OPERATOR,
    response: 'TaskDetail', success: 200, statuses: PROJECT_READ, reasons: ROLE_DENIAL,
  },
  {
    operationId: 'readInbox', method: 'GET', pattern: new RegExp(`${PROJECT_PATH}/inbox$`), security: BROWSER_OR_OPERATOR,
    query: ['kind', 'runId'], response: 'InboxView', success: 200, statuses: PROJECT_READ, reasons: ROLE_DENIAL,
  },
  {
    operationId: 'readInboxCounts', method: 'GET', pattern: new RegExp(`${PROJECT_PATH}/inbox/counts$`), security: BROWSER_OR_OPERATOR,
    response: 'InboxCounts', success: 200, statuses: PROJECT_READ, reasons: ROLE_DENIAL,
  },
  {
    operationId: 'readInstallationInbox', method: 'GET', pattern: /^\/inbox$/, security: BROWSER_OR_OPERATOR,
    query: ['kind'], response: 'InboxView', success: 200, statuses: COMMON, reasons: ROLE_DENIAL,
  },
  {
    operationId: 'readInstallationInboxCounts', method: 'GET', pattern: /^\/inbox\/counts$/, security: BROWSER_OR_OPERATOR,
    response: 'InboxCounts', success: 200, statuses: { forbidden: 401, unavailable: 503, internal: 500 }, reasons: ROLE_DENIAL,
  },
  {
    operationId: 'answerInboxItem', method: 'POST', pattern: new RegExp(`${PROJECT_PATH}/inbox/${SEGMENT}/answer$`), security: BROWSER_OR_OPERATOR,
    body: 'InboxAnswerSubmission', response: 'InboxItem', success: 200, statuses: INBOX_ANSWER, reasons: ROLE_DENIAL,
  },
  {
    operationId: 'answerInstallationInboxItem', method: 'POST', pattern: new RegExp(`^/inbox/${SEGMENT}/answer$`), security: BROWSER_OR_OPERATOR,
    body: 'InboxAnswerSubmission', response: 'InboxItem', success: 200, statuses: INBOX_ANSWER, reasons: ROLE_DENIAL,
  },
  // Control-plane wire contracts section 10: the event streams.
  {
    operationId: 'streamProjectEvents', method: 'GET', pattern: new RegExp(`${PROJECT_PATH}/events$`), security: BROWSER_OR_OPERATOR,
    query: ['after'], response: 'event-stream', success: 200, statuses: PROJECT_READ, reasons: ROLE_DENIAL,
  },
  {
    operationId: 'streamInstallationEvents', method: 'GET', pattern: /^\/events$/, security: BROWSER_OR_OPERATOR,
    query: ['after'], response: 'event-stream', success: 200, statuses: COMMON, reasons: ROLE_DENIAL,
  },
  // Control-plane wire contracts section 5.
  {
    operationId: 'receiveScmWebhook', method: 'POST', pattern: new RegExp(`^/scm-integrations/${SEGMENT}/webhooks$`), security: ['none'],
    signedBodyLimit: MAX_SCM_WEBHOOK_BODY_BYTES, keepsUndecodablePathParameters: true, response: 'empty', success: 202,
    statuses: COMMON, reasons: OVER_LIMIT,
  },
  // Control-plane wire contracts section 4: SCM integrations, whose secrets
  // are write-only.
  {
    operationId: 'listScmIntegrations', method: 'GET', pattern: /^\/scm-integrations$/, security: BROWSER_OR_OPERATOR, query: ['after'],
    response: 'ScmIntegrationPage', success: 200, statuses: COMMON,
  },
  {
    operationId: 'createScmIntegration', method: 'POST', pattern: /^\/scm-integrations$/, security: BROWSER_OR_OPERATOR,
    body: 'ScmIntegrationCreation', writeOnlyBody: true, settingMaps: SCM_SETTING_MAPS, response: 'ScmIntegration', success: 201, statuses: { ...COMMON, 'not-found': 404 },
  },
  {
    operationId: 'readScmIntegration', method: 'GET', pattern: new RegExp(`^/scm-integrations/${SEGMENT}$`), security: BROWSER_OR_OPERATOR,
    response: 'ScmIntegration', success: 200, statuses: { ...COMMON, 'not-found': 404 },
  },
  {
    operationId: 'updateScmIntegration', method: 'PATCH', pattern: new RegExp(`^/scm-integrations/${SEGMENT}$`), security: BROWSER_OR_OPERATOR,
    body: 'ScmIntegrationUpdate', writeOnlyBody: true, settingMaps: SCM_SETTING_MAPS, response: 'ScmIntegration', success: 200,
    statuses: { ...COMMON, 'not-found': 404, conflict: 409 },
  },
  // Control-plane wire contracts section 4: projects, members, and defaults.
  {
    operationId: 'listProjects', method: 'GET', pattern: /^\/projects$/, security: BROWSER_OR_OPERATOR, query: ['after'],
    response: 'ProjectPage', success: 200, statuses: COMMON,
  },
  {
    operationId: 'createProject', method: 'POST', pattern: /^\/projects$/, security: BROWSER_OR_OPERATOR, body: 'ProjectCreation',
    response: 'Project', success: 201, statuses: COMMON, reasons: ROLE_DENIAL,
  },
  {
    operationId: 'readProject', method: 'GET', pattern: new RegExp(`${PROJECT_PATH}$`), security: BROWSER_OR_OPERATOR,
    response: 'Project', success: 200, statuses: PROJECT_READ,
  },
  {
    operationId: 'updateProject', method: 'PATCH', pattern: new RegExp(`${PROJECT_PATH}$`), security: BROWSER_OR_OPERATOR, body: 'ProjectUpdate',
    response: 'Project', success: 200, statuses: PROJECT_UPDATE, reasons: ROLE_DENIAL,
  },
  {
    operationId: 'listProjectMembers', method: 'GET', pattern: new RegExp(`${PROJECT_PATH}/members$`), security: BROWSER_OR_OPERATOR, query: ['after'],
    response: 'ProjectMemberPage', success: 200, statuses: PROJECT_READ,
  },
  {
    operationId: 'assignProjectMember', method: 'PUT', pattern: new RegExp(`${PROJECT_PATH}/members/${SEGMENT}$`), security: BROWSER_OR_OPERATOR,
    body: 'MemberAssignment', response: 'ProjectMember', success: 200, statuses: PROJECT_READ, reasons: ROLE_DENIAL,
  },
  {
    operationId: 'removeProjectMember', method: 'DELETE', pattern: new RegExp(`${PROJECT_PATH}/members/${SEGMENT}$`), security: BROWSER_OR_OPERATOR,
    response: 'empty', success: 204, statuses: PROJECT_READ, reasons: ROLE_DENIAL,
  },
  {
    operationId: 'readProjectDefaults', method: 'GET', pattern: new RegExp(`${PROJECT_PATH}/defaults$`), security: BROWSER_OR_OPERATOR,
    response: 'ProjectDefaults', success: 200, statuses: PROJECT_READ,
  },
  {
    operationId: 'updateProjectDefaults', method: 'PUT', pattern: new RegExp(`${PROJECT_PATH}/defaults$`), security: BROWSER_OR_OPERATOR,
    body: 'ProjectDefaultsUpdate', response: 'ProjectDefaults', success: 200, statuses: PROJECT_UPDATE, reasons: ROLE_DENIAL,
  },
  {
    operationId: 'readAutoMergeSetting', method: 'GET', pattern: new RegExp(`${PROJECT_PATH}/auto-merge$`), security: BROWSER_OR_OPERATOR,
    response: 'AutoMergeSetting', success: 200, statuses: PROJECT_READ,
  },
  // Control-plane wire contracts section 4: the repository binding, whose
  // remote URL the integration's plugin resolves (section 4.1).
  {
    operationId: 'readRepositoryBinding', method: 'GET', pattern: new RegExp(`${PROJECT_PATH}/repository$`), security: BROWSER_OR_OPERATOR,
    response: 'RepositoryBinding', success: 200, statuses: PROJECT_READ,
  },
  {
    operationId: 'bindRepository', method: 'PUT', pattern: new RegExp(`${PROJECT_PATH}/repository$`), security: BROWSER_OR_OPERATOR,
    body: 'RepositoryBindingUpdate', response: 'RepositoryBinding', success: 200,
    statuses: { ...PROJECT_UPDATE, 'precondition-failed': 422 },
  },
  {
    operationId: 'readSession', method: 'GET', pattern: /^\/session$/, security: ['browserSession', 'none'], browserOnly: true,
    response: 'SessionState', success: 200, statuses: { unavailable: 503, internal: 500 },
  },
  {
    operationId: 'logIn', method: 'POST', pattern: /^\/session$/, security: ['browserSession'], browserOnly: true, body: 'LoginRequest', writeOnlyBody: true,
    response: 'AuthenticatedSession', success: 200, statuses: { ...COMMON },
  },
  {
    operationId: 'logOut', method: 'DELETE', pattern: /^\/session$/, security: ['browserSession'], browserOnly: true,
    response: 'empty', success: 204, statuses: { forbidden: 401, unavailable: 503, internal: 500 },
  },
]);
