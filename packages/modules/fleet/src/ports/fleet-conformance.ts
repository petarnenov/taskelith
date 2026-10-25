import { parseIdentifier, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import type { SecretHash } from '@taskelith/access';
import type { JournalId, WorkerId } from '@taskelith/execution';
import { expectCode, expectRead, expectSame, expectSuccess, type ConformanceCase } from '@taskelith/sdlc';
import type { EnrolledWorker, EnrollmentToken, WorkerCredentials } from '../domain/enrollment.js';
import { installationIdentity } from '../domain/installation.js';
import type { FleetRegistry } from './fleet-registry.js';
import type { InstallationTable } from './installation-records.js';

// Shared suites; each case gets an empty store.

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${result.error.message}`);
  return result.value;
}

const at = (text: string): Instant => must(parseInstant(text));
const AT = at('2026-10-25T09:00:00.000Z');
const LATER = at('2026-10-25T09:10:00.000Z');

export function fleetToken(hash: string, constraints: EnrollmentToken['constraints'] = {}): EnrollmentToken {
  return Object.freeze({ hash: hash as SecretHash, issuedAt: AT, expiresAt: at('2026-10-25T09:15:00.000Z'), constraints });
}

function credentials(generation: number, validUntil?: Instant): WorkerCredentials {
  const current = { generation, controlPlaneHash: `cp-${generation}` as SecretHash, brokerUserKey: `UKEY${generation}` };
  if (validUntil === undefined) return { current };
  return { current, previous: { generation: generation - 1, controlPlaneHash: `cp-${generation - 1}` as SecretHash, brokerUserKey: `UKEY${generation - 1}`, validUntil } };
}

export function fleetWorker(workerId: string, journalId: string, overrides: Partial<EnrolledWorker> = {}): EnrolledWorker {
  const worker: EnrolledWorker = {
    workerId: must(parseIdentifier('WorkerId', workerId)) as WorkerId,
    journalId: must(parseIdentifier('JournalId', journalId)) as JournalId,
    host: { platform: 'linux', architecture: 'x64', hostname: 'build-1' },
    protocolVersions: { minimum: 1, maximum: 1 },
    capacity: { slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, controls: ['cpu-limit', 'memory-limit'] },
    credentials: credentials(1),
    enrolledAt: AT,
    ...overrides,
  };
  return Object.freeze(worker);
}

export const FLEET_REGISTRY_CONFORMANCE: readonly ConformanceCase<FleetRegistry>[] = Object.freeze([
  {
    name: 'a token enrolls one worker and is then used',
    async check(registry) {
      const problems: string[] = [];
      expectSuccess(problems, 'add token', await registry.addToken(fleetToken('t1', { platform: 'linux' })));
      expectCode(problems, 'add twice', await registry.addToken(fleetToken('t1')), 'conflict');
      expectRead(problems, 'unused', await registry.unusedToken('t1' as SecretHash), fleetToken('t1', { platform: 'linux' }));
      expectRead(problems, 'unknown', await registry.unusedToken('t9' as SecretHash), undefined);
      expectSuccess(problems, 'enroll', await registry.enroll('t1' as SecretHash, fleetWorker('w1', 'j1')));
      expectRead(problems, 'used token', await registry.unusedToken('t1' as SecretHash), undefined);
      expectRead(problems, 'worker', await registry.worker(fleetWorker('w1', 'j1').workerId), fleetWorker('w1', 'j1'));
      const again = await registry.enroll('t1' as SecretHash, fleetWorker('w2', 'j2'));
      expectCode(problems, 'reuse', again, 'conflict');
      expectSame(problems, 'reuse reason', again.ok ? undefined : again.error.details.reason, 'token-used');
      return problems;
    },
  },
  {
    name: 'a journal enrolls once, and concurrent redemptions of one token have one winner',
    async check(registry) {
      const problems: string[] = [];
      for (const hash of ['t1', 't2', 't3']) must(await registry.addToken(fleetToken(hash)));
      must(await registry.enroll('t1' as SecretHash, fleetWorker('w1', 'j1')));
      const journal = await registry.enroll('t2' as SecretHash, fleetWorker('w2', 'j1'));
      expectSame(problems, 'journal reason', journal.ok ? undefined : journal.error.details.reason, 'journal-enrolled');
      expectRead(problems, 'token kept', await registry.unusedToken('t2' as SecretHash), fleetToken('t2'));
      const race = await Promise.all([
        registry.enroll('t3' as SecretHash, fleetWorker('w3', 'j3')),
        registry.enroll('t3' as SecretHash, fleetWorker('w4', 'j4')),
      ]);
      expectSame(problems, 'race winners', race.filter((result) => result.ok).length, 1);
      return problems;
    },
  },
  {
    name: 'credentials are replaced only at the expected generation, and predecessors expire',
    async check(registry) {
      const problems: string[] = [];
      must(await registry.addToken(fleetToken('t1')));
      const worker = fleetWorker('w1', 'j1');
      must(await registry.enroll('t1' as SecretHash, worker));
      expectCode(problems, 'stale', await registry.replaceCredentials(worker.workerId, 2, credentials(3, LATER)), 'conflict');
      expectSuccess(problems, 'rotate', await registry.replaceCredentials(worker.workerId, 1, credentials(2, LATER)));
      expectRead(problems, 'rotated', await registry.worker(worker.workerId), { ...worker, credentials: credentials(2, LATER) });
      expectRead(problems, 'not yet expired', await registry.expiredPredecessors(AT), []);
      const expired = await registry.expiredPredecessors(LATER);
      expectSame(problems, 'expired', expired.ok ? expired.value.map((w) => w.workerId) : expired, [worker.workerId]);
      expectCode(problems, 'unknown worker', await registry.replaceCredentials(fleetWorker('w9', 'j9').workerId, 1, credentials(2)), 'not-found');
      return problems;
    },
  },
  {
    name: 'revocation keeps its first time',
    async check(registry) {
      const problems: string[] = [];
      must(await registry.addToken(fleetToken('t1')));
      const worker = fleetWorker('w1', 'j1');
      must(await registry.enroll('t1' as SecretHash, worker));
      expectSuccess(problems, 'revoke', await registry.revoke(worker.workerId, AT));
      expectSuccess(problems, 'revoke again', await registry.revoke(worker.workerId, LATER));
      expectRead(problems, 'revoked', await registry.worker(worker.workerId), { ...worker, revokedAt: AT });
      expectCode(problems, 'unknown', await registry.revoke(fleetWorker('w9', 'j9').workerId, AT), 'not-found');
      return problems;
    },
  },
]);

export const INSTALLATION_TABLE_CONFORMANCE: readonly ConformanceCase<InstallationTable>[] = Object.freeze([
  {
    name: 'the installation copy is written once',
    async check(table) {
      const problems: string[] = [];
      const identity = must(installationIdentity('install-1', 1));
      expectRead(problems, 'empty', await table.read(), undefined);
      expectSuccess(problems, 'initialize', await table.initialize(identity));
      expectCode(problems, 'again', await table.initialize(must(installationIdentity('install-2', 1))), 'conflict');
      expectRead(problems, 'stored', await table.read(), identity);
      return problems;
    },
  },
]);
