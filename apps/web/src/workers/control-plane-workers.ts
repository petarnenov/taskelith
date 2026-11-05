import { createApiClient, hasStatus, type ApiRequest } from '../api/client';
import { readPagesUpTo } from '../api/read-pages';
import { denialOf, failureDetail, failureOf, failureReason, reachable, requiredRoleOf, type ReadFailed, type ReadResult } from '../api/read-result';
import { enrollmentTokenPageOf, issuedEnrollmentTokenOf } from './tokens-wire';
import { isIdentifier, workersViewOf } from './workers-wire';
import type {
  CommandRefused,
  EnrollmentTokenList,
  HostConstraints,
  IssueResult,
  RevokeResult,
  RotateResult,
  WorkersGateway,
  WorkersView,
} from './workers';

// The workers port through the typed fetch: the reads are GETs, which
// carry no CSRF token; the three token commands send the session's.

interface WorkersGatewayOptions {
  readonly fetch?: typeof fetch;
  // The session's CSRF token for the commands, read as each request is sent.
  readonly csrfToken?: () => string | undefined;
}

// An answer as the typed fetch returns it, whatever its operation.
interface Answer {
  readonly status: number;
  readonly body: unknown;
}

const UNAVAILABLE = { kind: 'unavailable' } as const;

export function createWorkersGateway({ fetch: send, csrfToken = () => undefined }: WorkersGatewayOptions = {}): WorkersGateway {
  const request: ApiRequest = createApiClient({ csrfToken, fetch: send });

  // listWorkers documents no 404, so one is an undocumented status.
  async function listWorkers(): Promise<ReadResult<WorkersView>> {
    const result = await reachable(() => request('get', '/workers'));
    if (result === undefined) return UNAVAILABLE;
    if (!hasStatus(result, 200)) return withoutNotFound(failureOf(result));
    const view = workersViewOf(result.body);
    return view === undefined ? UNAVAILABLE : { kind: 'read', value: view };
  }

  // Every page of the pending tokens; a 404, which the list does not
  // document, and a 400 for a cursor the control plane named are wrong answers.
  async function listEnrollmentTokens(): Promise<ReadResult<EnrollmentTokenList>> {
    const send = (after: string | undefined) => request('get', '/enrollment-tokens', { query: { after } });
    const result = await readPagesUpTo(send, enrollmentTokenPageOf, listFailureOf);
    if (result.kind !== 'read') return withoutNotFound(result);
    return { kind: 'read', value: { tokens: result.value, truncated: result.truncated } };
  }

  // issueEnrollmentToken documents no 404 and no 422.
  async function issueEnrollmentToken(constraints: HostConstraints): Promise<IssueResult> {
    const result = await reachable(() => request('post', '/enrollment-tokens', { body: constraints }));
    if (result === undefined) return UNAVAILABLE;
    if (hasStatus(result, 201)) return issuedOf(result.body);
    return withoutNotFound(refusalOf(result));
  }

  async function revokeEnrollmentToken(tokenId: string): Promise<RevokeResult> {
    const result = await reachable(() => request('delete', '/enrollment-tokens/{tokenId}', { path: { tokenId } }));
    if (result === undefined) return UNAVAILABLE;
    if (hasStatus(result, 204)) return { kind: 'revoked' };
    return result.status === 422 ? revokeRefusalOf(result.body) : refusalOf(result);
  }

  async function rotateEnrollmentToken(tokenId: string): Promise<RotateResult> {
    const result = await reachable(() => request('post', '/enrollment-tokens/{tokenId}/rotation', { path: { tokenId } }));
    if (result === undefined) return UNAVAILABLE;
    if (hasStatus(result, 201)) return issuedOf(result.body);
    if (result.status === 422) return failureReason(result.body) === 'token-not-pending' ? { kind: 'token-not-pending' } : UNAVAILABLE;
    return refusalOf(result);
  }

  return { listWorkers, listEnrollmentTokens, issueEnrollmentToken, revokeEnrollmentToken, rotateEnrollmentToken };
}

function issuedOf(body: unknown): IssueResult {
  const value = issuedEnrollmentTokenOf(body);
  return value === undefined ? UNAVAILABLE : { kind: 'issued', value };
}

// The refusals the three commands share, each by its documented reason; a
// refusal without it, and a 422 of another command, are wrong answers.
function refusalOf(result: Answer): CommandRefused {
  const { status, body } = result;
  const reason = failureReason(body);
  if (status === 400) return { kind: 'invalid' };
  if (status === 403 && reason === 'csrf-token-invalid') return { kind: 'csrf-rejected' };
  if (status === 403) return reason === 'role-required' ? denialOf(requiredRoleOf(body)) : UNAVAILABLE;
  if (status === 422) return UNAVAILABLE;
  return failureOf(result);
}

// The 422 reasons of revokeEnrollmentToken; token-rotated names the
// replacement that stays redeemable.
function revokeRefusalOf(body: unknown): RevokeResult {
  const reason = failureReason(body);
  if (reason === 'token-used') return { kind: 'token-used' };
  if (reason !== 'token-rotated') return UNAVAILABLE;
  const replacementTokenId = failureDetail(body, 'replacementTokenId');
  return isIdentifier(replacementTokenId) ? { kind: 'token-rotated', replacementTokenId } : UNAVAILABLE;
}

// The list documents one 403, role-required; any other reason is a wrong
// answer, never a denial.
function listFailureOf(result: Answer): ReadFailed {
  if (result.status !== 403) return failureOf(result);
  return failureReason(result.body) === 'role-required' ? denialOf(requiredRoleOf(result.body)) : UNAVAILABLE;
}

// An operation that documents no 404 answered one: an undocumented status.
function withoutNotFound<R extends { readonly kind: string }>(result: R): R | typeof UNAVAILABLE {
  return result.kind === 'not-found' ? UNAVAILABLE : result;
}
