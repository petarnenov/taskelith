import { isInstant, isRecord, isText } from '../board/board-wire';
import type { NotApplicableReason, SelfCheckResult, WorkerAdmissionEntry, WorkerHost, WorkersView } from './workers';

// The typed fetch does not check bodies, so the view is checked for the
// fields the screen shows and rebuilt from them; else an unreachable plane.

const PLATFORMS = ['linux', 'darwin'] as const;
const ARCHITECTURES = ['x64', 'arm64'] as const;
const ADMISSION_STATES = ['awaiting-self-check', 'admitted', 'self-check-failed'] as const;
const NOT_APPLICABLE_REASONS: readonly NotApplicableReason[] = ['platform-not-covered', 'no-launch-command'];
const SELF_CHECK_ID = /^[a-z][a-z0-9-]{0,63}$/;
const MAX_RESULTS = 8;
const MAX_PROBLEMS = 8;

export function workersViewOf(body: unknown): WorkersView | undefined {
  if (!isRecord(body) || !isInstant(body.asOf) || !Array.isArray(body.workers)) return undefined;
  const workers = body.workers.map(workerOf);
  if (workers.some((worker) => worker === undefined)) return undefined;
  return { asOf: body.asOf, workers: workers as WorkerAdmissionEntry[] };
}

function workerOf(value: unknown): WorkerAdmissionEntry | undefined {
  if (!isRecord(value) || !isText(value.workerId) || !isInstant(value.enrolledAt)) return undefined;
  if (!isOneOf(ADMISSION_STATES, value.admission) || !Array.isArray(value.results)) return undefined;
  if (value.reportedAt !== undefined && !isInstant(value.reportedAt)) return undefined;
  const host = hostOf(value.host);
  const results = value.results.length > MAX_RESULTS ? undefined : value.results.map(selfCheckResultOf);
  if (host === undefined || results === undefined || results.some((result) => result === undefined)) return undefined;
  const entry: WorkerAdmissionEntry = {
    workerId: value.workerId,
    host,
    enrolledAt: value.enrolledAt,
    admission: value.admission,
    results: results as SelfCheckResult[],
  };
  return value.reportedAt === undefined ? entry : { ...entry, reportedAt: value.reportedAt };
}

function hostOf(value: unknown): WorkerHost | undefined {
  if (!isRecord(value) || !isOneOf(PLATFORMS, value.platform) || !isOneOf(ARCHITECTURES, value.architecture)) {
    return undefined;
  }
  if (!isText(value.hostname)) return undefined;
  return { platform: value.platform, architecture: value.architecture, hostname: value.hostname };
}

// Each outcome fixes its details: none, 1 to 8 problems, or one reason.
function selfCheckResultOf(value: unknown): SelfCheckResult | undefined {
  if (!isRecord(value) || typeof value.checkId !== 'string' || !SELF_CHECK_ID.test(value.checkId)) return undefined;
  if (!Array.isArray(value.details)) return undefined;
  const { checkId, details } = value;
  if (value.outcome === 'passed' && details.length === 0) return { checkId, outcome: 'passed', details: [] };
  if (value.outcome === 'failed' && details.length > 0 && details.length <= MAX_PROBLEMS && details.every(isText)) {
    return { checkId, outcome: 'failed', details: details as string[] };
  }
  if (value.outcome === 'not-applicable' && details.length === 1 && isOneOf(NOT_APPLICABLE_REASONS, details[0])) {
    return { checkId, outcome: 'not-applicable', details: [details[0]] };
  }
  return undefined;
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}
