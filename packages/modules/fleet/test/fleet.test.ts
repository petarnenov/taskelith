import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryOperatorCredentials, OperatorCredentialService, type SecretHash, type Secrets } from '@taskelith/access';
import { err, failure, ok, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import type { WorkerId } from '@taskelith/execution';
import {
  EnrollmentService,
  FLEET_LIMITS,
  FLEET_REGISTRY_CONFORMANCE,
  INSTALLATION_TABLE_CONFORMANCE,
  InMemoryFleetRegistry,
  InMemoryInstallationRecord,
  InstallationService,
  installationIdentity,
  parseWorkerId,
  type BrokerCredentials,
  type WorkerCommandConsumers,
  type BrokerRevocation,
  type EnrollmentRequest,
} from '@taskelith/fleet';
import { failed, id, value } from '@taskelith/testing';

const realNow = () => value(parseInstant(new Date().toISOString()));

for (const conformance of FLEET_REGISTRY_CONFORMANCE) {
  test(`in-memory fleet registry: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check(new InMemoryFleetRegistry(realNow)), []);
  });
}

for (const conformance of INSTALLATION_TABLE_CONFORMANCE) {
  test(`in-memory installation table: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check(new InMemoryInstallationRecord()), []);
  });
}

function countingSecrets(): Secrets {
  let issued = 0;
  return {
    issue: (kind) => {
      issued += 1;
      return { secret: `${kind}-${issued}`, hash: `hash:${kind}-${issued}` as SecretHash };
    },
    hashOf: (secret) => `hash:${secret}` as SecretHash,
    matches: (secret, hash) => hash === `hash:${secret}`,
  };
}

function countingIds() {
  let next = 0;
  return { newInstallationId: () => `install-${++next}`, newWorkerId: () => `worker-${++next}` };
}

class MutableClock {
  current: Instant = value(parseInstant('2026-10-25T09:00:00.000Z'));

  now(): Instant {
    return this.current;
  }

  advance(milliseconds: number): void {
    this.current = value(parseInstant(new Date(Date.parse(this.current) + milliseconds).toISOString()));
  }
}

class RecordingConsumers implements WorkerCommandConsumers {
  readonly ensured: string[] = [];
  readonly removed: string[] = [];
  down = false;

  async ensure(workerId: string) {
    if (this.down) return err(failure('unavailable', 'the broker is down'));
    this.ensured.push(workerId);
    return ok(undefined);
  }

  async remove(workerId: string) {
    if (this.down) return err(failure('unavailable', 'the broker is down'));
    this.removed.push(workerId);
    return ok(undefined);
  }
}

// Keeps the last published revocation list, as the broker's account does.
class RecordingBroker implements BrokerCredentials {
  readonly issued: string[] = [];
  revoked: string[] = [];
  down = false;

  async issue(_installation: unknown, workerId: string, generation: number) {
    const userKey = `U-${workerId}-${generation}`;
    this.issued.push(userKey);
    return ok({ creds: `creds-${userKey}`, userKey, issuedAt: value(parseInstant('2026-10-25T08:00:00.000Z')) });
  }

  async sign(_installation: unknown, workerId: string, generation: number, userKey: string) {
    if (!userKey.startsWith('U')) return err(failure('invalid', 'not a user key'));
    return ok({ jwt: `jwt-${workerId}-${generation}-${userKey}`, issuedAt: value(parseInstant('2026-10-25T08:00:00.000Z')) });
  }

  async publishRevocations(revocations: readonly BrokerRevocation[]) {
    if (this.down) return err(failure('unavailable', 'the broker is down'));
    this.revoked = revocations.map((revocation) => revocation.userKey);
    return ok(undefined);
  }
}

const ADMIN = { actor: 'root@control-plane-1', reason: 'initial installation' };

function installation() {
  const record = new InMemoryInstallationRecord();
  const table = new InMemoryInstallationRecord();
  const operator = new OperatorCredentialService({ credentials: new InMemoryOperatorCredentials(), secrets: countingSecrets(), clock: new MutableClock() });
  return { record, table, service: new InstallationService({ record, table, ids: countingIds(), operator }) };
}

test('initialization creates the record, its copy, and the bootstrap credential once', async () => {
  const { record, table, service } = installation();
  assert.equal(failed(await service.verifyAtStart()).code, 'not-found');
  const initialized = value(await service.initialize(ADMIN));
  assert.deepEqual(initialized, { identity: value(installationIdentity('install-1', 1)), operatorSecret: 'operator-1' });
  assert.deepEqual(value(await record.read()), initialized.identity);
  assert.deepEqual(value(await table.read()), initialized.identity);
  assert.deepEqual(value(await service.verifyAtStart()), initialized.identity);
  assert.equal(failed(await service.initialize(ADMIN)).code, 'conflict');
});

test('a rerun after a crash completes the same identity', async () => {
  const { record, table, service } = installation();
  value(await record.create(value(installationIdentity('install-0', 1))));
  const initialized = value(await service.initialize(ADMIN));
  assert.equal(initialized.identity.installationId, 'install-0');
  assert.deepEqual(value(await table.read()), initialized.identity);
});

test('a database copy without its record, or a mismatch, keeps the installation closed', async () => {
  const orphan = installation();
  value(await orphan.table.initialize(value(installationIdentity('install-0', 1))));
  assert.equal(failed(await orphan.service.initialize(ADMIN)).code, 'precondition-failed');
  assert.equal(failed(await orphan.service.verifyAtStart()).code, 'not-found');

  const restored = installation();
  value(await restored.record.create(value(installationIdentity('install-0', 2))));
  value(await restored.table.initialize(value(installationIdentity('install-0', 1))));
  assert.equal(failed(await restored.service.verifyAtStart()).code, 'precondition-failed');
  assert.equal(failed(await restored.service.initialize(ADMIN)).code, 'precondition-failed');
});

function enrollment() {
  const clock = new MutableClock();
  const broker = new RecordingBroker();
  const consumers = new RecordingConsumers();
  const registry = new InMemoryFleetRegistry(() => clock.now());
  const service = new EnrollmentService({
    installation: value(installationIdentity('install-1', 1)),
    serverProtocolVersions: { minimum: 1, maximum: 1 },
    registry, secrets: countingSecrets(), ids: countingIds(), broker, commandConsumers: consumers, clock,
  });
  return { clock, broker, consumers, registry, service };
}

function request(journalId = 'journal-1', overrides: Partial<EnrollmentRequest> = {}): EnrollmentRequest {
  return {
    journalId: id('JournalId', journalId),
    host: { platform: 'linux', architecture: 'arm64', hostname: 'build-1' },
    protocolVersions: { minimum: 1, maximum: 2 },
    capacity: { slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, controls: ['cpu-limit'] },
    ...overrides,
  };
}

test('a token enrolls one worker with both credentials of generation 1', async () => {
  const { broker, registry, service } = enrollment();
  const token = value(await service.issueToken({ platform: 'linux', hostname: 'build-1' }));
  const enrolled = value(await service.enroll(token, request()));

  assert.deepEqual(enrolled, {
    installationId: 'install-1', workerId: 'worker-1', credentialGeneration: 1, recoveryEpoch: 1,
    protocolVersions: { minimum: 1, maximum: 1 }, credentials: { controlPlane: 'worker-2', broker: 'creds-U-worker-1-1' },
  });
  assert.deepEqual(broker.issued, ['U-worker-1-1']);
  assert.equal(value(await registry.worker(enrolled.workerId))?.credentials.current.brokerUserKey, 'U-worker-1-1');
  const reuse = failed(await service.enroll(token, request('journal-2')));
  assert.deepEqual([reuse.code, reuse.details.reason], ['forbidden', 'token-invalid']);
});

test('enrollment ensures the command consumer first; without it the token stays unused', async () => {
  const { consumers, registry, service } = enrollment();
  const token = value(await service.issueToken({}));
  consumers.down = true;
  const refused = failed(await service.enroll(token, request()));
  assert.equal(refused.code, 'unavailable');
  assert.deepEqual(value(await registry.activeWorkerIds()), []);
  consumers.down = false;
  const enrolled = value(await service.enroll(token, request()));
  assert.deepEqual(consumers.ensured, [enrolled.workerId]);
  assert.deepEqual(value(await registry.activeWorkerIds()), [enrolled.workerId]);
});

test('enrollment refuses an unknown or expired token, another host, no common version, and a known journal', async () => {
  const { clock, service } = enrollment();
  const reason = (result: Result<unknown>) => failed(result).details.reason;
  assert.equal(reason(await service.enroll('enrollment-99', request())), 'token-invalid');

  const constrained = value(await service.issueToken({ architecture: 'x64' }));
  assert.equal(reason(await service.enroll(constrained, request())), 'host-mismatch');
  const open = value(await service.issueToken({}));
  assert.equal(reason(await service.enroll(open, request('journal-1', { protocolVersions: { minimum: 2, maximum: 3 } }))), 'protocol-not-supported');
  value(await service.enroll(open, request()));
  const second = value(await service.issueToken({}));
  const known = failed(await service.enroll(second, request()));
  assert.deepEqual([known.code, known.details.reason], ['conflict', 'journal-enrolled']);

  const expiring = value(await service.issueToken({}));
  clock.advance(FLEET_LIMITS.enrollmentTokenTtlMilliseconds);
  assert.equal(reason(await service.enroll(expiring, request('journal-3'))), 'token-invalid');
});

const OPERATOR = { actor: 'ops@example.test', reason: 'scheduled rotation' };

// The worker's side of a renewal: only the key and the secret's hash leave it.
function material(generation: number, secret = `worker-next-${generation}`, userKey = `U-own-${generation}`) {
  return { credentialGeneration: generation, brokerUserPublicKey: userKey, controlPlaneSecretSha256: `hash:${secret}` as SecretHash };
}

async function enrolledWorker() {
  const fixture = enrollment();
  const enrolled = value(await fixture.service.enroll(value(await fixture.service.issueToken({})), request()));
  const principal = value(await fixture.service.authenticateWorkerBearer(enrolled.credentials.controlPlane));
  return { ...fixture, enrolled, principal };
}

// Requests, renews, and confirms one generation after the current one.
async function rotateFully(service: EnrollmentService, workerId: WorkerId, bearer: string, generation: number) {
  value(await service.requestRotation(workerId, OPERATOR));
  const principal = value(await service.authenticateWorkerBearer(bearer));
  value(await service.renew(principal, material(generation)));
  const next = value(await service.authenticateWorkerBearer(`worker-next-${generation}`));
  return value(await service.confirm(next, generation));
}

test('a rotation request names the next generation and its deadline, and prints no secret', async () => {
  const { clock, service, enrolled } = await enrolledWorker();
  const requested = value(await service.requestRotation(enrolled.workerId, OPERATOR));
  const deadline = new Date(Date.parse(clock.now()) + FLEET_LIMITS.rotationHardCapMilliseconds).toISOString();
  assert.deepEqual(requested, { workerId: enrolled.workerId, credentialGeneration: 2, deadline });
  clock.advance(1000);
  assert.deepEqual(value(await service.requestRotation(enrolled.workerId, OPERATOR)), requested, 'an open request is answered unchanged');
  assert.equal(failed(await service.requestRotation(enrolled.workerId, { actor: '', reason: 'x' })).code, 'invalid');
  assert.equal(value(await service.authenticateWorkerBearer(enrolled.credentials.controlPlane)).generation, 1, 'N stays valid');
});

test('a renewal without an open request for the next generation is rotation-not-requested', async () => {
  const { service, enrolled, principal } = await enrolledWorker();
  const unrequested = failed(await service.renew(principal, material(2)));
  assert.deepEqual([unrequested.code, unrequested.details.reason], ['conflict', 'rotation-not-requested']);
  value(await service.requestRotation(enrolled.workerId, OPERATOR));
  const skipped = failed(await service.renew(principal, material(3)));
  assert.deepEqual([skipped.code, skipped.details.reason], ['conflict', 'rotation-not-requested'], 'only N+1');
});

test('a repeated renewal with the same material answers the same JWT; other material is renewal-mismatch', async () => {
  const { broker, service, enrolled, principal } = await enrolledWorker();
  value(await service.requestRotation(enrolled.workerId, OPERATOR));
  const renewed = value(await service.renew(principal, material(2)));
  assert.equal(renewed.brokerUserJwt, `jwt-${enrolled.workerId}-2-U-own-2`);
  broker.sign = async () => err(failure('internal', 'a replay must not sign again'));
  assert.deepEqual(value(await service.renew(principal, material(2))), renewed);
  const other = failed(await service.renew(principal, material(2, 'worker-other', 'U-other')));
  assert.deepEqual([other.code, other.details.reason], ['conflict', 'renewal-mismatch']);
  assert.equal(value(await service.authenticateWorkerBearer('worker-next-2')).generation, 2);
  assert.equal(value(await service.authenticateWorkerBearer(enrolled.credentials.controlPlane)).generation, 1, 'N kept until confirm');
});

test('a key that is not an NKey user key is refused before anything is recorded', async () => {
  const { service, enrolled, principal } = await enrolledWorker();
  value(await service.requestRotation(enrolled.workerId, OPERATOR));
  assert.equal(failed(await service.renew(principal, material(2, 'worker-next-2', 'N-not-a-user'))).code, 'invalid');
  assert.equal(failed(await service.authenticateWorkerBearer('worker-next-2')).code, 'forbidden');
});

test('the confirmation drops the predecessor at once and publishes its revocation', async () => {
  const { broker, service, enrolled, principal } = await enrolledWorker();
  value(await service.requestRotation(enrolled.workerId, OPERATOR));
  value(await service.renew(principal, material(2)));
  const mismatch = failed(await service.confirm(principal, 2));
  assert.deepEqual([mismatch.code, mismatch.details.reason], ['conflict', 'confirmation-mismatch'], 'confirmed with N+1 only');
  const next = value(await service.authenticateWorkerBearer('worker-next-2'));
  assert.deepEqual(value(await service.confirm(next, 2)), { credentialGeneration: 2, revocationsPublished: true });
  assert.equal(failed(await service.authenticateWorkerBearer(enrolled.credentials.controlPlane)).code, 'forbidden');
  assert.deepEqual(broker.revoked, ['U-worker-1-1']);
  assert.deepEqual(value(await service.confirm(next, 2)), { credentialGeneration: 2, revocationsPublished: true }, 'a replay');
});

test('at the deadline an unconfirmed renewal keeps N+1 and drops N', async () => {
  const { clock, broker, service, enrolled, principal } = await enrolledWorker();
  value(await service.requestRotation(enrolled.workerId, OPERATOR));
  value(await service.renew(principal, material(2)));
  assert.deepEqual(value(await service.expireGraceWindows()), 0);
  clock.advance(FLEET_LIMITS.rotationHardCapMilliseconds);
  assert.deepEqual(value(await service.expireGraceWindows()), 1);
  assert.equal(failed(await service.authenticateWorkerBearer(enrolled.credentials.controlPlane)).code, 'forbidden');
  assert.equal(value(await service.authenticateWorkerBearer('worker-next-2')).generation, 2);
  assert.deepEqual(broker.revoked, ['U-worker-1-1']);
});

test('at the deadline a rotation that was never renewed revokes the worker', async () => {
  const { clock, broker, consumers, service, enrolled } = await enrolledWorker();
  value(await service.requestRotation(enrolled.workerId, OPERATOR));
  clock.advance(FLEET_LIMITS.rotationHardCapMilliseconds - 1);
  assert.deepEqual(value(await service.expireGraceWindows()), 0);
  clock.advance(1);
  assert.deepEqual(value(await service.expireGraceWindows()), 1);
  assert.equal(failed(await service.authenticateWorkerBearer(enrolled.credentials.controlPlane)).code, 'forbidden');
  assert.deepEqual(broker.revoked, ['U-worker-1-1']);
  assert.deepEqual(consumers.removed, [enrolled.workerId]);
});

test('a first renewal after the deadline is refused before the sweep, which then revokes the worker', async () => {
  const { clock, service, enrolled, principal } = await enrolledWorker();
  value(await service.requestRotation(enrolled.workerId, OPERATOR));
  clock.advance(FLEET_LIMITS.rotationHardCapMilliseconds);
  const late = failed(await service.renew(principal, material(2)));
  assert.deepEqual([late.code, late.details.reason], ['forbidden', 'worker-not-authorized']);
  assert.equal(failed(await service.authenticateWorkerBearer('worker-next-2')).code, 'forbidden', 'nothing was renewed');
  assert.deepEqual(value(await service.expireGraceWindows()), 1);
  assert.equal(failed(await service.authenticateWorkerBearer(enrolled.credentials.controlPlane)).code, 'forbidden');
});

test('a renewal whose registry write waits past the deadline is refused', async () => {
  const { clock, registry, service, enrolled, principal } = await enrolledWorker();
  value(await service.requestRotation(enrolled.workerId, OPERATOR));
  clock.advance(FLEET_LIMITS.rotationHardCapMilliseconds - 1);
  const renew = registry.renew.bind(registry);
  // The deadline passes while the write waits for the worker's row lock.
  registry.renew = (...write) => {
    clock.advance(1);
    return renew(...write);
  };
  const late = failed(await service.renew(principal, material(2)));
  assert.deepEqual([late.code, late.details.reason], ['forbidden', 'worker-not-authorized']);
  assert.deepEqual(value(await service.expireGraceWindows()), 1, 'the sweep revokes the worker');
});

test('a confirmation after the deadline expires the predecessor as unconfirmed, before or after the sweep', async () => {
  const kinds = async (registry: InMemoryFleetRegistry, workerId: WorkerId) =>
    value(await registry.credentialAuditTrail(workerId)).map(({ kind, reason }) => `${kind}:${reason}`);
  for (const sweepFirst of [false, true]) {
    const { clock, broker, registry, service, enrolled, principal } = await enrolledWorker();
    value(await service.requestRotation(enrolled.workerId, OPERATOR));
    value(await service.renew(principal, material(2)));
    const next = value(await service.authenticateWorkerBearer('worker-next-2'));
    clock.advance(FLEET_LIMITS.rotationHardCapMilliseconds);
    if (sweepFirst) assert.deepEqual(value(await service.expireGraceWindows()), 1);
    assert.deepEqual(value(await service.confirm(next, 2)), { credentialGeneration: 2, revocationsPublished: true });
    assert.deepEqual(value(await service.expireGraceWindows()), 0, 'nothing is left to expire');
    assert.deepEqual((await kinds(registry, enrolled.workerId)).slice(1), [
      'worker-credential.renewed:renewed', 'worker-credential.rotation-expired:unconfirmed',
    ], `sweep first: ${sweepFirst}`);
    assert.deepEqual(broker.revoked, ['U-worker-1-1']);
    assert.equal(value(await service.authenticateWorkerBearer('worker-next-2')).generation, 2);
  }
});

test('a repeated confirmation retries a revocation publication that failed', async () => {
  const { broker, service, enrolled } = await enrolledWorker();
  broker.down = true;
  const first = await rotateFully(service, enrolled.workerId, enrolled.credentials.controlPlane, 2);
  assert.equal(first.revocationsPublished, false);
  const next = value(await service.authenticateWorkerBearer('worker-next-2'));
  assert.deepEqual(value(await service.confirm(next, 2)), { credentialGeneration: 2, revocationsPublished: false }, 'the broker is still down');
  assert.deepEqual(broker.revoked, []);
  broker.down = false;
  assert.deepEqual(value(await service.confirm(next, 2)), { credentialGeneration: 2, revocationsPublished: true });
  assert.deepEqual(broker.revoked, ['U-worker-1-1']);
});

test('a revoked worker gets no rotation, and a consumer the sweep cannot remove is reported', async () => {
  const { clock, consumers, service, enrolled } = await enrolledWorker();
  value(await service.requestRotation(enrolled.workerId, OPERATOR));
  clock.advance(FLEET_LIMITS.rotationHardCapMilliseconds);
  consumers.down = true;
  const kept = failed(await service.expireGraceWindows());
  assert.deepEqual([kept.code, kept.details.workers], ['unavailable', enrolled.workerId]);
  assert.equal(failed(await service.requestRotation(enrolled.workerId, OPERATOR)).details.reason, 'worker-not-authorized');
  assert.deepEqual(value(await service.expireGraceWindows()), 0, 'the revocation stays committed');
});

test('a revocation the broker missed stays recorded and is published by the next sweep', async () => {
  const { broker, service, enrolled } = await enrolledWorker();
  await rotateFully(service, enrolled.workerId, enrolled.credentials.controlPlane, 2);
  broker.down = true;
  const partial = await rotateFully(service, enrolled.workerId, 'worker-next-2', 3);
  assert.deepEqual([partial.credentialGeneration, partial.revocationsPublished], [3, false], 'a committed confirmation stays');
  assert.equal(failed(await service.revoke(enrolled.workerId)).code, 'unavailable');
  assert.equal(failed(await service.authenticateWorkerBearer('worker-next-3')).code, 'forbidden');
  assert.equal(failed(await service.requestRotation(enrolled.workerId, OPERATOR)).details.reason, 'worker-not-authorized');

  broker.down = false;
  assert.deepEqual(value(await service.expireGraceWindows()), 0);
  assert.deepEqual(broker.revoked.sort(), ['U-worker-1-1', 'U-own-2', 'U-own-3'].sort());
});

test('a publication that throws after a committed confirmation still answers it', async () => {
  const { broker, service, enrolled } = await enrolledWorker();
  broker.publishRevocations = async () => {
    throw new Error('statement timeout');
  };
  const confirmed = await rotateFully(service, enrolled.workerId, enrolled.credentials.controlPlane, 2);
  assert.deepEqual(confirmed, { credentialGeneration: 2, revocationsPublished: false });
  assert.equal(value(await service.authenticateWorkerBearer('worker-next-2')).generation, 2);
});

test('revocation denies every credential of the worker at once', async () => {
  const { broker, consumers, service, enrolled, principal } = await enrolledWorker();
  value(await service.requestRotation(enrolled.workerId, OPERATOR));
  value(await service.renew(principal, material(2)));
  assert.deepEqual(value(await service.revoke(enrolled.workerId)), { commandConsumerRemoved: true });
  assert.deepEqual(consumers.removed, [enrolled.workerId], 'its command consumer is removed');

  assert.deepEqual(broker.revoked.sort(), ['U-own-2', 'U-worker-1-1']);
  assert.equal(failed(await service.authenticateWorkerBearer(enrolled.credentials.controlPlane)).code, 'forbidden');
  assert.equal(failed(await service.authenticateWorkerBearer('worker-next-2')).code, 'forbidden');
  assert.equal(failed(await service.requestRotation(enrolled.workerId, OPERATOR)).code, 'forbidden');
  const unknown = value(parseWorkerId('worker-9'));
  assert.equal(failed(await service.revoke(unknown)).code, 'not-found');
  assert.deepEqual(consumers.removed, [enrolled.workerId], 'an unknown worker removes nothing');
  assert.equal(failed(await service.authenticateWorkerBearer('x')).details.reason, 'worker-not-authorized');
});

test('a consumer the broker cannot remove leaves the worker revoked', async () => {
  const { consumers, registry, service } = enrollment();
  const enrolled = value(await service.enroll(value(await service.issueToken({})), request()));
  const active = value(await service.enroll(value(await service.issueToken({})), request('journal-2')));
  consumers.down = true;
  assert.deepEqual(value(await service.revoke(enrolled.workerId)), { commandConsumerRemoved: false });
  assert.equal(failed(await service.authenticateWorkerBearer(enrolled.credentials.controlPlane)).code, 'forbidden');
  assert.deepEqual(value(await registry.recentlyRevokedWorkerIds(10)), [enrolled.workerId]);
  assert.deepEqual(value(await registry.activeWorkerIds()), [active.workerId]);
});

test('a worker bearer names its own worker and generation, and nothing else authenticates', async () => {
  const { registry, service } = enrollment();
  const first = value(await service.enroll(value(await service.issueToken({})), request()));
  const second = value(await service.enroll(value(await service.issueToken({})), request('journal-2')));

  assert.deepEqual(value(await service.authenticateWorkerBearer(first.credentials.controlPlane)), { workerId: first.workerId, generation: 1 });
  assert.deepEqual(value(await service.authenticateWorkerBearer(second.credentials.controlPlane)), { workerId: second.workerId, generation: 1 });
  for (const secret of ['enrollment-1', 'operator-1', '']) {
    assert.equal(failed(await service.authenticateWorkerBearer(secret)).details.reason, 'worker-not-authorized', secret);
  }
  const unknown = failed(await service.authenticateWorkerBearer('worker-99'));
  await rotateFully(service, first.workerId, first.credentials.controlPlane, 2);
  assert.deepEqual(failed(await service.authenticateWorkerBearer(first.credentials.controlPlane)), unknown, 'confirmed away');
  value(await service.revoke(first.workerId));
  assert.deepEqual(failed(await service.authenticateWorkerBearer('worker-next-2')), unknown, 'revoked, current generation');
  registry.workerByCredentialHash = async () => err(failure('unavailable', 'the store is down'));
  assert.equal(failed(await service.authenticateWorkerBearer(second.credentials.controlPlane)).code, 'unavailable');
});
