import { isRecord } from './wire-guards';

// The outcome of one read of the control plane, as every gateway answers
// it: the value, or the documented failure the status and body name.

export type ReadFailure = 'unauthenticated' | 'denied' | 'not-found' | 'unavailable';

// A 403 names the role it needs, when the control plane says which.
export type ReadFailed =
  | { readonly kind: Exclude<ReadFailure, 'denied'> }
  | { readonly kind: 'denied'; readonly requiredRole?: string };

export type ReadResult<T> = { readonly kind: 'read'; readonly value: T } | ReadFailed;

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

export function failureOf({ status, body }: Answer): ReadFailed {
  if (status === 401) return { kind: failureReason(body) === 'unauthenticated' ? 'unauthenticated' : 'unavailable' };
  if (status === 403) return denialOf(requiredRoleOf(body));
  if (status === 404) return { kind: 'not-found' };
  return { kind: 'unavailable' };
}

export function denialOf(requiredRole: string | undefined): ReadFailed {
  return requiredRole === undefined ? { kind: 'denied' } : { kind: 'denied', requiredRole };
}

export function failureReason(body: unknown): unknown {
  return detailsOf(body)?.reason;
}

export function requiredRoleOf(body: unknown): string | undefined {
  const role = detailsOf(body)?.requiredRole;
  return typeof role === 'string' && role !== '' ? role : undefined;
}

function detailsOf(body: unknown): Record<string, unknown> | undefined {
  return isRecord(body) && isRecord(body.details) ? body.details : undefined;
}

// A network failure or an unreadable body reaches no documented status.
export async function reachable<T>(call: () => Promise<T>): Promise<T | undefined> {
  try {
    return await call();
  } catch {
    return undefined;
  }
}
