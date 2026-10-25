import type { HttpSchemas } from '@taskelith/contracts';
import type { FailureCode } from '@taskelith/kernel';

export type SecurityScheme = 'operatorToken' | 'enrollmentToken' | 'workerCredential';

// One operation of the OpenAPI documents: how a request reaches it and how
// its failures map to the statuses the document declares.
export interface RouteDefinition {
  readonly operationId: string;
  readonly method: 'GET' | 'POST';
  readonly pattern: RegExp;
  readonly security: SecurityScheme;
  readonly body?: keyof HttpSchemas & string;
  // The schema every success body is validated against before it leaves.
  readonly response: keyof HttpSchemas & string;
  readonly success: number;
  readonly statuses: Partial<Record<FailureCode, number>>;
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
    operationId: 'enrollWorker', method: 'POST', pattern: /^\/workers\/enrollments$/, security: 'enrollmentToken', body: 'EnrollmentRequest',
    response: 'Enrollment', success: 201, statuses: { ...COMMON, conflict: 409, 'precondition-failed': 422 },
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
