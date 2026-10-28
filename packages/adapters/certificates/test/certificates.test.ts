import assert from 'node:assert/strict';
import test from 'node:test';
import { X509CertificateIssuer } from '@taskelith/certificates';
import { authorityValidity, CERTIFICATE_ISSUER_CONFORMANCE } from '@taskelith/fleet';
import { parseInstant } from '@taskelith/kernel';
import { failed, NODE_CERTIFICATE_INSPECTOR, value } from '@taskelith/testing';

for (const conformance of CERTIFICATE_ISSUER_CONFORMANCE) {
  test(`x509 certificate issuer: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check({ issuer: new X509CertificateIssuer(), inspector: NODE_CERTIFICATE_INSPECTOR }), []);
  });
}

const NOW = value(parseInstant('2026-10-28T12:00:00.000Z'));
const issuer = new X509CertificateIssuer();
const authority = value(await issuer.createAuthority({ commonName: 'Taskelith test authority', validity: value(authorityValidity(NOW)) }));

test('keys are PKCS#8 PEM', () => {
  assert.match(authority.privateKeyPem, /^-----BEGIN PRIVATE KEY-----\r?\n/);
});

test('an issuance the library refuses fails with internal', async () => {
  const backwards = { notBefore: NOW, notAfter: value(parseInstant('1999-01-01T00:00:00.000Z')) };
  const bad = await issuer.issueServerCertificate(authority, { commonName: 'x', hosts: [{ kind: 'ip', name: 'not-an-ip' }], validity: backwards });
  assert.equal(failed(bad).code, 'internal');
});
