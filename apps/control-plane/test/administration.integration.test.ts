import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import pg from 'pg';
import { Administration, adminMain, type AdminIo } from '@taskelith/control-plane';
import { ControlPlaneNamespace } from '@taskelith/control-plane-store';
import { parseIdentifier } from '@taskelith/kernel';
import { createAccount } from '@nats-io/nkeys';
import {
  BrokerAuthority,
  connectSystemAccount,
  connectTransport,
  connectWorkerTransport,
  encodeJson,
  ensureStreams,
  ensureWorkerConsumer,
  JetStreamPublisher,
  NatsBrokerCredentials,
  TRANSPORT_LIMITS,
  TransportAddress,
} from '@taskelith/nats';
import { integrationEndpoint, integrationSecret, value } from '@taskelith/testing';

const POSTGRES = integrationEndpoint('TASKELITH_POSTGRES_URL');
const NATS = integrationEndpoint('TASKELITH_NATS_URL');
const ownerUid = process.getuid!();

async function sql(url: URL, text: string): Promise<void> {
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  try {
    await client.query(text);
  } finally {
    await client.end();
  }
}

// A database and a data root of this file's own; the data root already
// holds the test broker authority that the running server trusts.
const databaseName = `taskelith_admin_${process.pid}`;
await sql(POSTGRES, `CREATE DATABASE ${databaseName}`);
const database = new URL(POSTGRES);
database.pathname = `/${databaseName}`;
const base = mkdtempSync(join(tmpdir(), 'taskelith-admin-'));
const dataRoot = join(base, 'root');
const namespace = value(ControlPlaneNamespace.open({ dataRoot, ownerUid }));
// An account of this file's own on the test server: a published revocation
// list replaces the account's, so files that publish one must not share it.
const authorityKeys = { ...JSON.parse(integrationSecret('authority.json')), accountSeed: new TextDecoder().decode(createAccount().getSeed()) };
value(namespace.create('broker-authority', authorityKeys));
const authority = value(BrokerAuthority.fromKeys(authorityKeys));
const system = value(await connectSystemAccount({ server: NATS, creds: integrationSecret('system.creds') }));
value(await new NatsBrokerCredentials(authority, system.connection).publishRevocations([]));
await system.close();
after(async () => {
  rmSync(base, { recursive: true, force: true });
  await sql(POSTGRES, `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
});

const ENVIRONMENT = { TASKELITH_DATA_DIR: dataRoot, TASKELITH_POSTGRES_URL: database.href, TASKELITH_NATS_URL: NATS.href };

async function admin(argv: string[], extra: Record<string, string> = {}): Promise<{ status: number; output: Record<string, unknown> }> {
  const lines: string[] = [];
  const io: AdminIo = { environment: { ...ENVIRONMENT, ...extra }, platform: process.platform, ownerUid, write: (line) => lines.push(line) };
  const status = await adminMain(argv, io);
  return { status, output: status === 2 ? { usage: lines.join('\n') } : JSON.parse(lines.join('\n')) };
}

function statuses(connection: { status(): AsyncIterable<{ type: string; error?: Error }> }): string[] {
  const seen: string[] = [];
  void (async () => {
    for await (const status of connection.status()) seen.push(status.type === 'error' ? `error:${status.error?.message}` : status.type);
  })();
  return seen;
}

async function waitFor(condition: () => boolean, timeoutMs = 10_000): Promise<void> {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('condition not met');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const ADMIN = ['--actor', 'root@control-plane-1', '--reason', 'integration test'];

test('initialization, enrollment, rotation, revocation, and the operator reset work end to end', { timeout: 120_000 }, async () => {
  const initialized = await admin(['init', ...ADMIN]);
  assert.equal(initialized.status, 0, JSON.stringify(initialized.output));
  const { identity, operatorSecret, brokerServerConfig } = initialized.output as {
    identity: { installationId: string; recoveryEpoch: number }; operatorSecret: string; brokerServerConfig: string;
  };
  assert.equal(identity.recoveryEpoch, 1);
  assert.match(operatorSecret, /^tkop_/);
  assert.equal(brokerServerConfig, join(dataRoot, 'control-plane', 'nats-authority.conf'));
  assert.equal((await admin(['init', ...ADMIN])).output.error !== undefined, true, 'a second initialization fails');

  const refused = await admin(['issue-enrollment-token'], { TASKELITH_OPERATOR_TOKEN: 'tkop_wrong' });
  assert.deepEqual([refused.status, (refused.output.error as { code: string }).code], [1, 'forbidden']);
  const issued = await admin(['issue-enrollment-token', '--platform', 'linux'], { TASKELITH_OPERATOR_TOKEN: operatorSecret });
  assert.equal(issued.status, 0, JSON.stringify(issued.output));
  const token = issued.output.enrollmentToken as string;
  assert.match(token, /^tken_/);

  const administration = value(Administration.open({ dataRoot, ownerUid, postgres: database, nats: NATS }));
  after(() => administration.close());
  const enrollment = value(await administration.enrollmentService());
  after(() => enrollment.close());
  const enrolled = value(await enrollment.service.enroll(token, {
    journalId: value(parseIdentifier('JournalId', 'journal-1')),
    host: { platform: 'linux', architecture: 'x64', hostname: 'build-1' },
    protocolVersions: { minimum: 1, maximum: 1 },
    capacity: { slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, controls: ['cpu-limit'] },
  }));
  assert.equal(enrolled.installationId, identity.installationId);

  const address = value(TransportAddress.of(identity.installationId));
  const creds = authority.user('control-plane', Math.floor(Date.now() / 1000)).creds;
  const controlPlane = value(await connectTransport({ server: NATS, address, creds }));
  after(async () => {
    for (const kind of ['commands', 'observations', 'sdlc', 'quarantine', 'advisories'] as const) {
      await controlPlane.jsm.streams.delete(address.streamName(kind)).catch(() => false);
    }
    await controlPlane.close();
  });
  // The test server keeps JetStream in a small tmpfs.
  value(await ensureStreams(controlPlane.jsm, address, { ...TRANSPORT_LIMITS, streamMaxBytes: 64 * 1024 ** 2 }));
  value(await ensureWorkerConsumer(controlPlane.jsm, address, enrolled.workerId));
  value(await new JetStreamPublisher(controlPlane.js).publish({
    subject: value(address.commandSubject(enrolled.workerId)), body: encodeJson({ hello: 'worker' }), messageId: 'command-1',
  }));
  const worker = value(await connectWorkerTransport({ server: NATS, address, workerId: enrolled.workerId, creds: enrolled.credentials.broker }));
  const seen = statuses(worker.connection);
  after(() => worker.close());
  const received = await (await worker.js.consumers.get(address.streamName('commands'), enrolled.workerId)).next({ expires: 2000 });
  assert.equal(received?.json<{ hello: string }>().hello, 'worker');
  received?.ack();

  const rotated = await admin(['rotate-worker', enrolled.workerId], { TASKELITH_OPERATOR_TOKEN: operatorSecret });
  assert.equal((rotated.output as { credentialGeneration: number }).credentialGeneration, 2);
  assert.equal(value(await enrollment.service.authenticateWorkerBearer(enrolled.credentials.controlPlane)).generation, 1, 'grace window');

  const revoked = await admin(['revoke-worker', enrolled.workerId], { TASKELITH_OPERATOR_TOKEN: operatorSecret });
  assert.deepEqual(revoked.output, { revoked: enrolled.workerId });
  await waitFor(() => seen.includes('error:User Authentication Revoked'));
  assert.equal((await enrollment.service.authenticateWorkerBearer(enrolled.credentials.controlPlane)).ok, false);

  const reset = await admin(['reset-operator-credential', ...ADMIN]);
  const newSecret = (reset.output as { operatorSecret: string }).operatorSecret;
  assert.notEqual(newSecret, operatorSecret);
  assert.equal((await admin(['expire-grace-windows'], { TASKELITH_OPERATOR_TOKEN: operatorSecret })).status, 1);
  assert.deepEqual((await admin(['expire-grace-windows'], { TASKELITH_OPERATOR_TOKEN: newSecret })).output, { expired: 0 });

  const authorityPath = join(dataRoot, 'control-plane', 'broker-authority');
  rmSync(authorityPath);
  const lost = await admin(['init', ...ADMIN]);
  assert.equal((lost.output.error as { code: string }).code, 'precondition-failed', 'no new authority for an existing installation');
  value(namespace.create('broker-authority', authorityKeys));

  await sql(database, 'UPDATE installation SET recovery_epoch = 2');
  const closed = await administration.enrollmentService();
  assert.equal(!closed.ok && closed.error.code, 'precondition-failed', 'a mismatch with the record keeps the installation closed');
});

test('usage errors exit with 2 before anything is opened', async () => {
  for (const argv of [[], ['unknown'], ['rotate-worker'], ['init', 'extra'], ['issue-enrollment-token', '--platform', 'windows'], ['init', '--bogus']]) {
    const outcome = await admin(argv);
    assert.equal(outcome.status, 2, argv.join(' '));
    assert.match(String(outcome.output.usage), /usage: control-plane-admin/);
  }
});

test('a usage error redacts a secret typed by mistake', async () => {
  const secret = `tkop_${'A'.repeat(43)}`;
  const outcome = await admin([secret]);
  assert.equal(outcome.status, 2);
  assert.doesNotMatch(String(outcome.output.usage), new RegExp(secret));
  assert.match(String(outcome.output.usage), /\[redacted\]/);
});

test('an exception becomes a redacted failure with status 1', async () => {
  const lines: string[] = [];
  const environment = { ...ENVIRONMENT, TASKELITH_NATS_CA: join(base, 'missing-ca.pem') };
  const status = await adminMain(['expire-grace-windows'], { environment, platform: process.platform, ownerUid, write: (line) => lines.push(line) });
  assert.equal(status, 1);
  assert.equal(JSON.parse(lines[0]!).error.code, 'internal');
});

test('a missing setting fails with its name only', async () => {
  const lines: string[] = [];
  const status = await adminMain(['init', ...ADMIN], { environment: {}, platform: process.platform, ownerUid, write: (line) => lines.push(line) });
  assert.equal(status, 1);
  assert.match(lines[0]!, /TASKELITH_POSTGRES_URL is not set/);
});
