import type { NotApplicableReason, SelfCheckOutcome, SelfCheckResult, WorkerAdmissionState, WorkerHost } from './workers';

// The words of the workers screen for each wire value.

export const ADMISSION_LABELS: Readonly<Record<WorkerAdmissionState, string>> = {
  'awaiting-self-check': 'Awaiting self-check',
  admitted: 'Admitted',
  'self-check-failed': 'Not admitted: self-check failed',
};

export const PLATFORM_LABELS: Readonly<Record<WorkerHost['platform'], string>> = {
  linux: 'Linux',
  darwin: 'macOS',
};

export const OUTCOME_LABELS: Readonly<Record<SelfCheckOutcome, string>> = {
  passed: 'passed',
  failed: 'failed',
  'not-applicable': 'not applicable',
};

export const REASON_LABELS: Readonly<Record<NotApplicableReason, string>> = {
  'platform-not-covered': 'platform not covered',
  'no-launch-command': 'no launch command',
};

// The failed checks first, each group in the wire's check identifier order.
export function failedFirst(results: readonly SelfCheckResult[]): SelfCheckResult[] {
  const failed = results.filter((result) => result.outcome === 'failed');
  const others = results.filter((result) => result.outcome !== 'failed');
  return [...failed, ...others];
}
