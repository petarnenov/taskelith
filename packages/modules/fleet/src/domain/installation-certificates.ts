import { err, failure, instantFromEpochMilliseconds, ok, type Instant, type Result } from '@taskelith/kernel';

export interface CertificateValidity {
  readonly notBefore: Instant;
  readonly notAfter: Instant;
}

const DAY_MILLISECONDS = 86_400_000;
// Provisional periods (installation contract section 7); rollover is G6's.
export const AUTHORITY_VALIDITY_DAYS = 3650;
export const SERVER_CERTIFICATE_VALIDITY_DAYS = 397;
// A client clock slightly behind still accepts a new server certificate.
export const SERVER_CERTIFICATE_BACKDATE_MILLISECONDS = 3_600_000;

export function authorityValidity(now: Instant): Result<CertificateValidity> {
  return validity(now, 0, AUTHORITY_VALIDITY_DAYS);
}

export function serverCertificateValidity(now: Instant): Result<CertificateValidity> {
  return validity(now, SERVER_CERTIFICATE_BACKDATE_MILLISECONDS, SERVER_CERTIFICATE_VALIDITY_DAYS);
}

// Whether a certificate valid until `notAfter` has expired at `now`.
export function hasExpired(notAfter: Date, now: Instant): boolean {
  return notAfter.getTime() <= Date.parse(now);
}

// The period runs `days` from its start, which is `backdate` before `now`.
function validity(now: Instant, backdate: number, days: number): Result<CertificateValidity> {
  const start = Date.parse(now) - backdate;
  const notBefore = instantFromEpochMilliseconds(start);
  const notAfter = instantFromEpochMilliseconds(start + days * DAY_MILLISECONDS);
  if (!notBefore.ok || !notAfter.ok) return err(failure('invalid', 'the certificate validity is outside the representable time range'));
  return ok({ notBefore: notBefore.value, notAfter: notAfter.value });
}
