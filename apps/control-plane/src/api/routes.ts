import type { HttpSchemas } from '@taskelith/contracts';
import type { FailureCode } from '@taskelith/kernel';

// `none`: a public operation, which reads no bearer at all.
export type SecurityScheme = 'operatorToken' | 'enrollmentToken' | 'workerCredential' | 'none';

// One operation of the OpenAPI documents: how a request reaches it and how
// its failures map to the statuses the document declares.
export interface RouteDefinition {
  readonly operationId: string;
  readonly method: 'GET' | 'POST';
  readonly pattern: RegExp;
  readonly security: SecurityScheme;
  readonly body?: keyof HttpSchemas & string;
  // The schema every success body is validated against before it leaves,
  // or `binary` for exact bytes sent as application/octet-stream.
  readonly response: (keyof HttpSchemas & string) | 'binary';
  // The body is multipart: `body` validates its `record` part, and its
  // `content` part reaches the operation as exact bytes.
  readonly upload?: true;
  readonly success: number;
  readonly statuses: Partial<Record<FailureCode, number>>;
  // Statuses by failure reason, which take precedence over those by code.
  readonly reasons?: Readonly<Record<string, number>>;
}

const SEGMENT = '([^/]+)';
const COMMON: Partial<Record<FailureCode, number>> = { invalid: 400, forbidden: 401, unavailable: 503, internal: 500 };

export const ROUTES: readonly RouteDefinition[] = Object.freeze([
  {
    operationId: 'createRun', method: 'POST', pattern: /^\/runs$/, security: 'operatorToken', body: 'CreateRunRequest', response: 'Run', success: 201,
    statuses: { ...COMMON, conflict: 409, 'precondition-failed': 422 },
  },
  {
    operationId: 'submitTask', method: 'POST', pattern: new RegExp(`^/runs/${SEGMENT}/tasks$`), security: 'operatorToken',
    body: 'SubmitTaskRequest', response: 'TaskSubmission', success: 201,
    statuses: { ...COMMON, 'not-found': 404, conflict: 409, 'precondition-failed': 422 },
  },
  {
    operationId: 'readAdmission', method: 'GET', pattern: new RegExp(`^/runs/${SEGMENT}/admissions/${SEGMENT}$`), security: 'operatorToken',
    response: 'Admission', success: 200, statuses: { ...COMMON, 'not-found': 404 },
  },
  {
    operationId: 'readTaskResult', method: 'GET', pattern: new RegExp(`^/runs/${SEGMENT}/tasks/${SEGMENT}/result$`), security: 'operatorToken',
    response: 'TaskResult', success: 200, statuses: { ...COMMON, 'not-found': 404 },
  },
  {
    operationId: 'readInstallationCa', method: 'GET', pattern: /^\/installation\/ca$/, security: 'none', response: 'InstallationCa', success: 200,
    // As the document declares: a public read has no 400 or 401.
    statuses: { unavailable: 503, internal: 500 },
  },
  {
    operationId: 'enrollWorker', method: 'POST', pattern: /^\/workers\/enrollments$/, security: 'enrollmentToken', body: 'EnrollmentRequest',
    response: 'Enrollment', success: 201, statuses: { ...COMMON, conflict: 409, 'precondition-failed': 422 },
  },
  {
    operationId: 'authorizeLaunch', method: 'POST', pattern: /^\/launch-authorizations$/, security: 'workerCredential',
    body: 'LaunchAuthorizationRequest', response: 'LaunchAuthorizationOutcome', success: 200,
    // The contract has no 500: an undecided operation is retried (section 3).
    statuses: { ...COMMON, internal: 503 },
  },
  {
    operationId: 'publishEvidence', method: 'POST', pattern: /^\/evidence$/, security: 'workerCredential', body: 'EvidencePublication', upload: true,
    response: 'EvidenceRecord', success: 201, statuses: { ...COMMON, forbidden: 403, conflict: 409 },
    // A credential revoked after the bearer check is still a refused one.
    reasons: { 'worker-not-authorized': 401 },
  },
  {
    operationId: 'requestDelegation', method: 'POST', pattern: /^\/delegations$/, security: 'workerCredential', body: 'DelegationRequest',
    response: 'DelegationOutcome', success: 200,
    statuses: { ...COMMON, forbidden: 403, conflict: 409, 'not-found': 422, 'precondition-failed': 422 },
    reasons: { 'worker-not-authorized': 401 },
  },
  {
    operationId: 'readEvidence', method: 'GET', pattern: new RegExp(`^/evidence/${SEGMENT}$`), security: 'operatorToken',
    response: 'EvidenceRecord', success: 200, statuses: { ...COMMON, 'not-found': 404 },
  },
  {
    operationId: 'downloadEvidence', method: 'GET', pattern: new RegExp(`^/evidence/${SEGMENT}/content$`), security: 'operatorToken',
    response: 'binary', success: 200, statuses: { ...COMMON, 'not-found': 404 },
  },
  {
    operationId: 'listQuarantine', method: 'GET', pattern: /^\/quarantine$/, security: 'operatorToken', response: 'QuarantinePage', success: 200,
    statuses: COMMON,
  },
  {
    operationId: 'redriveQuarantined', method: 'POST', pattern: /^\/quarantine\/([0-9]+)\/redrive$/, security: 'operatorToken',
    response: 'Redrive', success: 200,
    statuses: { ...COMMON, 'not-found': 404, 'precondition-failed': 409 },
  },
]);
