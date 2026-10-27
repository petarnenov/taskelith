import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createTcpServer, type AddressInfo, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { createSecureContext, createServer as createTlsServer, TLSSocket } from 'node:tls';
import { X509CertificateIssuer } from '@taskelith/certificates';
import { authorityValidity, serverCertificateValidity, type IssuedCertificate } from '@taskelith/fleet';
import { parseInstant } from '@taskelith/kernel';
import { value } from '@taskelith/testing';
import { parseEndpoint, reissueProblems } from '../scripts/installation-tls-probe.ts';

const NOW = value(parseInstant(new Date().toISOString()));
const issuer = new X509CertificateIssuer();
const authority = value(await issuer.createAuthority({ commonName: 'Probe authority', validity: value(authorityValidity(NOW)) }));
const leaf = async () => value(await issuer.issueServerCertificate(authority, {
  commonName: 'Probe server', hosts: [{ kind: 'dns', name: 'localhost' }, { kind: 'ip', name: '127.0.0.1' }], validity: value(serverCertificateValidity(NOW)),
}));
const [api, nats, stale] = [await leaf(), await leaf(), await leaf()];
const directory = mkdtempSync(join(tmpdir(), 'taskelith-tls-probe-'));
after(() => rmSync(directory, { recursive: true, force: true }));

async function listening(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return `127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function tlsServer(presented: IssuedCertificate): Server {
  return createTlsServer({ cert: presented.certificatePem, key: presented.privateKeyPem }, (socket) => socket.end());
}

// A NATS stand-in: an INFO line in plain text, then TLS on the same socket.
function natsServer(presented: IssuedCertificate): Server {
  const secureContext = createSecureContext({ cert: presented.certificatePem, key: presented.privateKeyPem });
  return createTcpServer((socket) => {
    socket.write('INFO {"tls_required":true}\r\n');
    const secure = new TLSSocket(socket, { isServer: true, secureContext });
    secure.on('error', () => socket.destroy());
  });
}

writeFileSync(join(directory, 'installation-ca.pem'), authority.certificatePem);
writeFileSync(join(directory, 'api-certificate.pem'), api.certificatePem);
writeFileSync(join(directory, 'nats-certificate.pem'), nats.certificatePem);

test('servers that present the issued certificates pass the probe', async () => {
  const problems = await reissueProblems(parseEndpoint(await listening(tlsServer(api))), parseEndpoint(await listening(natsServer(nats))), directory);
  assert.deepEqual(problems, []);
});

test('servers that still present older certificates fail the probe by name', async () => {
  const problems = await reissueProblems(parseEndpoint(await listening(tlsServer(stale))), parseEndpoint(await listening(natsServer(stale))), directory);
  assert.deepEqual(problems, ['API presents another certificate than api-certificate.pem', 'NATS presents another certificate than nats-certificate.pem']);
});

test('an address without a port is refused', () => {
  assert.deepEqual(parseEndpoint('[::1]:4222'), { host: '::1', port: 4222 });
  assert.throws(() => parseEndpoint('localhost'), /not a host and port/);
});
