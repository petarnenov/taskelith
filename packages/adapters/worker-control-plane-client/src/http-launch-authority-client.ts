import { checkHttpSchema, type HttpSchemas } from '@taskelith/contracts';
import {
  parseLaunchParameters,
  parseRecoveryEpoch,
  type LaunchAuthorityClient,
  type LaunchAuthorizationRequest,
  type LaunchGrant,
  type LaunchOutcome,
} from '@taskelith/execution';
import { err, failure, ok, parseIdentifier, parseInstant, type Result } from '@taskelith/kernel';
import { parseArtifactRevision, parseGeneration, parseOwnershipGeneration, type ArtifactRevision } from '@taskelith/sdlc';

export interface ControlPlaneClientSettings {
  // The API's base, such as `https://control-plane:8443/`.
  readonly baseUrl: URL;
  // The control-plane secret of the worker's current credential generation.
  readonly credential: string;
  readonly timeoutMilliseconds: number;
  readonly fetch?: typeof fetch;
}

// `authorizeLaunch` over HTTP with the built-in fetch. A 503, a timeout,
// or a lost connection is `unavailable`: no decision was reached.
export class HttpLaunchAuthorityClient implements LaunchAuthorityClient {
  readonly #settings: ControlPlaneClientSettings;
  readonly #fetch: typeof fetch;

  constructor(settings: ControlPlaneClientSettings) {
    this.#settings = settings;
    this.#fetch = settings.fetch ?? fetch;
  }

  async authorize(request: LaunchAuthorizationRequest): Promise<Result<LaunchOutcome>> {
    const answered = await this.#post(request);
    if (!answered.ok) return answered;
    const { status, body } = answered.value;
    if (status !== 200) return err(statusFailure(status, body));
    const checked = checkHttpSchema('LaunchAuthorizationOutcome', body);
    if (!checked.ok) return err(failure('internal', 'the launch outcome violates its schema', { violation: checked.error[0] ?? '' }));
    const outcome = parseOutcome(body as HttpSchemas['LaunchAuthorizationOutcome']);
    if (!outcome.ok) return err(failure('internal', `the launch outcome is not valid: ${outcome.error.message}`));
    if (outcome.value.kind === 'granted' && !bindsRequest(outcome.value.grant, request)) {
      return err(failure('internal', 'the grant binds other values than the request'));
    }
    return outcome;
  }

  async #post(request: LaunchAuthorizationRequest): Promise<Result<{ status: number; body: unknown }>> {
    const { baseUrl, credential, timeoutMilliseconds } = this.#settings;
    try {
      const response = await this.#fetch(new URL('launch-authorizations', withTrailingSlash(baseUrl)), {
        method: 'POST',
        headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(timeoutMilliseconds),
      });
      return ok({ status: response.status, body: await response.json().catch(() => undefined) });
    } catch (error) {
      // The request may have reached a decision, which a retry replays.
      const cause = error instanceof Error ? error.name : 'unknown';
      return err(failure('unavailable', 'the control plane did not answer', { cause }));
    }
  }
}

// A 503, or a proxy's timeout or bad gateway, reached no decision, so the
// same operation is retried; every other status ends it.
const UNDECIDED_STATUSES = new Set([502, 503, 504]);

function statusFailure(status: number, body: unknown) {
  const message = typeof (body as { message?: unknown })?.message === 'string' ? (body as { message: string }).message : '';
  const code = UNDECIDED_STATUSES.has(status) ? 'unavailable' : status === 401 ? 'forbidden' : status === 400 ? 'invalid' : 'internal';
  return failure(code, `authorizeLaunch answered ${status}${message === '' ? '' : `: ${message}`}`, { status: String(status) });
}

// A grant for another operation or execution is never used (section 6).
function bindsRequest(grant: LaunchGrant, request: LaunchAuthorizationRequest): boolean {
  const bound = ['operationId', 'recoveryEpoch', 'assignmentId', 'attemptId', 'ownershipGeneration', 'executionId', 'admissionId',
    'admissionGeneration'] as const;
  return bound.every((field) => grant[field] === request[field]);
}

// A base without a trailing slash would drop its last path segment.
function withTrailingSlash(base: URL): URL {
  return base.pathname.endsWith('/') ? base : new URL(`${base.pathname}/${base.search}`, base);
}

function parseOutcome(body: HttpSchemas['LaunchAuthorizationOutcome']): Result<LaunchOutcome> {
  switch (body.outcome) {
    case 'granted': {
      const grant = parseGrant(body.grant);
      return grant.ok ? ok(Object.freeze({ kind: 'granted', grant: grant.value })) : grant;
    }
    case 'rejected':
      return ok(Object.freeze({ kind: 'rejected', rejection: Object.freeze({ ...body.rejection }) }));
    case 'revoked':
      return ok(Object.freeze({ kind: 'revoked', reason: body.reason }));
    case 'expired':
      return ok(Object.freeze({ kind: 'expired' }));
  }
}

function parseGrant(body: HttpSchemas['LaunchGrant']): Result<LaunchGrant> {
  const parsed = {
    launchAuthId: parseIdentifier('LaunchAuthId', body.launchAuthId),
    operationId: parseIdentifier('OperationId', body.operationId),
    executionId: parseIdentifier('ExecutionId', body.executionId),
    attemptId: parseIdentifier('AttemptId', body.attemptId),
    assignmentId: parseIdentifier('AssignmentId', body.assignmentId),
    workerId: parseIdentifier('WorkerId', body.workerId),
    ownershipGeneration: parseOwnershipGeneration(body.ownershipGeneration),
    recoveryEpoch: parseRecoveryEpoch(body.recoveryEpoch),
    admissionId: parseIdentifier('AdmissionId', body.admissionId),
    admissionGeneration: parseGeneration(body.admissionGeneration),
    reliedOnGates: all(body.reliedOnGates.map((gateId) => parseIdentifier('GateId', gateId))),
    artifacts: all<ArtifactRevision>(body.artifacts.map((artifact) => parseArtifactRevision(artifact))),
    policyRevision: parseIdentifier('PolicyRevision', body.policyRevision),
    issuedAt: parseInstant(body.issuedAt),
    parameters: parseLaunchParameters({ ttlMilliseconds: body.ttlMilliseconds, skewMilliseconds: body.skewMilliseconds }),
  };
  const values: Record<string, unknown> = {};
  for (const [field, result] of Object.entries(parsed)) {
    if (!result.ok) return result;
    values[field] = result.value;
  }
  return ok(Object.freeze({ ...values, state: 'granted' }) as LaunchGrant);
}

function all<Value>(results: readonly Result<Value>[]): Result<readonly Value[]> {
  const values: Value[] = [];
  for (const result of results) {
    if (!result.ok) return result;
    values.push(result.value);
  }
  return ok(Object.freeze(values));
}
