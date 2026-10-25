import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryOperatorCredentials, OperatorCredentialService, type SecretHash, type Secrets } from '@taskelith/access';
import { err, failure, ok, parseInstant, type Instant, type Result } from '@taskelith/kernel';
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

// Keeps the last published revocation list, as the broker's account does.
class RecordingConsumers implements WorkerCommandConsumers {
  readonly ensured: string[] = [];
  down = false;

  async ensure(workerId: string) {
    if (this.down) return err(failure('unavailable', 'the broker is down'));
    this.ensured.push(workerId);
    return ok(undefined);
  }
}

class RecordingBroker implements BrokerCredentials {
  readonly issued: string[] = [];
  revoked: string[] = [];
  down = false;

  async issue(_installation: unknown, workerId: string, generation: number) {
    const userKey = `U-${workerId}-${generation}`;
    this.issued.push(userKey);
    return ok({ creds: `creds-${userKey}`, userKey, issuedAt: value(parseInstant('2026-10-25T08:00:00.000Z')) });
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

test('rotation keeps the old generation for the grace window, then revokes its broker user', async () => {
  const { clock, broker, service } = enrollment();
  const enrolled = value(await service.enroll(value(await service.issueToken({})), request()));
  const rotated = value(await service.rotate(enrolled.workerId));

  assert.deepEqual([rotated.credentialGeneration, rotated.revocationsPublished], [2, true]);
  assert.deepEqual(value(await service.authenticateWorkerBearer(rotated.credentials.controlPlane)).generation, 2);
  assert.deepEqual(value(await service.authenticateWorkerBearer(enrolled.credentials.controlPlane)).generation, 1);
  assert.deepEqual(value(await service.expireGraceWindows()), 0);
  clock.advance(FLEET_LIMITS.rotationGraceMilliseconds);
  assert.equal(failed(await service.authenticateWorkerBearer(enrolled.credentials.controlPlane)).details.reason, 'worker-not-authorized');
  assert.deepEqual(value(await service.expireGraceWindows()), 1);
  assert.deepEqual(broker.revoked, ['U-worker-1-1']);

  value(await service.rotate(enrolled.workerId));
  value(await service.rotate(enrolled.workerId));
  assert.deepEqual(broker.revoked, ['U-worker-1-1', 'U-worker-1-2'], 'a second rotation drops the older predecessor');
});

test('a revocation the broker missed stays recorded and is published by the next sweep', async () => {
  const { broker, service } = enrollment();
  const enrolled = value(await service.enroll(value(await service.issueToken({})), request()));
  value(await service.rotate(enrolled.workerId));
  value(await service.rotate(enrolled.workerId));
  broker.down = true;
  const partial = value(await service.rotate(enrolled.workerId));
  assert.deepEqual([partial.credentialGeneration, partial.revocationsPublished], [4, false], 'a committed rotation keeps its secrets');
  assert.equal(failed(await service.revoke(enrolled.workerId)).code, 'unavailable');
  assert.equal(failed(await service.authenticateWorkerBearer(enrolled.credentials.controlPlane)).code, 'forbidden');
  assert.equal(failed(await service.rotate(enrolled.workerId)).details.reason, 'worker-not-authorized', 'a revoked worker gets no new generation');

  broker.down = false;
  assert.deepEqual(value(await service.expireGraceWindows()), 0);
  assert.deepEqual(broker.revoked.sort(), ['U-worker-1-1', 'U-worker-1-2', 'U-worker-1-3', 'U-worker-1-4']);
});

test('a publication that throws after a committed rotation still returns the new secrets', async () => {
  const { broker, service } = enrollment();
  const enrolled = value(await service.enroll(value(await service.issueToken({})), request()));
  value(await service.rotate(enrolled.workerId));
  broker.publishRevocations = async () => {
    throw new Error('statement timeout');
  };
  const rotated = value(await service.rotate(enrolled.workerId));
  assert.deepEqual([rotated.credentialGeneration, rotated.revocationsPublished], [3, false]);
  assert.equal(value(await service.authenticateWorkerBearer(rotated.credentials.controlPlane)).generation, 3);
});

test('revocation denies every credential of the worker at once', async () => {
  const { broker, service } = enrollment();
  const enrolled = value(await service.enroll(value(await service.issueToken({})), request()));
  value(await service.rotate(enrolled.workerId));
  value(await service.revoke(enrolled.workerId));

  assert.deepEqual(broker.revoked.sort(), ['U-worker-1-1', 'U-worker-1-2']);
  assert.equal(failed(await service.authenticateWorkerBearer(enrolled.credentials.controlPlane)).code, 'forbidden');
  assert.equal(failed(await service.rotate(enrolled.workerId)).code, 'forbidden');
  const unknown = value(parseWorkerId('worker-9'));
  assert.equal(failed(await service.revoke(unknown)).code, 'not-found');
  assert.equal(failed(await service.authenticateWorkerBearer('x')).details.reason, 'worker-not-authorized');
});

test('a worker bearer names its own worker and generation, and nothing else authenticates', async () => {
  const { clock, registry, service } = enrollment();
  const first = value(await service.enroll(value(await service.issueToken({})), request()));
  const second = value(await service.enroll(value(await service.issueToken({})), request('journal-2')));

  assert.deepEqual(value(await service.authenticateWorkerBearer(first.credentials.controlPlane)), { workerId: first.workerId, generation: 1 });
  assert.deepEqual(value(await service.authenticateWorkerBearer(second.credentials.controlPlane)), { workerId: second.workerId, generation: 1 });
  for (const secret of ['enrollment-1', 'operator-1', '']) {
    assert.equal(failed(await service.authenticateWorkerBearer(secret)).details.reason, 'worker-not-authorized', secret);
  }
  const unknown = failed(await service.authenticateWorkerBearer('worker-99'));
  const rotated = value(await service.rotate(first.workerId));
  clock.advance(FLEET_LIMITS.rotationGraceMilliseconds);
  assert.deepEqual(failed(await service.authenticateWorkerBearer(first.credentials.controlPlane)), unknown, 'past the grace window');
  value(await service.revoke(first.workerId));
  assert.deepEqual(failed(await service.authenticateWorkerBearer(rotated.credentials.controlPlane)), unknown, 'revoked, current generation');
  registry.workerByCredentialHash = async () => err(failure('unavailable', 'the store is down'));
  assert.equal(failed(await service.authenticateWorkerBearer(second.credentials.controlPlane)).code, 'unavailable');
});
