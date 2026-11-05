import type { Page } from '../api/read-pages';
import { isRecord } from '../api/wire-guards';
import type { EnrollmentToken, HostConstraints, IssuedEnrollmentToken } from './workers';
import { isArchitecture, isDisplayText, isIdentifier, isPlatform, isUtcInstant } from './workers-wire';

// The enrollment token bodies, checked against control-plane.openapi.json
// and rebuilt from their documented fields alone; else a wrong answer.

// EnrollmentTokenSecret: the one shape the 201 of issuing or rotating carries.
const SECRET = /^tken_[A-Za-z0-9_-]{43}$/;

// EnrollmentTokenPage lists at most this many tokens.
export const MAX_PAGE_TOKENS = 100;

export function enrollmentTokenPageOf(body: unknown): Page<EnrollmentToken> | undefined {
  if (!isRecord(body) || !Array.isArray(body.tokens) || body.tokens.length > MAX_PAGE_TOKENS) return undefined;
  if (body.next !== undefined && !isIdentifier(body.next)) return undefined;
  const tokens = body.tokens.map(enrollmentTokenOf);
  if (tokens.some((token) => token === undefined)) return undefined;
  const items = tokens as EnrollmentToken[];
  return body.next === undefined ? { items } : { items, next: body.next };
}

export function enrollmentTokenOf(value: unknown): EnrollmentToken | undefined {
  if (!isRecord(value) || !isIdentifier(value.tokenId)) return undefined;
  if (!isUtcInstant(value.issuedAt) || !isUtcInstant(value.expiresAt)) return undefined;
  const constraints = hostConstraintsOf(value.constraints);
  if (constraints === undefined) return undefined;
  return { tokenId: value.tokenId, issuedAt: value.issuedAt, expiresAt: value.expiresAt, constraints };
}

// Each constraint is optional; an absent one accepts any host.
function hostConstraintsOf(value: unknown): HostConstraints | undefined {
  if (!isRecord(value)) return undefined;
  const { platform, architecture, hostname } = value;
  if (platform !== undefined && !isPlatform(platform)) return undefined;
  if (architecture !== undefined && !isArchitecture(architecture)) return undefined;
  if (hostname !== undefined && !isDisplayText(hostname)) return undefined;
  return {
    ...(platform === undefined ? {} : { platform }),
    ...(architecture === undefined ? {} : { architecture }),
    ...(hostname === undefined ? {} : { hostname }),
  };
}

// A body whose secret is not of the documented shape reveals nothing.
export function issuedEnrollmentTokenOf(body: unknown): IssuedEnrollmentToken | undefined {
  if (!isRecord(body) || typeof body.secret !== 'string' || !SECRET.test(body.secret)) return undefined;
  const token = enrollmentTokenOf(body.token);
  return token === undefined ? undefined : { token, secret: body.secret };
}
