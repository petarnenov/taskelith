import assert from 'node:assert/strict';
import { createHash, X509Certificate } from 'node:crypto';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { X509CertificateIssuer } from '@taskelith/certificates';
import { authorityValidity, serverCertificateValidity, type IssuedCertificate } from '@taskelith/fleet';
import { parseInstant } from '@taskelith/kernel';
import { failed, trustCertificateAuthority, value } from '@taskelith/testing';
import {
  HttpEnrollmentClient,
  HttpEvidencePublisher,
  HttpInstallationCaSource,
  HttpLaunchAuthorityClient,
} from '@taskelith/worker-control-plane-client';

const NOW = value(parseInstant(new Date().toISOString()));
const issuer = new X509CertificateIssuer();
const TOKEN = `tken_${'P'.repeat(43)}`;
const CREDENTIAL = `tkwk_${'Q'.repeat(43)}`;

async function authority(commonName: string): Promise<IssuedCertificate> {
  return value(await issuer.createAuthority({ commonName, validity: value(authorityValidity(NOW)) }));
}

async function serverCertificate(signer: IssuedCertificate): Promise<IssuedCertificate> {
  const request = { commonName: 'control plane', hosts: [{ kind: 'ip' as const, name: '127.0.0.1' }], validity: value(serverCertificateValidity(NOW)) };
  return value(await issuer.issueServerCertificate(signer, request));
}

interface Seen {
  readonly method: string | undefined;
  readonly path: string | undefined;
  readonly authorization: string | undefined;
}

// A control plane on 127.0.0.1 that answers `body` to every request.
class FakeControlPlane {
  readonly seen: Seen[] = [];
  body: unknown = {};
  status = 200;
  readonly #server: Server;

  constructor(certificate: IssuedCertificate) {
    this.#server = createServer({ cert: certificate.certificatePem, key: certificate.privateKeyPem }, (request, response) => {
      this.seen.push({ method: request.method, path: request.url, authorization: request.headers.authorization });
      request.resume();
      request.on('end', () => response.writeHead(this.status, { 'content-type': 'application/json' }).end(JSON.stringify(this.body)));
    });
  }

  async listen(): Promise<URL> {
    await new Promise<void>((resolve) => this.#server.listen(0, '127.0.0.1', () => resolve()));
    return new URL(`https://127.0.0.1:${(this.#server.address() as AddressInfo).port}/`);
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.#server.close(() => resolve()));
  }
}

let installation: IssuedCertificate;
let foreign: IssuedCertificate;
let pinned: FakeControlPlane;
let impostor: FakeControlPlane;
let pinnedUrl: URL;
let impostorUrl: URL;

before(async () => {
  installation = await authority('Installation authority');
  foreign = await authority('Foreign authority');
  // The foreign CA is trusted by default, as a system root would be.
  trustCertificateAuthority(foreign.certificatePem);
  pinned = new FakeControlPlane(await serverCertificate(installation));
  impostor = new FakeControlPlane(await serverCertificate(foreign));
  pinnedUrl = await pinned.listen();
  impostorUrl = await impostor.listen();
});
after(async () => {
  await pinned.close();
  await impostor.close();
});

const endpoint = (baseUrl: URL) => ({ baseUrl, timeoutMilliseconds: 2000, installationCa: installation.certificatePem });

test('the CA is read over unverified TLS and comes back with the SHA-256 of its DER', async () => {
  pinned.body = { certificate: installation.certificatePem };
  const read = value(await new HttpInstallationCaSource({ baseUrl: pinnedUrl, timeoutMilliseconds: 2000 }).read());
  const der = new X509Certificate(installation.certificatePem).raw;
  assert.deepEqual(read, { certificatePem: installation.certificatePem, sha256: createHash('sha256').update(der).digest('hex') });
  assert.deepEqual(pinned.seen.at(-1), { method: 'GET', path: '/installation/ca', authorization: undefined });
});

test('a CA answer that is not one CA certificate, or a refusal, is no CA', async () => {
  const source = new HttpInstallationCaSource({ baseUrl: pinnedUrl, timeoutMilliseconds: 2000 });
  const server = await serverCertificate(installation);
  const keyed = `${installation.certificatePem}${installation.privateKeyPem}`;
  for (const certificate of [server.certificatePem, keyed, '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n']) {
    pinned.body = { certificate };
    const refused = failed(await source.read());
    assert.deepEqual([refused.code, refused.details.reason], ['precondition-failed', 'installation-ca-mismatch']);
    assert.doesNotMatch(JSON.stringify(refused), /PRIVATE KEY|BEGIN/);
  }
  pinned.status = 503;
  pinned.body = { code: 'unavailable', message: 'down', details: {} };
  assert.equal(failed(await source.read()).code, 'unavailable');
  pinned.status = 200;
});

test('a server the pinned CA issued gets the token; a system-trusted foreign one gets no request', async () => {
  pinned.body = {
    installationId: 'a'.repeat(32), workerId: `w${'b'.repeat(32)}`, credentialGeneration: 1, recoveryEpoch: 1,
    protocolVersions: { minimum: 1, maximum: 1 }, credentials: { controlPlane: CREDENTIAL, broker: 'creds text' },
  };
  impostor.body = pinned.body;
  pinned.status = 201;
  impostor.status = 201;
  const request = {
    journalId: 'c'.repeat(32) as never, host: { platform: 'linux' as const, architecture: 'x64' as const, hostname: 'build-1' },
    protocolVersions: { minimum: 1, maximum: 1 }, capacity: { slots: 1, cpuMillicores: 1000, memoryMebibytes: 1024, controls: [] },
  };
  value(await new HttpEnrollmentClient(endpoint(pinnedUrl)).enroll(TOKEN, request));
  assert.equal(pinned.seen.at(-1)?.authorization, `Bearer ${TOKEN}`);
  const refused = failed(await new HttpEnrollmentClient(endpoint(impostorUrl)).enroll(TOKEN, request));
  assert.equal(refused.code, 'unavailable');
  assert.match(refused.details.cause ?? '', /UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED|unable to verify/i);
  assert.deepEqual(impostor.seen, [], 'the foreign server saw no request and no token');
  pinned.status = 200;
  impostor.status = 200;
});

test('the launch authority and the evidence publisher refuse a system-trusted foreign server', async () => {
  const launch = new HttpLaunchAuthorityClient({ ...endpoint(impostorUrl), credential: CREDENTIAL });
  assert.equal(failed(await launch.authorize({} as never)).code, 'unavailable');
  const evidence = new HttpEvidencePublisher({ ...endpoint(impostorUrl), credential: CREDENTIAL });
  assert.equal(failed(await evidence.publish({} as never, new Uint8Array([1]))).code, 'unavailable');
  assert.deepEqual(impostor.seen, []);
});
