import { err, failure, ok, type Failure, type FailureCode, type Result } from '@taskelith/kernel';
import { describeFailureCause, sanitizeFailureText } from './failure-cause.js';
import { undiciFetch } from './undici-fetch.js';

// Where the control-plane API is and how long one call may take.
export interface ControlPlaneAddress {
  // The API's base, such as `https://control-plane:8443/`.
  readonly baseUrl: URL;
  readonly timeoutMilliseconds: number;
  readonly fetch?: HttpFetch;
}

// The part of fetch the client uses; tests stand in.
export type HttpFetch = (url: URL, init: HttpInit) => Promise<{ readonly status: number; json(): Promise<unknown> }>;

export interface HttpInit {
  readonly method: 'GET' | 'POST';
  readonly headers: Record<string, string>;
  readonly body?: string | FormData;
  readonly signal: AbortSignal;
  readonly trust: ServerTrust;
  // A redirect could lead off the pinned TLS, so none is followed.
  readonly redirect: 'error';
}

// A call's TLS trust: the pinned CA only, or no verification for the CA
// read, whose answer the fingerprint check decides.
export type ServerTrust = { readonly kind: 'pinned'; readonly ca: string } | { readonly kind: 'unverified' };

// An address with the pinned installation CA in PEM, the only CA that a
// call trusts (installation contract section 10).
export interface ControlPlaneEndpoint extends ControlPlaneAddress {
  readonly installationCa: string;
}

// An address with the TLS that its calls use.
export interface HttpTarget extends ControlPlaneAddress {
  readonly trust: ServerTrust;
}

// With a CA, Node's TLS trusts only it: neither the system roots nor
// NODE_EXTRA_CA_CERTS, so a certificate they issued is refused.
export function pinnedTarget(endpoint: ControlPlaneEndpoint): HttpTarget {
  const { installationCa, ...address } = endpoint;
  return { ...address, trust: Object.freeze({ kind: 'pinned', ca: installationCa }) };
}

export function unverifiedTarget(address: ControlPlaneAddress): HttpTarget {
  return { ...address, trust: Object.freeze({ kind: 'unverified' }) };
}

export interface HttpAnswer {
  readonly status: number;
  readonly body: unknown;
}

// One JSON POST with a bearer. A timeout or lost connection reached no
// known decision, so it is `unavailable`.
export function postJson(target: HttpTarget, path: string, bearer: string, body: unknown): Promise<Result<HttpAnswer>> {
  return send(target, path, { method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

// One `multipart/form-data` POST with a bearer; fetch sets the boundary.
export function postForm(target: HttpTarget, path: string, bearer: string, form: FormData): Promise<Result<HttpAnswer>> {
  return send(target, path, { method: 'POST', headers: { authorization: `Bearer ${bearer}` }, body: form });
}

// One GET, with a bearer when the operation takes one.
export function getJson(target: HttpTarget, path: string, bearer?: string): Promise<Result<HttpAnswer>> {
  return send(target, path, { method: 'GET', headers: bearer === undefined ? {} : { authorization: `Bearer ${bearer}` } });
}

type Exchange = Pick<HttpInit, 'method' | 'headers' | 'body'>;

async function send(target: HttpTarget, path: string, exchange: Exchange): Promise<Result<HttpAnswer>> {
  const fetchWith = target.fetch ?? undiciFetch;
  try {
    const response = await fetchWith(new URL(path, withTrailingSlash(target.baseUrl)), {
      ...exchange, signal: AbortSignal.timeout(target.timeoutMilliseconds), trust: target.trust, redirect: 'error',
    });
    return ok({ status: response.status, body: await response.json().catch(() => undefined) });
  } catch (error) {
    // The request may have reached a decision, which a retry replays.
    const refusal = certificateRefusal(error);
    const details = { ...describeFailureCause(error), ...(refusal === undefined ? {} : { certificateRefusal: refusal }) };
    return err(failure('unavailable', 'the control plane did not answer', details));
  }
}

// Node's codes for a server certificate that TLS did not verify; the
// handshake failed, so no request, and no secret, was sent.
const CERTIFICATE_REFUSALS: ReadonlySet<string> = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID',
  'CERT_SIGNATURE_FAILURE', 'CERT_UNTRUSTED', 'CERT_REJECTED', 'INVALID_CA', 'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export function isCertificateRefusal(refused: Failure): boolean {
  return refused.code === 'unavailable' && refused.details.certificateRefusal !== undefined;
}

// Read from the raw cause chain, as the described cause drops long codes;
// only a code of the fixed list is kept, so no thrown text passes.
function certificateRefusal(thrown: unknown): string | undefined {
  try {
    return refusalInChain(thrown);
  } catch {
    // A getter or proxy of the thrown value threw; it is no refusal.
    return undefined;
  }
}

function refusalInChain(thrown: unknown): string | undefined {
  let link = thrown;
  for (let depth = 0; depth < 16 && typeof link === 'object' && link !== null; depth += 1) {
    const { code, cause } = link as { code?: unknown; cause?: unknown };
    if (typeof code === 'string' && CERTIFICATE_REFUSALS.has(code)) return code;
    link = cause;
  }
  return undefined;
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
  return failure(statusFailureCode(answer.status), `${operation} answered ${answer.status}${text}`, found);
}

export function statusFailureCode(status: number): FailureCode {
  return STATUS_CODES.get(status) ?? 'internal';
}

// A base without a trailing slash would drop its last path segment.
function withTrailingSlash(base: URL): URL {
  return base.pathname.endsWith('/') ? base : new URL(`${base.pathname}/${base.search}`, base);
}
