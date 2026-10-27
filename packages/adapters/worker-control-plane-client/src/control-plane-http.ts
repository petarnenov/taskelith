import { err, failure, ok, type Failure, type FailureCode, type Result } from '@taskelith/kernel';
import { describeFailureCause, sanitizeFailureText } from './failure-cause.js';

// Where the control-plane API is and how long one call may take.
export interface ControlPlaneEndpoint {
  // The API's base, such as `https://control-plane:8443/`.
  readonly baseUrl: URL;
  readonly timeoutMilliseconds: number;
  readonly fetch?: typeof fetch;
}

export interface HttpAnswer {
  readonly status: number;
  readonly body: unknown;
}

// One JSON POST with a bearer. A timeout or lost connection reached no
// known decision, so it is `unavailable`.
export function postJson(endpoint: ControlPlaneEndpoint, path: string, bearer: string, body: unknown): Promise<Result<HttpAnswer>> {
  return post(endpoint, path, { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' }, JSON.stringify(body));
}

// One `multipart/form-data` POST with a bearer; fetch sets the boundary.
export function postForm(endpoint: ControlPlaneEndpoint, path: string, bearer: string, form: FormData): Promise<Result<HttpAnswer>> {
  return post(endpoint, path, { authorization: `Bearer ${bearer}` }, form);
}

async function post(endpoint: ControlPlaneEndpoint, path: string, headers: Record<string, string>, body: string | FormData): Promise<Result<HttpAnswer>> {
  const send = endpoint.fetch ?? fetch;
  try {
    const response = await send(new URL(path, withTrailingSlash(endpoint.baseUrl)), {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(endpoint.timeoutMilliseconds),
    });
    return ok({ status: response.status, body: await response.json().catch(() => undefined) });
  } catch (error) {
    // The request may have reached a decision, which a retry replays.
    return err(failure('unavailable', 'the control plane did not answer', describeFailureCause(error)));
  }
}

// A 503, or a proxy's timeout or bad gateway, reached no decision, so the
// same operation is retried; every other status ends it.
const STATUS_CODES: ReadonlyMap<number, FailureCode> = new Map([
  [400, 'invalid'], [401, 'forbidden'], [403, 'forbidden'], [409, 'conflict'], [422, 'precondition-failed'],
  [502, 'unavailable'], [503, 'unavailable'], [504, 'unavailable'],
]);

// The failure of a non-success answer, with the server's bounded and
// sanitized message and reason; never the request's secrets.
export function statusFailure(operation: string, answer: HttpAnswer): Failure {
  const { message, details } = (answer.body ?? {}) as { message?: unknown; details?: { reason?: unknown } };
  const text = typeof message === 'string' && message !== '' ? `: ${sanitizeFailureText(message)}` : '';
  const found: Record<string, string> = { status: String(answer.status) };
  if (typeof details?.reason === 'string') found.reason = sanitizeFailureText(details.reason);
  const code = STATUS_CODES.get(answer.status) ?? 'internal';
  return failure(code, `${operation} answered ${answer.status}${text}`, found);
}

// A base without a trailing slash would drop its last path segment.
function withTrailingSlash(base: URL): URL {
  return base.pathname.endsWith('/') ? base : new URL(`${base.pathname}/${base.search}`, base);
}
