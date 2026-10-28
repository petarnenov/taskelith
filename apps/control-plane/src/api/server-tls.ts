import { createPrivateKey, X509Certificate } from 'node:crypto';
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

// A file or setting that failures name instead of its text: a setting such
// as `{variable: ...}` or a file such as `{path: ...}`.
export interface TlsSource {
  readonly name: string;
  readonly details: Readonly<Record<string, string>>;
}

// Where a listener's certificate and key came from, and what fixes them.
export interface TlsOrigin {
  readonly certificate: TlsSource;
  readonly key: TlsSource;
  readonly remedy?: string;
}

// A certificate that parses, matches its key, and has not expired at `now`;
// a failure names the certificate or the key, whichever is at fault.
export function checkServerTls(tls: ServerTls, origin: TlsOrigin, now: Instant): Result<ServerTls> {
  const { certificate: certificateSource, key: keySource } = origin;
  const certificate = parse(() => new X509Certificate(tls.certificate));
  if (certificate === undefined) return refused(origin, certificateSource, `${certificateSource.name} is not a PEM certificate`);
  const key = parse(() => createPrivateKey(tls.key));
  if (key === undefined) return refused(origin, keySource, `${keySource.name} is not a PEM private key`);
  if (!certificate.checkPrivateKey(key)) return refused(origin, keySource, `${keySource.name} does not match ${certificateSource.name}`);
  if (hasExpired(new Date(certificate.validTo), now)) {
    return refused(origin, certificateSource, `the certificate of ${certificateSource.name} expired on ${certificate.validTo}`);
  }
  try {
    createSecureContext({ cert: tls.certificate, key: tls.key, minVersion: MINIMUM_TLS_VERSION });
  } catch {
    return refused(origin, certificateSource, `${certificateSource.name} and ${keySource.name} are not usable for TLS`);
  }
  return ok(tls);
}

// The parsers' errors are dropped: they could quote the key's text.
function parse<T>(parser: () => T): T | undefined {
  try {
    return parser();
  } catch {
    return undefined;
  }
}

function refused(origin: TlsOrigin, source: TlsSource, problem: string): Result<never> {
  const message = origin.remedy === undefined ? problem : `${problem}; ${origin.remedy}`;
  return err(failure('precondition-failed', message, source.details));
}
