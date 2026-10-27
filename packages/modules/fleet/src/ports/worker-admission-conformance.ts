import { parseInstant, type Result } from '@taskelith/kernel';
import type { Sequence, SelfCheckResult, WorkerId } from '@taskelith/execution';
import type { SecretHash } from '@taskelith/access';
import { expectCode, expectSame, expectSuccess, type ConformanceCase } from '@taskelith/sdlc';
import {
  LINUX_CONTAINMENT_CHECK_ID,
  LINUX_CONTAINMENT_SCOPE,
  decideWorkerAdmission,
  type WorkerAdmissionDecision,
} from '../domain/worker-admission.js';
import type { SelfCheckRun, WorkerAdmissionCheck } from './worker-admission-check.js';
import { fleetToken, fleetWorker } from './fleet-conformance.js';
import type { FleetRegistry } from './fleet-registry.js';
import type { WorkerAdmissionEntry, WorkerAdmissions, WorkerAdmissionView } from './worker-admissions.js';

// A stand-in for the Linux containment check with the same scope, for
// compositions whose host cannot run the real one.
export function stubAdmissionCheck(run: SelfCheckRun = { outcome: 'passed' }): WorkerAdmissionCheck {
  return Object.freeze({ checkId: LINUX_CONTAINMENT_CHECK_ID, scope: LINUX_CONTAINMENT_SCOPE, run: async () => run });
}

// The registry enrolls the workers whose admission the store keeps;
// `breakWorker` makes that worker's stored record unreadable.
export interface WorkerAdmissionFixture {
  readonly registry: FleetRegistry;
  readonly admissions: WorkerAdmissions & WorkerAdmissionView;
  readonly breakWorker: (workerId: WorkerId) => Promise<void>;
}

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${result.error.message}`);
  return result.value;
}

const REPORTED_AT = must(parseInstant('2026-10-28T09:00:00.000Z'));
const LATER = must(parseInstant('2026-10-28T09:05:00.000Z'));

const PASSED: SelfCheckResult = { checkId: 'linux-containment', outcome: 'passed', details: [] };
const FAILED: SelfCheckResult = { checkId: 'linux-containment', outcome: 'failed', details: ['cgroup v2 is not mounted'] };

function decision(result: SelfCheckResult): WorkerAdmissionDecision {
  return decideWorkerAdmission([result], 'linux');
}

async function enrolled(registry: FleetRegistry, workerId: string, journalId: string): Promise<WorkerId> {
  must(await registry.addToken(fleetToken(`t-${workerId}`)));
  const worker = fleetWorker(workerId, journalId);
  must(await registry.enroll(`t-${workerId}` as SecretHash, worker));
  return worker.workerId;
}

async function entryOf(view: WorkerAdmissionView, workerId: WorkerId): Promise<WorkerAdmissionEntry | undefined> {
  return must(await view.workers()).workers.find((entry) => entry.workerId === workerId);
}

const sequence = (value: number) => value as Sequence;

export const WORKER_ADMISSION_CONFORMANCE: readonly ConformanceCase<WorkerAdmissionFixture>[] = Object.freeze([
  {
    name: 'an enrolled worker awaits its self-check, and a revoked one is not listed',
    async check({ registry, admissions }) {
      const problems: string[] = [];
      const first = await enrolled(registry, 'w1', 'j1');
      const revoked = await enrolled(registry, 'w2', 'j2');
      must(await registry.revoke(revoked, REPORTED_AT));
      const snapshot = must(await admissions.workers());
      expectSame(problems, 'listed', snapshot.workers.map((entry) => entry.workerId), [first]);
      const expected = fleetWorker('w1', 'j1');
      expectSame(problems, 'entry', snapshot.workers[0], {
        workerId: first, host: expected.host, enrolledAt: expected.enrolledAt, admission: 'awaiting-self-check', results: [],
      });
      return problems;
    },
  },
  {
    name: 'a report above the fence decides and replaces the results; one at or below it changes nothing',
    async check({ registry, admissions }) {
      const problems: string[] = [];
      const workerId = await enrolled(registry, 'w1', 'j1');
      expectSuccess(problems, 'failed report', await admissions.record(workerId, decision(FAILED), sequence(3), REPORTED_AT));
      const failed = await entryOf(admissions, workerId);
      expectSame(problems, 'failed state', failed?.admission, 'self-check-failed');
      expectSame(problems, 'failed results', failed?.results, [FAILED]);
      expectSame(problems, 'reported at', failed?.reportedAt === undefined ? undefined : Date.parse(failed.reportedAt), Date.parse(REPORTED_AT));
      expectSuccess(problems, 'stale report', await admissions.record(workerId, decision(PASSED), sequence(3), LATER));
      expectSame(problems, 'after stale', (await entryOf(admissions, workerId))?.admission, 'self-check-failed');
      expectSuccess(problems, 'passing report', await admissions.record(workerId, decision(PASSED), sequence(4), LATER));
      const passed = await entryOf(admissions, workerId);
      expectSame(problems, 'admitted', passed?.admission, 'admitted');
      expectSame(problems, 'replaced results', passed?.results, [PASSED]);
      return problems;
    },
  },
  {
    name: 'a new journal incarnation awaits a self-check again and restarts the fence',
    async check({ registry, admissions }) {
      const problems: string[] = [];
      const workerId = await enrolled(registry, 'w1', 'j1');
      must(await admissions.record(workerId, decision(PASSED), sequence(9), REPORTED_AT));
      expectSuccess(problems, 'await', await admissions.awaitSelfCheck(workerId));
      const awaiting = await entryOf(admissions, workerId);
      expectSame(problems, 'awaiting', [awaiting?.admission, awaiting?.results, awaiting?.reportedAt], ['awaiting-self-check', [], undefined]);
      expectSuccess(problems, 'first report', await admissions.record(workerId, decision(PASSED), sequence(1), LATER));
      expectSame(problems, 'admitted again', (await entryOf(admissions, workerId))?.admission, 'admitted');
      return problems;
    },
  },
  {
    name: 'a report that names a check twice stores one failed result and never admits',
    async check({ registry, admissions }) {
      const problems: string[] = [];
      const workerId = await enrolled(registry, 'w1', 'j1');
      must(await admissions.record(workerId, decision(PASSED), sequence(1), REPORTED_AT));
      const repeated: SelfCheckResult = { checkId: 'linux-containment', outcome: 'failed', details: ['the check was reported more than once'] };
      for (const [index, report] of [[PASSED, PASSED], [PASSED, FAILED]].entries()) {
        const decided = decideWorkerAdmission(report, 'linux');
        expectSuccess(problems, `report ${index}`, await admissions.record(workerId, decided, sequence(index + 2), LATER));
        const entry = await entryOf(admissions, workerId);
        expectSame(problems, `state ${index}`, [entry?.admission, entry?.results], ['self-check-failed', [repeated]]);
      }
      return problems;
    },
  },
  {
    name: 'a view whose source cannot be read is unavailable and returns no workers',
    async check({ registry, admissions, breakWorker }) {
      const problems: string[] = [];
      const readable = await enrolled(registry, 'w1', 'j1');
      const broken = await enrolled(registry, 'w2', 'j2');
      must(await admissions.record(readable, decision(PASSED), sequence(1), REPORTED_AT));
      await breakWorker(broken);
      expectCode(problems, 'view', await admissions.workers(), 'unavailable');
      return problems;
    },
  },
  {
    name: 'an unknown worker is not found',
    async check({ admissions }) {
      const problems: string[] = [];
      const unknown = 'w-unknown' as WorkerId;
      expectCode(problems, 'record', await admissions.record(unknown, decision(PASSED), sequence(1), REPORTED_AT), 'not-found');
      expectCode(problems, 'await', await admissions.awaitSelfCheck(unknown), 'not-found');
      return problems;
    },
  },
]);

