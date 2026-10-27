import { createPrivateKey, X509Certificate, type KeyObject } from 'node:crypto';
import { createSecureContext } from 'node:tls';
import { hasExpired } from '@taskelith/fleet';
import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';

// No listener accepts an older protocol (installation contract section 7).
export const MINIMUM_TLS_VERSION = 'TLSv1.2';

// A listener's certificate chain and private key, both in PEM.
export interface ServerTls {
  readonly certificate: string;
  readonly key: string;
}

// Where a certificate came from, named by every failure instead of its text:
// a setting such as `{variable: ...}` or a file such as `{path: ...}`.
export interface TlsOrigin {
  readonly name: string;
  readonly details: Readonly<Record<string, string>>;
}

// A certificate that parses, matches its key, and has not expired at `now`.
export function checkServerTls(tls: ServerTls, origin: TlsOrigin, now: Instant): Result<ServerTls> {
  const parsed = parse(tls);
  if (parsed === undefined) return refused(origin, 'is not a PEM certificate with its private key');
  if (!parsed.certificate.checkPrivateKey(parsed.key)) return refused(origin, 'does not match its key');
  if (hasExpired(new Date(parsed.certificate.validTo), now)) return refused(origin, `expired on ${parsed.certificate.validTo}`);
  try {
    createSecureContext({ cert: tls.certificate, key: tls.key, minVersion: MINIMUM_TLS_VERSION });
  } catch {
    return refused(origin, 'is not usable for TLS');
  }
  return ok(tls);
}

// The parsers' errors are dropped: they could quote the key's text.
function parse(tls: ServerTls): { certificate: X509Certificate; key: KeyObject } | undefined {
  try {
    return { certificate: new X509Certificate(tls.certificate), key: createPrivateKey(tls.key) };
  } catch {
    return undefined;
  }
}

function refused(origin: TlsOrigin, problem: string): Result<never> {
  return err(failure('precondition-failed', `the certificate of ${origin.name} ${problem}`, origin.details));
}
