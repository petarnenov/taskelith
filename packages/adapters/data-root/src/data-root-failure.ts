import { failure, type Failure, type FailureCode } from '@taskelith/kernel';

// Why a path under the data root cannot be used; callers branch on `reason`
// in the failure details, as for the worker root's failures.
export const DATA_ROOT_FAILURE_REASONS = Object.freeze(['unsafe-path', 'inside-checkout', 'flush-failure'] as const);

export type DataRootFailureReason = (typeof DATA_ROOT_FAILURE_REASONS)[number];

const CODES: Readonly<Record<DataRootFailureReason, FailureCode>> = Object.freeze({
  'unsafe-path': 'forbidden',
  'inside-checkout': 'forbidden',
  'flush-failure': 'unavailable',
});

export function dataRootFailure(reason: DataRootFailureReason, message: string, details: Record<string, string> = {}): Failure {
  return failure(CODES[reason], message, { ...details, reason });
}
