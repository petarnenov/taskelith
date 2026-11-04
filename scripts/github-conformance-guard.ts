import { describeThrown } from '@taskelith/integrations';
import { CONFORMANCE_REPOSITORIES } from './github-conformance-settings.ts';

// Every request of the live run, the plugin's included, passes this guard,
// which refuses any repository but the disposable ones before the call.

const ALLOWED = new Set(Object.values(CONFORMANCE_REPOSITORIES).map((name) => name.toLowerCase()));
const OWNER = 'petarnenov';
const API_HOST = 'api.github.com';
const GIT_HOST = 'github.com';
const TOKEN_REQUEST = /^\/app\/installations\/[0-9]+\/access_tokens$/;
// Calls about the installation or its token, which name no repository.
const UNSCOPED = /^\/installation\/(?:repositories|token)$/;

export type GuardVerdict = { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

const ALLOWED_VERDICT: GuardVerdict = Object.freeze({ allowed: true });

export function checkRequest(url: URL, body: unknown): GuardVerdict {
  if (url.protocol !== 'https:' || url.port !== '') return refuse('a non-HTTPS or non-default port URL');
  const segments = url.pathname.split('/').slice(1).map(decodeSegment);
  if (url.hostname === GIT_HOST) return checkRepository(segments[0], segments[1]?.replace(/\.git$/, ''));
  if (url.hostname !== API_HOST) return refuse(`the host ${url.hostname}`);
  if (segments[0] === 'repos') return checkRepository(segments[1], segments[2]);
  if (TOKEN_REQUEST.test(url.pathname)) return checkTokenRequest(body);
  return UNSCOPED.test(url.pathname) ? ALLOWED_VERDICT : refuse(`the API path ${url.pathname}`);
}

// A token request without repositories would cover the whole installation.
function checkTokenRequest(body: unknown): GuardVerdict {
  const request = parseBody(body);
  const repositories = request?.['repositories'];
  if (request === undefined || 'repository_ids' in request || !Array.isArray(repositories) || repositories.length === 0) {
    return refuse('a token request that names no repositories by name');
  }
  const outside = repositories.find((name) => typeof name !== 'string' || !ALLOWED.has(`${OWNER}/${name}`.toLowerCase()));
  return outside === undefined ? ALLOWED_VERDICT : refuse('a token request for another repository');
}

function checkRepository(owner: string | undefined, repo: string | undefined): GuardVerdict {
  const name = `${owner ?? ''}/${repo ?? ''}`;
  return ALLOWED.has(name.toLowerCase()) ? ALLOWED_VERDICT : refuse(`the repository ${name}`);
}

function parseBody(body: unknown): Record<string, unknown> | undefined {
  if (typeof body !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

// A segment that does not decode cannot name an allowed repository.
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return '\u0000';
  }
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

// The guard's own refusals, known by identity, never by a thrown value's text.
const REFUSAL_REASONS = new WeakMap<object, string>();

// Why a run stopped: the guard's reason, or a fixed category, as other
// thrown text may hold a secret.
export function describeStop(thrown: unknown): string {
  return REFUSAL_REASONS.get(thrown as object) ?? `the run stopped on ${describeThrown(thrown)}`;
}

function refuse(subject: string): GuardVerdict {
  return { allowed: false, reason: `the conformance guard refused ${subject}` };
}

// The guarded fetch records each refusal and each minted token, so that
// the run fails on a refusal and its evidence is scanned for the tokens.
export class RequestGuard {
  readonly refusals: string[] = [];
  readonly mintedTokens: string[] = [];

  private readonly inner: typeof fetch;

  constructor(inner: typeof fetch) {
    this.inner = inner;
  }

  readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const verdict = checkRequest(url, init?.body);
    if (!verdict.allowed) this.refuse(verdict.reason);
    // Redirects stay unfollowed, so no hop escapes the check above.
    const response = await this.inner(input, { ...init, redirect: 'manual' });
    if (isRedirect(response.status)) {
      await response.body?.cancel();
      return this.refuse(`the conformance guard refused a redirect from ${url.pathname}`);
    }
    if (TOKEN_REQUEST.test(url.pathname) && response.ok) await this.witnessToken(response.clone());
    return response;
  };

  private refuse(reason: string): never {
    this.refusals.push(reason);
    const refusal = new Error(reason);
    REFUSAL_REASONS.set(refusal, reason);
    throw refusal;
  }

  private async witnessToken(response: Response): Promise<void> {
    const token = parseBody(await response.text())?.['token'];
    if (typeof token === 'string' && token.length > 0) this.mintedTokens.push(token);
  }
}
