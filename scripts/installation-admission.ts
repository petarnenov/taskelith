import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The admission check of make verify-installation: decides on the output
// of the administrative entry's worker-admission command.

// Exit statuses: the caller polls again only on WAITING.
export const ADMITTED = 0;
export const REFUSED = 1;
export const WAITING = 3;

export type AdmissionVerdict =
  | { readonly kind: 'admitted'; readonly asOf: string }
  | { readonly kind: 'waiting'; readonly reason: string }
  | { readonly kind: 'refused'; readonly reason: string };

export interface AdmissionExpectation {
  // The check that must have run and passed, such as linux-containment.
  readonly checkId: string;
  // Only a report consumed after this database time counts, if given.
  readonly reportedAfter?: string;
}

interface CheckResult {
  readonly checkId: string;
  readonly outcome: string;
  readonly details: readonly string[];
}

interface WorkerEntry {
  readonly admission: string;
  readonly reportedAt?: string;
  readonly results: readonly CheckResult[];
}

// A failure of the read itself; `unavailable` may clear, others will not.
interface AdminError {
  readonly code: string;
  readonly message: string;
}

const TRANSIENT_CODES = new Set(['unavailable']);

export function admissionVerdict(output: string, expected: AdmissionExpectation): AdmissionVerdict {
  if (output.trim() === '') return waiting('the worker admission command printed nothing');
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return refused('the worker admission command printed no JSON');
  }
  const error = adminError(parsed);
  if (error !== undefined) return readFailure(error);
  const snapshot = (parsed ?? {}) as { asOf?: unknown; workers?: unknown };
  if (typeof snapshot.asOf !== 'string' || !Array.isArray(snapshot.workers)) {
    return refused('the worker admission command printed no workers view');
  }
  if (snapshot.workers.length !== 1) return refused(`expected one enrolled worker, found ${snapshot.workers.length}`);
  return workerVerdict(snapshot.workers[0] as WorkerEntry, snapshot.asOf, expected);
}

function workerVerdict(worker: WorkerEntry, asOf: string, expected: AdmissionExpectation): AdmissionVerdict {
  if (!isCurrent(worker, expected.reportedAfter)) return waiting(`no self-check report after the restart (${worker.admission})`);
  if (worker.admission === 'awaiting-self-check') return waiting('the worker is awaiting-self-check');
  if (worker.admission === 'self-check-failed') return refused(`self-check-failed: ${failedChecks(worker.results)}`);
  if (worker.admission !== 'admitted') return refused(`unknown worker admission ${worker.admission}`);
  const check = worker.results.find((result) => result.checkId === expected.checkId);
  if (check?.outcome !== 'passed') {
    return refused(`admitted, but ${expected.checkId} is ${check?.outcome ?? 'not reported'}`);
  }
  return { kind: 'admitted', asOf };
}

function isCurrent(worker: WorkerEntry, reportedAfter: string | undefined): boolean {
  if (reportedAfter === undefined) return true;
  return worker.reportedAt !== undefined && Date.parse(worker.reportedAt) > Date.parse(reportedAfter);
}

// The failed check IDs with their details, which the command redacted.
function failedChecks(results: readonly CheckResult[]): string {
  const failed = results.filter((result) => result.outcome === 'failed');
  return failed.map((result) => `${result.checkId} (${result.details.join('; ')})`).join(', ') || 'no failed check listed';
}

function adminError(parsed: unknown): AdminError | undefined {
  if (typeof parsed !== 'object' || parsed === null || !('error' in parsed)) return undefined;
  const { code, message } = (parsed as { error: { code?: unknown; message?: unknown } }).error ?? {};
  return { code: String(code), message: String(message) };
}

function readFailure(error: AdminError): AdmissionVerdict {
  const reason = `the worker admission could not be read: ${error.code}: ${error.message}`;
  return TRANSIENT_CODES.has(error.code) ? waiting(reason) : refused(reason);
}

function waiting(reason: string): AdmissionVerdict {
  return { kind: 'waiting', reason };
}

function refused(reason: string): AdmissionVerdict {
  return { kind: 'refused', reason };
}

export function exitStatus(verdict: AdmissionVerdict): number {
  if (verdict.kind === 'admitted') return ADMITTED;
  return verdict.kind === 'waiting' ? WAITING : REFUSED;
}

// usage: installation-admission.ts CHECK_ID [REPORTED_AFTER] < OUTPUT;
// prints the view's asOf when admitted, else the reason on stderr.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [checkId = '', reportedAfter] = process.argv.slice(2);
  const expected = { checkId, ...(reportedAfter ? { reportedAfter } : {}) };
  const verdict = admissionVerdict(readFileSync(0, 'utf8'), expected);
  if (verdict.kind === 'admitted') console.log(verdict.asOf);
  else console.error(`installation-admission: ${verdict.reason}`);
  process.exit(exitStatus(verdict));
}
