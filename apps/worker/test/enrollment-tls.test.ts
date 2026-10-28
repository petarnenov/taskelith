import assert from 'node:assert/strict';
import { createHook } from 'node:async_hooks';
import { createHash, X509Certificate } from 'node:crypto';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import { createServer as createTcpServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TLSSocket } from 'node:tls';
import { after, afterEach, before, test } from 'node:test';
import { createUser } from '@nats-io/nkeys';
import { X509CertificateIssuer } from '@taskelith/certificates';
import { authorityValidity, serverCertificateValidity, stubAdmissionCheck, type IssuedCertificate } from '@taskelith/fleet';
import { err, failure, ok, parseInstant } from '@taskelith/kernel';
import { connectWorkerTransport, credsFile, TransportAddress, type WorkerTransportEndpoint } from '@taskelith/nats';
import { trustCertificateAuthority, value } from '@taskelith/testing';
import { productionDependencies, workerMain, type RunningWorker, type WorkerSettings } from '@taskelith/worker';
import { workerPaths } from '@taskelith/worker-journal';

// The real HTTP adapters of the worker against local HTTPS control planes;
// the broker is a stand-in that records the endpoint and refuses it.
const NOW = value(parseInstant(new Date().toISOString()));
const issuer = new X509CertificateIssuer();
const TOKEN = `tken_${'E'.repeat(43)}`;
const ENROLLMENT = {
  installationId: 'a'.repeat(32), workerId: `w${'b'.repeat(32)}`, credentialGeneration: 1, recoveryEpoch: 1,
  protocolVersions: { minimum: 1, maximum: 1 }, credentials: { controlPlane: `tkwk_${'C'.repeat(43)}`, broker: 'creds text' },
};
const LISTENING = new Set(['TCPSERVERWRAP', 'PIPESERVERWRAP', 'UDPWRAP']);

async function authority(commonName: string): Promise<IssuedCertificate> {
  return value(await issuer.createAuthority({ commonName, validity: value(authorityValidity(NOW)) }));
}

async function serverCertificate(signer: IssuedCertificate): Promise<IssuedCertificate> {
  const request = { commonName: 'control plane', hosts: [{ kind: 'ip' as const, name: '127.0.0.1' }], validity: value(serverCertificateValidity(NOW)) };
  return value(await issuer.issueServerCertificate(signer, request));
}

function sha256(certificatePem: string): string {
  return createHash('sha256').update(new X509Certificate(certificatePem).raw).digest('hex');
}

// A control plane that serves `ca` as the installation CA, presents the
// certificate it was made with, and enrolls every token it receives.
class FakeControlPlane {
  readonly tokens: string[] = [];
  readonly #server: Server;

  constructor(certificate: IssuedCertificate, ca: string) {
    this.#server = createServer({ cert: certificate.certificatePem, key: certificate.privateKeyPem }, (request, response) => {
      const authorization = request.headers.authorization;
      if (authorization !== undefined) this.tokens.push(authorization.replace(/^Bearer /, ''));
      request.resume();
      request.on('end', () => {
        const caRead = request.method === 'GET' && request.url === '/installation/ca';
        response.writeHead(caRead ? 200 : 201, { 'content-type': 'application/json' }).end(JSON.stringify(caRead ? { certificate: ca } : ENROLLMENT));
      });
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
let genuine: FakeControlPlane;
let impostor: FakeControlPlane;
let genuineUrl: URL;
let impostorUrl: URL;
let base: string;
const endpoints: WorkerTransportEndpoint[] = [];
const running: RunningWorker[] = [];

before(async () => {
  installation = await authority('Installation authority');
  foreign = await authority('Foreign authority');
  // Both CAs are in the default trust, as system roots or
  // NODE_EXTRA_CA_CERTS would put them; only the pin may decide.
  trustCertificateAuthority(installation.certificatePem);
  trustCertificateAuthority(foreign.certificatePem);
  genuine = new FakeControlPlane(await serverCertificate(installation), installation.certificatePem);
  // It mirrors the public installation CA, but its own certificate is the
  // foreign CA's.
  impostor = new FakeControlPlane(await serverCertificate(foreign), installation.certificatePem);
  genuineUrl = await genuine.listen();
  impostorUrl = await impostor.listen();
});
after(async () => {
  await genuine.close();
  await impostor.close();
});
afterEach(async () => {
  for (const worker of running.splice(0)) await worker.stop();
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  endpoints.length = 0;
  genuine.tokens.length = 0;
  impostor.tokens.length = 0;
});

function environment(controlPlane: URL, fingerprint: string): Record<string, string> {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'taskelith-enrollment-tls-')));
  return {
    TASKELITH_DATA_DIR: join(base, 'data'), TASKELITH_CONTROL_PLANE_URL: controlPlane.href, TASKELITH_NATS_URL: 'nats://127.0.0.1:1',
    TASKELITH_ENROLLMENT_TOKEN: TOKEN, TASKELITH_INSTALLATION_CA_SHA256: fingerprint,
  };
}

// The production composition, with a test volume, ample space, and a
// broker that refuses, so the worker runs offline after its start.
function dependencies(settings: WorkerSettings) {
  const { launching: _launching, ...production } = productionDependencies(settings);
  return {
    ...production, admissionChecks: [stubAdmissionCheck()],
    probe: () => ok({ platform: 'darwin' as const, filesystem: 'apfs', local: true }),
    space: () => ok({ availableBytes: 2 ** 40, totalBytes: 2 ** 41 }),
    daemon: { residentBytes: () => ok(0), eventLoopLagMilliseconds: () => ok(0), watch: async () => undefined },
    connect: async (endpoint: WorkerTransportEndpoint) => {
      endpoints.push(endpoint);
      return err(failure('unavailable', 'no broker in this test'));
    },
  };
}

async function start(env: Record<string, string>): Promise<{ worker: RunningWorker | undefined; lines: string[] }> {
  const lines: string[] = [];
  const worker = await workerMain(env, (line) => lines.push(line), dependencies);
  if (worker !== undefined) running.push(worker);
  return { worker, lines };
}

// Every listening handle created while `run` lasts, unreferenced ones too,
// which `process.getActiveResourcesInfo` does not list.
async function listenersCreatedDuring(run: () => Promise<void>): Promise<string[]> {
  const created: string[] = [];
  const hook = createHook({ init: (_id, type) => { if (LISTENING.has(type)) created.push(type); } });
  hook.enable();
  try {
    await run();
  } finally {
    hook.disable();
  }
  return created;
}

test('a CA with another fingerprint aborts the start before the token is sent', async () => {
  const env = environment(genuineUrl, sha256(foreign.certificatePem));
  const { worker, lines } = await start(env);
  assert.equal(worker, undefined);
  assert.equal(JSON.parse(lines[0] ?? '{}').error.details.reason, 'installation-ca-mismatch');
  assert.deepEqual(genuine.tokens, [], 'no request carried the token');
  assert.equal(existsSync(workerPaths(env.TASKELITH_DATA_DIR!).worker), false);
});

test('a system-trusted certificate that the installation CA did not issue gets no token', async () => {
  const { worker, lines } = await start(environment(impostorUrl, sha256(installation.certificatePem)));
  assert.equal(worker, undefined);
  const { code, details } = JSON.parse(lines[0] ?? '{}').error;
  assert.deepEqual([code, details.reason], ['precondition-failed', 'installation-ca-untrusted']);
  assert.deepEqual(impostor.tokens, [], 'the foreign server got no token');
});

test('a worker enrolls over pinned TLS, pins the broker too, and listens on nothing', async () => {
  const listeners = await listenersCreatedDuring(async () => {
    const { worker, lines } = await start(environment(genuineUrl, sha256(installation.certificatePem).toUpperCase()));
    assert.ok(worker, lines.join('\n'));
    for (let wait = 0; endpoints.length === 0 && wait < 100; wait += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  });
  assert.deepEqual(genuine.tokens, [TOKEN]);
  assert.deepEqual(endpoints[0]?.tls, { ca: installation.certificatePem }, 'the pinned CA is the broker TLS\'s only CA');
  assert.equal(endpoints[0]?.creds, ENROLLMENT.credentials.broker, 'the broker credential, not a client certificate');
  assert.deepEqual(listeners, [], 'the worker opened no listening socket');
});

// A broker that asks for TLS in its INFO, then presents the foreign CA's
// certificate and records each handshake and decrypted byte.
test('NODE_TLS_REJECT_UNAUTHORIZED=0 does not let a foreign broker get the credential', async (t) => {
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  t.after(() => {
    if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
  });
  const certificate = await serverCertificate(foreign);
  const received: Buffer[] = [];
  let handshakes = 0;
  const broker = createTcpServer((socket) => {
    socket.write(`INFO ${JSON.stringify({ server_id: 'foreign', version: '2.15.1', proto: 1, max_payload: 1048576, tls_required: true })}\r\n`);
    const secure = new TLSSocket(socket, { isServer: true, cert: certificate.certificatePem, key: certificate.privateKeyPem });
    secure.on('secure', () => { handshakes += 1; });
    secure.on('data', (chunk: Buffer) => received.push(chunk));
    secure.on('error', () => undefined);
  });
  await new Promise<void>((resolve) => broker.listen(0, '127.0.0.1', () => resolve()));
  t.after(() => new Promise((resolve) => broker.close(resolve)));
  const connected = await connectWorkerTransport({
    server: new URL(`nats://127.0.0.1:${(broker.address() as AddressInfo).port}`), creds: credsFile('header.claims.signature', createUser().getSeed()),
    address: value(TransportAddress.of(ENROLLMENT.installationId)), workerId: ENROLLMENT.workerId,
    tls: { ca: installation.certificatePem },
  });
  assert.equal(connected.ok, false);
  assert.equal(handshakes, 0, 'the client refused the foreign certificate');
  assert.deepEqual(received, [], 'no CONNECT, and so no credential, reached the foreign broker');
});
