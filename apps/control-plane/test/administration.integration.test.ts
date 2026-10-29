import assert from 'node:assert/strict';
import { createHash, X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import pg from 'pg';
import { Administration, adminMain, repairCommandConsumers, type AdminIo } from '@taskelith/control-plane';
import { ControlPlaneNamespace } from '@taskelith/control-plane-store';
import type { WorkerId } from '@taskelith/execution';
import type { EnrollmentService } from '@taskelith/fleet';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import { createAccount } from '@nats-io/nkeys';
import {
  BrokerAuthority,
  connectSystemAccount,
  connectTransport,
  connectWorkerTransport,
  encodeJson,
  ensureStreams,
  JetStreamPublisher,
  NatsBrokerCredentials,
  NatsCommandConsumers,
  TRANSPORT_LIMITS,
  TransportAddress,
} from '@taskelith/nats';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { CommittingFleetRegistry, PostgresDatabase } from '@taskelith/postgres';
import { integrationEndpoint, integrationSecret, integrationSecretPath, value } from '@taskelith/testing';
import { createLaunchRun, launchAuthority, placedTask } from './launch-fixtures.ts';

const POSTGRES = integrationEndpoint('TASKELITH_POSTGRES_URL');
const NATS = integrationEndpoint('TASKELITH_NATS_URL');
const ownerUid = process.getuid!();

async function rows(url: URL, text: string): Promise<unknown[]> {
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  try {
    return (await client.query(text)).rows;
  } finally {
    await client.end();
  }
}

async function sql(url: URL, text: string): Promise<void> {
  await rows(url, text);
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

// The test broker's certificate is issued by the test CA, not by the
// installation's authority, so the broker CA is configured.
const ENVIRONMENT = {
  TASKELITH_DATA_DIR: dataRoot, TASKELITH_POSTGRES_URL: database.href, TASKELITH_NATS_URL: NATS.href,
  TASKELITH_NATS_CA: integrationSecretPath('ca.pem'),
};

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
  const { identity, operatorSecret, brokerServerConfig, installationCa } = initialized.output as {
    identity: { installationId: string; recoveryEpoch: number }; operatorSecret: string; brokerServerConfig: string; installationCa: string;
  };
  assert.equal(identity.recoveryEpoch, 1);
  assert.match(operatorSecret, /^tkop_/);
  assert.equal(brokerServerConfig, join(dataRoot, 'control-plane', 'nats-authority.conf'));
  assert.equal(installationCa, join(dataRoot, 'control-plane', 'installation-ca.pem'));
  for (const name of ['installation-authority', 'installation-ca.pem', 'api-certificate.pem', 'api-key.pem', 'nats-certificate.pem', 'nats-key.pem', 'session-input-digest.key']) {
    assert.equal(statSync(join(dataRoot, 'control-plane', name)).mode & 0o777, 0o600, name);
  }
  assert.equal(new X509Certificate(controlPlaneFile('api-certificate.pem')).checkHost('localhost'), 'localhost');
  const digestKey = controlPlaneFile('session-input-digest.key');
  assert.ok(!JSON.stringify(initialized.output).includes(JSON.parse(digestKey).key), 'the output holds no key');
  const again = await admin(['init', ...ADMIN]);
  assert.equal((again.output.error as { code: string }).code, 'conflict', 'a second initialization fails');
  assert.equal(controlPlaneFile('session-input-digest.key'), digestKey, 'a rerun keeps the key');
  rmSync(join(dataRoot, 'control-plane', 'session-input-digest.key'));
  assert.equal((await admin(['init', ...ADMIN])).status, 1, 'a third initialization fails too');
  assert.equal(statSync(join(dataRoot, 'control-plane', 'session-input-digest.key')).mode & 0o777, 0o600, 'a rerun creates a missing key');
  const ownerTrail = await rows(database, 'SELECT * FROM access_audit_events ORDER BY position') as Array<Record<string, unknown>>;
  assert.deepEqual(ownerTrail.map((event) => [event.kind, event.actor]), [
    ['access.owner-created', 'root@control-plane-1'], ['access.owner-bootstrap-refused', 'root@control-plane-1'],
    ['access.owner-bootstrap-refused', 'root@control-plane-1'],
  ]);
  assert.equal(ownerTrail[1]?.principal_id, ownerTrail[0]?.principal_id);
  assert.doesNotMatch(JSON.stringify(ownerTrail), new RegExp(operatorSecret), 'the refusal names no secret');

  const refused = await admin(['issue-enrollment-token'], { TASKELITH_OPERATOR_TOKEN: 'tkop_wrong' });
  assert.deepEqual([refused.status, (refused.output.error as { code: string }).code], [1, 'forbidden']);
  const issued = await admin(['issue-enrollment-token', '--platform', 'linux'], { TASKELITH_OPERATOR_TOKEN: operatorSecret });
  assert.equal(issued.status, 0, JSON.stringify(issued.output));
  const token = issued.output.enrollmentToken as string;
  assert.match(token, /^tken_/);
  const caDer = new X509Certificate(readFileSync(installationCa, 'utf8')).raw;
  assert.equal(issued.output.installationCaSha256, createHash('sha256').update(caDer).digest('hex'));
  renameSync(installationCa, `${installationCa}.moved`);
  const withoutCa = await admin(['issue-enrollment-token'], { TASKELITH_OPERATOR_TOKEN: operatorSecret });
  const strangerWithoutCa = await admin(['issue-enrollment-token'], { TASKELITH_OPERATOR_TOKEN: 'tkop_wrong' });
  renameSync(`${installationCa}.moved`, installationCa);
  assert.equal((strangerWithoutCa.output.error as { code: string }).code, 'forbidden', 'authorization comes before the CA');
  const missing = withoutCa.output.error as { code: string; details: { path?: string } };
  assert.deepEqual([withoutCa.status, missing.code, withoutCa.output.enrollmentToken], [1, 'precondition-failed', undefined]);
  assert.equal(missing.details.path, installationCa);

  const administration = value(Administration.open({ dataRoot, ownerUid, postgres: database, nats: NATS }));
  after(() => administration.close());
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
  const enrollment = value(await administration.enrollmentService(new NatsCommandConsumers(controlPlane.jsm, address)));
  after(() => enrollment.close());
  const enrolled = value(await enrollment.service.enroll(token, {
    journalId: value(parseIdentifier('JournalId', 'journal-1')),
    host: { platform: 'linux', architecture: 'x64', hostname: 'build-1' },
    protocolVersions: { minimum: 1, maximum: 1 },
    capacity: { slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, controls: ['cpu-limit'] },
  }));
  assert.equal(enrolled.installationId, identity.installationId);
  const hiddenView = await admin(['worker-admission'], { TASKELITH_OPERATOR_TOKEN: 'tkop_wrong' });
  assert.deepEqual([hiddenView.status, (hiddenView.output.error as { code: string }).code], [1, 'forbidden']);
  const view = await admin(['worker-admission'], { TASKELITH_OPERATOR_TOKEN: operatorSecret });
  assert.equal(view.status, 0, JSON.stringify(view.output));
  const viewed = view.output.workers as ReadonlyArray<{ workerId: string; admission: string; results: unknown[] }>;
  assert.deepEqual(viewed.map(({ workerId, admission, results }) => [workerId, admission, results]), [
    [enrolled.workerId, 'awaiting-self-check', []],
  ]);
  value(await new JetStreamPublisher(controlPlane.js).publish({
    subject: value(address.commandSubject(enrolled.workerId)), body: encodeJson({ hello: 'worker' }), messageId: 'command-1',
  }));
  const worker = value(await connectWorkerTransport({ server: NATS, address, workerId: enrolled.workerId, creds: enrolled.credentials.broker }));
  const seen = statuses(worker.connection);
  after(() => worker.close());
  const received = await (await worker.js.consumers.get(address.streamName('commands'), enrolled.workerId)).next({ expires: 2000 });
  assert.equal(received?.json<{ hello: string }>().hello, 'worker');
  received?.ack();

  const unexplained = await admin(['rotate-worker', enrolled.workerId], { TASKELITH_OPERATOR_TOKEN: operatorSecret });
  assert.deepEqual([unexplained.status, (unexplained.output.error as { code: string }).code], [1, 'invalid'], 'actor and reason');
  const rotation = ['rotate-worker', enrolled.workerId, '--actor', 'ops', '--reason', 'scheduled'];
  const rotated = await admin(rotation, { TASKELITH_OPERATOR_TOKEN: operatorSecret });
  assert.deepEqual(Object.keys(rotated.output).sort(), ['credentialGeneration', 'deadline', 'workerId'], 'no secret is printed');
  assert.equal((rotated.output as { credentialGeneration: number }).credentialGeneration, 2);
  assert.deepEqual((await admin(rotation, { TASKELITH_OPERATOR_TOKEN: operatorSecret })).output, rotated.output, 'an open request');
  assert.equal(value(await enrollment.service.authenticateWorkerBearer(enrolled.credentials.controlPlane)).generation, 1, 'N stays valid');
  const notices = await rows(database, "SELECT message::jsonb->>'subject' AS subject FROM outbox WHERE event_type = 'worker.credentials.rotation-requested'");
  const subject = `workers.${enrolled.workerId}.commands`;
  assert.deepEqual(notices, [{ subject }, { subject }], 'each request sends the notice');
  const audited = await rows(database, "SELECT subject, kind, actor, reason, generation FROM audit_events WHERE kind LIKE 'worker-credential.%'");
  assert.deepEqual(audited, [{ subject: enrolled.workerId, kind: 'worker-credential.rotation-requested', actor: 'ops', reason: 'scheduled', generation: 2 }]);

  // A grant before the revocation, which the administration must invalidate.
  const store = new PostgresDatabase(database);
  after(() => store.close());
  await sql(database, "UPDATE workers SET reachable = true, worker_admission = 'admitted'");
  await createLaunchRun(store);
  const { taskId, request } = await placedTask(store, 'task-1', enrolled.workerId);
  const granted = value(await launchAuthority(store).authorize({ workerId: enrolled.workerId, generation: 1 }, request));
  assert.equal(granted.kind, 'granted');

  const revoked = await admin(['revoke-worker', enrolled.workerId], { TASKELITH_OPERATOR_TOKEN: operatorSecret });
  assert.deepEqual(revoked.output, { revoked: enrolled.workerId });
  const commands = address.streamName('commands');
  const consumerExists = (workerId: string) => controlPlane.jsm.consumers.info(commands, workerId).then(() => true, () => false);
  assert.equal(await consumerExists(enrolled.workerId), false, 'the revocation removes the command consumer');
  const consumers = new NatsCommandConsumers(controlPlane.jsm, address);
  value(await consumers.remove(enrolled.workerId));

  // A removal the broker refuses leaves a committed revocation and a
  // consumer that the next start removes; an active worker keeps its own.
  const refusing = value(await administration.enrollmentService({
    ensure: (workerId) => consumers.ensure(workerId), remove: async () => err(failure('unavailable', 'the broker is down')),
  }));
  after(() => refusing.close());
  const unremoved = await enrollWorker(refusing.service, 'journal-2');
  const active = await enrollWorker(refusing.service, 'journal-3');
  assert.deepEqual(value(await refusing.service.revoke(unremoved)), { commandConsumerRemoved: false });
  const fleet = new CommittingFleetRegistry(store);
  assert.deepEqual(value(await fleet.recentlyRevokedWorkerIds(10)), [unremoved, enrolled.workerId], 'committed latest first');
  assert.equal(await consumerExists(unremoved), true);
  const sink = new InMemoryLogSink();
  await repairCommandConsumers(fleet, consumers, new Logger(sink, { now: () => new Date().toISOString() as never }));
  assert.deepEqual([await consumerExists(unremoved), await consumerExists(active)], [false, true]);
  assert.deepEqual(sink.records.at(-1)?.fields, { workers: 2, failed: 0 });
  assert.deepEqual(value(await store.transaction((tx) => tx.launches.liveGrants({ kind: 'all' }))), [], 'the grant is revoked');
  const launched = value(await store.transaction((tx) => tx.tasks.get(taskId)));
  assert.equal(launched.attempts[0]!.executions[0]!.evidence[0]?.kind, 'uncertain');
  const cancellations = await rows(database, `SELECT 1 FROM outbox WHERE event_type = 'execution.cancellation.request'`);
  assert.equal(cancellations.length, 1);
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
  const closed = await administration.enrollmentService(new NatsCommandConsumers(controlPlane.jsm, address));
  assert.equal(!closed.ok && closed.error.code, 'precondition-failed', 'a mismatch with the record keeps the installation closed');
});

function controlPlaneFile(name: string): string {
  return readFileSync(join(dataRoot, 'control-plane', name), 'utf8');
}

test('server certificates are issued again by the kept authority, which fails closed when lost', async () => {
  const authority = new X509Certificate(controlPlaneFile('installation-ca.pem'));
  const earlier = new X509Certificate(controlPlaneFile('nats-certificate.pem'));
  const hosts = { TASKELITH_API_HOSTS: 'control-plane,127.0.0.1', TASKELITH_NATS_HOSTS: 'nats' };
  const reissued = await admin(['issue-installation-certificates'], hosts);
  assert.equal(reissued.status, 0, JSON.stringify(reissued.output));
  assert.deepEqual(Object.keys(reissued.output).sort(), ['apiCertificate', 'installationCa', 'natsCertificate', 'notAfter']);
  const api = new X509Certificate(controlPlaneFile('api-certificate.pem'));
  const nats = new X509Certificate(controlPlaneFile('nats-certificate.pem'));
  assert.equal(new X509Certificate(controlPlaneFile('installation-ca.pem')).fingerprint256, authority.fingerprint256, 'the authority is unchanged');
  assert.notEqual(nats.serialNumber, earlier.serialNumber);
  assert.ok(api.checkIssued(authority) && nats.checkIssued(authority));
  assert.deepEqual([api.checkHost('control-plane'), api.checkIP('127.0.0.1'), api.checkHost('nats')], ['control-plane', '127.0.0.1', undefined]);
  assert.deepEqual([nats.checkHost('nats'), nats.checkHost('localhost')], ['nats', undefined]);

  const wildcard = await admin(['issue-installation-certificates'], { TASKELITH_NATS_HOSTS: '*.example.com' });
  assert.deepEqual([wildcard.status, (wildcard.output.error as { details: { variable: string } }).details.variable], [1, 'TASKELITH_NATS_HOSTS']);

  const authorityPath = join(dataRoot, 'control-plane', 'installation-authority');
  renameSync(authorityPath, `${authorityPath}.kept`);
  try {
    for (const argv of [['init', ...ADMIN], ['issue-installation-certificates']]) {
      const lost = await admin(argv);
      assert.equal((lost.output.error as { code: string }).code, 'precondition-failed', argv[0]);
    }
    assert.equal(new X509Certificate(controlPlaneFile('installation-ca.pem')).fingerprint256, authority.fingerprint256, 'no new authority is made');
  } finally {
    renameSync(`${authorityPath}.kept`, authorityPath);
  }
});

async function enrollWorker(service: EnrollmentService, journal: string): Promise<WorkerId> {
  const token = value(await service.issueToken({}));
  return value(await service.enroll(token, {
    journalId: value(parseIdentifier('JournalId', journal)),
    host: { platform: 'linux', architecture: 'x64', hostname: journal },
    protocolVersions: { minimum: 1, maximum: 1 },
    capacity: { slots: 1, cpuMillicores: 1000, memoryMebibytes: 1024, controls: [] },
  })).workerId;
}

test('usage errors exit with 2 before anything is opened', async () => {
  for (const argv of [[], ['unknown'], ['rotate-worker'], ['init', 'extra'], ['worker-admission', 'worker-1'], ['issue-enrollment-token', '--platform', 'windows'], ['init', '--bogus']]) {
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

test('an unreadable broker CA fails and names its setting', async () => {
  const outcome = await admin(['expire-grace-windows'], { TASKELITH_NATS_CA: join(base, 'missing-ca.pem') });
  assert.equal(outcome.status, 1);
  assert.deepEqual(outcome.output.error, {
    code: 'invalid', message: 'TASKELITH_NATS_CA must name a readable PEM file', details: { variable: 'TASKELITH_NATS_CA' },
  });
});

test('an exception becomes a redacted failure with status 1', async () => {
  const lines: string[] = [];
  const secret = `tkop_${'C'.repeat(43)}`;
  const environment = new Proxy({ ...ENVIRONMENT }, {
    get: (target, name) => {
      if (name === 'TASKELITH_OPERATOR_TOKEN') throw new Error(`no ${secret}`);
      return target[name as keyof typeof target];
    },
  });
  const status = await adminMain(['expire-grace-windows'], { environment, platform: process.platform, ownerUid, write: (line) => lines.push(line) });
  assert.equal(status, 1);
  const { error } = JSON.parse(lines[0]!) as { error: { code: string; message: string } };
  assert.deepEqual([error.code, error.message.includes(secret)], ['internal', false]);
});

test('a missing setting fails with its name only', async () => {
  const lines: string[] = [];
  const status = await adminMain(['init', ...ADMIN], { environment: {}, platform: process.platform, ownerUid, write: (line) => lines.push(line) });
  assert.equal(status, 1);
  assert.match(lines[0]!, /TASKELITH_POSTGRES_URL is not set/);
});

async function adminWithSecret(argv: string[], token: string, secret: string | Result<string>): Promise<{ status: number; output: Record<string, unknown> }> {
  const lines: string[] = [];
  const io: AdminIo = {
    environment: { ...ENVIRONMENT, TASKELITH_OPERATOR_TOKEN: token }, platform: process.platform, ownerUid,
    write: (line) => lines.push(line), readSecret: async () => (typeof secret === 'string' ? ok(secret) : secret),
  };
  const status = await adminMain(argv, io);
  return { status, output: JSON.parse(lines.join('\n')) };
}

test('the owner exists from initialization, and only its credential manages principals and roles', { timeout: 60_000 }, async () => {
  const reset = await admin(['reset-operator-credential', ...ADMIN]);
  const token = (reset.output as { operatorSecret: string }).operatorSecret;
  const password = 'a password of bob that is long';
  const [owner] = await rows(database, 'SELECT p.principal_id, p.login_name FROM operator_principal o JOIN principals p USING (principal_id)') as Array<{ login_name: string }>;
  assert.equal(owner?.login_name, 'owner');
  const created = await adminWithSecret(['create-principal', '--login-name', 'Bob', ...ADMIN], token, '');
  assert.deepEqual([created.status, (created.output as { loginName: string }).loginName], [0, 'bob']);
  assert.equal((await adminWithSecret(['create-principal', '--login-name', 'eve', ...ADMIN], 'tkop_wrong', '')).status, 1);
  const set = await adminWithSecret(['set-password', '--login-name', 'bob', ...ADMIN], token, password);
  assert.deepEqual([set.status, (set.output as { sessionsEnded: number }).sessionsEnded], [0, 0]);
  const weak = await adminWithSecret(['set-password', '--login-name', 'bob', ...ADMIN], token, 'short');
  assert.equal(weak.status, 1);
  const role = ['--project', 'alpha', '--login-name', 'bob', ...ADMIN];
  assert.equal((await adminWithSecret(['assign-project-role', ...role, '--role', 'project-operator'], token, '')).status, 0);
  assert.deepEqual(await rows(database, 'SELECT project_id, role FROM project_roles'), [{ project_id: 'alpha', role: 'project-operator' }]);
  assert.equal((await adminWithSecret(['remove-project-role', ...role], token, '')).status, 0);
  assert.deepEqual(await rows(database, 'SELECT project_id FROM project_roles'), []);
  const audit = await rows(database, 'SELECT kind, actor FROM access_audit_events ORDER BY position') as Array<{ kind: string; actor: string }>;
  assert.deepEqual(audit.map((event) => event.kind), [
    'access.owner-created', 'access.owner-bootstrap-refused', 'access.owner-bootstrap-refused', 'access.principal-created', 'access.password-set',
    'access.project-role-assigned', 'access.project-role-removed',
  ]);
  const [stored] = await rows(database, "SELECT password_hash FROM principals WHERE login_name = 'bob'") as Array<{ password_hash: string }>;
  assert.match(stored?.password_hash ?? '', /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.doesNotMatch(JSON.stringify([set.output, weak.output, audit]), new RegExp(password));
  const state = () => Promise.all(['SELECT password_hash FROM principals', 'SELECT kind FROM access_audit_events', 'SELECT * FROM browser_sessions']
    .map((query) => rows(database, query)));
  const before = await state();
  const cancel = err(failure('invalid', 'the input was cancelled', { reason: 'cancelled' }));
  const cancelled = await adminWithSecret(['set-password', '--login-name', 'bob', ...ADMIN], token, cancel);
  assert.deepEqual([cancelled.status, await state()], [1, before], 'a cancelled set-password changes nothing');
});
