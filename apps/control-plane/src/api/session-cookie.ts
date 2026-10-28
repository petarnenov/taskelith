import { parseCookie, stringifySetCookie } from 'cookie';

// The `browserSession` scheme of the control-plane document.
export const SESSION_COOKIE = '__Host-taskelith-session';

const ATTRIBUTES = { path: '/', secure: true, httpOnly: true, sameSite: 'strict' } as const;

// The session identifier of a Cookie header; a header with two cookies of
// the name names no session, so neither can be planted beside the other.
export function sessionCookie(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const named = header.split(';').filter((pair) => pair.trim().startsWith(`${SESSION_COOKIE}=`));
  if (named.length !== 1) return undefined;
  const value = parseCookie(header)[SESSION_COOKIE];
  return value === undefined || value === '' ? undefined : value;
}

// A browser-session cookie: no Max-Age, as the server-side expiry governs.
export function sessionSetCookie(sessionId: string): string {
  return stringifySetCookie({ name: SESSION_COOKIE, value: sessionId, ...ATTRIBUTES });
}

export function expiredSessionCookie(): string {
  return stringifySetCookie({ name: SESSION_COOKIE, value: '', maxAge: 0, ...ATTRIBUTES });
}
