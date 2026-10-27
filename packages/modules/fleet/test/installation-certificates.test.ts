import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTHORITY_VALIDITY_DAYS,
  SERVER_CERTIFICATE_VALIDITY_DAYS,
  authorityValidity,
  hasExpired,
  serverCertificateValidity,
} from '@taskelith/fleet';
import { parseInstant } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';

const NOW = value(parseInstant('2026-10-28T12:00:00.000Z'));
const DAY = 86_400_000;

test('the authority is valid for ten years from now', () => {
  const validity = value(authorityValidity(NOW));
  assert.equal(validity.notBefore, NOW);
  assert.equal(Date.parse(validity.notAfter) - Date.parse(NOW), AUTHORITY_VALIDITY_DAYS * DAY);
  assert.equal(AUTHORITY_VALIDITY_DAYS, 3650);
});

test('a server certificate is valid for 397 days, from one hour back', () => {
  const validity = value(serverCertificateValidity(NOW));
  assert.equal(validity.notBefore, '2026-10-28T11:00:00.000Z');
  assert.equal(Date.parse(validity.notAfter) - Date.parse(NOW), SERVER_CERTIFICATE_VALIDITY_DAYS * DAY);
  assert.equal(SERVER_CERTIFICATE_VALIDITY_DAYS, 397);
});

test('a validity outside the representable range fails', () => {
  const late = value(parseInstant('9999-01-01T00:00:00.000Z'));
  assert.equal(failed(authorityValidity(late)).code, 'invalid');
});

test('a certificate has expired at its notAfter and later', () => {
  const notAfter = new Date(Date.parse(NOW));
  assert.equal(hasExpired(notAfter, NOW), true);
  assert.equal(hasExpired(new Date(Date.parse(NOW) + 1), NOW), false);
});
