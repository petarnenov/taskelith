import type { SecretHash, Secrets } from '@taskelith/access';
import { err, failure, ok, parseInstant, type Instant } from '@taskelith/kernel';
import {
  EnrollmentService,
  InMemoryFleetRegistry,
  installationIdentity,
  type BrokerCredentials,
  type BrokerRevocation,
  type EnrollmentRequest,
  type WorkerCommandConsumers,
} from '@taskelith/fleet';
import { id, value } from '@taskelith/testing';

// The in-memory enrollment fixture: counting secrets and identifiers, a
// clock a test moves by hand, and a recording broker and consumers.

export function countingSecrets(): Secrets {
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

// Token identifiers count on their own, zero-padded so they sort as issued.
export function countingIds() {
  let next = 0;
  let tokens = 0;
  return {
    newInstallationId: () => `install-${++next}`,
    newWorkerId: () => `worker-${++next}`,
    newEnrollmentTokenId: () => `e${String(++tokens).padStart(3, '0')}`,
  };
}

export class MutableClock {
  current: Instant = value(parseInstant('2026-10-25T09:00:00.000Z'));

  now(): Instant {
    return this.current;
  }

  advance(milliseconds: number): void {
    this.current = value(parseInstant(new Date(Date.parse(this.current) + milliseconds).toISOString()));
  }
}

export class RecordingConsumers implements WorkerCommandConsumers {
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
export class RecordingBroker implements BrokerCredentials {
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

export function enrollment() {
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

export function request(journalId = 'journal-1', overrides: Partial<EnrollmentRequest> = {}): EnrollmentRequest {
  return {
    journalId: id('JournalId', journalId),
    host: { platform: 'linux', architecture: 'arm64', hostname: 'build-1' },
    protocolVersions: { minimum: 1, maximum: 2 },
    capacity: { slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, controls: ['cpu-limit'] },
    ...overrides,
  };
}
