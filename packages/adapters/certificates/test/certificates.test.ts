import assert from 'node:assert/strict';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import test from 'node:test';
import { X509CertificateIssuer } from '@taskelith/certificates';
import { authorityValidity, serverCertificateValidity, type IssuedCertificate } from '@taskelith/fleet';
import { parseInstant } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';

const NOW = value(parseInstant('2026-10-28T12:00:00.000Z'));
const issuer = new X509CertificateIssuer();
const authority = value(await issuer.createAuthority({ commonName: 'Taskelith test authority', validity: value(authorityValidity(NOW)) }));
const hosts = [{ kind: 'dns', name: 'control-plane' }, { kind: 'ip', name: '127.0.0.1' }, { kind: 'ip', name: '::1' }] as const;
const server = value(await issuer.issueServerCertificate(authority, {
  commonName: 'Taskelith API', hosts, validity: value(serverCertificateValidity(NOW)),
}));

test('the authority is a self-signed CA certificate with its PKCS#8 key', () => {
  const certificate = new X509Certificate(authority.certificatePem);
  assert.equal(certificate.ca, true);
  assert.equal(certificate.subject, 'CN=Taskelith test authority');
  assert.equal(certificate.verify(certificate.publicKey), true);
  assert.equal(certificate.checkPrivateKey(createPrivateKey(authority.privateKeyPem)), true);
  assert.match(authority.privateKeyPem, /^-----BEGIN PRIVATE KEY-----\r?\n/);
  assert.equal(new Date(certificate.validTo).toISOString().slice(0, 10), '2036-10-25');
});

test('a server certificate is signed by the authority for its hosts only', () => {
  const certificate = new X509Certificate(server.certificatePem);
  const ca = new X509Certificate(authority.certificatePem);
  assert.equal(certificate.ca, false);
  assert.equal(certificate.checkIssued(ca), true);
  assert.equal(certificate.verify(ca.publicKey), true);
  assert.equal(certificate.checkPrivateKey(createPrivateKey(server.privateKeyPem)), true);
  assert.equal(certificate.checkHost('control-plane'), 'control-plane');
  assert.equal(certificate.checkIP('127.0.0.1'), '127.0.0.1');
  assert.equal(certificate.checkIP('::1'), '::1');
  assert.equal(certificate.checkHost('other.example'), undefined);
  assert.deepEqual(certificate.keyUsage, ['1.3.6.1.5.5.7.3.1']);
  assert.equal(new Date(certificate.validFrom).toISOString(), '2026-10-28T11:00:00.000Z');
  assert.notEqual(certificate.serialNumber, new X509Certificate(authority.certificatePem).serialNumber);
});

test('an unreadable authority fails without quoting its key', async () => {
  const broken: IssuedCertificate = { certificatePem: authority.certificatePem, privateKeyPem: 'not a key' };
  const failure = failed(await issuer.issueServerCertificate(broken, { commonName: 'x', hosts, validity: value(serverCertificateValidity(NOW)) }));
  assert.equal(failure.code, 'precondition-failed');
  assert.doesNotMatch(failure.message, /not a key/);
});

test('a server certificate needs a host', async () => {
  const failure = failed(await issuer.issueServerCertificate(authority, { commonName: 'x', hosts: [], validity: value(serverCertificateValidity(NOW)) }));
  assert.equal(failure.code, 'invalid');
});

test('an issuance the library refuses fails with internal', async () => {
  const backwards = { notBefore: NOW, notAfter: value(parseInstant('1999-01-01T00:00:00.000Z')) };
  const bad = await issuer.issueServerCertificate(authority, { commonName: 'x', hosts: [{ kind: 'ip', name: 'not-an-ip' }], validity: backwards });
  assert.equal(failed(bad).code, 'internal');
});
