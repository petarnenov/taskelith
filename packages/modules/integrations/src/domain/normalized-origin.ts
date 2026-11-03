import { err, failure, ok, type Result } from '@taskelith/kernel';

// Wire contracts section 4.1: `https://`, a lower-case host name, and an
// explicit port; origins are compared only in this form.
export type NormalizedOrigin = string & { readonly __brand: 'NormalizedOrigin' };

export const MAX_ORIGIN_LENGTH = 300;
const DEFAULT_HTTPS_PORT = 443;
const MAX_PORT = 65535;
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
// No IPv6 literal, user information, path, query, or fragment.
const ORIGIN = new RegExp(`^https://(${LABEL}(?:\\.${LABEL})*)(?::([1-9][0-9]{0,4}))?$`);

// Fails with `invalid` naming the field, never quoting the origin.
export function normalizeOrigin(origin: string, field = 'allowedOrigin'): Result<NormalizedOrigin> {
  const match = origin.length <= MAX_ORIGIN_LENGTH ? ORIGIN.exec(origin.toLowerCase()) : null;
  const port = match === null ? undefined : Number(match[2] ?? DEFAULT_HTTPS_PORT);
  if (match === null || port === undefined || port > MAX_PORT) return err(notAnOrigin(field));
  const normalized = `https://${match[1]!}:${port}`;
  return normalized.length <= MAX_ORIGIN_LENGTH ? ok(normalized as NormalizedOrigin) : err(notAnOrigin(field));
}

function notAnOrigin(field: string) {
  return failure('invalid', `${field} must be an https origin with a host name and an optional port`, { field });
}
