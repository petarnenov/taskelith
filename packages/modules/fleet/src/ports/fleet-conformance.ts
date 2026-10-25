import { err, failure, ok, parseIdentifier, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import type { SecretHash } from '@taskelith/access';
import type { JournalId, WorkerId } from '@taskelith/execution';
import { expectCode, expectRead, expectSame, expectSuccess, type ConformanceCase } from '@taskelith/sdlc';
import type { BrokerRevocation, CredentialGeneration, EnrolledWorker, EnrollmentToken } from '../domain/enrollment.js';
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
// The adapters use their own clock at the moment of use, so a valid token
// expires far ahead and an expired one long ago.
const FAR_AHEAD = at('2100-01-01T00:00:00.000Z');
const LONG_AGO = at('2000-01-01T00:00:00.000Z');

export function fleetToken(hash: string, constraints: EnrollmentToken['constraints'] = {}, expiresAt: Instant = FAR_AHEAD): EnrollmentToken {
  return Object.freeze({ hash: hash as SecretHash, issuedAt: LONG_AGO, expiresAt, constraints });
}

function generation(number: number, workerId = 'w1'): CredentialGeneration {
  return Object.freeze({ generation: number, controlPlaneHash: `cp-${workerId}-${number}` as SecretHash, brokerUserKey: `U-${workerId}-${number}`, brokerIssuedAt: AT });
}

export function fleetWorker(workerId: string, journalId: string, overrides: Partial<EnrolledWorker> = {}): EnrolledWorker {
  const worker: EnrolledWorker = {
    workerId: must(parseIdentifier('WorkerId', workerId)) as WorkerId,
    journalId: must(parseIdentifier('JournalId', journalId)) as JournalId,
    host: { platform: 'linux', architecture: 'x64', hostname: 'build-1' },
    protocolVersions: { minimum: 1, maximum: 1 },
    protocolVersion: 1,
    capacity: { slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, controls: ['cpu-limit', 'memory-limit'] },
    credentials: { current: generation(1, workerId) },
    enrolledAt: AT,
    ...overrides,
  };
  return Object.freeze(worker);
}

async function enrolled(registry: FleetRegistry, workerId = 'w1', journalId = 'j1'): Promise<EnrolledWorker> {
  must(await registry.addToken(fleetToken(`t-${workerId}`)));
  const worker = fleetWorker(workerId, journalId);
  must(await registry.enroll(`t-${workerId}` as SecretHash, worker));
  return worker;
}

function recordingPush(fail = false) {
  const pushes: string[][] = [];
  const push = async (revocations: readonly BrokerRevocation[]): Promise<Result<void>> => {
    pushes.push(revocations.map((revocation) => revocation.userKey).sort());
    return fail ? err(failure('unavailable', 'the broker is down')) : ok(undefined);
  };
  return { pushes, push };
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
      expectSame(problems, 'reuse reason', again.ok ? undefined : again.error.details.reason, 'token-used');
      return problems;
    },
  },
  {
    name: 'the active workers are the enrolled ones that are not revoked',
    async check(registry) {
      const problems: string[] = [];
      await enrolled(registry, 'w2', 'j2');
      await enrolled(registry, 'w1', 'j1');
      await enrolled(registry, 'w3', 'j3');
      must(await registry.revoke('w3' as WorkerId, AT));
      const active = must(await registry.activeWorkerIds());
      if (active.join(',') !== 'w1,w2') problems.push(`active workers are ${active.join(',')}, expected w1,w2`);
      return problems;
    },
  },
  {
    name: 'the recently revoked workers come latest first by revocation, up to the limit',
    async check(registry) {
      const problems: string[] = [];
      // w1's broker JWT postdates its revocation, which the order ignores.
      const issuedLast = { ...generation(1, 'w1'), brokerIssuedAt: at('2026-10-25T09:20:00.000Z') };
      must(await registry.addToken(fleetToken('t-w1')));
      must(await registry.enroll('t-w1' as SecretHash, fleetWorker('w1', 'j1', { credentials: { current: issuedLast } })));
      for (const n of [2, 3, 4]) await enrolled(registry, `w${n}`, `j${n}`);
      must(await registry.revoke('w2' as WorkerId, AT));
      must(await registry.revoke('w3' as WorkerId, LATER));
      must(await registry.revoke('w1' as WorkerId, AT));
      const recent = must(await registry.recentlyRevokedWorkerIds(2));
      if (recent.join(',') !== 'w3,w1') problems.push(`recently revoked workers are ${recent.join(',')}, expected w3,w1`);
      return problems;
    },
  },
  {
    name: 'an expired token enrolls nothing at the moment of use',
    async check(registry) {
      const problems: string[] = [];
      must(await registry.addToken(fleetToken('t1', {}, LONG_AGO)));
      const expired = await registry.enroll('t1' as SecretHash, fleetWorker('w1', 'j1'));
      expectSame(problems, 'reason', expired.ok ? undefined : expired.error.details.reason, 'token-expired');
      expectRead(problems, 'no worker', await registry.worker(fleetWorker('w1', 'j1').workerId), undefined);
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
    name: 'a journal is replaced only from the enrolled one, by one no worker holds',
    async check(registry) {
      const problems: string[] = [];
      for (const [workerId, journalId] of [['w1', 'j1'], ['w2', 'j2'], ['w3', 'j3']] as const) await enrolled(registry, workerId, journalId);
      const [w1, w2, w3] = ['w1', 'w2', 'w3'].map((text) => fleetWorker(text, 'j0').workerId);
      const journal = (text: string) => fleetWorker('w0', text).journalId;
      expectSuccess(problems, 'replace', await registry.replaceJournal(w1!, journal('j1'), journal('j1b')));
      expectRead(problems, 'replaced', await registry.worker(w1!), fleetWorker('w1', 'j1b'));
      expectCode(problems, 'stale previous', await registry.replaceJournal(w1!, journal('j1'), journal('j1c')), 'conflict');
      expectCode(problems, 'held by another', await registry.replaceJournal(w1!, journal('j1b'), journal('j2')), 'conflict');
      expectRead(problems, 'other kept', await registry.worker(w2!), fleetWorker('w2', 'j2'));
      must(await registry.revoke(w3!, AT));
      expectCode(problems, 'revoked', await registry.replaceJournal(w3!, journal('j3'), journal('j3b')), 'forbidden');
      expectCode(problems, 'unknown', await registry.replaceJournal(fleetWorker('w9', 'j0').workerId, journal('j9'), journal('j9b')), 'not-found');
      expectRead(problems, 'first kept', await registry.worker(w1!), fleetWorker('w1', 'j1b'));
      return problems;
    },
  },
  {
    name: 'a rotation keeps one predecessor and records the dropped one for revocation',
    async check(registry) {
      const problems: string[] = [];
      const worker = await enrolled(registry);
      expectCode(problems, 'stale', await registry.rotate(worker.workerId, 2, generation(3), LATER, AT), 'conflict');
      expectSuccess(problems, 'first', await registry.rotate(worker.workerId, 1, generation(2), LATER, AT));
      expectRead(problems, 'rotated', await registry.worker(worker.workerId), {
        ...worker, credentials: { current: generation(2), previous: { ...generation(1), validUntil: LATER } },
      });
      expectSuccess(problems, 'second', await registry.rotate(worker.workerId, 2, generation(3), LATER, AT));
      const { pushes, push } = recordingPush();
      expectRead(problems, 'published', await registry.publishRevocations(push), 1);
      expectSame(problems, 'pushed', pushes, [['U-w1-1']]);
      expectCode(problems, 'unknown', await registry.rotate(fleetWorker('w9', 'j9').workerId, 1, generation(2), LATER, AT), 'not-found');
      return problems;
    },
  },
  {
    name: 'a revoked worker cannot rotate, and revocation records all its broker users once',
    async check(registry) {
      const problems: string[] = [];
      const worker = await enrolled(registry);
      must(await registry.rotate(worker.workerId, 1, generation(2), LATER, AT));
      expectSuccess(problems, 'revoke', await registry.revoke(worker.workerId, AT));
      expectSuccess(problems, 'revoke again', await registry.revoke(worker.workerId, LATER));
      const stored = must(await registry.worker(worker.workerId));
      expectSame(problems, 'revoked at', stored?.revokedAt, AT);
      expectCode(problems, 'rotate revoked', await registry.rotate(worker.workerId, 2, generation(3), LATER, AT), 'forbidden');
      const { pushes, push } = recordingPush();
      expectRead(problems, 'published', await registry.publishRevocations(push), 2);
      expectSame(problems, 'pushed', pushes, [['U-w1-1', 'U-w1-2']]);
      expectCode(problems, 'unknown', await registry.revoke(fleetWorker('w9', 'j9').workerId, AT), 'not-found');
      return problems;
    },
  },
  {
    name: 'a control-plane hash finds its worker in the current or predecessor generation',
    async check(registry) {
      const problems: string[] = [];
      const first = await enrolled(registry, 'w1', 'j1');
      const second = await enrolled(registry, 'w2', 'j2');
      const byHash = (hash: string) => registry.workerByCredentialHash(hash as SecretHash);
      must(await registry.rotate(first.workerId, 1, generation(2), LATER, AT));
      const rotated = must(await registry.worker(first.workerId));
      expectRead(problems, 'current', await byHash('cp-w1-2'), rotated);
      expectRead(problems, 'predecessor', await byHash('cp-w1-1'), rotated);
      expectRead(problems, 'other worker', await byHash('cp-w2-1'), second);
      must(await registry.expirePredecessors(LATER));
      expectRead(problems, 'expired', await byHash('cp-w1-1'), undefined);
      must(await registry.revoke(first.workerId, LATER));
      expectRead(problems, 'revoked', await byHash('cp-w1-2'), must(await registry.worker(first.workerId)));
      expectRead(problems, 'unknown', await byHash('cp-w9-1'), undefined);
      return problems;
    },
  },
  {
    name: 'a control-plane hash that two workers hold authenticates neither',
    async check(registry) {
      const problems: string[] = [];
      const first = await enrolled(registry, 'w1', 'j1');
      must(await registry.rotate(first.workerId, 1, generation(2), LATER, AT));
      must(await registry.addToken(fleetToken('t-w2')));
      const shared = { ...generation(1, 'w2'), controlPlaneHash: 'cp-w1-1' as SecretHash };
      must(await registry.enroll('t-w2' as SecretHash, fleetWorker('w2', 'j2', { credentials: { current: shared } })));
      expectCode(problems, 'shared', await registry.workerByCredentialHash('cp-w1-1' as SecretHash), 'internal');
      return problems;
    },
  },
  {
    name: 'a revocation is never earlier than the JWT it revokes',
    async check(registry) {
      const problems: string[] = [];
      const worker = await enrolled(registry);
      must(await registry.rotate(worker.workerId, 1, { ...generation(2), brokerIssuedAt: LATER }, FAR_AHEAD, AT));
      must(await registry.revoke(worker.workerId, AT));
      let pushed: readonly BrokerRevocation[] = [];
      must(await registry.publishRevocations(async (revocations) => {
        pushed = revocations;
        return ok(undefined);
      }));
      const times = Object.fromEntries(pushed.map((revocation) => [revocation.userKey, revocation.revokedAt]));
      expectSame(problems, 'times', times, { 'U-w1-1': AT, 'U-w1-2': LATER });
      return problems;
    },
  },
  {
    name: 'expired predecessors are dropped and recorded for revocation',
    async check(registry) {
      const problems: string[] = [];
      const worker = await enrolled(registry);
      must(await registry.rotate(worker.workerId, 1, generation(2), LATER, AT));
      expectRead(problems, 'not yet', await registry.expirePredecessors(AT), 0);
      expectRead(problems, 'expired', await registry.expirePredecessors(LATER), 1);
      expectRead(problems, 'dropped', await registry.worker(worker.workerId), { ...worker, credentials: { current: generation(2) } });
      expectRead(problems, 'again', await registry.expirePredecessors(LATER), 0);
      const { pushes, push } = recordingPush();
      expectRead(problems, 'published', await registry.publishRevocations(push), 1);
      expectSame(problems, 'pushed', pushes, [['U-w1-1']]);
      return problems;
    },
  },
  {
    name: 'a revocation stays unpublished until a push succeeds, and every push is the complete list',
    async check(registry) {
      const problems: string[] = [];
      const nothing = recordingPush();
      expectRead(problems, 'nothing', await registry.publishRevocations(nothing.push), 0);
      expectSame(problems, 'no push', nothing.pushes, []);
      const first = await enrolled(registry, 'w1', 'j1');
      must(await registry.revoke(first.workerId, AT));
      const failing = recordingPush(true);
      expectCode(problems, 'failed push', await registry.publishRevocations(failing.push), 'unavailable');
      const retry = recordingPush();
      expectRead(problems, 'retried', await registry.publishRevocations(retry.push), 1);
      const second = await enrolled(registry, 'w2', 'j2');
      must(await registry.revoke(second.workerId, AT));
      const complete = recordingPush();
      expectRead(problems, 'second', await registry.publishRevocations(complete.push), 1);
      expectSame(problems, 'complete', complete.pushes, [['U-w1-1', 'U-w2-1']]);
      return problems;
    },
  },
  {
    name: 'publications run one at a time',
    async check(registry) {
      const problems: string[] = [];
      for (const [workerId, journalId] of [['w1', 'j1'], ['w2', 'j2']] as const) {
        const worker = await enrolled(registry, workerId, journalId);
        must(await registry.revoke(worker.workerId, AT));
      }
      let running = 0;
      let overlapped = false;
      const push = async (): Promise<Result<void>> => {
        running += 1;
        overlapped ||= running > 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        running -= 1;
        return ok(undefined);
      };
      const results = await Promise.all([registry.publishRevocations(push), registry.publishRevocations(push)]);
      expectSame(problems, 'overlap', overlapped, false);
      expectSame(problems, 'published once', results.map((result) => (result.ok ? result.value : -1)).sort(), [0, 2]);
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
