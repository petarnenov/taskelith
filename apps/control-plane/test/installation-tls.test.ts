import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:tls';
import { after, test } from 'node:test';
import { X509CertificateIssuer } from '@taskelith/certificates';
import {
  Administration,
  LOCAL_SERVER_HOSTS,
  MINIMUM_TLS_VERSION,
  checkServerTls,
  createApiServer,
  createTlsApiServer,
  ensureInstallationAuthority,
  issueServerCertificates,
  readServerCertificate,
  storedInstallationAuthority,
  type ApiHandlers,
  type ApiServer,
} from '@taskelith/control-plane';
import { ControlPlaneNamespace } from '@taskelith/control-plane-store';
import type { CertificateIssuer } from '@taskelith/fleet';
import { err, failure, parseInstant, type Instant } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';

const ownerUid = process.getuid!();
const base = mkdtempSync(join(tmpdir(), 'taskelith-installation-tls-'));
after(() => rmSync(base, { recursive: true, force: true }));
const NOW = value(parseInstant(new Date().toISOString()));
const issuer = new X509CertificateIssuer();
let roots = 0;

function namespace(): ControlPlaneNamespace {
  return value(ControlPlaneNamespace.open({ dataRoot: join(base, `root-${++roots}`), ownerUid }));
}

// The real issuer, counting its calls, or failing from the given call on.
function countingIssuer(failFrom = Infinity): CertificateIssuer & { calls: number } {
  const counting = {
    calls: 0,
    createAuthority: (request: Parameters<CertificateIssuer['createAuthority']>[0]) => {
      counting.calls += 1;
      return counting.calls >= failFrom ? Promise.resolve(err(failure('internal', 'refused'))) : issuer.createAuthority(request);
    },
    issueServerCertificate: (...request: Parameters<CertificateIssuer['issueServerCertificate']>) => {
      counting.calls += 1;
      return counting.calls >= failFrom ? Promise.resolve(err(failure('internal', 'refused'))) : issuer.issueServerCertificate(...request);
    },
  };
  return counting;
}

test('the authority is created once and kept by a rerun before the installation exists', async () => {
  const store = namespace();
  const counting = countingIssuer();
  const created = value(await ensureInstallationAuthority(store, false, counting, NOW));
  assert.equal(statSync(join(store.directory, 'installation-authority')).mode & 0o777, 0o600);
  const kept = value(await ensureInstallationAuthority(store, false, counting, NOW));
  assert.deepEqual([kept, counting.calls], [created, 1]);
  assert.deepEqual(value(storedInstallationAuthority(store)), created);
});

test('an installed installation without its authority fails closed and makes none', async () => {
  const store = namespace();
  const counting = countingIssuer();
  assert.equal(failed(await ensureInstallationAuthority(store, true, counting, NOW)).code, 'precondition-failed');
  assert.equal(failed(storedInstallationAuthority(store)).code, 'precondition-failed');
  assert.deepEqual([counting.calls, existsSync(join(store.directory, 'installation-authority'))], [0, false]);
});

test('a refused authority writes nothing, and a record with invalid fields is refused', async () => {
  const store = namespace();
  assert.equal(failed(await ensureInstallationAuthority(store, false, countingIssuer(1), NOW)).message, 'refused');
  assert.equal(existsSync(join(store.directory, 'installation-authority')), false);
  value(store.create('installation-authority', { certificate: 1, privateKey: 'x' }));
  assert.equal(failed(await ensureInstallationAuthority(store, false, countingIssuer(), NOW)).code, 'precondition-failed');
});

test('server certificates are written owner-only and read back with their path', async () => {
  const store = namespace();
  const authority = value(await ensureInstallationAuthority(store, false, issuer, NOW));
  const issued = value(await issueServerCertificates(store, authority, issuer, LOCAL_SERVER_HOSTS, NOW));
  assert.equal(issued.apiCertificate, join(store.directory, 'api-certificate.pem'));
  for (const name of ['installation-ca.pem', 'api-certificate.pem', 'api-key.pem', 'nats-certificate.pem', 'nats-key.pem']) {
    assert.equal(statSync(join(store.directory, name)).mode & 0o777, 0o600, name);
  }
  const api = value(readServerCertificate(store, 'api'));
  assert.equal(api.path, issued.apiCertificate);
  value(checkServerTls({ certificate: api.certificatePem, key: api.privateKeyPem }, { name: api.path, details: { path: api.path } }, NOW));
});

test('a missing server file names its path, and a refused issuance stops the writes', async () => {
  const store = namespace();
  const missing = failed(readServerCertificate(store, 'nats'));
  assert.deepEqual([missing.code, missing.details.path], ['precondition-failed', join(store.directory, 'nats-certificate.pem')]);
  const authority = value(await ensureInstallationAuthority(store, false, issuer, NOW));
  assert.equal(failed(await issueServerCertificates(store, authority, countingIssuer(2), LOCAL_SERVER_HOSTS, NOW)).message, 'refused');
  assert.equal(existsSync(join(store.directory, 'nats-key.pem')), false, 'the second server got no files');
  writeFileSync(join(store.directory, 'nats-certificate.pem'), 'x', { mode: 0o600 });
  assert.equal(failed(readServerCertificate(store, 'nats')).details.path, join(store.directory, 'nats-key.pem'));
});

const authority = value(await issuer.createAuthority({ commonName: 'Test authority', validity: { notBefore: NOW, notAfter: later(30) } }));
const leaf = value(await issuer.issueServerCertificate(authority, {
  commonName: 'Test server', hosts: [{ kind: 'ip', name: '127.0.0.1' }], validity: { notBefore: NOW, notAfter: later(1) },
}));
const TLS = { certificate: leaf.certificatePem, key: leaf.privateKeyPem };
const ORIGIN = { name: 'TASKELITH_BROWSER_TLS_CERT', details: { variable: 'TASKELITH_BROWSER_TLS_CERT' } };

function later(days: number): Instant {
  return value(parseInstant(new Date(Date.parse(NOW) + days * 86_400_000).toISOString()));
}

test('a certificate with another key, an unparsable one, or an expired one is refused by name', () => {
  assert.deepEqual(value(checkServerTls(TLS, ORIGIN, NOW)), TLS);
  const refusals = [
    [{ ...TLS, key: authority.privateKeyPem }, NOW, /does not match its key/],
    [{ ...TLS, certificate: 'not a certificate' }, NOW, /is not a PEM certificate/],
    [{ ...TLS, key: 'not a key' }, NOW, /is not a PEM certificate/],
    [TLS, later(2), /expired on/],
  ] as const;
  for (const [tls, now, problem] of refusals) {
    const refused = failed(checkServerTls(tls, ORIGIN, now));
    assert.deepEqual([refused.code, refused.details], ['precondition-failed', ORIGIN.details]);
    assert.match(refused.message, problem);
    assert.doesNotMatch(refused.message, /PRIVATE KEY|not a key/);
  }
});

const handlers: ApiHandlers = {
  authenticateOperator: async () => err(failure('forbidden', 'no operator')),
  authenticateWorker: async () => err(failure('forbidden', 'no worker')),
  handle: async () => err(failure('internal', 'unused')),
};

async function listening(server: ApiServer): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return (server.address() as AddressInfo).port;
}

function handshake(port: number, maxVersion: 'TLSv1.1' | 'TLSv1.3'): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port, ca: authority.certificatePem, minVersion: 'TLSv1', maxVersion }, () => {
      resolve(socket.getProtocol() ?? '');
      socket.end();
    });
    socket.once('error', reject);
  });
}

test('the TLS listener answers over HTTPS from TLS 1.2 and refuses older protocols and plain HTTP', async () => {
  assert.equal(MINIMUM_TLS_VERSION, 'TLSv1.2');
  const port = await listening(createApiServer(handlers, { tls: TLS }));
  assert.equal(await handshake(port, 'TLSv1.3'), 'TLSv1.3');
  await assert.rejects(handshake(port, 'TLSv1.1'));
  await assert.rejects(fetch(`http://127.0.0.1:${port}/runs`));
  const shared = await listening(createTlsApiServer((_request, response) => response.end('shared'), TLS));
  assert.equal(await handshake(shared, 'TLSv1.3'), 'TLSv1.3');
});

test('re-issue needs an initialized installation and touches no database', async () => {
  const dataRoot = join(base, 'uninitialized');
  const admin = value(Administration.open({ dataRoot, ownerUid, postgres: new URL('postgres://127.0.0.1:1/none'), nats: new URL('nats://127.0.0.1:1') }));
  try {
    const refused = failed(await admin.issueInstallationCertificates());
    assert.deepEqual([refused.code, refused.message], ['precondition-failed', 'the installation is not initialized; run init first']);
    assert.equal(failed(admin.serverCertificate('api')).code, 'precondition-failed');
  } finally {
    await admin.close();
  }
});
